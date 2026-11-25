import {
  PROVIDER_LABELS,
  providerCreateSchema,
  providerTestInputSchema,
  providerUpdateSchema,
} from "@support-agent/shared/api/providers";
import { parseWith } from "../http/errors";
import { parseJsonBody } from "../http/json";
import {
  createProvider,
  deleteProvider,
  listProviderModels,
  listProviders,
  loadProvider,
  readProvider,
  testProvider,
  updateProvider,
} from "../modules/providers";
import { UsageError } from "./io";
import type { ListSetting } from "./settings";

const SHOW_USAGE = "cli settings show providers [--id <id> [--models]]";
const TEST_USAGE = "cli settings test providers --id <id> --model <model>";

export const agentCount = (count: number) => (count === 1 ? "1 agent" : `${count} agents`);

/** `providers`: Admin › Providers (/api/v1/providers). */
export const providers: ListSetting = {
  kind: "list",
  name: "providers",
  label: "Providers: model APIs (Anthropic, OpenAI, Mistral, compatible) and their keys",
  none: "no providers yet",
  async entries() {
    return (await listProviders()).map((provider) => ({
      id: provider.id,
      // A compatible API may need no key; the others cannot be saved without one.
      state: provider.hasApiKey || provider.kind === "openai_compatible" ? "set" : "incomplete",
      hints: [
        `"${provider.name}"`,
        PROVIDER_LABELS[provider.kind],
        provider.baseUrl ?? "default URL",
        provider.hasApiKey ? `key ${provider.apiKeyHint ?? "stored"}` : "no key",
        agentCount(provider.agentCount),
      ],
    }));
  },
  async show(id, { models }) {
    if (id === undefined) {
      if (models) throw new UsageError("Name the provider with --id to list its models.", SHOW_USAGE);
      return { items: await listProviders() };
    }
    return models ? listProviderModels(id) : readProvider(id);
  },
  showOptions: { options: { models: { type: "boolean" } }, usage: SHOW_USAGE },
  create: (actor, body) => createProvider(actor, parseJsonBody(body, providerCreateSchema)),
  update: (actor, id, body) => updateProvider(actor, id, parseJsonBody(body, providerUpdateSchema)),
  remove: deleteProvider,
  testOptions: { options: { model: { type: "string" } }, usage: TEST_USAGE },
  async test(id, { model }) {
    if (typeof model !== "string") throw new UsageError("Name the model to test.", TEST_USAGE);
    const row = await loadProvider(id);
    return testProvider(row, parseWith(providerTestInputSchema, { model }).model);
  },
};
