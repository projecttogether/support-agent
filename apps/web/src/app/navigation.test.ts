import { describe, expect, it } from "vitest";
import { breadcrumbsFor, NAVIGATION, recordOf } from "./navigation";

const items = [
  { label: "Overview", href: "/" },
  { label: "Agents", href: "/agents" },
  { label: "Conversations", href: "/conversations" },
  { label: "Knowledge sources", href: "/knowledge" },
  { label: "Settings", href: "/settings" },
];
const labels = { newAgent: "New agent", newSource: "New knowledge source", preferences: "My settings" };
const crumbs = (pathname: string, record?: string) => breadcrumbsFor(pathname, { items, labels, record });
const AGENT_ID = "11111111-1111-4111-8111-111111111111";

describe("NAVIGATION", () => {
  it("gives each main page its own letter, the start page o, and admin pages none", () => {
    const shortcuts = NAVIGATION.flatMap((group) => group.items).flatMap((item) =>
      item.shortcut ? [item.shortcut] : [],
    );
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    expect(NAVIGATION[0]!.items.find((item) => item.to === "/")?.shortcut).toBe("o");
    for (const group of NAVIGATION.filter((group) => group.adminOnly)) {
      expect(group.items.every((item) => !item.shortcut)).toBe(true);
    }
  });
});

describe("recordOf", () => {
  it("finds the agent or knowledge source of a path, not the new forms", () => {
    expect(recordOf(`/agents/${AGENT_ID}`)).toEqual({ kind: "agent", id: AGENT_ID });
    expect(recordOf(`/knowledge/${AGENT_ID}/`)).toEqual({ kind: "source", id: AGENT_ID });
    expect(recordOf("/agents/new")).toBeNull();
    expect(recordOf("/knowledge/new")).toBeNull();
    expect(recordOf("/agents")).toBeNull();
    expect(recordOf("/conversations")).toBeNull();
  });
});

describe("breadcrumbsFor", () => {
  it("names the sidebar page itself", () => {
    expect(crumbs("/")).toEqual([{ label: "Overview" }]);
    expect(crumbs("/conversations")).toEqual([{ label: "Conversations" }]);
    expect(crumbs("/settings")).toEqual([{ label: "Settings" }]);
    expect(crumbs("/agents/")).toEqual([{ label: "Agents" }]);
  });

  it("leads back from the new forms", () => {
    expect(crumbs("/agents/new")).toEqual([{ label: "Agents", href: "/agents" }, { label: "New agent" }]);
    expect(crumbs("/knowledge/new")).toEqual([
      { label: "Knowledge sources", href: "/knowledge" },
      { label: "New knowledge source" },
    ]);
  });

  it("names an agent or a source by its name once it has loaded", () => {
    expect(crumbs(`/agents/${AGENT_ID}`, "IT support")).toEqual([
      { label: "Agents", href: "/agents" },
      { label: "IT support" },
    ]);
    expect(crumbs(`/knowledge/${AGENT_ID}`, "IT wiki")).toEqual([
      { label: "Knowledge sources", href: "/knowledge" },
      { label: "IT wiki" },
    ]);
    expect(crumbs(`/agents/${AGENT_ID}`)).toEqual([{ label: "Agents", href: "/agents" }]);
  });

  it("names the person's settings, and nothing for pages outside the sidebar", () => {
    expect(crumbs("/preferences")).toEqual([{ label: "My settings" }]);
    expect(crumbs("/somewhere")).toEqual([]);
    expect(crumbs("/agents-old")).toEqual([]);
    // An editor's sidebar has no knowledge sources: their pages are not found.
    expect(breadcrumbsFor("/knowledge", { items: items.slice(0, 3), labels })).toEqual([]);
  });
});
