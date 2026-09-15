import { Router, type IRouter } from "express";
import { ZipArchive, type ArchiverError } from "archiver";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import multer from "multer";
import { db, processingJobsTable } from "@workspace/db";
import {
  CreateProcessingJobBody,
  CreateProcessingJobResponse,
  CancelProcessingJobParams,
  CancelProcessingJobResponse,
  GetProcessingJobParams,
  GetProcessingJobResponse,
  ListProcessingJobsResponse,
} from "@workspace/api-zod";
import {
  getPdfPageCount,
  isPdfData,
  processPdf,
  type ProcessedOutput,
  type ProcessingModule,
} from "../lib/pdf-processing";
import {
  JobQueueCapacity,
  MAX_BUFFERED_PROCESSING_BYTES,
  MAX_CONCURRENT_PROCESSING_JOBS,
  MAX_WAITING_PROCESSING_JOBS,
} from "../lib/job-queue-capacity";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

type RuntimeJob = {
  outputs: ProcessedOutput[];
  errorMessage?: string;
};

type PendingJob = {
  id: number;
  data: Buffer;
  fileName: string;
  moduleId: ProcessingModule;
  month?: string;
  year?: string;
  releaseCapacity: () => void;
  controller: AbortController;
};

const runtimeJobs = new Map<number, RuntimeJob>();
const jobControllers = new Map<number, AbortController>();
const pendingJobs: PendingJob[] = [];
const processStartedAt = new Date();
let activeJobs = 0;
const queueCapacity = new JobQueueCapacity(
  MAX_CONCURRENT_PROCESSING_JOBS + MAX_WAITING_PROCESSING_JOBS,
  MAX_BUFFERED_PROCESSING_BYTES,
);
const uploadCapacity = new JobQueueCapacity(2, 0);
const validModules = new Set<ProcessingModule>([
  "payroll",
  "attendance",
  "hr-documents",
]);

async function recoverInterruptedJobs() {
  await db
    .update(processingJobsTable)
    .set({ status: "failed", progress: 100, outputCount: 0 })
    .where(
      and(
        inArray(processingJobsTable.status, ["queued", "processing"]),
        lt(processingJobsTable.createdAt, processStartedAt),
      ),
    );
}

void recoverInterruptedJobs().catch(() => undefined);

function serializeJob(job: Record<string, unknown>) {
  const runtime = runtimeJobs.get(Number(job.id));
  return {
    ...job,
    ...(runtime?.errorMessage ? { errorMessage: runtime.errorMessage } : {}),
    createdAt: (job.createdAt as Date).toISOString(),
  };
}

async function findOwnedJob(userId: string, jobId: number) {
  const [job] = await db
    .select()
    .from(processingJobsTable)
    .where(
      and(
        eq(processingJobsTable.id, jobId),
        eq(processingJobsTable.userId, userId),
      ),
    );
  return job;
}

type JobUpdate = Partial<{
  status: string;
  progress: number;
  outputCount: number;
}>;

async function transitionJob(
  id: number,
  allowedStatuses: string[],
  values: JobUpdate,
) {
  const [updated] = await db
    .update(processingJobsTable)
    .set(values)
    .where(
      and(
        eq(processingJobsTable.id, id),
        inArray(processingJobsTable.status, allowedStatuses),
      ),
    )
    .returning();
  return updated;
}

async function runJob(params: {
  id: number;
  data: Buffer;
  fileName: string;
  moduleId: ProcessingModule;
  month?: string;
  year?: string;
  controller: AbortController;
}) {
  runtimeJobs.set(params.id, { outputs: [] });
  try {
    const started = await transitionJob(params.id, ["queued"], {
      status: "processing",
      progress: 1,
    });
    if (!started) return;
    const result = await processPdf({
      ...params,
      signal: params.controller.signal,
      onProgress: async (progress) => {
        const updated = await transitionJob(params.id, ["processing"], {
          status: "processing",
          progress,
        });
        if (!updated) params.controller.abort();
      },
    });
    params.controller.signal.throwIfAborted();
    const completed = await transitionJob(params.id, ["processing"], {
      status: "completed",
      progress: 100,
      outputCount: result.outputs.length,
    });
    if (completed) {
      runtimeJobs.set(params.id, { outputs: result.outputs });
    }
  } catch (error) {
    const cancelled = params.controller.signal.aborted;
    const message =
      cancelled
        ? "Processamento cancelado pelo usuário."
        : error instanceof Error
          ? error.message
          : "Falha inesperada ao processar o PDF.";
    const updated = await transitionJob(
      params.id,
      cancelled ? ["queued", "processing"] : ["processing"],
      {
        status: cancelled ? "cancelled" : "failed",
        outputCount: 0,
        ...(cancelled ? {} : { progress: 100 }),
      },
    );
    if (updated) {
      runtimeJobs.set(params.id, { outputs: [], errorMessage: message });
    }
  }
}

