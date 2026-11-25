import type { AnyRoute } from "@tanstack/react-router";
import { routes as overview } from "./overview/routes";
import { routes as agents } from "./agents/routes";
import { routes as conversations } from "./conversations/routes";
import { routes as knowledge } from "./knowledge/routes";
import { routes as providers } from "./providers/routes";
import { routes as slack } from "./slack/routes";
import { routes as users } from "./users/routes";
import { routes as settings } from "./settings/routes";
import { routes as audit } from "./audit/routes";
import { routes as preferences } from "./preferences/routes";

/** Routes of every module inside the signed-in app. Add new modules here. */
export const appRoutes: AnyRoute[] = [
  ...overview,
  ...agents,
  ...conversations,
  ...knowledge,
  ...providers,
  ...slack,
  ...users,
  ...settings,
  ...audit,
  ...preferences,
];
