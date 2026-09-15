import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import {
  getPdfRuntimeReadiness,
  type PdfRuntimeReadiness,
} from "../lib/pdf-runtime-readiness";

type ReadinessProvider = () => Promise<PdfRuntimeReadiness>;

export function createHealthRouter(
  getReadiness: ReadinessProvider = getPdfRuntimeReadiness,
): IRouter {
  const router: IRouter = Router();

  router.get("/healthz", async (_req, res) => {
    try {
      const readiness = await getReadiness();
      if (!readiness.ready) {
        logger.error(
          { missingDependencies: readiness.missing },
          "PDF/OCR runtime is not ready",
        );
        res.status(503).json({
          status: "unhealthy",
          missing: readiness.missing,
        });
        return;
      }

      const data = HealthCheckResponse.parse({ status: "ok" });
      res.json(data);
    } catch (error) {
      logger.error({ err: error }, "PDF/OCR readiness check failed");
      res.status(503).json({ status: "unhealthy" });
    }
  });

  return router;
}

export default createHealthRouter();
