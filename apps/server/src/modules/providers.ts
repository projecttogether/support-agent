import { Hono } from "hono";
import { asc, eq, or, sql } from "drizzle-orm";
import {
  PROVIDER_LABELS,
  providerCreateSchema,
  providerTestInputSchema,
  providerUpdateSchema,
  type Provider,
  type ProviderCreate,
  type ProviderKind,
  type ProviderModels,
  type ProviderUpdate,
} from "@support-agent/shared/api/providers";
import type { CheckResult } from "@support-agent/shared/api/common";
import { getDb, type DbOrTx } from "../db/client";
import { agents, providers } from "../db/schema";
import { encryptSecret, secretHint } from "../core/crypto";
import { audit } from "../core/audit";
import { notifyConfigChanged } from "../core/config-events";
import type { Actor } from "../auth/principal";
import type { AppEnv } from "../http/env";
import { AppError, conflict, notFound } from "../http/errors";
import { idParam, jsonBody, requireAdmin, requireUser } from "../http/middleware";
import { providerConnection } from "../agent/runtime";
import { generateJson, llmClient, LlmError } from "../llm";
import { z } from "zod";
import { iso, isoRequired } from "./util";

type Row = typeof providers.$inferSelect;

async function agentCounts(db: DbOrTx): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: providers.id, count: sql<number>`count(${agents.id})::int` })
    .from(providers)
    .leftJoin(agents, or(eq(agents.providerId, providers.id), eq(agents.fallbackProviderId, providers.id)))
    .groupBy(providers.id);
  return new Map(rows.map((row) => [row.id, row.count]));
}

function toProvider(row: Row, count: number): Provider {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as ProviderKind,
    baseUrl: row.baseUrl,
    hasApiKey: Boolean(row.apiKeyEncrypted),
    apiKeyHint: row.apiKeyEncrypted ? row.apiKeyHint : null,
    agentCount: count,
    createdAt: isoRequired(row.createdAt),
    updatedAt: iso(row.updatedAt)!,
  };
}

async function load(db: DbOrTx, id: string): Promise<Row> {
  const [row] = await db.select().from(providers).where(eq(providers.id, id));
  if (!row) throw notFound("Provider not found");
  return row;
}

// ---------------------------------------------------------------------------
// Service: the admin page's routes and `cli settings … providers` call these.
// ---------------------------------------------------------------------------

/** Every provider, as admins see it on the Providers page. */
export async function listProviders(): Promise<Provider[]> {
  const db = getDb();
  const [rows, counts] = await Promise.all([
    db.select().from(providers).orderBy(asc(providers.name)),
    agentCounts(db),
  ]);
  return rows.map((row) => toProvider(row, counts.get(row.id) ?? 0));
}

export async function readProvider(id: string): Promise<Provider> {
  const db = getDb();
  const row = await load(db, id);
  const counts = await agentCounts(db);
  return toProvider(row, counts.get(id) ?? 0);
}

export async function createProvider(actor: Actor, input: ProviderCreate): Promise<Provider> {
  const row = await getDb().transaction(async (tx) => {
    const [created] = await tx
      .insert(providers)
      .values({
        name: input.name,
        kind: input.kind,
        baseUrl: input.baseUrl ?? null,
        apiKeyEncrypted: input.apiKey ? encryptSecret(input.apiKey) : null,
        apiKeyHint: input.apiKey ? secretHint(input.apiKey) : null,
      })
      .returning();
    await audit(tx, actor, {
      action: "provider.created",
      entityType: "provider",
      entityId: created!.id,
      summary: `Added provider "${input.name}" (${PROVIDER_LABELS[input.kind]})`,
    });
    return created!;
  });
  return toProvider(row, 0);
}

