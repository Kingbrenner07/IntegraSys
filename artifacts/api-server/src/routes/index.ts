import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import modulesRouter from "./modules";
import processingRouter from "./processing";
import { createAdminRouter } from "./admin";
import { createAuthRouter } from "./auth";
import {
  authenticateSupabaseRequest,
  createRequireAuth,
  type Authenticator,
} from "../middlewares/auth";
import { type AdminAuthActions } from "../lib/supabase-admin";

export function createApiRouter(options: {
  authenticate?: Authenticator;
  adminActions?: AdminAuthActions;
} = {}): IRouter {
  const authenticator = options.authenticate ?? authenticateSupabaseRequest;
  const router: IRouter = Router();

  router.use(healthRouter);
  router.use(createRequireAuth(authenticator));
  router.use(createAuthRouter());
  router.use(dashboardRouter);
  router.use(modulesRouter);
  router.use(processingRouter);
  router.use(createAdminRouter(options.adminActions));

  return router;
}

export default createApiRouter();
