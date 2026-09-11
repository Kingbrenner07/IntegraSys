import type { AdminRole, AdminStatus } from "../middlewares/auth";

export class SupabaseAdminError extends Error {
  constructor(
    public readonly statusCode: 409 | 502,
    message: string,
  ) {
    super(message);
    this.name = "SupabaseAdminError";
  }
}

function getConfig() {
  const rawUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  let url: string | undefined;
  try {
    url = rawUrl ? new URL(rawUrl).origin : undefined;
  } catch {
    url = undefined;
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new SupabaseAdminError(
      502,
      "A administração do Supabase não está configurada no servidor.",
    );
  }

  return { url, serviceRoleKey };
}

async function adminRequest(path: string, init: RequestInit = {}) {
  const { url, serviceRoleKey } = getConfig();
  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1${path}`, {
      ...init,
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new SupabaseAdminError(
      502,
      "Não foi possível contactar a administração do Supabase.",
    );
  }

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 409 || response.status === 422) {
      throw new SupabaseAdminError(
        409,
        detail || "O usuário já existe no Supabase.",
      );
    }
    throw new SupabaseAdminError(
      502,
      detail || "O Supabase recusou a operação administrativa.",
    );
  }

  return response;
}

type SupabaseAuthUser = {
  id: string;
  email?: string;
};

async function findUserByEmail(email: string): Promise<SupabaseAuthUser> {
    const response = await adminRequest("/admin/users?page=1&per_page=1000", {
    method: "GET",
  });
  const body = (await response.json()) as {
    users?: SupabaseAuthUser[];
  };
  const user = body.users?.find(
    (candidate) => candidate.email?.trim().toLowerCase() === email,
  );
  if (!user) {
    throw new SupabaseAdminError(
      502,
      "Usuário não encontrado no Supabase Auth.",
    );
  }
  return user;
}

export type AdminAuthActions = {
  invite: (email: string, role: AdminRole) => Promise<void>;
  setStatus: (email: string, status: Exclude<AdminStatus, "invited">) => Promise<void>;
  setRole: (email: string, role: AdminRole) => Promise<void>;
};

export const supabaseAdminActions: AdminAuthActions = {
  async invite(email, role) {
    await adminRequest("/invite", {
      method: "POST",
      body: JSON.stringify({
        email,
        data: { role },
      }),
    });
  },

  async setStatus(email, status) {
    const user = await findUserByEmail(email);
    await adminRequest(`/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PUT",
      body: JSON.stringify({
        ban_duration: status === "suspended" ? "876000h" : "none",
      }),
    });
  },

  async setRole(email, role) {
    const user = await findUserByEmail(email);
    await adminRequest(`/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PUT",
      body: JSON.stringify({
        app_metadata: { role },
      }),
    });
  },
};