import { Router, type IRouter } from "express";

function normalizeUrl(value?: string) {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const router: IRouter = Router();

router.get("/public-config", (_req, res) => {
  const supabaseUrl = normalizeUrl(
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  );
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(503).json({
      error: "A configuração pública de autenticação não está disponível.",
    });
    return;
  }

  res.setHeader("cache-control", "public, max-age=300");
  res.json({ supabaseUrl, supabaseAnonKey });
});

export default router;