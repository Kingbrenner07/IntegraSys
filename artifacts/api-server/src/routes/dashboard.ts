import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, processingJobsTable } from "@workspace/db";
import {
  GetDashboardActivityResponse,
  GetDashboardSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const [metrics] = await db
    .select({
      documentsProcessed: sql<number>`
        count(*) filter (where ${processingJobsTable.status} = 'completed')::int
      `,
      activeJobs: sql<number>`
        count(*) filter (
          where ${processingJobsTable.status} in ('queued', 'processing')
        )::int
      `,
      successfulJobs: sql<number>`
        count(*) filter (where ${processingJobsTable.status} = 'completed')::int
      `,
      finishedJobs: sql<number>`
        count(*) filter (
          where ${processingJobsTable.status} in ('completed', 'failed')
        )::int
      `,
      monthlyPages: sql<number>`
        coalesce(
          sum(${processingJobsTable.pages}) filter (
            where ${processingJobsTable.status} = 'completed'
              and ${processingJobsTable.createdAt} >= date_trunc('month', now())
          ),
          0
        )::int
      `,
    })
    .from(processingJobsTable)
    .where(eq(processingJobsTable.userId, req.auth!.id));

  const finishedJobs = metrics?.finishedJobs ?? 0;
  const successRate =
    finishedJobs === 0
      ? 100
      : Number(
          (((metrics?.successfulJobs ?? 0) / finishedJobs) * 100).toFixed(1),
        );

  res.json(
    GetDashboardSummaryResponse.parse({
      documentsProcessed: metrics?.documentsProcessed ?? 0,
      activeJobs: metrics?.activeJobs ?? 0,
      successRate,
      monthlyPages: metrics?.monthlyPages ?? 0,
    }),
  );
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const jobs = await db
    .select()
    .from(processingJobsTable)
    .where(eq(processingJobsTable.userId, req.auth!.id))
    .orderBy(desc(processingJobsTable.createdAt))
    .limit(6);

  const activity = jobs.map((job) => ({
    id: job.id,
    title: job.fileName,
    detail: `${job.pages} páginas · ${job.outputCount} arquivos gerados`,
    status:
      job.status === "failed"
        ? "failed"
        : job.status === "cancelled"
          ? "cancelled"
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