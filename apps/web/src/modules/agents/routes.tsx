import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { z } from "zod";
import { appRoute } from "@/routes/app";
import { AgentsPage } from "./agents-page";
import { AgentEditor, AgentPage, type AgentTab } from "./agent-page";

const tabSearch = z.object({ tab: z.enum(["settings", "test"]).optional().catch(undefined) });

const agentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/agents",
  component: AgentsPage,
});

const newAgentRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/agents/new",
  validateSearch: tabSearch,
  component: function NewAgentRoute() {
    const { tab } = newAgentRoute.useSearch();
    const navigate = newAgentRoute.useNavigate();
    return (
      <AgentEditor
        agent={null}
        tab={tab ?? "settings"}
        onTab={(next: AgentTab) => void navigate({ search: { tab: next }, replace: true })}
      />
    );
  },
});

const agentRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/agents/$agentId",
  validateSearch: tabSearch,
  component: function AgentRoute() {
    const { agentId } = agentRoute.useParams();
    const { tab } = agentRoute.useSearch();
    const navigate = agentRoute.useNavigate();
    return (
      <AgentPage
        agentId={agentId}
        tab={tab ?? "settings"}
        onTab={(next) => void navigate({ search: { tab: next }, replace: true })}
      />
    );
  },
});

export const routes: AnyRoute[] = [agentsRoute, newAgentRoute, agentRoute];
