import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { queryClient } from "@/lib/query";
import { setUnauthorizedHandler } from "@/lib/api";
import { reportCaughtError, startErrorReporting } from "@/lib/error-reporting";
import { ThemeProvider } from "@/lib/theme";
import { router } from "@/router";
import "./styles.css";

void startErrorReporting(() => router.state.matches.at(-1)?.fullPath);

// A 401 anywhere means the session ended: show the sign-in page.
setUnauthorizedHandler(() => {
  const path = window.location.pathname;
  if (!path.startsWith("/sign-in")) {
    queryClient.removeQueries({ queryKey: ["me"] });
    void router.navigate({ to: "/sign-in", search: { redirect: path + window.location.search } });
  }
});

createRoot(document.getElementById("root")!, {
  // Errors that an error screen caught never reach window.onerror. Log them as
  // React does by default, and report them.
  onCaughtError: (error) => {
    console.error(error); // eslint-disable-line no-console
    reportCaughtError(error);
  },
}).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
