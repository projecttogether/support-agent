import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../dialog";
import { Kbd, KbdGroup } from "../kbd";
import { useT } from "@/i18n";
import { cn } from "../utils";
import { isOverviewKey, layerOpen, letterOf } from "./keyboard";
import { useReturnFocus } from "./focus";
import { frameMessages } from "./messages";

/** A page that "G then a letter" opens. */
export type GoTarget = { key: string; label: string; href: string };

/** How long G waits for its second key. */
export const GO_WAIT_MS = 1500;

const SHORTCUTS_KEY = "support-agent.shortcuts";
const SHORTCUTS_EVENT = "support-agent:shortcuts";
let unsavedShortcuts = true;

function readShortcuts(): boolean {
  try {
    return window.localStorage.getItem(SHORTCUTS_KEY) !== "off";
  } catch {
    return unsavedShortcuts;
  }
}

function subscribeShortcuts(onChange: () => void): () => void {
  window.addEventListener(SHORTCUTS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SHORTCUTS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Whether the person uses shortcuts with single letters ("G then a letter",
 * "/"), saved in this browser; on unless turned off. Ctrl and ⌘ shortcuts
 * always work. Turning them off is what WCAG 2.1.4 asks for.
 */
export function useShortcutsPreference(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribeShortcuts, readShortcuts, () => true);
  const setEnabled = (next: boolean) => {
    try {
      if (next) window.localStorage.removeItem(SHORTCUTS_KEY);
      else window.localStorage.setItem(SHORTCUTS_KEY, "off");
    } catch {
      unsavedShortcuts = next;
    }
    window.dispatchEvent(new Event(SHORTCUTS_EVENT));
  };
  return [enabled, setEnabled];
}

const noSubscription = () => () => {};

/**
 * The key for Search (K) and the sidebar (B): "⌘" on Apple devices, else
 * Ctrl ("Strg" on German keyboards). The overview (Ctrl+/) is Ctrl everywhere.
 */
export function useModifierLabel(): { mod: string; ctrl: string } {
  const t = useT(frameMessages);
  const apple = useSyncExternalStore(
    noSubscription,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false,
  );
  return { mod: apple ? "⌘" : t("ctrl"), ctrl: t("ctrl") };
}

/**
 * "G then a letter" opens a page, Ctrl+/ the overview. Single letters only
 * when `enabled`; nothing while typing or while a dialog or menu is open.
 * Returns the pages while G waits for its second key.
 */
export function useGoShortcuts(props: {
  targets: GoTarget[];
  enabled: boolean;
  navigate: (href: string) => void;
  onOverview: () => void;
}): GoTarget[] | null {
  const { targets, enabled, navigate, onOverview } = props;
  const [waiting, setWaiting] = useState(false);
  const waitingRef = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  // The latest values, so the listener stays the same while the app re-renders.
  const latest = useRef({ targets, navigate, onOverview });
  useEffect(() => {
    latest.current = { targets, navigate, onOverview };
  });

  useEffect(() => {
    const stop = () => {
      window.clearTimeout(timer.current);
      if (!waitingRef.current) return;
      waitingRef.current = false;
      setWaiting(false);
    };
    function onKeyDown(event: KeyboardEvent) {
      if (isOverviewKey(event)) {
        if (layerOpen()) return;
        event.preventDefault();
        stop();
        latest.current.onOverview();
        return;
      }
      if (!enabled) return;
      const letter = letterOf(event);
      if (letter === null || layerOpen()) {
        stop();
        return;
      }
      if (waitingRef.current) {
        stop();
        const target = latest.current.targets.find((candidate) => candidate.key === letter);
        if (target) {
          event.preventDefault();
          latest.current.navigate(target.href);
        }
        return;
      }
      if (letter === "g" && latest.current.targets.length > 0) {
        event.preventDefault();
        waitingRef.current = true;
        setWaiting(true);
        timer.current = window.setTimeout(stop, GO_WAIT_MS);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      stop();
    };
  }, [enabled]);

  return waiting ? targets : null;
}

/** Shown while G waits for its second key: which letter opens which page. */
export function GoHint({ targets }: { targets: GoTarget[] }) {
  const t = useT(frameMessages);
  return (
    <div
      role="status"
      data-slot="go-hint"
      className="bg-popover text-popover-foreground fixed bottom-6 left-1/2 z-50 hidden max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm shadow-lg md:flex"
    >
      <span className="text-muted-foreground">{t("goTo")}</span>
      {targets.map((target) => (
        <span key={target.key} className="flex items-center gap-1.5">
          <Kbd>{target.key.toUpperCase()}</Kbd>
          {target.label}
        </span>
      ))}
    </div>
  );
}

function Row(props: { label: ReactNode; keys: string[]; then?: string; off?: boolean }) {
  return (
    <li className={cn("flex items-center justify-between gap-4 py-1.5 text-sm", props.off && "opacity-50")}>
      <span>{props.label}</span>
      <KbdGroup>
        {props.keys.map((key, index) => (
          <span key={`${key}-${index}`} className="flex items-center gap-1">
            {index > 0 && props.then ? (
              <span className="text-muted-foreground text-xs">{props.then}</span>
            ) : null}
            <Kbd>{key}</Kbd>
          </span>
        ))}
      </KbdGroup>
    </li>
  );
}

/** The overview of every shortcut: Ctrl+/, the user menu or the search open it. */
export function ShortcutsDialog(props: {
  targets: GoTarget[];
  enabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where single-letter shortcuts are turned on and off. */
  settings?: ReactNode;
}) {
  const t = useT(frameMessages);
  const { mod, ctrl } = useModifierLabel();
  const off = !props.enabled;
  const returnFocus = useReturnFocus(props.open);
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>{t("shortcuts")}</DialogTitle>
          <DialogDescription>{t("shortcutsDescription")}</DialogDescription>
        </DialogHeader>
        <section className="flex flex-col gap-1">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t("general")}
          </h3>
          <ul className="divide-y">
            <Row label={t("search")} keys={[mod, "K"]} />
            <Row label={t("search")} keys={["/"]} off={off} />
            <Row label={t("toggleSidebar")} keys={[mod, "B"]} />
            <Row label={t("showShortcuts")} keys={[ctrl, "/"]} />
          </ul>
        </section>
        {props.targets.length > 0 ? (
          <section className="flex flex-col gap-1">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{t("goTo")}</h3>
            <ul className="divide-y">
              {props.targets.map((target) => (
                <Row
                  key={target.key}
                  label={target.label}
                  keys={["G", target.key.toUpperCase()]}
                  then={t("then")}
                  off={off}
                />
              ))}
            </ul>
          </section>
        ) : null}
        <p className="text-muted-foreground text-xs">
          {t(off ? "singleKeysOff" : "singleKeysOn")} {props.settings}
        </p>
      </DialogContent>
    </Dialog>
  );
}
