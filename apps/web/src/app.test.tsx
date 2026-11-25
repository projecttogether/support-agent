import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, AgentTest } from "@support-agent/shared/api/agents";
import type { Exchange } from "@support-agent/shared/api/exchanges";
import type { KnowledgeSource } from "@support-agent/shared/api/knowledge";
import type { Provider } from "@support-agent/shared/api/providers";
import type { SlackSettings } from "@support-agent/shared/api/slack";
import type { Status } from "@support-agent/shared/api/status";
import type { Me, User } from "@support-agent/shared/api/users";
import { DEFAULT_APP_SETTINGS } from "@support-agent/shared/api/settings";
import { DEFAULT_SEARCH_API_CONFIG } from "@support-agent/shared/api/knowledge";
import { ThemeProvider } from "@/lib/theme";
import { createAppRouter } from "@/router";

const AT = "2026-11-15T09:00:00.000Z";
const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const PROVIDER_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_ID = "33333333-3333-4333-8333-333333333333";
const EXCHANGE_ID = "44444444-4444-4444-8444-444444444444";

const me: Me = {
  id: "55555555-5555-4555-8555-555555555555",
  email: "admin@example.org",
  name: "Ada Admin",
  role: "admin",
  image: null,
};
const agent: Agent = {
  id: AGENT_ID,
  name: "IT support",
  enabled: true,
  instructions: "Answer IT questions.",
  providerId: PROVIDER_ID,
  model: "claude-sonnet-5-5",
  fallbackProviderId: null,
  fallbackModel: null,
  replyMode: "questions",
  followUpsInThreads: true,
  noAnswerMode: "escalate",
  escalationMessage: "Please ask the IT team.",
  headlineThreads: false,
  headlineMessage: "",
  displayName: null,
  iconUrl: null,
  readImages: false,
  channels: [{ id: "C01ABCDEF", name: "it-help" }],
  knowledgeSourceIds: [SOURCE_ID],
  version: 3,
  createdAt: AT,
  updatedAt: AT,
};
const test: AgentTest = {
  id: "66666666-6666-4666-8666-666666666666",
  agentId: AGENT_ID,
  question: "How do I reset my password?",
  expectation: "answer",
  expectedUrl: "https://wiki.example.org/pw",
  lastRunAt: AT,
  lastPassed: false,
  lastOutcome: "no_answer",
  lastAnswer: null,
  lastFailure: "The answer didn't cite https://wiki.example.org/pw",
  createdAt: AT,
};
const provider: Provider = {
  id: PROVIDER_ID,
  name: "Anthropic",
  kind: "anthropic",
  baseUrl: null,
  hasApiKey: true,
  apiKeyHint: "…3f9a",
  agentCount: 1,
  createdAt: AT,
  updatedAt: AT,
};
const source: KnowledgeSource = {
  id: SOURCE_ID,
  name: "IT wiki",
  description: "Public IT guides",
  kind: "search_api",
  config: DEFAULT_SEARCH_API_CONFIG,
  hasSecret: true,
  agentCount: 1,
  createdAt: AT,
  updatedAt: AT,
};
const exchange: Exchange = {
  id: EXCHANGE_ID,
  agentId: AGENT_ID,
  agentName: "IT support",
  channelId: "C01ABCDEF",
  channelName: "it-help",
  slackUserId: "U0123",
  permalink: "https://example.slack.com/archives/C01ABCDEF/p1",
  question: "Where is the VPN guide?",
  answer: "See *the guide*: <https://wiki.example.org/vpn|VPN>",
  outcome: "answered",
  reason: "A question about the VPN.",
  sources: [{ title: "VPN", url: "https://wiki.example.org/vpn" }],
  provider: "Anthropic",
  model: "claude-sonnet-5-5",
  usedFallback: false,
  error: null,
  feedback: 1,
  latencyMs: 2300,
  inputTokens: 1200,
  outputTokens: 80,
  createdAt: AT,
};
const status: Status = {
  version: "1.0.0",
  bot: {
    state: "connected",
    startedAt: AT,
    lastHeartbeatAt: AT,
    lastEventAt: AT,
    connectedSince: AT,
    version: "1.0.0",
  },
  setup: { slack: true, provider: true, knowledgeSource: false, agent: false },
  last24h: { messages: 12, answered: 8, silent: 2, noAnswer: 1, errors: 1, helpful: 3, notHelpful: 1 },
  recentErrors: [{ at: AT, agentName: "IT support", message: "The knowledge source didn't answer." }],
};
const slack: SlackSettings = {
  hasBotToken: true,
  hasAppToken: false,
  botTokenHint: "…abcd",
  appTokenHint: null,
  teamId: "T0123",
  teamName: "Example Org",
  botUserId: "U0BOT",
  botName: "support",
  missingScopes: [],
  alertChannelId: null,
};
const user: User = {
  id: me.id,
  email: me.email,
  name: me.name,
  role: "admin",
  isActive: true,
  fromEnvironment: true,
  lastSignInAt: AT,
  createdAt: AT,
};

