import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseAdminActions } from "../lib/supabase-admin";

describe("Supabase admin invitations", () => {
  const previousUrl = process.env.VITE_SUPABASE_URL;
  const previousServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousUrl === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = previousUrl;
    if (previousServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRoleKey;
    }
  });

  it("returns invited when Supabase creates a new invitation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      supabaseAdminActions.invite("novo@empresa.com", "operator"),
    ).resolves.toBe("invited");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("authorizes an identity that already exists in Supabase Auth", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"message":"User already registered"}', {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            users: [
              {
                id: "existing-user-id",
                email: "existente@empresa.com",
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      supabaseAdminActions.invite("existente@empresa.com", "operator"),
    ).resolves.toBe("existing");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/auth/v1/admin/users");
  });

  it("does not authorize an email that cannot be confirmed in Supabase Auth", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"message":"Invitation rejected"}', {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ users: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      supabaseAdminActions.invite("ausente@empresa.com", "operator"),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "SupabaseAdminError",
        statusCode: 502,
        message: "Usuário não encontrado no Supabase Auth.",
      }),
    );
  });
});