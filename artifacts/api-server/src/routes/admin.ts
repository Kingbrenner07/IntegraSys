import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { adminUsersTable, db } from "@workspace/db";
import {
  InviteAdminUserBody,
  InviteAdminUserResponse,
  ListAdminUsersResponse,
  UpdateAdminUserStatusBody,
  UpdateAdminUserStatusParams,
  UpdateAdminUserStatusResponse,
  UpdateAdminUserRoleBody,
  UpdateAdminUserRoleResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";
import {
  type AdminAuthActions,
  SupabaseAdminError,
  supabaseAdminActions,
} from "../lib/supabase-admin";

export function createAdminRouter(
  adminActions: AdminAuthActions = supabaseAdminActions,
): IRouter {
  const router: IRouter = Router();
  router.use(requireAdmin);

  router.get("/admin/users", async (_req, res): Promise<void> => {
  const users = await db
    .select()
    .from(adminUsersTable)
    .orderBy(asc(adminUsersTable.email));
  res.json(
    ListAdminUsersResponse.parse(
      users.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
      })),
    ),
  );
  });

  router.post("/admin/users", async (req, res): Promise<void> => {
  const parsed = InviteAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

    const email = parsed.data.email.trim().toLowerCase();
    let invitationResult: "invited" | "existing";
    try {
      invitationResult = await adminActions.invite(email, parsed.data.role);
    } catch (error) {
      if (error instanceof SupabaseAdminError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      throw error;
    }

    const [user] = await db
      .insert(adminUsersTable)
      .values({
        email,
        role: parsed.data.role,
        status: invitationResult === "existing" ? "active" : "invited",
      })
      .onConflictDoUpdate({
        target: adminUsersTable.email,
        set: {
          role: parsed.data.role,
          status: invitationResult === "existing" ? "active" : "invited",
        },
      })
      .returning();

  res.status(201).json(
    InviteAdminUserResponse.parse({
      ...user,
      createdAt: user.createdAt.toISOString(),
    }),
  );
  });

  router.patch(
    "/admin/users/:userId/status",
    async (req, res): Promise<void> => {
    const params = UpdateAdminUserStatusParams.safeParse(req.params);
    const body = UpdateAdminUserStatusBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }

      const [existing] = await db
        .select()
        .from(adminUsersTable)
        .where(eq(adminUsersTable.id, params.data.userId))
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: "Usuário não encontrado." });
        return;
      }

      try {
        await adminActions.setStatus(existing.email, body.data.status);
      } catch (error) {
        if (error instanceof SupabaseAdminError) {
          res.status(error.statusCode).json({ error: error.message });
          return;
        }
        throw error;
      }

      const [user] = await db
      .update(adminUsersTable)
      .set({ status: body.data.status })
      .where(eq(adminUsersTable.id, params.data.userId))
      .returning();

      res.json(
        UpdateAdminUserStatusResponse.parse({
          ...user,
          createdAt: user.createdAt.toISOString(),
        }),
      );
    },
  );

  router.patch(
    "/admin/users/:userId/role",
    async (req, res): Promise<void> => {
      const params = UpdateAdminUserStatusParams.safeParse(req.params);
      const body = UpdateAdminUserRoleBody.safeParse(req.body);
      if (!params.success || !body.success) {
        res.status(400).json({ error: "Dados inválidos." });
        return;
      }

      const [existing] = await db
        .select()
        .from(adminUsersTable)
        .where(eq(adminUsersTable.id, params.data.userId))
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: "Usuário não encontrado." });
        return;
      }

      try {
        await adminActions.setRole(existing.email, body.data.role);
      } catch (error) {
        if (error instanceof SupabaseAdminError) {
          res.status(error.statusCode).json({ error: error.message });
          return;
        }
        throw error;
      }

      const [user] = await db
        .update(adminUsersTable)
        .set({ role: body.data.role })
        .where(eq(adminUsersTable.id, params.data.userId))
        .returning();

      res.json(
        UpdateAdminUserRoleResponse.parse({
          ...user,
          createdAt: user.createdAt.toISOString(),
        }),
      );
    },
  );

  return router;
}

export default createAdminRouter();