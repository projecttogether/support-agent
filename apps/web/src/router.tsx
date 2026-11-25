import { createRouter, type RouterHistory } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/query";
import { rootRoute } from "@/routes/root";
import { appRoute } from "@/routes/app";
import { signInRoute } from "@/routes/sign-in";
import { appRoutes } from "@/modules";
import { LoadingState } from "@/components/ui/states";

const routeTree = rootRoute.addChildren([signInRoute, appRoute.addChildren(appRoutes)]);

/** The app's router; tests pass a memory history and their own query client. */
export function createAppRouter(options: { history?: RouterHistory; queryClient?: QueryClient } = {}) {
  return createRouter({
    routeTree,
    history: options.history,
    context: { queryClient: options.queryClient ?? queryClient },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => <LoadingState />,
    scrollRestoration: true,
  });
}

export const router = createAppRouter();
