import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { appRoute, requireAdmin } from "@/routes/app";
import { SlackPage } from "./slack-page";

const slackRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/slack",
  beforeLoad: requireAdmin,
  component: SlackPage,
});

export const routes: AnyRoute[] = [slackRoute];
