import { Router, type IRouter } from "express";
import { ZipArchive, type ArchiverError } from "archiver";
import { desc, eq, inArray } from "drizzle-orm";
import multer from "multer";
import { db, processingJobsTable } from "@workspace/db";
import {
  CreateProcessingJobBody,
  CreateProcessingJobResponse,
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
};

const runtimeJobs = new Map<number, RuntimeJob>();
const pendingJobs: PendingJob[] = [];
let activeJob = false;
const validModules = new Set<ProcessingModule>([
  "payroll",
  "attendance",
  "hr-documents",
]);

async function recoverInterruptedJobs() {
  await db
    .update(processingJobsTable)
    .set({ status: "failed", progress: 100, outputCount: 0 })
    .where(inArray(processingJobsTable.status, ["queued", "processing"]));
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

async function updateJob(
  id: number,
  values: Partial<{
    status: string;
    progress: number;
    outputCount: number;
  }>,
) {
  await db
    .update(processingJobsTable)
    .set(values)
    .where(eq(processingJobsTable.id, id));
}

async function runJob(params: {
  id: number;
  data: Buffer;
  fileName: string;
  moduleId: ProcessingModule;
  month?: string;
  year?: string;
}) {
  runtimeJobs.set(params.id, { outputs: [] });
  try {
    await updateJob(params.id, { status: "processing", progress: 1 });
    const result = await processPdf({
      ...params,
      onProgress: (progress) =>
        updateJob(params.id, { status: "processing", progress }),
    });
    runtimeJobs.set(params.id, { outputs: result.outputs });
    await updateJob(params.id, {
      status: "completed",
      progress: 100,
      outputCount: result.outputs.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada ao processar o PDF.";
    runtimeJobs.set(params.id, { outputs: [], errorMessage: message });
    await updateJob(params.id, { status: "failed", progress: 100, outputCount: 0 });
  }
}

async function drainJobQueue() {
  if (activeJob) return;
  const nextJob = pendingJobs.shift();
  if (!nextJob) return;

  activeJob = true;
  try {
    await runJob(nextJob);
  } finally {
    activeJob = false;
    void drainJobQueue();
  }
}

function enqueueJob(params: PendingJob) {
  pendingJobs.push(params);
  void drainJobQueue();
}

router.get("/processing/jobs", async (_req, res): Promise<void> => {
  const jobs = await db
    .select()
    .from(processingJobsTable)
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
    const [job] = await db
      .insert(processingJobsTable)
      .values({
        moduleId: selectedModule,
        fileName: file.originalname,
        pages,
        status: "queued",
        progress: 0,
        outputCount: 0,
      })
      .returning();
    enqueueJob({
      id: job.id,
      data: file.buffer,
      fileName: file.originalname,
      moduleId: selectedModule,
      month,
      year,
    });
    res.status(201).json(
      CreateProcessingJobResponse.parse({
        ...job,
        createdAt: job.createdAt.toISOString(),
      }),
    );
  },
);

router.get("/processing/jobs/:jobId", async (req, res): Promise<void> => {
  const params = GetProcessingJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db
    .select()
    .from(processingJobsTable)
    .where(eq(processingJobsTable.id, params.data.jobId));

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

router.get("/processing/jobs/:jobId/outputs", async (req, res): Promise<void> => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId)) {
    res.status(400).json({ error: "Identificador de processamento inválido." });
    return;
  }
  const [job] = await db
    .select()
    .from(processingJobsTable)
    .where(eq(processingJobsTable.id, jobId));
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
    const output = runtimeJobs.get(jobId)?.outputs[outputId];
    if (!Number.isInteger(jobId) || !Number.isInteger(outputId) || !output) {
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
  const outputs = runtimeJobs.get(jobId)?.outputs;
  if (!Number.isInteger(jobId) || !outputs?.length) {
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