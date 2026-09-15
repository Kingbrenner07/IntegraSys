import { describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  checkPdfRuntimeReadiness,
  type PdfRuntimeDependency,
  type PdfRuntimeProbes,
} from "../lib/pdf-runtime-readiness";
import { createHealthRouter } from "../routes/health";
import {
  calculateRenderScale,
  createOcrWorkerWithTimeout,
} from "../lib/node-pdf-runtime";
import type { Worker } from "tesseract.js";

function createProbes(
  unavailable: PdfRuntimeDependency[] = [],
): PdfRuntimeProbes {
  const unavailableSet = new Set(unavailable);
  const probe = (dependency: PdfRuntimeDependency) => async () => {
    if (unavailableSet.has(dependency)) {
      throw new Error(`${dependency} unavailable`);
    }
  };
  return {
    pdfjs: probe("pdfjs"),
    "canvas-renderer": probe("canvas-renderer"),
    "tesseract-por": probe("tesseract-por"),
  };
}

describe("prontidão do runtime de PDF e OCR", () => {
  it("fica pronto quando os executáveis e o idioma português existem", async () => {
    await expect(checkPdfRuntimeReadiness(createProbes())).resolves.toEqual({
      ready: true,
      missing: [],
    });
  });

  it("identifica cada dependência empacotada ausente", async () => {
    await expect(
      checkPdfRuntimeReadiness(
        createProbes(["pdfjs", "canvas-renderer", "tesseract-por"]),
      ),
    ).resolves.toEqual({
      ready: false,
      missing: ["pdfjs", "canvas-renderer", "tesseract-por"],
    });
  });
});

describe("healthcheck do runtime de PDF e OCR", () => {
  it("retorna 503 e identifica a dependência ausente", async () => {
    const app = express();
    app.use(
      createHealthRouter(async () => ({
        ready: false,
        missing: ["canvas-renderer"],
      })),
    );
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    try {
      const address = server.address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${address.port}/healthz`,
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        status: "unhealthy",
        missing: ["canvas-renderer"],
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

describe("limite de memória da renderização", () => {
  it("reduz a escala de páginas extremas", () => {
    const scale = calculateRenderScale(20_000, 20_000);
    expect(20_000 * scale * 20_000 * scale).toBeLessThanOrEqual(12_000_001);
  });
});

describe("prazo de inicialização do OCR", () => {
  it("rejeita no prazo e encerra um worker que inicializa tarde", async () => {
    let terminated = false;
    const lateWorker = {
      terminate: async () => {
        terminated = true;
        return {} as never;
      },
    } as unknown as Worker;

    await expect(
      createOcrWorkerWithTimeout(
        () =>
          new Promise<Worker>((resolve) =>
            setTimeout(() => resolve(lateWorker), 20),
          ),
        5,
      ),
    ).rejects.toThrow("initialization timed out");

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(terminated).toBe(true);
  });
});