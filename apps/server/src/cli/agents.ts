import { agentInputSchema, agentUpdateSchema } from "@support-agent/shared/api/agents";
import { getDb } from "../db/client";
import { parseJsonBody } from "../http/json";
import { createAgent, deleteAgent, listAgents, loadAgent, updateAgent } from "../modules/agents";
import { listProviders } from "../modules/providers";
import type { ListSetting } from "./settings";

const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * `agents`: Agents (/api/v1/agents): which provider, model, knowledge sources
 * and channels each agent uses. Its tests and previews stay on the page.
 */
export const agents: ListSetting = {
  kind: "list",
  name: "agents",
  label: "Agents: provider and model, knowledge sources and Slack channels",
  none: "no agents yet",
  async entries() {
    const [items, providers] = await Promise.all([listAgents(), listProviders()]);
    const providerName = new Map(providers.map((provider) => [provider.id, provider.name]));
    return items.map((agent) => {
      const provider = agent.providerId ? providerName.get(agent.providerId) : undefined;
      return {
        id: agent.id,
        state: provider && agent.model ? "set" : "incomplete",
        hints: [
          `"${agent.name}"`,
          agent.enabled ? "on" : "off",
          provider ? `"${provider}" ${agent.model || "(no model)"}` : "no provider",
          counted(agent.knowledgeSourceIds.length, "knowledge source", "knowledge sources"),
          counted(agent.channels.length, "channel", "channels"),
        ],
      };
    });
  },
  show: async (id) => (id === undefined ? { items: await listAgents() } : loadAgent(getDb(), id)),
  create: (actor, body) => createAgent(actor, parseJsonBody(body, agentInputSchema)),
  update: (actor, id, body) => updateAgent(actor, id, parseJsonBody(body, agentUpdateSchema)),
  remove: deleteAgent,
};
