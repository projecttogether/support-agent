import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { appRoute } from "@/routes/app";
import { OverviewPage } from "./overview-page";

const overviewRoute = createRoute({ getParentRoute: () => appRoute, path: "/", component: OverviewPage });

export const routes: AnyRoute[] = [overviewRoute];
