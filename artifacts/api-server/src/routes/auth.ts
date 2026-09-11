import { Router, type IRouter } from "express";

export function createAuthRouter(): IRouter {
  const router: IRouter = Router();

  router.get("/auth/me", (req, res): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Sessão ausente ou inválida." });
      return;
    }
    res.json(req.auth);
  });

  return router;
}

export default createAuthRouter;