import { createContext, useContext, type ReactNode } from "react";

const PortalContainerContext = createContext<HTMLElement | null>(null);

/**
 * Where popovers, tooltips, menus and dialogs render: `document.body` by
 * default. A page that embeds components in a shadow root (the standalone
 * update button) passes an element inside it, so the shadow root's styles
 * apply to them too.
 */
export function PortalContainerProvider(props: { container: HTMLElement | null; children: ReactNode }) {
  return (
    <PortalContainerContext.Provider value={props.container}>
      {props.children}
    </PortalContainerContext.Provider>
  );
}

/** The element portals render into; undefined: `document.body`. */
export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined;
}
