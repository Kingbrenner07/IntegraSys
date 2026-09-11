import { Router, type IRouter } from "express";
import { desc, inArray, sql } from "drizzle-orm";
import {
  db,
  dashboardMetricsTable,
  processingJobsTable,
} from "@workspace/db";
import {
  GetDashboardActivityResponse,
  GetDashboardSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [metrics] = await db.select().from(dashboardMetricsTable).limit(1);
  const [active] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(processingJobsTable)
    .where(
      inArray(processingJobsTable.status, ["queued", "processing"]),
    );

  res.json(
    GetDashboardSummaryResponse.parse({
      documentsProcessed: metrics?.documentsProcessed ?? 0,
      activeJobs: active?.count ?? 0,
      successRate: metrics?.successRate ?? 100,
      monthlyPages: metrics?.monthlyPages ?? 0,
    }),
  );
});

router.get("/dashboard/activity", async (_req, res): Promise<void> => {
  const jobs = await db
    .select()
    .from(processingJobsTable)
    .orderBy(desc(processingJobsTable.createdAt))
    .limit(6);

  const activity = jobs.map((job) => ({
    id: job.id,
    title: job.fileName,
    detail: `${job.pages} páginas · ${job.outputCount} arquivos gerados`,
    status:
      job.status === "failed"
        ? "failed"
        : job.status === "completed"
          ? "completed"
          : job.status === "queued"
            ? "queued"
            : "processing",
    createdAt: job.createdAt.toISOString(),
  }));

  res.json(GetDashboardActivityResponse.parse(activity));
});

export default router;