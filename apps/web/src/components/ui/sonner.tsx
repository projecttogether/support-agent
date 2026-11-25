import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useDocumentTheme } from "./theme";

/** Toasts in the app's theme: follows the `dark` class on <html> unless `theme` is given. */
function Toaster(props: ToasterProps) {
  const documentTheme = useDocumentTheme();
  return (
    <Sonner
      theme={documentTheme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
