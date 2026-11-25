import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppFrame, type FrameLink, type NavGroup } from "@/components/ui/app-frame";
import { AppIcon, SidebarOrganization } from "@/components/brand";
import { useMe } from "@/hooks/use-me";
import { useTheme } from "@/lib/theme";
import { authClient } from "@/lib/auth-client";
import { DEFAULT_APP_NAME, useAuthConfig } from "@/lib/auth-config";
import { queryClient } from "@/lib/query";
import { defineMessages, useT } from "@/i18n";
import { breadcrumbsFor, NAVIGATION, navMessages, PREFERENCES_PATH, recordOf } from "@/app/navigation";
import { agentQuery } from "@/modules/agents/api";
import { messages as agentMessages } from "@/modules/agents/messages";
import { knowledgeSourcesQuery } from "@/modules/knowledge/api";
import { messages as knowledgeMessages } from "@/modules/knowledge/messages";
import { messages as preferencesMessages } from "@/modules/preferences/messages";

const messages = defineMessages({
  en: { admin: "Admin", editor: "Editor" },
  de: { admin: "Admin", editor: "Bearbeitung" },
});

/**
 * TanStack Router's link for the frame: every other prop goes on to the <a>.
 * Exact, so that the router marks only the page itself as current, not the
 * breadcrumb of its parent; the frame marks the sidebar item.
 */
const AppLink: FrameLink = ({ href, ...props }) => (
  <Link to={href} activeOptions={{ exact: true }} {...props} />
);

/**
 * The name of the agent or knowledge source the path shows, for the
 * breadcrumbs. The pages load the same queries, so this asks for nothing more.
 */
function useRecordName(pathname: string, admin: boolean): string | undefined {
  const record = recordOf(pathname);
  const agent = useQuery({ ...agentQuery(record?.id ?? ""), enabled: record?.kind === "agent" }).data;
  const sources = useQuery({ ...knowledgeSourcesQuery, enabled: admin && record?.kind === "source" }).data;
  if (record?.kind === "agent") return agent?.name;
  if (record?.kind === "source") return sources?.find((source) => source.id === record.id)?.name;
  return undefined;
}

/** The signed-in application frame: the AppFrame with the support agent's navigation. */
export function AppLayout() {
  const me = useMe();
  const m = useT(messages);
  const t = useT(navMessages);
  const tAgents = useT(agentMessages);
  const tKnowledge = useT(knowledgeMessages);
  const tPreferences = useT(preferencesMessages);
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const admin = me.role === "admin";
  const record = useRecordName(pathname, admin);
  const { theme, setTheme } = useTheme();
  const appName = useAuthConfig()?.appName || DEFAULT_APP_NAME;
  useEffect(() => {
    document.title = appName;
  }, [appName]);

  const nav: NavGroup[] = NAVIGATION.filter((group) => !group.adminOnly || admin).map((group) => ({
    label: t(group.key),
    items: group.items.map((item) => ({ label: t(item.key), href: item.to, shortcut: item.shortcut })),
  }));
  const breadcrumbs = breadcrumbsFor(pathname, {
    items: nav.flatMap((group) => group.items),
    labels: {
      newAgent: tAgents("newTitle"),
      newSource: tKnowledge("newTitle"),
      preferences: tPreferences("title"),
    },
    record,
  });

  const signOut = async () => {
    await authClient.signOut();
    queryClient.clear();
    window.location.assign("/sign-in");
  };

  return (
    // No `search`: the API has no text search, so the search offers the pages.
    <AppFrame
      app={{ name: appName, icon: <AppIcon /> }}
      sidebarFooter={<SidebarOrganization />}
      nav={nav}
      pathname={pathname}
      link={AppLink}
      navigate={(href) => void router.navigate({ to: href })}
      user={{ name: me.name || me.email, email: me.email, detail: m(me.role), image: me.image }}
      theme={theme}
      onThemeChange={setTheme}
      settingsHref={PREFERENCES_PATH}
      onSignOut={() => void signOut()}
      breadcrumbs={breadcrumbs}
    >
      <Outlet />
    </AppFrame>
  );
}
