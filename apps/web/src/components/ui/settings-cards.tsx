import { useId, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "./button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
import { Label } from "./label";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { Switch } from "./switch";
import { defineMessages, useT } from "@/i18n";
import { THEME_PREFERENCES, type ThemePreference } from "./theme";
import { useShortcutsPreference } from "./frame/shortcuts";

const messages = defineMessages({
  en: {
    appearance: "Appearance",
    appearanceDescription: "Light, dark, or as your device is set.",
    light: "Light",
    dark: "Dark",
    system: "Device setting",
    shortcuts: "Keyboard shortcuts",
    shortcutsDescription: "Ctrl / shows every shortcut. Ctrl K and Ctrl / always work.",
    singleKeys: "Shortcuts with single letters: G then a letter, and /",
    about: "About",
    version: "Version {version}",
    noVersion: "Built from source, without a version",
    sourceCode: "Source code on GitHub",
  },
  de: {
    appearance: "Darstellung",
    appearanceDescription: "Hell, dunkel oder wie dein Gerät eingestellt ist.",
    light: "Hell",
    dark: "Dunkel",
    system: "Wie das Gerät",
    shortcuts: "Tastenkürzel",
    shortcutsDescription: "Strg / zeigt alle Tastenkürzel. Strg K und Strg / gelten immer.",
    singleKeys: "Tastenkürzel mit einzelnen Buchstaben: G und dann ein Buchstabe, und /",
    about: "Über",
    version: "Version {version}",
    noVersion: "Aus dem Quellcode gebaut, ohne Version",
    sourceCode: "Quellcode auf GitHub",
  },
});

/** "Appearance" for the person's settings page: the same choice as in the user menu. */
export function AppearanceCard(props: {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}) {
  const t = useT(messages);
  const id = useId();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("appearance")}</CardTitle>
        <CardDescription>{t("appearanceDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={props.value}
          onValueChange={(value) => props.onChange(value as ThemePreference)}
          aria-label={t("appearance")}
          className="gap-3"
        >
          {THEME_PREFERENCES.map((option) => (
            <div key={option} className="flex items-center gap-2">
              <RadioGroupItem value={option} id={`${id}-${option}`} />
              <Label htmlFor={`${id}-${option}`} className="font-normal">
                {t(option)}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}

/**
 * Turns shortcuts with single letters on and off (WCAG 2.1.4). Without
 * props, the choice is kept in this browser and the frame follows it.
 */
export function KeyboardShortcutsCard(props: {
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
}) {
  const t = useT(messages);
  const id = useId();
  const [saved, setSaved] = useShortcutsPreference();
  const enabled = props.enabled ?? saved;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("shortcuts")}</CardTitle>
        <CardDescription>{t("shortcutsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <Label htmlFor={id} className="font-normal">
          {t("singleKeys")}
        </Label>
        <Switch id={id} checked={enabled} onCheckedChange={props.onEnabledChange ?? setSaved} />
      </CardContent>
    </Card>
  );
}

/**
 * "About" for the settings page: who makes the app (`text`, with `logo`),
 * the version that runs (`version`: null for a build without one, undefined
 * while it loads; linked with `versionHref`), and a link to the source code.
 */
export function AboutCard(props: {
  logo?: ReactNode;
  text: ReactNode;
  version: string | null | undefined;
  versionHref?: string;
  repositoryUrl: string;
}) {
  const t = useT(messages);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("about")}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground flex items-center gap-3 text-sm">
        {props.logo}
        <div className="space-y-1">
          <p>{props.text}</p>
          {props.version === undefined ? null : (
            <p>
              {props.version === null ? (
                t("noVersion")
              ) : props.versionHref ? (
                <a
                  href={props.versionHref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link underline underline-offset-4"
                >
                  {t("version", { version: props.version })}
                </a>
              ) : (
                t("version", { version: props.version })
              )}
            </p>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm" asChild>
          <a href={props.repositoryUrl} target="_blank" rel="noreferrer">
            {t("sourceCode")}
            <ArrowUpRight />
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}
