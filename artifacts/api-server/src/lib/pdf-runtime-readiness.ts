import {
  createPortugueseOcrWorkerWithTimeout,
  probeCanvasRenderer,
  probePdfJs,
} from "./node-pdf-runtime";

export type PdfRuntimeDependency =
  | "pdfjs"
  | "canvas-renderer"
  | "tesseract-por";

export type PdfRuntimeReadiness = {
  ready: boolean;
  missing: PdfRuntimeDependency[];
};

export type PdfRuntimeProbes = Record<
  PdfRuntimeDependency,
  () => Promise<void> | void
>;

const defaultProbes: PdfRuntimeProbes = {
  pdfjs: probePdfJs,
  "canvas-renderer": probeCanvasRenderer,
  "tesseract-por": async () => {
    const worker = await createPortugueseOcrWorkerWithTimeout();
    await worker.terminate();
  },
};

export async function checkPdfRuntimeReadiness(
  probes: PdfRuntimeProbes = defaultProbes,
): Promise<PdfRuntimeReadiness> {
  const missing: PdfRuntimeDependency[] = [];
  const dependencies = Object.keys(probes) as PdfRuntimeDependency[];
  for (const dependency of dependencies) {
    try {
      await probes[dependency]();
    } catch {
      missing.push(dependency);
    }
  }

  return {
    ready: missing.length === 0,
    missing,
  };
}

let readinessPromise: Promise<PdfRuntimeReadiness> | undefined;

export function getPdfRuntimeReadiness(): Promise<PdfRuntimeReadiness> {
  readinessPromise ??= checkPdfRuntimeReadiness().then(
    (result) => {
      if (!result.ready) readinessPromise = undefined;
      return result;
    },
    (error) => {
      readinessPromise = undefined;
      throw error;
    },
  );
  return readinessPromise;
}