function drainJobQueue() {
  while (activeJobs < MAX_CONCURRENT_PROCESSING_JOBS) {
    const nextJob = pendingJobs.shift();
    if (!nextJob) return;

    activeJobs += 1;
    void runJob(nextJob)
      .catch((error) => {
        logger.error({ err: error, jobId: nextJob.id }, "Processing job failed");
      })
      .finally(() => {
        jobControllers.delete(nextJob.id);
        nextJob.releaseCapacity();
        activeJobs -= 1;
        drainJobQueue();
      });
  }
}

function enqueueJob(params: PendingJob) {
  pendingJobs.push(params);
  drainJobQueue();
}

router.get("/processing/jobs", async (req, res): Promise<void> => {
  const jobs = await db
    .select()
    .from(processingJobsTable)
    .where(eq(processingJobsTable.userId, req.auth!.id))
    .orderBy(desc(processingJobsTable.createdAt));
  res.json(
    ListProcessingJobsResponse.parse(
      jobs.map((job) => serializeJob(job)),
    ),
  );
});

router.post("/processing/jobs", async (req, res): Promise<void> => {
  const parsed = CreateProcessingJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [job] = await db
    .insert(processingJobsTable)
    .values({
      ...parsed.data,
      userId: req.auth!.id,
      status: "queued",
      progress: 0,
      outputCount: 0,
    })
    .returning();

  res.status(201).json(
    CreateProcessingJobResponse.parse({
      ...job,
      createdAt: job.createdAt.toISOString(),
    }),
  );
});

router.post(
  "/processing/jobs/upload",
  (_req, res, next) => {
    const releaseUploadSlot = uploadCapacity.reserve(0);
    if (!releaseUploadSlot) {
      res.status(503).json({
        error:
          "Há muitos uploads simultâneos. Aguarde alguns instantes e tente novamente.",
      });
      return;
    }
    res.once("finish", releaseUploadSlot);
    res.once("close", releaseUploadSlot);
    next();
  },
  (req, res, next) => {
    upload.single("file")(req, res, (error) => {
      if (error) {
        const message =
          error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
            ? "O PDF excede o limite de 50 MB."
            : error instanceof Error
              ? error.message
              : "Não foi possível receber o arquivo.";
        res.status(400).json({ error: message });
        return;
      }
      next();
    });
  },
  async (req, res): Promise<void> => {
    const file = req.file;
    const moduleId = req.body?.moduleId as ProcessingModule | undefined;
    const month = typeof req.body?.month === "string" ? req.body.month : undefined;
    const year = typeof req.body?.year === "string" ? req.body.year : undefined;
    if (!file) {
      res.status(400).json({ error: "Envie um arquivo PDF no campo file." });
      return;
    }
    if (typeof moduleId !== "string" || !validModules.has(moduleId as ProcessingModule)) {
      res.status(400).json({ error: "Módulo de processamento inválido." });
      return;
    }
    const selectedModule = moduleId as ProcessingModule;
    if (!/\.pdf$/i.test(file.originalname)) {
      res.status(400).json({ error: "O arquivo deve ter extensão .pdf." });
      return;
    }
    if (!(await isPdfData(file.buffer))) {
      res.status(400).json({ error: "O arquivo enviado não é um PDF válido." });
      return;
    }
    if (selectedModule === "attendance" && (!month || !/^(0[1-9]|1[0-2])$/.test(month))) {
      res.status(400).json({ error: "Informe um mês de competência entre 01 e 12." });
      return;
    }
    if (selectedModule === "attendance" && (!year || !/^\d{4}$/.test(year))) {
      res.status(400).json({ error: "Informe um ano de competência com quatro dígitos." });
      return;
    }
    let pages: number;
    try {
      pages = await getPdfPageCount(file.buffer);
    } catch {
      res.status(400).json({ error: "O PDF está corrompido ou protegido por senha." });
      return;
    }
    if (pages < 1) {
      res.status(400).json({ error: "O PDF não contém páginas." });
      return;
    }
    const releaseCapacity = queueCapacity.reserve(file.buffer.length);
    if (!releaseCapacity) {
      res.status(503).json({
        error:
          "A fila de processamento está temporariamente cheia. Tente novamente após a conclusão dos documentos atuais.",
      });
      return;
    }
    try {
      const [job] = await db
        .insert(processingJobsTable)
        .values({
          userId: req.auth!.id,
          moduleId: selectedModule,
          fileName: file.originalname,
          pages,
          status: "queued",
          progress: 0,
          outputCount: 0,
        })
        .returning();
      const controller = new AbortController();
      jobControllers.set(job.id, controller);
      enqueueJob({
        id: job.id,
        data: file.buffer,
        fileName: file.originalname,
        moduleId: selectedModule,
        month,
        year,
        releaseCapacity,
        controller,
      });
      res.status(201).json(
        CreateProcessingJobResponse.parse({
          ...job,
          createdAt: job.createdAt.toISOString(),
        }),
      );
    } catch (error) {
      releaseCapacity();
      throw error;
    }
  },
);

