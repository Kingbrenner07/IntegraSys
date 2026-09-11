import {
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const processingJobsTable = pgTable("processing_jobs", {
  id: serial("id").primaryKey(),
  moduleId: text("module_id").notNull(),
  fileName: text("file_name").notNull(),
  status: text("status").notNull().default("queued"),
  progress: integer("progress").notNull().default(0),
  pages: integer("pages").notNull(),
  outputCount: integer("output_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const adminUsersTable = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("operator"),
  status: text("status").notNull().default("invited"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const dashboardMetricsTable = pgTable("dashboard_metrics", {
  id: serial("id").primaryKey(),
  documentsProcessed: integer("documents_processed").notNull().default(0),
  successRate: real("success_rate").notNull().default(100),
  monthlyPages: integer("monthly_pages").notNull().default(0),
});

export const insertProcessingJobSchema = createInsertSchema(
  processingJobsTable,
).omit({ id: true, createdAt: true });
export const insertAdminUserSchema = createInsertSchema(adminUsersTable).omit({
  id: true,
  createdAt: true,
});

export type ProcessingJob = typeof processingJobsTable.$inferSelect;
export type InsertProcessingJob = z.infer<typeof insertProcessingJobSchema>;
export type AdminUser = typeof adminUsersTable.$inferSelect;
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;