import { useQuery } from "@tanstack/react-query";
import { Page, PageHeader } from "@/components/ui/page";
import { AboutCard, AppearanceCard, KeyboardShortcutsCard } from "@/components/ui/settings-cards";
import { OrganizationLogo } from "@/components/brand";
import { useT } from "@/i18n";
import { commitUrl, REPOSITORY_URL } from "@/lib/repository";
import { useTheme } from "@/lib/theme";
import { statusQuery } from "@/modules/overview/api";
import { messages } from "./messages";

/** The person's own settings, for every role: appearance, single-letter shortcuts (WCAG 2.1.4), about. */
export function PreferencesPage() {
  const t = useT(messages);
  const { theme, setTheme } = useTheme();
  // The version that runs: undefined while the status loads, null for a build without one.
  const status = useQuery(statusQuery).data;
  const version = status ? status.version : undefined;
  return (
    <Page className="max-w-3xl">
      <PageHeader title={t("title")} description={t("description")} />
      <AppearanceCard value={theme} onChange={setTheme} />
      <KeyboardShortcutsCard />
      {/* The software's name, also when an installation renames the app. */}
      <AboutCard
        logo={<OrganizationLogo className="size-10 rounded-md" />}
        text={t("about")}
        version={version}
        versionHref={version ? commitUrl(version) : undefined}
        repositoryUrl={REPOSITORY_URL}
      />
    </Page>
  );
}
