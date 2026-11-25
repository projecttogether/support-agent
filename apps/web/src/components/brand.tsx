import { ArrowUpRight } from "lucide-react";
import organizationLogo from "@/assets/projecttogether-logo.png";
import { cn } from "@/components/ui/utils";
import { defineMessages, useT } from "@/i18n";
import { REPOSITORY_URL } from "@/lib/repository";

/*
 * The app's identity (ProjectTogether's app identity rules): its own icon,
 * Lucide's bot-message-square on PT Sky (public/favicon.svg), in the browser
 * tab, the sidebar and on the sign-in page; ProjectTogether's unchanged logo
 * as the organization that makes the app, in the sidebar's footer, on the
 * sign-in page and in the About card.
 */

/** The organization that makes the app. */
export const ORGANIZATION = "ProjectTogether";

const messages = defineMessages({
  en: {
    madeBy: "{app} is open source, made by {organization}.",
    sourceCode: "Source code",
    newTab: "(GitHub, opens in a new tab)",
  },
  de: {
    madeBy: "{app} ist Open Source, gemacht von {organization}.",
    sourceCode: "Quellcode",
    newTab: "(GitHub, öffnet in einem neuen Tab)",
  },
});

/** The app icon; 32 pixels unless `className` sets another size. */
export function AppIcon({ className }: { className?: string }) {
  return (
    <img src="/favicon.svg" alt="" width={32} height={32} className={cn("size-8 shrink-0", className)} />
  );
}

/** ProjectTogether's logo; 20 pixels unless `className` sets another size. */
export function OrganizationLogo({ className }: { className?: string }) {
  return (
    <img
      src={organizationLogo}
      alt=""
      width={20}
      height={20}
      className={cn("size-5 shrink-0 rounded-sm", className)}
    />
  );
}

/** The sidebar's footer: the organization's logo and name. */
export function SidebarOrganization() {
  return (
    <div className="text-muted-foreground flex items-center gap-2 px-2 text-xs">
      <OrganizationLogo />
      <span className="truncate">{ORGANIZATION}</span>
    </div>
  );
}

/** "<App> is open source, made by ProjectTogether. Source code", with the logo (sign-in page). */
export function MadeBy({ appName }: { appName: string }) {
  const t = useT(messages);
  return (
    <span className="inline-flex items-center gap-2">
      <OrganizationLogo className="size-6" />
      <span>
        {t("madeBy", { app: appName, organization: ORGANIZATION })}{" "}
        <a
          href={REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground inline-flex items-center gap-0.5 underline underline-offset-4"
        >
          {t("sourceCode")}
          <ArrowUpRight className="size-3" aria-hidden="true" />
          <span className="sr-only">{t("newTab")}</span>
        </a>
      </span>
    </span>
  );
}
