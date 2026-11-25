import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { DEFAULT_INSTRUCTIONS, type AgentInput } from "@support-agent/shared/api/agents";
import { DEFAULT_SEARCH_API_CONFIG } from "@support-agent/shared/api/knowledge";
import { getDb } from "../db/client";
import { auditLog, providers } from "../db/schema";
import { createUser, request, resetDatabase } from "../test/helpers";
import { setLlmClientFactoryForTests } from "../llm";
import { ensureEnvironmentAdmins } from "../auth/bootstrap";

// Sign-in is the OIDC provider's job; these tests act as a person from the database.
vi.mock("../auth/resolve", async () => {
  const { eq: equals } = await import("drizzle-orm");
  const { users } = await import("../db/schema");
  return {
    resolvePrincipal: async (db: ReturnType<typeof getDb>, headers: Headers) => {
      const id = headers.get("x-test-user");
      if (!id) return null;
      const [user] = await db.select().from(users).where(equals(users.id, id));
      return user?.isActive
        ? { kind: "user", id: user.id, email: user.email, name: user.name, role: user.role, image: null }
        : null;
    },
  };
});

beforeEach(async () => {
  await resetDatabase();
  setLlmClientFactoryForTests(null);
});

function agentInput(overrides: Partial<AgentInput> = {}): AgentInput {
  return {
    name: "IT support",
    enabled: false,
    instructions: DEFAULT_INSTRUCTIONS,
    providerId: null,
    model: "",
    fallbackProviderId: null,
    fallbackModel: null,
    replyMode: "questions",
    followUpsInThreads: false,
    noAnswerMode: "escalate",
    escalationMessage: "Ask the IT team.",
    headlineThreads: false,
    headlineMessage: "",
    displayName: null,
    iconUrl: null,
    readImages: true,
    channels: [],
    knowledgeSourceIds: [],
    ...overrides,
  };
}

