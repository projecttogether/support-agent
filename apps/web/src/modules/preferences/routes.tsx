import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { PREFERENCES_PATH } from "@/app/navigation";
import { appRoute } from "@/routes/app";
import { PreferencesPage } from "./preferences-page";

const preferencesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: PREFERENCES_PATH,
  component: PreferencesPage,
});

export const routes: AnyRoute[] = [preferencesRoute];
