import {
  knowledgeSourceCreateSchema,
  knowledgeSourceUpdateSchema,
  knowledgeTestInputSchema,
  type SearchAuthKind,
} from "@support-agent/shared/api/knowledge";
import { parseWith } from "../http/errors";
import { parseJsonBody } from "../http/json";
import {
  createKnowledgeSource,
  deleteKnowledgeSource,
  listKnowledgeSources,
  loadKnowledgeSource,
  readKnowledgeSource,
  testKnowledgeSource,
  updateKnowledgeSource,
} from "../modules/knowledge";
import { UsageError } from "./io";
import { agentCount } from "./providers";
import type { ListSetting } from "./settings";

const TEST_USAGE = "cli settings test knowledge-sources --id <id> --query <text>";

/** The page's names of the kinds of authentication, and of their secret. */
const AUTH: Record<SearchAuthKind, { label: string; secret: string | null }> = {
  none: { label: "no authentication", secret: null },
  bearer: { label: "bearer token", secret: "token" },
  oauth2_client_credentials: { label: "OAuth 2.0 client credentials", secret: "client secret" },
};

/** `knowledge-sources`: Admin › Knowledge (/api/v1/knowledge-sources). */
export const knowledgeSources: ListSetting = {
  kind: "list",
  name: "knowledge-sources",
  label: "Knowledge sources: the search APIs agents answer from, with their token or client secret",
  none: "no knowledge sources yet",
  async entries() {
    return (await listKnowledgeSources()).map((source) => {
      const auth = AUTH[source.config.auth];
      const hints = [`"${source.name}"`, source.config.url, auth.label];
      if (auth.secret) hints.push(`${auth.secret} ${source.hasSecret ? "stored" : "not stored"}`);
      hints.push(agentCount(source.agentCount));
      return {
        id: source.id,
        state: auth.secret && !source.hasSecret ? "incomplete" : "set",
        hints,
      };
    });
  },
  show: async (id) => (id === undefined ? { items: await listKnowledgeSources() } : readKnowledgeSource(id)),
  create: (actor, body) => createKnowledgeSource(actor, parseJsonBody(body, knowledgeSourceCreateSchema)),
  update: (actor, id, body) =>
    updateKnowledgeSource(actor, id, parseJsonBody(body, knowledgeSourceUpdateSchema)),
  remove: deleteKnowledgeSource,
  testOptions: { options: { query: { type: "string" } }, usage: TEST_USAGE },
  async test(id, { query }) {
    if (typeof query !== "string") throw new UsageError("Name the search query to test.", TEST_USAGE);
    const row = await loadKnowledgeSource(id);
    return testKnowledgeSource(row, parseWith(knowledgeTestInputSchema, { query }).query);
  },
};
