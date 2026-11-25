import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { common } from "@/i18n/common";
import { useT } from "@/i18n";
import { LocaleProvider } from "@/i18n/provider";

export type RouterContext = { queryClient: QueryClient };

function NotFound() {
  const t = useT(common);
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <EmptyState
        title={t("notFound")}
        description={t("notFoundText")}
        action={
          <Button asChild variant="outline">
            <Link to="/">{t("back")}</Link>
          </Button>
        }
      />
    </div>
  );
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <LocaleProvider>
      <Outlet />
      {/* Above the sticky save bars of forms, so a toast never covers Save. */}
      <Toaster richColors closeButton offset={{ bottom: 80 }} mobileOffset={{ bottom: 80 }} />
    </LocaleProvider>
  ),
  notFoundComponent: NotFound,
});
