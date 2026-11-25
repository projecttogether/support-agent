import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { z } from "zod";
import { appRoute, requireAdmin } from "@/routes/app";
import { AuditPage } from "./audit-page";

const auditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/audit",
  beforeLoad: requireAdmin,
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).max(100_000).optional().catch(undefined),
  }),
  component: function AuditRoute() {
    const { page } = auditRoute.useSearch();
    const navigate = auditRoute.useNavigate();
    return (
      <AuditPage
        page={page ?? 1}
        onPage={(next) => void navigate({ search: { page: next > 1 ? next : undefined } })}
      />
    );
  },
});

export const routes: AnyRoute[] = [auditRoute];
