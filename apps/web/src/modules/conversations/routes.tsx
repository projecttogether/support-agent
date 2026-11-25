import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { z } from "zod";
import { OUTCOMES } from "@support-agent/shared/api/agents";
import { appRoute } from "@/routes/app";
import { ConversationsPage } from "./conversations-page";

const conversationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/conversations",
  validateSearch: z.object({
    agentId: z.uuid().optional().catch(undefined),
    outcome: z.enum(OUTCOMES).optional().catch(undefined),
    feedback: z.enum(["helpful", "not_helpful"]).optional().catch(undefined),
    page: z.coerce.number().int().min(1).max(100_000).optional().catch(undefined),
    exchange: z.uuid().optional().catch(undefined),
  }),
  component: function ConversationsRoute() {
    const navigate = conversationsRoute.useNavigate();
    return (
      <ConversationsPage
        search={conversationsRoute.useSearch()}
        onSearch={(search) => void navigate({ search })}
      />
    );
  },
});

export const routes: AnyRoute[] = [conversationsRoute];
