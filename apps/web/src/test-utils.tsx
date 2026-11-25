import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { LocaleContext } from "@/i18n";
import type { Locale } from "@/i18n/locales";

/** Renders with a fresh query client and the given interface language. */
export function renderWithProviders(ui: ReactNode, options: { locale?: Locale } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const locale = options.locale ?? "en";
  return render(
    <QueryClientProvider client={client}>
      <LocaleContext.Provider value={locale}>{ui}</LocaleContext.Provider>
    </QueryClientProvider>,
  );
}

type Reply = { status?: number; body?: unknown };

/** Stubs fetch: each call gets the next reply; returns the mock to inspect requests. */
export function stubFetch(...replies: Reply[]) {
  const mock = vi.fn(async (_url: string, _init?: RequestInit) => {
    const reply = replies.shift() ?? {
      status: 500,
      body: { error: { code: "internal_error", message: "No reply" } },
    };
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