export async function updateProvider(actor: Actor, id: string, input: ProviderUpdate): Promise<Provider> {
  const db = getDb();
  const row = await db.transaction(async (tx) => {
    const current = await load(tx, id);
    if (current.kind === "openai_compatible" && input.baseUrl === null) {
      throw conflict("An OpenAI-compatible provider needs a base URL");
    }
    if (current.kind !== "openai_compatible" && input.apiKey === null) {
      throw conflict("This provider needs an API key; enter a new one instead");
    }
    const changes: Partial<typeof providers.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) changes.name = input.name;
    if (input.baseUrl !== undefined) changes.baseUrl = input.baseUrl;
    if (input.apiKey !== undefined) {
      changes.apiKeyEncrypted = input.apiKey ? encryptSecret(input.apiKey) : null;
      changes.apiKeyHint = input.apiKey ? secretHint(input.apiKey) : null;
    }
    const [updated] = await tx.update(providers).set(changes).where(eq(providers.id, id)).returning();
    await audit(tx, actor, {
      action: "provider.updated",
      entityType: "provider",
      entityId: id,
      summary: `Changed provider "${updated!.name}"${input.apiKey !== undefined ? " (API key replaced)" : ""}`,
    });
    await notifyConfigChanged(tx);
    return updated!;
  });
  const counts = await agentCounts(db);
  return toProvider(row, counts.get(id) ?? 0);
}

export async function deleteProvider(actor: Actor, id: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const current = await load(tx, id);
    const [used] = await tx
      .select({ name: agents.name })
      .from(agents)
      .where(or(eq(agents.providerId, id), eq(agents.fallbackProviderId, id)))
      .limit(1);
    if (used)
      throw conflict(`The agent "${used.name}" uses this provider. Choose another provider there first.`);
    await tx.delete(providers).where(eq(providers.id, id));
    await audit(tx, actor, {
      action: "provider.deleted",
      entityType: "provider",
      entityId: id,
      summary: `Deleted provider "${current.name}"`,
    });
  });
}

/** The models the provider lists; a 502 with the provider's problem when it lists none. */
export async function listProviderModels(id: string): Promise<ProviderModels> {
  const row = await load(getDb(), id);
  try {
    return { models: await llmClient(providerConnection(row)).listModels() };
  } catch (error) {
    // Not every compatible API lists its models; people can type the name instead.
    const message = error instanceof LlmError ? error.message : "Could not list the models";
    throw new AppError(502, "provider_error", message);
  }
}

/** The provider as stored, for its test (404 when it is gone). */
export const loadProvider = (id: string) => load(getDb(), id);

/** The page's test button: one small model call. */
export async function testProvider(row: Row, model: string): Promise<CheckResult> {
  const started = performance.now();
  try {
    const reply = await generateJson(
      llmClient(providerConnection(row)),
      {
        model,
        system: "You check that a model connection works.",
        messages: [{ role: "user", content: [{ type: "text", text: 'Reply with {"ok": true}.' }] }],
        schemaName: "check",
        jsonSchema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false,
        },
      },
      z.object({ ok: z.boolean() }),
    );
    return {
      ok: true,
      message: `The model answered (${reply.inputTokens + reply.outputTokens} tokens)`,
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof LlmError ? error.message : "The model call failed",
      latencyMs: Math.round(performance.now() - started),
    };
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const router = new Hono<AppEnv>();

/** Editors read the list for the agent form; only admins see the hints of the keys. */
router.get("/providers", async (c) => {
  const principal = requireUser(c);
  const items = await listProviders();
  return c.json({
    items: principal.role === "admin" ? items : items.map((item) => ({ ...item, apiKeyHint: null })),
  });
});

router.post("/providers", async (c) => {
  const actor = requireAdmin(c);
  const input = await jsonBody(c, providerCreateSchema);
  return c.json(await createProvider(actor, input), 201);
});

router.patch("/providers/:id", async (c) => {
  const actor = requireAdmin(c);
  const id = idParam(c);
  const input = await jsonBody(c, providerUpdateSchema);
  return c.json(await updateProvider(actor, id, input));
});

router.delete("/providers/:id", async (c) => {
  const actor = requireAdmin(c);
  await deleteProvider(actor, idParam(c));
  return c.json({ ok: true });
});

router.get("/providers/:id/models", async (c) => {
  requireUser(c);
  return c.json(await listProviderModels(idParam(c)));
});

router.post("/providers/:id/test", async (c) => {
  requireAdmin(c);
  const row = await loadProvider(idParam(c));
  const { model } = await jsonBody(c, providerTestInputSchema);
  return c.json(await testProvider(row, model));
});

export default router;
