import { Hono } from "hono";
import { and, asc, count, desc, eq, ne, sql } from "drizzle-orm";
import {
  auditListQuerySchema,
  userCreateSchema,
  userUpdateSchema,
  type User,
} from "@support-agent/shared/api/users";
import type { Role } from "@support-agent/shared/roles";
import { getDb, type Tx } from "../db/client";
import { auditLog, sessions, users } from "../db/schema";
import { audit } from "../core/audit";
import { isEnvironmentAdmin } from "../auth/bootstrap";
import type { AppEnv } from "../http/env";
import { conflict, notFound } from "../http/errors";
import { idParam, jsonBody, queryOf, requireAdmin } from "../http/middleware";
import { iso, isoRequired } from "./util";

type Row = typeof users.$inferSelect;

function toUser(row: Row): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as Role,
    isActive: row.isActive,
    fromEnvironment: isEnvironmentAdmin(row.email),
    lastSignInAt: iso(row.lastSignInAt),
    createdAt: isoRequired(row.createdAt),
  };
}

/** Refuses a change that would leave no active admin. */
async function keepOneAdmin(tx: Tx, exceptId: string) {
  const [other] = await tx
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true), ne(users.id, exceptId)));
  if (!other?.value) throw conflict("At least one active admin must remain");
}

const router = new Hono<AppEnv>();

router.get("/users", async (c) => {
  requireAdmin(c);
  const rows = await getDb().select().from(users).orderBy(asc(users.email));
  return c.json({ items: rows.map(toUser) });
});

router.post("/users", async (c) => {
  const actor = requireAdmin(c);
  const input = await jsonBody(c, userCreateSchema);
  const row = await getDb().transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (existing) throw conflict("This email address is already on the list");
    const [created] = await tx
      .insert(users)
      .values({ email: input.email, name: input.name, role: input.role, isActive: true })
      .returning();
    await audit(tx, actor, {
      action: "user.created",
      entityType: "user",
      entityId: created!.id,
      summary: `Added ${input.email} as ${input.role}`,
    });
    return created!;
  });
  return c.json(toUser(row), 201);
});

router.patch("/users/:id", async (c) => {
  const actor = requireAdmin(c);
  const id = idParam(c);
  const input = await jsonBody(c, userUpdateSchema);
  const row = await getDb().transaction(async (tx) => {
    const [current] = await tx.select().from(users).where(eq(users.id, id));
    if (!current) throw notFound("Person not found");
    if (isEnvironmentAdmin(current.email))
      throw conflict("This admin is set in ADMIN_EMAILS; change it there");
    const demoted = input.role !== undefined && input.role !== "admin" && current.role === "admin";
    const deactivated = input.isActive === false && current.isActive;
    if (current.role === "admin" && current.isActive && (demoted || deactivated)) await keepOneAdmin(tx, id);
    const [updated] = await tx
      .update(users)
      .set({ ...input, updatedAt: sql`now()` })
      .where(eq(users.id, id))
      .returning();
    if (deactivated) await tx.delete(sessions).where(eq(sessions.userId, id));
    const changes = [
      input.role !== undefined && input.role !== current.role ? `role ${input.role}` : null,
      input.isActive !== undefined && input.isActive !== current.isActive
        ? input.isActive
          ? "reactivated"
          : "deactivated"
        : null,
    ].filter(Boolean);
    await audit(tx, actor, {
      action: "user.updated",
      entityType: "user",
      entityId: id,
      summary: `Changed ${current.email}${changes.length ? `: ${changes.join(", ")}` : ""}`,
    });
    return updated!;
  });
  return c.json(toUser(row));
});

router.delete("/users/:id", async (c) => {
  const actor = requireAdmin(c);
  const id = idParam(c);
  await getDb().transaction(async (tx) => {
    const [current] = await tx.select().from(users).where(eq(users.id, id));
    if (!current) throw notFound("Person not found");
    if (isEnvironmentAdmin(current.email))
      throw conflict("This admin is set in ADMIN_EMAILS; change it there");
    if (current.role === "admin" && current.isActive) await keepOneAdmin(tx, id);
    await tx.delete(users).where(eq(users.id, id));
    await audit(tx, actor, {
      action: "user.deleted",
      entityType: "user",
      entityId: id,
      summary: `Removed ${current.email}`,
    });
  });
  return c.json({ ok: true });
});

router.get("/audit", async (c) => {
  requireAdmin(c);
  const query = queryOf(c, auditListQuerySchema);
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ value: count() }).from(auditLog),
  ]);
  return c.json({
    items: rows.map((row) => ({
      id: row.id,
      createdAt: isoRequired(row.createdAt),
      actorEmail: row.actorEmail,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      summary: row.summary,
    })),
    total: total?.value ?? 0,
  });
});

export default router;
