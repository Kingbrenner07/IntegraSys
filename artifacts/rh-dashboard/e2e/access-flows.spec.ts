import { expect, test, type Page, type Route } from "@playwright/test";

type Role = "admin" | "operator";
type AdminUser = {
  id: number;
  email: string;
  role: Role;
  status: "active" | "suspended" | "invited";
  createdAt: string;
};

const adminEmail = "admin@empresa.com";
const operatorEmail = "operador@empresa.com";
const outsideEmail = "fora@empresa.com";
const validPassword = "senha-segura-123";

function jsonResponse(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function sessionFor(email: string) {
  const userId = `supabase-${email.split("@")[0]}`;
  return {
    access_token: `access-token-${email}`,
    token_type: "bearer",
    expires_in: 3_600,
    expires_at: Math.floor(Date.now() / 1_000) + 3_600,
    refresh_token: `refresh-token-${email}`,
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      identities: [],
      created_at: "2026-09-10T00:00:00.000Z",
    },
  };
}

async function mockAuthAndApi(page: Page) {
  let signedInEmail: string | null = null;
  const resetRequests: string[] = [];
  const passwordUpdates: string[] = [];
  const users: AdminUser[] = [
    {
      id: 1,
      email: operatorEmail,
      role: "operator",
      status: "active",
      createdAt: "2026-09-09T12:00:00.000Z",
    },
  ];

  await page.route("**/auth/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith("/token")) {
      const body = JSON.parse(request.postData() ?? "{}") as {
        email?: string;
        password?: string;
      };
      const email = body.email?.trim().toLowerCase();
      if (!email || body.password !== validPassword) {
        await jsonResponse(
          route,
          {
            error: "invalid_grant",
            error_description: "Credenciais inválidas.",
          },
          400,
        );
        return;
      }
      signedInEmail = email;
      await jsonResponse(route, sessionFor(email));
      return;
    }

    if (url.pathname.endsWith("/logout")) {
      signedInEmail = null;
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (url.pathname.endsWith("/recover")) {
      const body = JSON.parse(request.postData() ?? "{}") as { email?: string };
      if (body.email) resetRequests.push(body.email);
      await jsonResponse(route, {});
      return;
    }

    if (url.pathname.endsWith("/user") && request.method() === "PUT") {
      const body = JSON.parse(request.postData() ?? "{}") as { password?: string };
      if (body.password) passwordUpdates.push(body.password);
      await jsonResponse(route, { user: sessionFor(signedInEmail ?? adminEmail).user });
      return;
    }

    await jsonResponse(route, {});
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith("/auth/me")) {
      if (!signedInEmail) {
        await jsonResponse(route, { error: "Sessão ausente ou inválida." }, 401);
      } else if (signedInEmail === outsideEmail) {
        await jsonResponse(
          route,
          { error: "Este e-mail não está autorizado a acessar o painel." },
          403,
        );
      } else {
        await jsonResponse(route, {
          id: `supabase-${signedInEmail.split("@")[0]}`,
          email: signedInEmail,
          role: signedInEmail === adminEmail ? "admin" : "operator",
          status: "active",
        });
      }
      return;
    }

    if (path.endsWith("/admin/users") && request.method() === "GET") {
      await jsonResponse(route, users);
      return;
    }

    const roleMatch = path.match(/\/admin\/users\/(\d+)\/role$/);
    if (roleMatch && request.method() === "PATCH") {
      const body = JSON.parse(request.postData() ?? "{}") as { role?: Role };
      const user = users.find((candidate) => candidate.id === Number(roleMatch[1]));
      if (user && body.role) user.role = body.role;
      await jsonResponse(route, user);
      return;
    }

    const statusMatch = path.match(/\/admin\/users\/(\d+)\/status$/);
    if (statusMatch && request.method() === "PATCH") {
      const body = JSON.parse(request.postData() ?? "{}") as {
        status?: "active" | "suspended";
      };
      const user = users.find((candidate) => candidate.id === Number(statusMatch[1]));
      if (user && body.status) user.status = body.status;
      await jsonResponse(route, user);
      return;
    }

    if (path.endsWith("/dashboard/summary")) {
      await jsonResponse(route, {
        documentsProcessed: 0,
        activeJobs: 0,
        successRate: 100,
        monthlyPages: 0,
      });
      return;
    }

    if (path.endsWith("/dashboard/activity")) {
      await jsonResponse(route, []);
      return;
    }

    await jsonResponse(route, []);
  });

  return {
    resetRequests,
    passwordUpdates,
    users,
    getSignedInEmail: () => signedInEmail,
  };
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail corporativo").fill(email);
  await page.getByLabel("Senha").fill(validPassword);
  await page.getByRole("button", { name: "Entrar no Console" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("permite login válido e rejeita credenciais inválidas", async ({ page }) => {
  await mockAuthAndApi(page);

  await page.goto("/login");
  await page.getByLabel("E-mail corporativo").fill(adminEmail);
  await page.getByLabel("Senha").fill("senha-incorreta");
  await page.getByRole("button", { name: "Entrar no Console" }).click();
  await expect(page.getByRole("alert")).toHaveText("Credenciais inválidas.");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Senha").fill(validPassword);
  await page.getByRole("button", { name: "Entrar no Console" }).click();
  await expect(page.getByRole("heading", { name: "Visão Geral" })).toBeVisible();
});

test("redireciona e explica quando o e-mail não está na allowlist", async ({ page }) => {
  await mockAuthAndApi(page);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?returnTo=%2F$/);
  await page.getByLabel("E-mail corporativo").fill(outsideEmail);
  await page.getByLabel("Senha").fill(validPassword);
  await page.getByRole("button", { name: "Entrar no Console" }).click();

  await expect(page).toHaveURL(/\/login\?returnTo=%2F$/);
  await expect(page.getByRole("alert")).toHaveText(
    "Este e-mail não está autorizado a acessar o painel.",
  );
});

test("envia recuperação e atualiza a nova senha", async ({ page }) => {
  const state = await mockAuthAndApi(page);

  await page.goto("/login");
  await page.getByRole("button", { name: "Esqueceu a senha?" }).click();
  await expect(page.getByRole("heading", { name: "Recuperar acesso" })).toBeVisible();
  await page.getByLabel("E-mail corporativo").fill(adminEmail);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByText("Se o e-mail estiver autorizado")).toBeVisible();
  expect(state.resetRequests).toEqual([adminEmail]);

  await login(page, adminEmail);
  await page.goto("/login?mode=reset");
  await page.getByLabel("Nova senha", { exact: true }).fill("nova-senha-segura-456");
  await page.getByLabel("Confirmar nova senha").fill("nova-senha-segura-456");
  await page.getByRole("button", { name: "Atualizar senha" }).click();

  await expect(page.getByText("Senha atualizada. Você já pode entrar no painel.")).toBeVisible();
  expect(state.passwordUpdates).toEqual(["nova-senha-segura-456"]);
});

