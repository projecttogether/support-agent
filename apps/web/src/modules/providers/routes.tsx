import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { appRoute, requireAdmin } from "@/routes/app";
import { ProvidersPage } from "./providers-page";

const providersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/providers",
  beforeLoad: requireAdmin,
  component: ProvidersPage,
});

export const routes: AnyRoute[] = [providersRoute];
