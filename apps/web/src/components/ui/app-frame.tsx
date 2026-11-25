import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ComponentType,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ChevronsUpDown, Keyboard, LogOut, PanelLeft, Settings, SunMoon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Separator } from "./separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from "./sidebar";
import { useT } from "@/i18n";
import { THEME_PREFERENCES, type ThemePreference } from "./theme";
import { FrameCrumbs, type Crumb } from "./frame/crumbs";
import { shortcutClashes } from "./frame/keyboard";
import { activeHref } from "./frame/nav";
import { frameMessages } from "./frame/messages";
import { SearchButton, SearchDialog, useSearchKeys, type AppSearchOptions } from "./frame/search";
import {
  GoHint,
  ShortcutsDialog,
  useGoShortcuts,
  useShortcutsPreference,
  type GoTarget,
} from "./frame/shortcuts";

export type { Crumb } from "./frame/crumbs";
export type { AppSearchOptions, SearchResult } from "./frame/search";
export { useShortcutsPreference } from "./frame/shortcuts";

/**
 * The app's link: Next.js's `Link` as it is, or a small adapter for another
 * router. It must pass every other prop (class, `aria-current`, `ref`, …)
 * on to its `<a>`.
 */
export type FrameLinkProps = Omit<ComponentProps<"a">, "href"> & { href: string };
export type FrameLink = ComponentType<FrameLinkProps>;

export type NavItem = {
  label: string;
  href: string;
  /** A count or marker at the right, e.g. open tasks. */
  badge?: ReactNode;
  /**
   * "G then this letter" opens the page. Only for main pages people open
   * often, with a letter they can guess, each letter once; none for admin
   * pages. "o" is the start page in every app.
   */
  shortcut?: string;
  /** Active only on the page itself, not on its sub-pages. "/" is always exact. */
  exact?: boolean;
  /** More paths whose pages belong to this item, with their sub-pages: ["/e"] for entries of a timeline at "/". */
  match?: string[];
};

export type NavGroup = { label?: string; items: NavItem[] };

export type AppFrameProps = {
  /** At the top of the sidebar, a link to the start page. `icon`: the app icon, 32 pixels. */
  app: { name: string; icon: ReactNode; description?: string; href?: string };
  /** At the bottom of the sidebar, above the user menu: the organization that makes the app. */
  sidebarFooter?: ReactNode;
  nav: NavGroup[];
  /** More sidebar content after the groups, e.g. a list of spaces. */
  sidebarContent?: ReactNode;
  /** The current path; the matching item is marked. */
  pathname: string;
  link: FrameLink;
  /** For shortcuts and search results: go to a path of the app. */
  navigate: (href: string) => void;
  user: { name: string; email?: string | null; detail?: string; image?: string | null };
  /** "Appearance" in the user menu; the app's ThemeProvider (lib/theme.tsx) keeps it in the browser. */
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  /**
   * The person's settings page: "Settings" in the user menu and in the
   * shortcuts overview. Things about the person's account, such as a link to
   * the sign-in provider's account page, go on that page, not in the header.
   */
  settingsHref?: string;
  onSignOut: () => void;
  /** Where the page sits in the app, from the sidebar section to the page; at most three show. */
  breadcrumbs?: Crumb[];
  /** At the right of the header. */
  headerEnd?: ReactNode;
  search?: AppSearchOptions;
  /** Single-letter shortcuts ("G then a letter", "/"). Default: the person's choice in this browser. */
  shortcuts?: boolean;
  /** Next.js: the cookie `sidebar_state`, read on the server. Default: that cookie, read in the browser. */
  defaultSidebarOpen?: boolean;
  /**
   * For an app that decides itself whether the sidebar is open on wide screens
   * (e.g. folded on article pages). ⌘B or Ctrl+B and the toggle then call
   * `onSidebarOpenChange`. Default: the frame decides, from the cookie.
   */
  sidebarOpen?: boolean;
  onSidebarOpenChange?: (open: boolean) => void;
  children: ReactNode;
};

const SIDEBAR_COOKIE = "sidebar_state";

function sidebarCookie(): boolean {
  if (typeof document === "undefined") return true;
  return !document.cookie.split("; ").includes(`${SIDEBAR_COOKIE}=false`);
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words.at(-1)!] : words;
  // By character, not by UTF-16 unit: a name may start with an emoji or a rare letter.
  return letters.map((word) => Array.from(word)[0]!.toUpperCase()).join("") || "?";
}

