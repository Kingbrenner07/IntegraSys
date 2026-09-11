import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { createApiRouter } from "./routes";
import type { Authenticator } from "./middlewares/auth";
import type { AdminAuthActions } from "./lib/supabase-admin";

export function createApp(options: {
  authenticate?: Authenticator;
  adminActions?: AdminAuthActions;
} = {}): Express {
  const app: Express = express();

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    }),
  );
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use("/api", createApiRouter(options));
  return app;
}

const app = createApp();

export default app;
