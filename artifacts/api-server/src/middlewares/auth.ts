import type { NextFunction, Request, RequestHandler, Response as ExpressResponse } from "express";
import { eq } from "drizzle-orm";
import { adminUsersTable, db } from "@workspace/db";

export type AdminRole = "admin" | "operator";
export type AdminStatus = "active" | "invited" | "suspended";

export type AuthPrincipal = {
  id: string;
  email: string;
  role: AdminRole;
  status: "active";
};

export type Authenticator = (req: Request) => Promise<AuthPrincipal | null>;

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPrincipal;
    }
  }
}

class AuthenticationError extends Error {
  constructor(
    public readonly statusCode: 401 | 403 | 503,
    message: string,
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

function getSupabaseConfig() {
  const rawUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  let url: string | undefined;
  try {
    url = rawUrl ? new URL(rawUrl).origin : undefined;
  } catch {
    url = undefined;
  }
  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new AuthenticationError(
      503,
      "A autenticação do Supabase não está configurada no servidor.",
    );
  }

  return { url, anonKey };
}

async function getSupabaseIdentity(
  accessToken: string,
): Promise<{ id: string; email: string } | null> {
  const { url, anonKey } = getSupabaseConfig();

  let response: globalThis.Response;
  try {
    response = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    throw new AuthenticationError(
      503,
      "Não foi possível contactar o serviço de autenticação.",
    );
  }

  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) {
    throw new AuthenticationError(
      503,
      "O serviço de autenticação retornou um erro.",
    );
  }

  const body = (await response.json()) as { id?: string; email?: string };
  if (!body.id || !body.email) return null;
  return { id: body.id, email: body.email };
}

export const authenticateSupabaseRequest: Authenticator = async (req) => {
  const header = req.header("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const identity = await getSupabaseIdentity(match[1]);
  if (!identity) return null;

  const email = identity.email.trim().toLowerCase();
  const [allowlistedUser] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, email))
    .limit(1);

  if (!allowlistedUser || allowlistedUser.status === "suspended") {
    throw new AuthenticationError(
      403,
      "Este e-mail não está autorizado a acessar o painel.",
    );
  }

  if (allowlistedUser.role !== "admin" && allowlistedUser.role !== "operator") {
    throw new AuthenticationError(403, "A função do usuário não é válida.");
  }

  return {
    id: identity.id,
    email,
    role: allowlistedUser.role as AdminRole,
    status: "active",
  };
};

export function createRequireAuth(
  authenticator: Authenticator = authenticateSupabaseRequest,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const principal = await authenticator(req);
      if (!principal) {
        res.status(401).json({ error: "Sessão ausente ou inválida." });
        return;
      }
      req.auth = principal;
      next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      next(error);
    }
  };
}

export const requireAdmin: RequestHandler = (
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
) => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Acesso restrito a administradores." });
    return;
  }
  next();
};