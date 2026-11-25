import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { appRoute, requireAdmin } from "@/routes/app";
import { SettingsPage } from "./settings-page";

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  beforeLoad: requireAdmin,
  component: SettingsPage,
});

export const routes: AnyRoute[] = [settingsRoute];
