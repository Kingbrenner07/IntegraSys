import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";

const testState = vi.hoisted(() => {
  const tables = {
    adminUsersTable: Symbol("adminUsersTable"),
    dashboardMetricsTable: Symbol("dashboardMetricsTable"),
    processingJobsTable: Symbol("processingJobsTable"),
  };

  const state: {
    tables: typeof tables;
    metrics: Array<Record<string, unknown>>;
    jobs: Array<Record<string, unknown>>;
    users: Array<Record<string, unknown>>;
    nextJobId: number;
    nextUserId: number;
    missingJob: boolean;
    missingUser: boolean;
    insertedJobs: number;
    db?: Record<string, unknown>;
    reset: () => void;
  } = {
    tables,
    metrics: [],
    jobs: [],
    users: [],
    nextJobId: 1,
    nextUserId: 1,
    missingJob: false,
    missingUser: false,
    insertedJobs: 0,
    reset: () => undefined,
  };

  const seed = () => {
    state.metrics = [
      {
        id: 1,
        documentsProcessed: 42,
        successRate: 98.5,
        monthlyPages: 120,
      },
    ];
    state.jobs = [
      {
        id: 1,
        moduleId: "contracheques",
        fileName: "folha-mais-recente.pdf",
        status: "completed",
        progress: 100,
        pages: 4,
        outputCount: 4,
        createdAt: new Date("2026-09-09T12:00:00.000Z"),
      },
      {
        id: 2,
        moduleId: "folha-de-ponto",
        fileName: "ponto-em-processamento.pdf",
        status: "processing",
        progress: 50,
        pages: 2,
        outputCount: 0,
        createdAt: new Date("2026-09-08T12:00:00.000Z"),
      },
    ];
    state.users = [
      {
        id: 1,
        email: "admin@empresa.com",
        role: "admin",
        status: "active",
        createdAt: new Date("2026-09-01T12:00:00.000Z"),
      },
    ];
    state.nextJobId = 3;
    state.nextUserId = 2;
    state.missingJob = false;
    state.missingUser = false;
    state.insertedJobs = 0;
  };

  const createSelectQuery = (selection?: Record<string, unknown>) => {
    let table: unknown;
    let ordered = false;
    let filtered = false;
    let resultLimit: number | undefined;
    const query: {
      from: (nextTable: unknown) => typeof query;
      orderBy: () => typeof query;
      limit: (count: number) => typeof query;
      where: () => typeof query;
      then: (
        resolve: (value: Array<Record<string, unknown>>) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise<unknown>;
    } = {
      from: (nextTable) => {
        table = nextTable;
        return query;
      },
      orderBy: () => {
        ordered = true;
        return query;
      },
      limit: (count) => {
        resultLimit = count;
        return query;
      },
      where: () => {
        filtered = true;
        return query;
      },
      then: (resolve, reject) => {
        const result = resultLimit
          ? getResult().slice(0, resultLimit)
          : getResult();
        return Promise.resolve(result).then(resolve, reject);
      },
    };

    const getResult = () => {
      if (table === tables.dashboardMetricsTable) return state.metrics;

      if (table === tables.processingJobsTable) {
        if (selection) {
          const processingCount = state.jobs.filter(
            (job) => job.status === "processing",
          ).length;
          return [{ count: processingCount }];
        }
        if (ordered) return state.jobs;
        if (filtered && state.missingJob) return [];
        return state.jobs.slice(0, 1);
      }

      if (table === tables.adminUsersTable) {
        if (ordered) return state.users;
        if (filtered && state.missingUser) return [];
        return state.users.slice(0, 1);
      }

      return [];
    };

    return query;
  };

  const db = {
    select: (selection?: Record<string, unknown>) =>
      createSelectQuery(selection),
    insert: (table: unknown) => {
      let values: Record<string, unknown> = {};
      const query = {
        values: (nextValues: Record<string, unknown>) => {
          values = nextValues;
          return query;
        },
        onConflictDoUpdate: () => query,
        returning: async () => {
          if (table === tables.processingJobsTable) {
            const job = {
              id: state.nextJobId++,
              ...values,
              createdAt: new Date("2026-09-10T12:00:00.000Z"),
            };
            state.jobs.unshift(job);
            state.insertedJobs += 1;
            return [job];
          }

          const existing = state.users.find(
            (user) => user.email === values.email,
          );
          if (existing) {
            Object.assign(existing, values);
            return [existing];
          }

          const user = {
            id: state.nextUserId++,
            ...values,
            createdAt: new Date("2026-09-10T12:00:00.000Z"),
          };
          state.users.push(user);
          return [user];
        },
      };
      return query;
    },
    update: (table: unknown) => {
      let values: Record<string, unknown> = {};
      const query = {
        set: (nextValues: Record<string, unknown>) => {
          values = nextValues;
          return query;
        },
        where: () => query,
        returning: async () => {
          if (table !== tables.adminUsersTable || state.missingUser) return [];
          const user = state.users[0];
          Object.assign(user, values);
          return [user];
        },
      };
      return query;
    },
  };

  state.db = db;
  state.reset = seed;
  seed();
  return state;
});

vi.mock("@workspace/db", () => ({
  db: testState.db,
  adminUsersTable: testState.tables.adminUsersTable,
  dashboardMetricsTable: testState.tables.dashboardMetricsTable,
  processingJobsTable: testState.tables.processingJobsTable,
}));

import { createApp } from "../app";

const testAdminActions = {
  invite: async () => "invited" as const,
  setStatus: async () => undefined,
  setRole: async () => undefined,
};

const testAdminPrincipal = {
  id: "supabase-admin-id",
  email: "admin@empresa.com",
  role: "admin" as const,
  status: "active" as const,
};

const testApp = createApp({
  authenticate: async () => testAdminPrincipal,
  adminActions: testAdminActions,
});

describe("API dashboard and processing routes", () => {
  let server: ReturnType<typeof testApp.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    server = testApp.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api`;
  });

  beforeEach(() => {
    testState.reset();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error: Error | undefined) =>
        error ? reject(error) : resolve(),
      ),
    );
  });

  async function request(path: string, init?: RequestInit) {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  }

  async function uploadRequest(params: {
    fileName: string;
    data: string;
    moduleId?: string;
    month?: string;
    year?: string;
  }) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([params.data], { type: "application/pdf" }),
      params.fileName,
    );
    if (params.moduleId !== undefined) form.append("moduleId", params.moduleId);
    if (params.month !== undefined) form.append("month", params.month);
    if (params.year !== undefined) form.append("year", params.year);
    return fetch(`${baseUrl}/processing/jobs/upload`, {
      method: "POST",
      body: form,
    });
  }

  it("exposes the public authentication configuration without a session", async () => {
    const previousUrl = process.env.VITE_SUPABASE_URL;
    const previousAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    process.env.VITE_SUPABASE_URL = "https://example.supabase.co/path";
    process.env.VITE_SUPABASE_ANON_KEY = "public-anon-key";

    try {
      const response = await request("/public-config");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "public-anon-key",
      });
    } finally {
      if (previousUrl === undefined) delete process.env.VITE_SUPABASE_URL;
      else process.env.VITE_SUPABASE_URL = previousUrl;
      if (previousAnonKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
      else process.env.VITE_SUPABASE_ANON_KEY = previousAnonKey;
    }
  });

  it("returns dashboard summary and recent activity", async () => {
    const summaryResponse = await request("/dashboard/summary");
    expect(summaryResponse.status).toBe(200);
    await expect(summaryResponse.json()).resolves.toEqual({
      documentsProcessed: 42,
      activeJobs: 1,
      successRate: 98.5,
      monthlyPages: 120,
    });

    const activityResponse = await request("/dashboard/activity");
    expect(activityResponse.status).toBe(200);
    await expect(activityResponse.json()).resolves.toEqual([
      expect.objectContaining({
        id: 1,
        title: "folha-mais-recente.pdf",
        status: "completed",
      }),
      expect.objectContaining({
        id: 2,
        title: "ponto-em-processamento.pdf",
        status: "processing",
      }),
    ]);
  });

  it("lists modules and processing history", async () => {
    const modulesResponse = await request("/modules");
    expect(modulesResponse.status).toBe(200);
    await expect(modulesResponse.json()).resolves.toHaveLength(3);

    const jobsResponse = await request("/processing/jobs");
    expect(jobsResponse.status).toBe(200);
    await expect(jobsResponse.json()).resolves.toEqual([
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ id: 2 }),
    ]);
  });

  it("creates a queued processing job and retrieves it", async () => {
    const createResponse = await request("/processing/jobs", {
      method: "POST",
      body: JSON.stringify({
        moduleId: "documentos-rh",
        fileName: "documentos-setembro.PDF",
        pages: 3,
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created).toEqual(
      expect.objectContaining({
        id: 3,
        moduleId: "documentos-rh",
        fileName: "documentos-setembro.PDF",
        status: "queued",
        progress: 0,
        pages: 3,
        outputCount: 0,
      }),
    );
    expect(testState.insertedJobs).toBe(1);

    const detailResponse = await request("/processing/jobs/3");
    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toEqual(
      expect.objectContaining({ id: 3 }),
    );
  });

  it.each([
    [{ moduleId: "contracheques", fileName: "dados.csv", pages: 2 }],
    [{ moduleId: "contracheques", fileName: "sem-paginas.pdf", pages: 0 }],
    [{ moduleId: "contracheques", fileName: "sem-paginas.pdf", pages: 1.5 }],
  ])("rejects invalid processing uploads: %o", async (body) => {
    const response = await request("/processing/jobs", {
      method: "POST",
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
    expect(testState.insertedJobs).toBe(0);
  });

  it.each(["payroll", "attendance", "hr-documents"])(
    "returns the extension rejection for the %s module",
    async (moduleId) => {
      const response = await uploadRequest({
        fileName: "arquivo.txt",
        data: "%PDF-",
        moduleId,
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "O arquivo deve ter extensão .pdf.",
      });
      expect(testState.insertedJobs).toBe(0);
    },
  );

  it.each(["payroll", "attendance", "hr-documents"])(
    "returns the invalid-PDF rejection for the %s module",
    async (moduleId) => {
      const response = await uploadRequest({
        fileName: "arquivo.pdf",
        data: "não é um PDF",
        moduleId,
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "O arquivo enviado não é um PDF válido.",
      });
      expect(testState.insertedJobs).toBe(0);
    },
  );

  it.each([
    ["month", { month: "13", year: "2026" }],
    ["year", { month: "09", year: "26" }],
  ])("returns the attendance %s validation message", async (_field, values) => {
    const response = await uploadRequest({
      fileName: "ponto.pdf",
      // The route validates attendance fields before reading the PDF page count.
      data: "%PDF-",
      moduleId: "attendance",
      ...values,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        _field === "month"
          ? "Informe um mês de competência entre 01 e 12."
          : "Informe um ano de competência com quatro dígitos.",
    });
    expect(testState.insertedJobs).toBe(0);
  });

  it("returns 404 for an unknown processing job", async () => {
    testState.missingJob = true;
    const response = await request("/processing/jobs/999");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Processamento não encontrado.",
    });
  });
});

describe("API administration routes", () => {
  let server: ReturnType<typeof testApp.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    server = testApp.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api`;
  });

  beforeEach(() => {
    testState.reset();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error: Error | undefined) =>
        error ? reject(error) : resolve(),
      ),
    );
  });

  async function request(path: string, init?: RequestInit) {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  }

  it("lists users, normalizes invitation email, and updates status", async () => {
    const listResponse = await request("/admin/users");
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({ email: "admin@empresa.com", role: "admin" }),
    ]);

    const inviteResponse = await request("/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: "Operador@Empresa.com",
        role: "operator",
      }),
    });
    expect(inviteResponse.status).toBe(201);
    await expect(inviteResponse.json()).resolves.toEqual(
      expect.objectContaining({
        email: "operador@empresa.com",
        role: "operator",
        status: "invited",
      }),
    );

    const updateResponse = await request("/admin/users/1/status", {
      method: "PATCH",
      body: JSON.stringify({ status: "suspended" }),
    });
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toEqual(
      expect.objectContaining({
        id: 1,
        status: "suspended",
      }),
    );

    const roleResponse = await request("/admin/users/1/role", {
      method: "PATCH",
      body: JSON.stringify({ role: "operator" }),
    });
    expect(roleResponse.status).toBe(200);
    await expect(roleResponse.json()).resolves.toEqual(
      expect.objectContaining({
        id: 1,
        role: "operator",
      }),
    );
  });

  it("authorizes an existing Supabase identity without sending another invite", async () => {
    const existingUserApp = createApp({
      authenticate: async () => testAdminPrincipal,
      adminActions: {
        ...testAdminActions,
        invite: async () => "existing" as const,
      },
    });
    const existingUserServer = existingUserApp.listen(0);
    await new Promise<void>((resolve) =>
      existingUserServer.once("listening", resolve),
    );
    const address = existingUserServer.address() as AddressInfo;

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/admin/users`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "existente@empresa.com",
            role: "operator",
          }),
        },
      );

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({
          email: "existente@empresa.com",
          role: "operator",
          status: "active",
        }),
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        existingUserServer.close((error) =>
          error ? reject(error) : resolve(),
        ),
      );
    }
  });

  it.each([
    [{ email: "not-an-email", role: "operator" }],
    [{ email: "valid@empresa.com", role: "owner" }],
  ])("rejects invalid invitations: %o", async (body) => {
    const response = await request("/admin/users", {
      method: "POST",
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
    expect(testState.users).toHaveLength(1);
  });

  it("rejects invalid status changes and missing users", async () => {
    const invalidResponse = await request("/admin/users/1/status", {
      method: "PATCH",
      body: JSON.stringify({ status: "invited" }),
    });
    expect(invalidResponse.status).toBe(400);

    testState.missingUser = true;
    const missingResponse = await request("/admin/users/999/status", {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({
      error: "Usuário não encontrado.",
    });
  });
});

describe("API authentication boundaries", () => {
  it("keeps health public but rejects protected routes without a session", async () => {
    const unauthenticatedApp = createApp({
      authenticate: async () => null,
    });
    const server = unauthenticatedApp.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/api`;

    const health = await fetch(`${baseUrl}/healthz`);
    expect(health.status).toBe(200);

    const protectedResponse = await fetch(`${baseUrl}/dashboard/summary`);
    expect(protectedResponse.status).toBe(401);

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("returns the authenticated profile through the protected auth endpoint", async () => {
    const server = testApp.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/auth/me`,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(testAdminPrincipal);
    await new Promise<void>((resolve, reject) =>
      server.close((error: Error | undefined) =>
        error ? reject(error) : resolve(),
      ),
    );
  });

  it("denies operators from administrative routes", async () => {
    const operatorApp = createApp({
      authenticate: async () => ({
        id: "supabase-operator-id",
        email: "operador@empresa.com",
        role: "operator" as const,
        status: "active" as const,
      }),
      adminActions: testAdminActions,
    });
    const server = operatorApp.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/admin/users`,
    );
    expect(response.status).toBe(403);

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
});