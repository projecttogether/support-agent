import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CornerDownLeft, Keyboard, Search } from "lucide-react";
import { Badge } from "../badge";
import { Button } from "../button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "../command";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../dialog";
import { Kbd, KbdGroup } from "../kbd";
import { SidebarMenuButton } from "../sidebar";
import { useT } from "@/i18n";
import { cn } from "../utils";
import { isSearchKey, isSlashKey, layerOpen } from "./keyboard";
import { useReturnFocus } from "./focus";
import { frameMessages } from "./messages";
import { useModifierLabel } from "./shortcuts";

/** A record the app found for a query. */
export type SearchResult = {
  href: string;
  title: string;
  /** A short number or code, shown before the title, e.g. "REQ-142". */
  reference?: string;
  /** What kind of record, shown as a badge, e.g. "Request". */
  kind?: string;
};

/** What the app adds to the search; without it, the search offers the app's pages. */
export type AppSearchOptions = {
  /** Records for a query; called after a short pause in typing, with a signal that aborts outdated queries. */
  find?: (query: string, signal: AbortSignal) => Promise<SearchResult[]>;
  /** A page with every result, e.g. a filtered list: "Show all results". */
  allResultsHref?: (query: string) => string;
};

/** A page of the navigation; `group` tells pages with the same label apart. */
type SearchPage = { label: string; href: string; shortcut?: string; group?: string };

/** Looks like a search field at the top of the sidebar; opens the search. */
export function SearchButton({ onClick }: { onClick: () => void }) {
  const t = useT(frameMessages);
  const { mod } = useModifierLabel();
  const shortcut = mod === "⌘" ? "⌘K" : `${mod} K`;
  return (
    <SidebarMenuButton
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K /"
      onClick={onClick}
      className="bg-background text-muted-foreground border shadow-xs"
    >
      <Search aria-hidden="true" />
      <span>{t("search")}</span>
      <Kbd aria-hidden="true" className="ml-auto">
        {shortcut}
      </Kbd>
    </SidebarMenuButton>
  );
}

/** Opens the search with ⌘K or Ctrl+K anywhere, and with "/" outside fields when single keys are on. */
export function useSearchKeys(props: { open: boolean; slash: boolean; onOpen: () => void }) {
  const { open, slash, onOpen } = props;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isSearchKey(event) && !(slash && isSlashKey(event))) return;
      if (open || layerOpen()) return;
      event.preventDefault();
      onOpen();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, slash, onOpen]);
}

/**
 * The search of the frame: the app's pages and, when the app passes `find`,
 * its records. Near the top of the screen, so the field stays put while the
 * results change.
 */
export function SearchDialog(props: {
  appName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: SearchPage[];
  options?: AppSearchOptions;
  singleKeys: boolean;
  navigate: (href: string) => void;
  onShortcuts: () => void;
}) {
  const t = useT(frameMessages);
  const returnFocus = useReturnFocus(props.open);
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        onCloseAutoFocus={returnFocus}
        showCloseButton={false}
        className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("searchPlaceholder", { app: props.appName })}</DialogTitle>
          <DialogDescription>{t("searchDescription")}</DialogDescription>
        </DialogHeader>
        <SearchPanel {...props} />
        <DialogClose asChild>
          <Button variant="ghost" size="sm" className="absolute top-2.5 right-3 h-7 px-1.5">
            <Kbd aria-hidden="true">Esc</Kbd>
            <span className="sr-only">{t("closeSearch")}</span>
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

type Found = { term: string; results: SearchResult[] | null };

/** The field, the results and the footer. It unmounts with the dialog, so every search starts empty. */
function SearchPanel(props: Parameters<typeof SearchDialog>[0]) {
  const t = useT(frameMessages);
  const { ctrl } = useModifierLabel();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found>();
  const term = query.trim();
  const find = useRef(props.options?.find);
  useEffect(() => {
    find.current = props.options?.find;
  });
  const searches = Boolean(props.options?.find);

  useEffect(() => {
    if (!term || !find.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      find
        .current?.(term, controller.signal)
        .then((results) => {
          // An app's find may ignore the signal: an outdated answer still arrives.
          if (!controller.signal.aborted) setFound({ term, results });
        })
        .catch(() => {
          if (!controller.signal.aborted) setFound({ term, results: null });
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  const go = (href: string) => {
    props.onOpenChange(false);
    props.navigate(href);
  };
  const lower = term.toLowerCase();
  const pages = props.pages.filter((page) => page.label.toLowerCase().includes(lower));
  const ready = found?.term === term;
  const results = searches && term && ready ? found.results : undefined;
  const allResults = term && props.options?.allResultsHref ? props.options.allResultsHref(term) : null;

  // The shortcuts overview, while nothing is typed or the query names it.
  const actions = !term || t("shortcuts").toLowerCase().includes(lower);

  let status: string | null = null;
  if (searches && term && !ready) status = t("searching");
  else if (results === null) status = t("searchFailed");
  else if (pages.length === 0 && !results?.length && !actions) status = t("nothingFound");

  return (
    <Command shouldFilter={false} loop className="rounded-none **:data-[slot=command-input-wrapper]:h-12">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t("searchPlaceholder", { app: props.appName })}
        className="h-12 pr-12 text-base sm:text-sm"
      />
      <p
        role="status"
        className={cn("text-muted-foreground px-4 text-center text-sm", status ? "py-6" : "sr-only")}
      >
        {status}
      </p>
      <CommandList className="max-h-[min(24rem,50vh)]">
        {results && results.length > 0 ? (
          <CommandGroup heading={t("results")}>
            {results.map((result) => (
              <CommandItem
                key={result.href}
                value={`result ${result.href}`}
                onSelect={() => go(result.href)}
                className="gap-3"
              >
                {result.reference ? (
                  <span className="text-muted-foreground w-16 shrink-0 text-xs tabular-nums">
                    {result.reference}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{result.title}</span>
                {result.kind ? (
                  <Badge variant="outline" className="shrink-0 font-normal">
                    {result.kind}
                  </Badge>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {pages.length > 0 ? (
          <CommandGroup heading={t("pages")}>
            {pages.map((page) => (
              <CommandItem key={page.href} value={`page ${page.href}`} onSelect={() => go(page.href)}>
                {page.label}
                {page.group && props.pages.filter((other) => other.label === page.label).length > 1 ? (
                  <span className="text-muted-foreground text-xs">{page.group}</span>
                ) : null}
                {props.singleKeys && page.shortcut ? (
                  <CommandShortcut>G {page.shortcut.toUpperCase()}</CommandShortcut>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {actions ? (
          <CommandGroup heading={t("actions")}>
            <CommandItem
              value="action shortcuts"
              onSelect={() => {
                props.onOpenChange(false);
                props.onShortcuts();
              }}
            >
              <Keyboard />
              {t("shortcuts")}
              <CommandShortcut>{ctrl} /</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        ) : null}
      </CommandList>
      <div className="text-muted-foreground flex items-center justify-between gap-3 border-t px-3 py-2 text-xs">
        <span className="hidden items-center gap-3 sm:flex" aria-hidden="true">
          <span className="flex items-center gap-1.5">
            <KbdGroup>
              <Kbd>
                <ArrowUp />
              </Kbd>
              <Kbd>
                <ArrowDown />
              </Kbd>
            </KbdGroup>
            {t("navigateHint")}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>
              <CornerDownLeft />
            </Kbd>
            {t("openHint")}
          </span>
        </span>
        {allResults ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7"
            onClick={() => go(allResults)}
          >
            {t("allResults")}
          </Button>
        ) : null}
      </div>
    </Command>
  );
}
