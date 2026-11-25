import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "@support-agent/shared/api/providers";
import { renderWithProviders, stubFetch } from "@/test-utils";
import { ProviderDialog } from "./provider-dialog";

const stored: Provider = {
  id: "7d9f3c56-63c4-4a3e-9d1b-4f7f6e2f9a10",
  name: "Self-hosted",
  kind: "openai_compatible",
  baseUrl: "https://llm.example.org/v1",
  hasApiKey: true,
  apiKeyHint: "…3f9a",
  agentCount: 1,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("ProviderDialog", () => {
  it("shows the shared schema's errors next to the fields and sends nothing", async () => {
    const fetch = stubFetch();
    renderWithProviders(<ProviderDialog provider={null} onClose={() => undefined} />);

    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Required")).toBeInTheDocument();
    expect(screen.getByText("Enter an API key")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("translates validation messages", async () => {
    stubFetch();
    renderWithProviders(<ProviderDialog provider={null} onClose={() => undefined} />, { locale: "de" });

    await userEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    expect(await screen.findByText("Pflichtfeld")).toBeInTheDocument();
    expect(screen.getByText("Gib einen API-Schlüssel ein")).toBeInTheDocument();
  });

  it("checks a typed base URL", async () => {
    stubFetch();
    renderWithProviders(<ProviderDialog provider={null} onClose={() => undefined} />);

    await userEvent.type(screen.getByLabelText("Base URL"), "not a url");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Enter a full address, e.g. https://example.org")).toBeInTheDocument();
  });

  it("hides the API key until the eye button shows it", async () => {
    stubFetch();
    renderWithProviders(<ProviderDialog provider={null} onClose={() => undefined} />);

    const apiKey = screen.getByLabelText("API key");
    await userEvent.type(apiKey, "sk-ant-example");
    expect(apiKey).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(apiKey).toHaveAttribute("type", "text");
    expect(apiKey).toHaveValue("sk-ant-example");

    await userEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(apiKey).toHaveAttribute("type", "password");
  });

  it("creates a provider and closes", async () => {
    const fetch = stubFetch({ status: 201, body: { ...stored, kind: "anthropic", name: "Anthropic" } });
    const onClose = vi.fn();
    renderWithProviders(<ProviderDialog provider={null} onClose={onClose} />);

    await userEvent.type(screen.getByLabelText("Name"), "Anthropic");
    await userEvent.type(screen.getByLabelText("API key"), "sk-ant-example");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/v1/providers");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: "anthropic",
      name: "Anthropic",
      baseUrl: null,
      apiKey: "sk-ant-example",
    });
  });

  it("shows the server's field errors and keeps the input", async () => {
    stubFetch({
      status: 422,
      body: {
        error: {
          code: "validation_error",
          message: "Check the highlighted fields.",
          fields: { name: "A provider with this name exists" },
        },
      },
    });
    const onClose = vi.fn();
    renderWithProviders(<ProviderDialog provider={null} onClose={onClose} />);

    await userEvent.type(screen.getByLabelText("Name"), "Anthropic");
    await userEvent.type(screen.getByLabelText("API key"), "sk-ant-example");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("A provider with this name exists")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Anthropic");
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps a stored key unless replaced, and can remove it for OpenAI-compatible APIs", async () => {
    const fetch = stubFetch({ body: stored }, { body: { ...stored, hasApiKey: false, apiKeyHint: null } });
    renderWithProviders(<ProviderDialog provider={stored} onClose={() => undefined} />);

    expect(screen.getByText("Stored (…3f9a)")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Self-hosted vLLM");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls[0]![1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({
      name: "Self-hosted vLLM",
      baseUrl: "https://llm.example.org/v1",
    });

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText("Removed when you save.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetch.mock.calls[1]![1]?.body))).toMatchObject({ apiKey: null });
  });
});