test("logout remove a sessão e retorna ao login", async ({ page }) => {
  const state = await mockAuthAndApi(page);
  await login(page, adminEmail);

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2F$/);
  await expect(page.getByRole("heading", { name: "Acesso ao Sistema" })).toBeVisible();
  expect(state.getSignedInEmail()).toBeNull();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) => key.includes("auth-token")),
    ),
  ).toBe(false);
});

test("operadores não veem administração e administradores alteram função e status", async ({
  page,
}) => {
  await mockAuthAndApi(page);
  await login(page, operatorEmail);

  await expect(page.getByText("Administração", { exact: true })).toHaveCount(0);
  await page.goto("/admin/usuarios");
  await expect(page.getByRole("heading", { name: "Acesso restrito" })).toBeVisible();
  await expect(page.getByText("Apenas administradores podem acessar esta área.")).toBeVisible();

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fadmin%2Fusuarios$/);
  await login(page, adminEmail);
  await page.goto("/admin/usuarios");
  await expect(page.getByRole("heading", { name: "Gestão de Usuários" })).toBeVisible();

  const operatorRow = page.getByRole("row", { name: new RegExp(operatorEmail) });
  await expect(operatorRow).toBeVisible();
  await operatorRow.getByRole("combobox", { name: `Função de ${operatorEmail}` }).selectOption("admin");
  await expect(operatorRow.getByRole("combobox", { name: `Função de ${operatorEmail}` })).toHaveValue(
    "admin",
  );

  await operatorRow.getByRole("button", { name: `Suspender ${operatorEmail}` }).click();
  await expect(operatorRow.getByText("Suspenso")).toBeVisible();
});