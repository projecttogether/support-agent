import type { ReactNode } from "react";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: {
    signIn: "Sign in",
    withAccount: "With the account of {organization}.",
    forPeople: "For the people of {organization}.",
  },
  de: {
    signIn: "Anmelden",
    withAccount: "Mit dem Konto von {organization}.",
    forPeople: "Für die Menschen bei {organization}.",
  },
});

function AppMark(props: { name: string; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {props.icon}
      <span className="font-semibold">{props.name}</span>
    </div>
  );
}

/**
 * The sign-in page, outside the frame: what the app is for on the left (on
 * wide screens), the sign-in on the right, and the organization that makes
 * the app at the bottom. The app puts its buttons and messages in `children`.
 */
export function SignInPage(props: {
  /** `icon`: the app icon, 36 pixels. */
  app: { name: string; icon: ReactNode };
  /** What the app is for, in one sentence; the large text on the left. */
  tagline: string;
  /** The organization that runs this installation, if known. */
  organization?: string;
  /** At the bottom: who makes the app, with a link to its source code. */
  footer: ReactNode;
  /** Default: "Sign in". */
  title?: ReactNode;
  /** Default: "With the account of <organization>." when it is known. */
  description?: ReactNode;
  children: ReactNode;
}) {
  const t = useT(messages);
  const organization = props.organization;
  const description = props.description ?? (organization ? t("withAccount", { organization }) : undefined);
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <section className="bg-muted/60 hidden flex-col justify-between p-10 lg:flex">
        <AppMark name={props.app.name} icon={props.app.icon} />
        <div className="max-w-md space-y-3">
          <p className="text-3xl font-semibold tracking-tight">{props.tagline}</p>
          {organization ? <p className="text-muted-foreground">{t("forPeople", { organization })}</p> : null}
        </div>
        <div className="text-muted-foreground text-xs">{props.footer}</div>
      </section>
      <section className="flex flex-col items-center justify-center gap-8 p-6">
        <div className="flex w-full max-w-sm flex-col gap-6">
          {/* Narrow screens have no left side: the mark and what the app is for come first. */}
          <div className="space-y-3 lg:hidden">
            <AppMark name={props.app.name} icon={props.app.icon} />
            <p className="text-muted-foreground text-sm">{props.tagline}</p>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{props.title ?? t("signIn")}</h1>
            {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
          </div>
          {props.children}
        </div>
        <div className="text-muted-foreground max-w-sm text-xs lg:hidden">{props.footer}</div>
      </section>
    </main>
  );
}