describe("access", () => {
  it("needs a signed-in person and keeps admin areas from editors", async () => {
    expect((await request("GET", "/api/v1/agents")).status).toBe(401);
    expect((await request("GET", "/api/v1/auth-config")).body).toEqual({
      appName: "Support Agent",
      providerName: "single sign-on",
    });
    const editor = await createUser("editor");
    expect((await request("GET", "/api/v1/agents", { userId: editor.id })).status).toBe(200);
    expect((await request("GET", "/api/v1/providers", { userId: editor.id })).status).toBe(200);
    const denied = await request("POST", "/api/v1/providers", {
      userId: editor.id,
      body: { name: "OpenAI", kind: "openai", apiKey: "sk-x" },
    });
    expect(denied.status).toBe(403);
    expect((await request("GET", "/api/v1/slack", { userId: editor.id })).status).toBe(403);
    expect((await request("GET", "/api/v1/users", { userId: editor.id })).status).toBe(403);
  });

  it("rejects cross-site changes", async () => {
    const admin = await createUser("admin");
    const { createApp } = await import("../http/app");
    const response = await createApp().request("/api/v1/settings", {
      method: "PUT",
      headers: {
        origin: "https://evil.example.org",
        "x-test-user": admin.id,
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(response.status).toBe(403);
  });
});

describe("providers", () => {
  it("stores the key encrypted and never returns it", async () => {
    const admin = await createUser("admin");
    const created = await request("POST", "/api/v1/providers", {
      userId: admin.id,
      body: { name: "Mistral", kind: "mistral", apiKey: "mistral-secret-key-1234" },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: "Mistral",
      kind: "mistral",
      hasApiKey: true,
      apiKeyHint: "…1234",
    });
    expect(JSON.stringify(created.body)).not.toContain("mistral-secret");
    const [row] = await getDb().select().from(providers);
    expect(row?.apiKeyEncrypted).not.toContain("mistral-secret");
    const [entry] = await getDb().select().from(auditLog);
    expect(entry?.summary).toBe('Added provider "Mistral" (Mistral AI)');

    const invalid = await request("POST", "/api/v1/providers", {
      userId: admin.id,
      body: { name: "Local", kind: "openai_compatible" },
    });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.fields).toHaveProperty("baseUrl");
  });

  it("refuses to delete a provider an agent uses", async () => {
    const admin = await createUser("admin");
    const provider = await request("POST", "/api/v1/providers", {
      userId: admin.id,
      body: { name: "OpenAI", kind: "openai", apiKey: "sk-test-key-5678" },
    });
    await request("POST", "/api/v1/agents", {
      userId: admin.id,
      body: agentInput({ providerId: provider.body.id, model: "gpt-test" }),
    });
    const deleted = await request("DELETE", `/api/v1/providers/${provider.body.id}`, { userId: admin.id });
    expect(deleted.status).toBe(409);
    expect(deleted.body.error.message).toContain('"IT support"');
  });
});

describe("agents", () => {
  it("creates, updates with a version check, and keeps channels to one agent", async () => {
    const editor = await createUser("editor");
    const first = await request("POST", "/api/v1/agents", {
      userId: editor.id,
      body: agentInput({ channels: ["C0SUPPORT"] }),
    });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ version: 1, channels: [{ id: "C0SUPPORT", name: null }] });

    const taken = await request("POST", "/api/v1/agents", {
      userId: editor.id,
      body: agentInput({ name: "HR", channels: ["C0SUPPORT"] }),
    });
    expect(taken.status).toBe(422);
    expect(taken.body.error.fields.channels).toContain('"IT support"');

    const updated = await request("PUT", `/api/v1/agents/${first.body.id}`, {
      userId: editor.id,
      body: { ...agentInput({ name: "IT help", channels: ["C0SUPPORT", "C0HELPDESK"] }), version: 1 },
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: "IT help", version: 2 });
    expect(updated.body.channels.map((channel: { id: string }) => channel.id).sort()).toEqual([
      "C0HELPDESK",
      "C0SUPPORT",
    ]);

    const stale = await request("PUT", `/api/v1/agents/${first.body.id}`, {
      userId: editor.id,
      body: { ...agentInput(), version: 1 },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("version_conflict");
  });

  it("lets only one of several simultaneous saves of the same version through", async () => {
    const editor = await createUser("editor");
    const created = await request("POST", "/api/v1/agents", { userId: editor.id, body: agentInput() });
    const saves = await Promise.all(
      ["A", "B", "C", "D", "E"].map((name) =>
        request("PUT", `/api/v1/agents/${created.body.id}`, {
          userId: editor.id,
          body: { ...agentInput({ name }), version: 1 },
        }),
      ),
    );
    expect(saves.map((save) => save.status).sort()).toEqual([200, 409, 409, 409, 409]);
    const saved = await request("GET", `/api/v1/agents/${created.body.id}`, { userId: editor.id });
    expect(saved.body.version).toBe(2);
  });

  it("requires a model, channels and a provider for enabled agents", async () => {
    const editor = await createUser("editor");
    const response = await request("POST", "/api/v1/agents", {
      userId: editor.id,
      body: agentInput({ enabled: true }),
    });
    expect(response.status).toBe(422);
    expect(Object.keys(response.body.error.fields).sort()).toEqual(["channels", "model", "providerId"]);
  });

  it("previews unsaved changes and runs saved tests", async () => {
    const admin = await createUser("admin");
    setLlmClientFactoryForTests(() => ({
      async chatJson(request) {
        const text =
          request.schemaName === "triage"
            ? JSON.stringify({ respond: true, reason: "Question", searchQueries: ["printer"] })
            : JSON.stringify({ status: "answered", answer: "Floor 2.", citedRefs: ["S1"] });
        return { text, inputTokens: 1, outputTokens: 1, refused: false };
      },
      async listModels() {
        return [{ id: "m1", name: null }];
      },
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ results: [{ title: "Printers", url: "https://it.example.org/p", text: "Floor 2" }] }),
      ),
    );
    try {
      const provider = await request("POST", "/api/v1/providers", {
        userId: admin.id,
        body: { name: "OpenAI", kind: "openai", apiKey: "sk-test-key-0000" },
      });
      const source = await request("POST", "/api/v1/knowledge-sources", {
        userId: admin.id,
        body: { name: "KB", kind: "search_api", config: DEFAULT_SEARCH_API_CONFIG, secret: "token" },
      });
      expect(source.body).toMatchObject({ hasSecret: true });
      expect(JSON.stringify(source.body)).not.toContain('"token"');
      const draft = agentInput({
        providerId: provider.body.id,
        model: "m1",
        knowledgeSourceIds: [source.body.id],
      });

      const preview = await request("POST", "/api/v1/agents/preview", {
        userId: admin.id,
        body: { question: "Where is the printer?", draft },
      });
      expect(preview.status).toBe(200);
      expect(preview.body).toMatchObject({
        outcome: "answered",
        slackText: "Floor 2.\n\n:page_facing_up: <https://it.example.org/p|Printers>",
        citedRefs: ["S1"],
      });

      const agent = await request("POST", "/api/v1/agents", { userId: admin.id, body: draft });
      await request("POST", `/api/v1/agents/${agent.body.id}/tests`, {
        userId: admin.id,
        body: {
          question: "Where is the printer?",
          expectation: "answer",
          expectedUrl: "https://it.example.org/p/",
        },
      });
      await request("POST", `/api/v1/agents/${agent.body.id}/tests`, {
        userId: admin.id,
        body: { question: "Thanks!", expectation: "silent", expectedUrl: null },
      });
      const run = await request("POST", `/api/v1/agents/${agent.body.id}/tests/run`, {
        userId: admin.id,
        body: {},
      });
      expect(run.body).toMatchObject({ passed: 1, failed: 1 });
      expect(run.body.tests[1]).toMatchObject({ lastPassed: false, lastFailure: "The agent answered" });

      const models = await request("GET", `/api/v1/providers/${provider.body.id}/models`, {
        userId: admin.id,
      });
      expect(models.body).toEqual({ models: [{ id: "m1", name: null }] });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("users", () => {
  it("keeps at least one admin and protects ADMIN_EMAILS", async () => {
    await ensureEnvironmentAdmins(getDb());
    const admin = await createUser("admin");
    const list = await request("GET", "/api/v1/users", { userId: admin.id });
    const root = list.body.items.find((user: { email: string }) => user.email === "root@example.org");
    expect(root).toMatchObject({ role: "admin", fromEnvironment: true });
    expect(
      (await request("PATCH", `/api/v1/users/${root.id}`, { userId: admin.id, body: { role: "editor" } }))
        .status,
    ).toBe(409);

    const added = await request("POST", "/api/v1/users", {
      userId: admin.id,
      body: { email: "New.Person@Example.org", role: "editor" },
    });
    expect(added.body).toMatchObject({
      email: "new.person@example.org",
      role: "editor",
      fromEnvironment: false,
    });
    expect(
      (
        await request("POST", "/api/v1/users", {
          userId: admin.id,
          body: { email: "new.person@example.org", role: "admin" },
        })
      ).status,
    ).toBe(409);
  });

  it("refuses to remove the last active admin", async () => {
    const admin = await createUser("admin");
    const response = await request("PATCH", `/api/v1/users/${admin.id}`, {
      userId: admin.id,
      body: { isActive: false },
    });
    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe("At least one active admin must remain");
  });
});

describe("status", () => {
  it("reports the setup steps", async () => {
    const admin = await createUser("admin");
    const status = await request("GET", "/api/v1/status", { userId: admin.id });
    expect(status.body).toMatchObject({
      bot: { state: "not_configured" },
      setup: { slack: false, provider: false, knowledgeSource: false, agent: false },
      last24h: { messages: 0 },
    });
    await getDb().update(providers).set({ name: "x" }).where(eq(providers.name, "none"));
  });
});
