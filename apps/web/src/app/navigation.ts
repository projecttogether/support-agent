import { defineMessages } from "@/i18n";

export const navMessages = defineMessages({
  en: {
    workspace: "Support",
    admin: "Administration",
    overview: "Overview",
    agents: "Agents",
    conversations: "Conversations",
    knowledge: "Knowledge sources",
    providers: "Providers",
    slack: "Slack",
    users: "Users",
    settings: "Settings",
    audit: "Audit log",
  },
  de: {
    workspace: "Support",
    admin: "Verwaltung",
    overview: "Übersicht",
    agents: "Agenten",
    conversations: "Unterhaltungen",
    knowledge: "Wissensquellen",
    providers: "Anbieter",
    slack: "Slack",
    users: "Benutzer",
    settings: "Einstellungen",
    audit: "Protokoll",
  },
});

export type NavKey = keyof typeof navMessages.en;
/** `shortcut`: "G then this letter" opens the page (main pages only, each letter once). */
export type NavItem = { key: NavKey; to: string; shortcut?: string };
export type NavGroup = { key: NavKey; items: NavItem[]; adminOnly?: boolean };

/**
 * The sidebar, as text. Each module's main page lives at the `to` path; the
 * main action of a page ("New agent") sits in its header, not here.
 */
export const NAVIGATION: NavGroup[] = [
  {
    key: "workspace",
    items: [
      { key: "overview", to: "/", shortcut: "o" },
      { key: "agents", to: "/agents", shortcut: "a" },
      { key: "conversations", to: "/conversations", shortcut: "c" },
    ],
  },
  {
    key: "admin",
    adminOnly: true,
    items: [
      { key: "knowledge", to: "/knowledge" },
      { key: "providers", to: "/providers" },
      { key: "slack", to: "/slack" },
      { key: "users", to: "/users" },
      { key: "settings", to: "/settings" },
      { key: "audit", to: "/audit" },
    ],
  },
];

/** The person's own settings (appearance, keyboard shortcuts); every role may open it. */
export const PREFERENCES_PATH = "/preferences";

export type Crumb = { label: string; href?: string };

/** The agent or knowledge source a path shows, so the header can name it. */
export function recordOf(pathname: string): { kind: "agent" | "source"; id: string } | null {
  const match = /^\/(agents|knowledge)\/([^/]+)\/?$/.exec(pathname);
  if (!match || match[2] === "new") return null;
  return { kind: match[1] === "agents" ? "agent" : "source", id: match[2]! };
}

/**
 * Where a page sits: the sidebar item it belongs to, then the new form or
 * the record by its name (once loaded). The person's settings are outside
 * the sidebar; other paths get none.
 */
export function breadcrumbsFor(
  pathname: string,
  options: {
    items: { label: string; href: string }[];
    labels: { newAgent: string; newSource: string; preferences: string };
    /** The name of the agent or source the page shows, once loaded. */
    record?: string;
  },
): Crumb[] {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === PREFERENCES_PATH) return [{ label: options.labels.preferences }];
  const item = options.items
    .filter((candidate) =>
      candidate.href === "/"
        ? path === "/"
        : path === candidate.href || path.startsWith(`${candidate.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!item) return [];
  if (path === item.href) return [{ label: item.label }];
  const parent = { label: item.label, href: item.href };
  const rest = path.slice(item.href.length + 1);
  const newLabels: Record<string, string | undefined> = {
    "/agents": options.labels.newAgent,
    "/knowledge": options.labels.newSource,
  };
  const newLabel = newLabels[item.href];
  if (rest === "new" && newLabel) return [parent, { label: newLabel }];
  if (options.record && !rest.includes("/")) return [parent, { label: options.record }];
  return [parent];
}