function UserMenu(props: {
  user: AppFrameProps["user"];
  link: FrameLink;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  settingsHref?: string;
  onSignOut: () => void;
  onShortcuts: () => void;
  /** Closes the sheet on phones once a page is chosen. */
  onNavigate: () => void;
}) {
  const t = useT(frameMessages);
  const { isMobile } = useSidebar();
  const { user } = props;
  const Link = props.link;
  const person = (
    <>
      {/* Decoration: the name and email next to it are the button's name (WCAG 2.5.3). */}
      <Avatar className="size-8 rounded-lg" aria-hidden="true">
        {user.image ? <AvatarImage src={user.image} alt="" /> : null}
        <AvatarFallback className="rounded-lg">{initials(user.name)}</AvatarFallback>
      </Avatar>
      <span className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        {user.email ? <span className="text-muted-foreground truncate text-xs">{user.email}</span> : null}
      </span>
    </>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          {person}
          <ChevronsUpDown className="ml-auto size-4" aria-hidden="true" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--radix-dropdown-menu-trigger-width) min-w-60 rounded-lg"
        side={isMobile ? "top" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{user.name}</div>
          {user.email || user.detail ? (
            <div className="text-muted-foreground truncate text-xs">
              {[user.email, user.detail].filter(Boolean).join(" · ")}
            </div>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SunMoon />
            {t("appearance")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={props.theme}
              onValueChange={(value) => props.onThemeChange(value as ThemePreference)}
            >
              {THEME_PREFERENCES.map((option) => (
                <DropdownMenuRadioItem key={option} value={option}>
                  {t(option)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {props.settingsHref ? (
          <DropdownMenuItem asChild>
            <Link href={props.settingsHref} onClick={props.onNavigate}>
              <Settings />
              {t("settings")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={props.onShortcuts}>
          <Keyboard />
          {t("shortcuts")}
          <DropdownMenuShortcut>{t("ctrl")} /</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={props.onSignOut}>
          <LogOut />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FrameSidebar(props: AppFrameProps & { onSearch: () => void; onShortcuts: () => void }) {
  const t = useT(frameMessages);
  const { isMobile, setOpenMobile, state } = useSidebar();
  const Link = props.link;
  const items = props.nav.flatMap((group) => group.items);
  // Collapsed on a wide screen, the sidebar is off screen: keep its contents out of the tab
  // order. Not on the whole sidebar, so that its edge (the rail) still opens it.
  const hidden = !isMobile && state === "collapsed";
  const active = activeHref(props.pathname, items);
  // On phones the sidebar is a sheet: it closes once a page is chosen.
  const close = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar variant="floating" collapsible="offcanvas">
      <SidebarHeader inert={hidden}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={props.app.href ?? "/"} onClick={close}>
                {props.app.icon}
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">{props.app.name}</span>
                  {props.app.description ? (
                    <span className="text-muted-foreground truncate text-xs">{props.app.description}</span>
                  ) : null}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="mt-1">
            <SearchButton
              onClick={() => {
                close();
                props.onSearch();
              }}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent inert={hidden}>
        <nav aria-label={t("navigation")} className="contents">
          {props.nav.map((group, index) => (
            <SidebarGroup key={group.label ?? index}>
              {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const current = item.href === active;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={current}>
                          <Link href={item.href} onClick={close} aria-current={current ? "page" : undefined}>
                            <span className="truncate">{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                        {item.badge !== undefined && item.badge !== null ? (
                          <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
        {props.sidebarContent}
      </SidebarContent>

      <SidebarFooter inert={hidden}>
        {props.sidebarFooter}
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu
              user={props.user}
              link={props.link}
              theme={props.theme}
              onThemeChange={props.onThemeChange}
              settingsHref={props.settingsHref}
              onSignOut={props.onSignOut}
              onShortcuts={props.onShortcuts}
              onNavigate={close}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function FrameHeader(props: { crumbs: Crumb[]; link: FrameLink; end?: ReactNode }) {
  const t = useT(frameMessages);
  const { isMobile, toggleSidebar } = useSidebar();
  return (
    <header className="bg-background/95 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur md:rounded-t-[inherit]">
      <Button
        variant="ghost"
        size="icon"
        className="-ml-1 size-7"
        aria-label={t("toggleSidebar")}
        title={t("toggleSidebar")}
        onClick={toggleSidebar}
      >
        <PanelLeft />
      </Button>
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <FrameCrumbs crumbs={props.crumbs} link={props.link} compact={isMobile} />
      {props.end ? <div className="ml-auto flex shrink-0 items-center gap-1">{props.end}</div> : null}
    </header>
  );
}

/**
 * The app's frame: the sidebar with the search at the top, the navigation as
 * text, the organization and the user menu at the bottom; the header with the
 * breadcrumbs and, at the right, `headerEnd`; the page.
 * Keys: ⌘K or Ctrl+K and "/" search, "G then a letter" opens a page, Ctrl+/
 * lists the shortcuts, ⌘B or Ctrl+B shows or hides the sidebar.
 */
export function AppFrame(props: AppFrameProps) {
  const t = useT(frameMessages);
  const [savedShortcuts] = useShortcutsPreference();
  const singleKeys = props.shortcuts ?? savedShortcuts;
  const [defaultOpen] = useState(() => props.defaultSidebarOpen ?? sidebarCookie());
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);

  const items = props.nav.flatMap((group) => group.items);
  const signature = JSON.stringify(items.map((item) => [item.shortcut ?? "", item.label, item.href]));
  const targets = useMemo<GoTarget[]>(
    () =>
      props.nav
        .flatMap((group) => group.items)
        .filter((item) => item.shortcut)
        .map((item) => ({ key: item.shortcut!.toLowerCase(), label: item.label, href: item.href })),
    // The items' content, not the array: apps often build `nav` on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );
  useEffect(() => {
    for (const [key, labels] of shortcutClashes(items)) {
      // A mistake in the app's navigation; its developers see it in the console.
      // eslint-disable-next-line no-console
      console.error(
        `AppFrame: "G then ${key.toUpperCase()}" is set for ${labels.join(", ")}; each letter may open one page.`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      open={props.sidebarOpen}
      onOpenChange={props.onSidebarOpenChange}
    >
      <a
        href="#main"
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          // Focus only: the address stays as it is.
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
        className="bg-background sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("skip")}
      </a>
      <FrameSidebar {...props} onSearch={openSearch} onShortcuts={openShortcuts} />
      <SidebarInset className="min-w-0">
        <FrameHeader crumbs={props.breadcrumbs ?? []} link={props.link} end={props.headerEnd} />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          {props.children}
        </main>
      </SidebarInset>
      <FrameLayers
        {...props}
        pages={props.nav.flatMap((group) =>
          group.items.map((item) => ({
            label: item.label,
            href: item.href,
            shortcut: item.shortcut,
            group: group.label,
          })),
        )}
        targets={targets}
        singleKeys={singleKeys}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        shortcutsOpen={shortcutsOpen}
        setShortcutsOpen={setShortcutsOpen}
      />
    </SidebarProvider>
  );
}

/** The search, the shortcuts overview and the keys; inside the sidebar's provider, to close its sheet on phones. */
function FrameLayers(
  props: AppFrameProps & {
    pages: { label: string; href: string; shortcut?: string }[];
    targets: GoTarget[];
    singleKeys: boolean;
    searchOpen: boolean;
    setSearchOpen: (open: boolean) => void;
    shortcutsOpen: boolean;
    setShortcutsOpen: (open: boolean) => void;
  },
) {
  const t = useT(frameMessages);
  const { setOpenMobile } = useSidebar();
  const { setSearchOpen, setShortcutsOpen } = props;
  const Link = props.link;
  const appNavigate = props.navigate;
  const navigate = useCallback(
    (href: string) => {
      setOpenMobile(false);
      appNavigate(href);
    },
    [setOpenMobile, appNavigate],
  );
  const openSearch = useCallback(() => setSearchOpen(true), [setSearchOpen]);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), [setShortcutsOpen]);

  useSearchKeys({ open: props.searchOpen, slash: props.singleKeys, onOpen: openSearch });
  const waiting = useGoShortcuts({
    targets: props.targets,
    enabled: props.singleKeys,
    navigate,
    onOverview: openShortcuts,
  });

  const settingsLink = props.settingsHref ? (
    <Link
      href={props.settingsHref}
      onClick={() => {
        setShortcutsOpen(false);
        setOpenMobile(false);
      }}
      className="text-foreground underline underline-offset-4"
    >
      {t("openSettings")}
    </Link>
  ) : null;

  return (
    <>
      <SearchDialog
        appName={props.app.name}
        open={props.searchOpen}
        onOpenChange={setSearchOpen}
        pages={props.pages}
        options={props.search}
        singleKeys={props.singleKeys}
        navigate={navigate}
        onShortcuts={openShortcuts}
      />
      <ShortcutsDialog
        targets={props.targets}
        enabled={props.singleKeys}
        open={props.shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        settings={settingsLink}
      />
      {waiting ? <GoHint targets={waiting} /> : null}
    </>
  );
}
