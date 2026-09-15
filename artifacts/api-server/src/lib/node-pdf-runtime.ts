import { createCanvas } from "@napi-rs/canvas";
import porLanguage from "@tesseract.js-data/por";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker, PSM, type Worker } from "tesseract.js";

type ExtractedPage = {
  text: string;
  source: "text" | "ocr" | "none";
};

export type PdfTextExtractor = {
  extractPage(pageIndex: number): Promise<ExtractedPage>;
  extractPageOcr(pageIndex: number): Promise<string>;
  close(): Promise<void>;
};

const TARGET_DPI_SCALE = 300 / 72;
const MAX_RENDER_PIXELS = 12_000_000;
const PAGE_OPERATION_TIMEOUT_MS = 120_000;

export function calculateRenderScale(
  widthAtScaleOne: number,
  heightAtScaleOne: number,
): number {
  const targetPixels =
    widthAtScaleOne *
    heightAtScaleOne *
    TARGET_DPI_SCALE *
    TARGET_DPI_SCALE;
  if (targetPixels <= MAX_RENDER_PIXELS) return TARGET_DPI_SCALE;
  return Math.sqrt(
    MAX_RENDER_PIXELS / (widthAtScaleOne * heightAtScaleOne),
  );
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Promise<void> | void,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      Promise.resolve(onTimeout())
        .catch(() => undefined)
        .finally(() =>
          reject(new Error(`PDF/OCR operation timed out after ${timeoutMs}ms`)),
        );
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function createPortugueseOcrWorker(): Promise<Worker> {
  const worker = await createWorker(porLanguage.code, undefined, {
    langPath: porLanguage.langPath,
    gzip: porLanguage.gzip,
    cacheMethod: "none",
  });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    return worker;
  } catch (error) {
    await worker.terminate().catch(() => undefined);
    throw error;
  }
}

export async function createOcrWorkerWithTimeout(
  create: () => Promise<Worker>,
  timeoutMs = PAGE_OPERATION_TIMEOUT_MS,
): Promise<Worker> {
  const pendingWorker = create();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("Portuguese OCR worker initialization timed out")),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([pendingWorker, timeout]);
  } catch (error) {
    void pendingWorker
      .then((worker) => worker.terminate())
      .catch(() => undefined);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createPortugueseOcrWorkerWithTimeout(): Promise<Worker> {
  return createOcrWorkerWithTimeout(createPortugueseOcrWorker);
}

export async function createPdfTextExtractor(
  data: Buffer,
): Promise<PdfTextExtractor> {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  let workerPromise: Promise<Worker> | undefined;

  const getOcrWorker = () => {
    workerPromise ??= createPortugueseOcrWorkerWithTimeout();
    return workerPromise;
  };

  const discardOcrWorker = async () => {
    const pendingWorker = workerPromise;
    workerPromise = undefined;
    if (!pendingWorker) return;
    const worker = await pendingWorker.catch(() => undefined);
    await worker?.terminate().catch(() => undefined);
  };

  const extractPageOcr = async (pageIndex: number): Promise<string> => {
    const page = await document.getPage(pageIndex + 1);
    try {
      const dimensions = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: calculateRenderScale(dimensions.width, dimensions.height),
      });
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      const context = canvas.getContext("2d");
      const renderTask = page.render({
        canvas: canvas as never,
        canvasContext: context as never,
        viewport,
        background: "rgb(255,255,255)",
      });
      await withTimeout(
        renderTask.promise,
        PAGE_OPERATION_TIMEOUT_MS,
        () => renderTask.cancel(),
      );
      const worker = await getOcrWorker();
      const result = await withTimeout(
        worker.recognize(canvas.toBuffer("image/png")),
        PAGE_OPERATION_TIMEOUT_MS,
        discardOcrWorker,
      );
      return result.data.text;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[pdf-processing] OCR failed on page ${pageIndex + 1}: ${message}`,
      );
      return "";
    } finally {
      page.cleanup();
    }
  };

  return {
    async extractPage(pageIndex) {
      const page = await document.getPage(pageIndex + 1);
      try {
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => {
            if (!("str" in item)) return "";
            return `${item.str}${item.hasEOL ? "\n" : " "}`;
          })
          .join("")
          .trim();
        if (text.length >= 10) {
          return { text, source: "text" };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[pdf-processing] Text extraction failed on page ${pageIndex + 1}: ${message}`,
        );
      } finally {
        page.cleanup();
      }

      const text = await extractPageOcr(pageIndex);
      return { text, source: text.trim() ? "ocr" : "none" };
    },
    extractPageOcr,
    async close() {
      await discardOcrWorker();
      await loadingTask.destroy().catch(() => undefined);
    },
  };
}

function createMinimalPdf(): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body));
}

export async function probePdfJs(): Promise<void> {
  if (typeof pdfjs.getDocument !== "function") {
    throw new Error("PDF.js is unavailable");
  }
  const loadingTask = pdfjs.getDocument({
    data: createMinimalPdf(),
    useSystemFonts: true,
  });
  try {
    const document = await loadingTask.promise;
    if (document.numPages !== 1) {
      throw new Error("PDF.js failed to open the readiness document");
    }
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

export function probeCanvasRenderer(): void {
  const canvas = createCanvas(1, 1);
  canvas.getContext("2d").fillRect(0, 0, 1, 1);
  if (canvas.toBuffer("image/png").length === 0) {
    throw new Error("Canvas renderer is unavailable");
  }
}