router.get("/processing/jobs/:jobId", async (req, res): Promise<void> => {
  const params = GetProcessingJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const job = await findOwnedJob(req.auth!.id, params.data.jobId);

  if (!job) {
    res.status(404).json({ error: "Processamento não encontrado." });
    return;
  }

  res.json(
    GetProcessingJobResponse.parse({
      ...serializeJob(job),
    }),
  );
});

router.post(
  "/processing/jobs/:jobId/cancel",
  async (req, res): Promise<void> => {
    const params = CancelProcessingJobParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const job = await findOwnedJob(req.auth!.id, params.data.jobId);
    if (!job) {
      res.status(404).json({ error: "Processamento não encontrado." });
      return;
    }
    if (job.status !== "queued" && job.status !== "processing") {
      res.status(409).json({
        error: "Este processamento já foi finalizado e não pode ser cancelado.",
      });
      return;
    }

    const errorMessage = "Processamento cancelado pelo usuário.";
    const cancelled = await transitionJob(
      params.data.jobId,
      ["queued", "processing"],
      {
        status: "cancelled",
        outputCount: 0,
      },
    );
    if (!cancelled) {
      res.status(409).json({
        error: "Este processamento já foi finalizado e não pode ser cancelado.",
      });
      return;
    }

    const pendingIndex = pendingJobs.findIndex(
      (pending) => pending.id === params.data.jobId,
    );
    if (pendingIndex >= 0) {
      const [pending] = pendingJobs.splice(pendingIndex, 1);
      pending.controller.abort();
      pending.releaseCapacity();
      jobControllers.delete(pending.id);
    } else {
      jobControllers.get(params.data.jobId)?.abort();
    }

    runtimeJobs.set(params.data.jobId, { outputs: [], errorMessage });

    res.json(
      CancelProcessingJobResponse.parse({
        ...cancelled,
        errorMessage,
        createdAt: cancelled.createdAt.toISOString(),
      }),
    );
  },
);

router.get("/processing/jobs/:jobId/outputs", async (req, res): Promise<void> => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId)) {
    res.status(400).json({ error: "Identificador de processamento inválido." });
    return;
  }
  const job = await findOwnedJob(req.auth!.id, jobId);
  if (!job) {
    res.status(404).json({ error: "Processamento não encontrado." });
    return;
  }
  const runtime = runtimeJobs.get(jobId);
  if (job.status !== "completed" || !runtime) {
    res.status(409).json({ error: "Os arquivos ainda não estão disponíveis." });
    return;
  }
  res.json(
    runtime.outputs.map((output, index) => ({
      id: index,
      name: output.name,
      description: output.description,
      downloadUrl: `/api/processing/jobs/${jobId}/outputs/${index}`,
    })),
  );
});

router.get(
  "/processing/jobs/:jobId/outputs/:outputId",
  async (req, res): Promise<void> => {
    const jobId = Number(req.params.jobId);
    const outputId = Number(req.params.outputId);
    if (!Number.isInteger(jobId) || !Number.isInteger(outputId)) {
      res.status(404).json({ error: "Arquivo de saída não encontrado." });
      return;
    }
    const job = await findOwnedJob(req.auth!.id, jobId);
    const output = job ? runtimeJobs.get(jobId)?.outputs[outputId] : undefined;
    if (!output) {
      res.status(404).json({ error: "Arquivo de saída não encontrado." });
      return;
    }
    res.type("application/pdf");
    res.attachment(output.name.split("/").at(-1) ?? "documento.pdf");
    res.send(output.data);
  },
);

router.get("/processing/jobs/:jobId/download", async (req, res): Promise<void> => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId)) {
    res.status(404).json({ error: "Arquivos de saída não encontrados." });
    return;
  }
  const job = await findOwnedJob(req.auth!.id, jobId);
  const outputs = job ? runtimeJobs.get(jobId)?.outputs : undefined;
  if (!outputs?.length) {
    res.status(404).json({ error: "Arquivos de saída não encontrados." });
    return;
  }
  res.attachment(`processamento-${jobId}.zip`);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on("error", (error: ArchiverError) => {
    if (!res.headersSent) res.status(500).json({ error: "Falha ao gerar o ZIP." });
    else res.destroy(error);
  });
  archive.pipe(res);
  for (const output of outputs) archive.append(output.data, { name: output.name });
  await archive.finalize();
});

export default router;