/** API replies by path; anything else is a 404. */
function reply(path: string): { status: number; body: unknown } {
  const routes: Record<string, unknown> = {
    "/me": me,
    "/auth-config": { appName: "Example Support", providerName: "Example SSO" },
    "/status": status,
    "/agents": { items: [agent] },
    [`/agents/${AGENT_ID}`]: agent,
    [`/agents/${AGENT_ID}/tests`]: { items: [test] },
    "/providers": { items: [provider] },
    [`/providers/${PROVIDER_ID}/models`]: {
      models: [{ id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" }],
    },
    "/knowledge-sources": { items: [source] },
    "/slack": slack,
    "/slack/manifest": { manifest: { display_information: { name: "Example Support" } } },
    "/exchanges": { items: [exchange], total: 1 },
    [`/exchanges/${EXCHANGE_ID}`]: exchange,
    "/settings": DEFAULT_APP_SETTINGS,
    "/users": { items: [user] },
    "/audit": { items: [], total: 0 },
  };
  if (path === "/slack/channels") {
    return {
      status: 409,
      body: { error: { code: "slack_not_configured", message: "Slack isn't set up yet." } },
    };
  }
  if (path in routes) return { status: 200, body: routes[path] };
  return { status: 404, body: { error: { code: "not_found", message: "Not found" } } };
}

/** Replies to writes; reads come from `reply`. */
let onWrite: (method: string, path: string, body: unknown) => { status: number; body: unknown } = () => ({
  status: 500,
  body: { error: { code: "internal_error", message: "Unexpected write" } },
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = new URL(input, "http://localhost").pathname.replace(/^\/api\/v1/, "");
      const method = init?.method ?? "GET";
      const { status, body } =
        method === "GET"
          ? reply(path)
          : onWrite(method, path, init?.body ? JSON.parse(String(init.body)) : null);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }), queryClient });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe("pages", () => {
  it.each([
    ["/", "Overview", "Connected"],
    ["/agents", "Agents", "#it-help"],
    ["/agents/new", "New agent", "Instructions"],
    [`/agents/${AGENT_ID}`, "IT support", "Slack channels"],
    [`/agents/${AGENT_ID}?tab=test`, "IT support", "The answer didn't cite https://wiki.example.org/pw"],
    ["/conversations", "Conversations", "Where is the VPN guide?"],
    ["/knowledge", "Knowledge sources", "IT wiki"],
    ["/knowledge/new", "New knowledge source", "Response mapping"],
    [`/knowledge/${SOURCE_ID}`, "IT wiki", "Used by 1 agent"],
    ["/providers", "Providers", "Key stored (…3f9a)"],
    ["/slack", "Slack", "Step 1: Create the Slack app"],
    ["/users", "Users", "Set by ADMIN_EMAILS"],
    ["/settings", "Settings", "Keep message text for (days)"],
    ["/audit", "Audit log", "No entries yet"],
    ["/preferences", "My settings", "Keyboard shortcuts"],
  ])("%s renders", async (path, heading, text) => {
    renderAt(path);
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
  });

  it("opens a conversation from the address", async () => {
    renderAt(`/conversations?exchange=${EXCHANGE_ID}`);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    const links = await screen.findAllByRole("link", { name: "VPN" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://wiki.example.org/vpn",
      "https://wiki.example.org/vpn",
    ]);
    expect(screen.getByRole("link", { name: "Open in Slack" })).toBeInTheDocument();
  });

  it("shows the navigation as text, without the main action, and where the page sits", async () => {
    renderAt(`/agents/${AGENT_ID}`);
    expect(await screen.findByRole("heading", { level: 1, name: "IT support" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "Overview",
      "Agents",
      "Conversations",
      "Knowledge sources",
      "Providers",
      "Slack",
      "Users",
      "Settings",
      "Audit log",
    ]);
    expect(within(nav).getByRole("link", { name: "Agents" })).toHaveAttribute("aria-current", "page");
    expect(nav.querySelector("svg")).toBeNull();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumbs" });
    const parent = within(crumbs).getByRole("link", { name: "Agents" });
    expect(parent).toHaveAttribute("href", "/agents");
    // Only the sidebar item is the current page, not the breadcrumb that leads back.
    expect(parent).not.toHaveAttribute("aria-current");
    expect(await within(crumbs).findByText("IT support")).toBeInTheDocument();
  });

  it("opens the person's settings from the user menu", async () => {
    renderAt("/");
    // The user menu is named by the name and email it shows.
    await userEvent.click(await screen.findByRole("button", { name: /Ada Admin/ }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Appearance",
      "Settings",
      "Keyboard shortcutsCtrl /",
      "Sign out",
    ]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(await screen.findByRole("heading", { level: 1, name: "My settings" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /single letters/ })).toBeChecked();
  });

  it("lets editors open their own settings", async () => {
    me.role = "editor";
    try {
      renderAt("/preferences");
      expect(await screen.findByRole("heading", { level: 1, name: "My settings" })).toBeInTheDocument();
      expect(screen.getByText("Appearance")).toBeInTheDocument();
    } finally {
      me.role = "admin";
    }
  });

  it("keeps a language stored in this browser, also for the frame", async () => {
    localStorage.setItem("support-agent.locale", "de");
    try {
      renderAt("/");
      expect(await screen.findByRole("heading", { level: 1, name: "Übersicht" })).toBeInTheDocument();
      const nav = screen.getByRole("navigation", { name: "Hauptnavigation" });
      expect(within(nav).getByRole("link", { name: "Unterhaltungen" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Seitenleiste ein- oder ausblenden" })).toBeInTheDocument();
      expect(document.documentElement.lang).toBe("de");
    } finally {
      localStorage.removeItem("support-agent.locale");
    }
  });

  it("hides admin pages from editors", async () => {
    me.role = "editor";
    try {
      renderAt("/");
      expect(await screen.findByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Providers" })).not.toBeInTheDocument();
      expect((await screen.findAllByText(/An admin does this step\./)).length).toBe(3);
    } finally {
      me.role = "admin";
    }
  });

  it("shows the sign-in page with the provider name and the no-access message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const path = new URL(input, "http://localhost").pathname;
        if (path === "/api/v1/auth-config") {
          return new Response(JSON.stringify({ appName: "Example Support", providerName: "Example SSO" }));
        }
        return new Response(JSON.stringify({ error: { code: "unauthorized", message: "Sign in" } }), {
          status: 401,
        });
      }),
    );
    renderAt("/sign-in?error=access_denied");
    expect(await screen.findByRole("button", { name: "Sign in with Example SSO" })).toBeInTheDocument();
    expect(
      screen.getByText("This account has no access. Ask an admin to add your email address."),
    ).toBeInTheDocument();
    // ProjectTogether makes the app; the link leads to its source code.
    expect(
      screen.getAllByText(/Example Support is open source, made by ProjectTogether\./).length,
    ).toBeGreaterThan(0);
    for (const link of screen.getAllByRole("link", { name: /Source code/ })) {
      expect(link).toHaveAttribute("href", "https://github.com/projecttogether/support-agent");
    }
  });

  it("saves an agent with the version it started from, and reports a newer one", async () => {
    const writes: { method: string; path: string; body: unknown }[] = [];
    onWrite = (method, path, body) => {
      writes.push({ method, path, body });
      return {
        status: 409,
        body: { error: { code: "version_conflict", message: "Someone else changed this agent." } },
      };
    };
    renderAt(`/agents/${AGENT_ID}`);
    const name = await screen.findByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "IT help desk");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Someone else changed this agent. Reload to see the changes."),
    ).toBeInTheDocument();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      method: "PUT",
      path: `/agents/${AGENT_ID}`,
      body: { version: 3, name: "IT help desk", channels: ["C01ABCDEF"], fallbackModel: null },
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("shows field errors of a rejected save on the settings form", async () => {
    onWrite = () => ({
      status: 422,
      body: {
        error: {
          code: "validation_error",
          message: "Check the highlighted fields.",
          fields: { "channels.0": "This channel belongs to another agent" },
        },
      },
    });
    renderAt(`/agents/${AGENT_ID}`);
    const name = await screen.findByLabelText("Name");
    await userEvent.type(name, "!");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByText("This channel belongs to another agent")).toBeInTheDocument(),
    );
  });

  it("asks the agent as edited in the form and shows the result", async () => {
    const writes: { path: string; body: unknown }[] = [];
    onWrite = (_method, path, body) => {
      writes.push({ path, body });
      return {
        status: 200,
        body: {
          outcome: "answered",
          reason: "A password question.",
          searchQueries: ["reset password"],
          sources: [
            {
              ref: "S1",
              knowledgeSourceName: "IT wiki",
              title: "Reset your password",
              url: "https://wiki.example.org/pw",
              section: "Accounts",
              text: "Open the portal and choose Reset.",
            },
          ],
          citedRefs: ["S1"],
          slackText: "*Reset it* in the portal: <https://wiki.example.org/pw|guide>",
          provider: "Anthropic",
          model: "claude-sonnet-5-5",
          usedFallback: true,
          error: null,
          timings: { triageMs: 300, searchMs: 200, answerMs: 1500, totalMs: 2000 },
          usage: { inputTokens: 1500, outputTokens: 90 },
        },
      };
    };
    renderAt(`/agents/${AGENT_ID}`);
    const name = await screen.findByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Draft name");
    await userEvent.click(screen.getByRole("tab", { name: "Test" }));
    await userEvent.type(await screen.findByLabelText("Question"), "How do I reset my password?");
    await userEvent.click(screen.getByLabelText("Treat as a mention"));
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("Reset it")).toHaveProperty("tagName", "STRONG");
    expect(screen.getByRole("link", { name: "guide" })).toHaveAttribute(
      "href",
      "https://wiki.example.org/pw",
    );
    expect(screen.getByText("Cited")).toBeInTheDocument();
    expect(screen.getByText("Used the fallback model")).toBeInTheDocument();
    expect(writes[0]).toMatchObject({
      path: `/agents/${AGENT_ID}/preview`,
      body: {
        question: "How do I reset my password?",
        mentioned: true,
        thread: [],
        images: [],
        draft: { name: "Draft name", channels: ["C01ABCDEF"] },
      },
    });
  });

  it("tests a new agent from the form alone", async () => {
    const writes: { path: string; body: unknown }[] = [];
    onWrite = (_method, path, body) => {
      writes.push({ path, body });
      return {
        status: 200,
        body: {
          outcome: "silent",
          reason: "Not a question.",
          searchQueries: [],
          sources: [],
          citedRefs: [],
          slackText: null,
          provider: null,
          model: null,
          usedFallback: false,
          error: null,
          timings: { triageMs: 300, searchMs: null, answerMs: null, totalMs: 300 },
          usage: { inputTokens: 100, outputTokens: 5 },
        },
      };
    };
    renderAt("/agents/new");
    await userEvent.type(await screen.findByLabelText("Name"), "Helpdesk");
    await userEvent.click(screen.getByRole("tab", { name: "Test" }));
    await userEvent.type(await screen.findByLabelText("Question"), "Thanks!");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("Nothing would be posted.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save as test" })).not.toBeInTheDocument();
    expect(writes[0]).toMatchObject({
      path: "/agents/preview",
      body: { question: "Thanks!", draft: { name: "Helpdesk" } },
    });
  });
});
