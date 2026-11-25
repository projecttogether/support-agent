import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FieldValues, Path, Resolver, UseFormReturn } from "react-hook-form";
import type { z } from "zod";
import { defineMessages, translate, useLocale, type Messages } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { ApiError } from "./api";

/**
 * Validation messages. The shared schemas carry English messages; the German
 * catalog translates them by their English text (`known`). Zod's own
 * messages are replaced by plain ones (`issueMessage`).
 */
const known = defineMessages({
  en: {
    "Use a Slack channel ID, e.g. C01ABCDEF": "Use a Slack channel ID, e.g. C01ABCDEF",
    "Choose a provider": "Choose a provider",
    "Choose a model": "Choose a model",
    "Choose at least one channel": "Choose at least one channel",
    "Choose a fallback model": "Choose a fallback model",
    "Enter what the agent says when it has no answer": "Enter what the agent says when it has no answer",
    "A channel is listed twice": "A channel is listed twice",
    "Use names separated by dots, e.g. source.title": "Use names separated by dots, e.g. source.title",
    "Must be valid JSON": "Must be valid JSON",
    "Must be a JSON object": "Must be a JSON object",
    'Must contain "{{query}}"': 'Must contain "{{query}}"',
    "Enter the token URL": "Enter the token URL",
    "Enter the client ID": "Enter the client ID",
    "Enter the API's base URL": "Enter the API's base URL",
    "Enter an API key": "Enter an API key",
    "Use an emoji name without colons, e.g. eyes": "Use an emoji name without colons, e.g. eyes",
    "A bot token starts with xoxb-": "A bot token starts with xoxb-",
    "An app-level token starts with xapp-": "An app-level token starts with xapp-",
  },
  de: {
    "Use a Slack channel ID, e.g. C01ABCDEF": "Gib eine Slack-Kanal-ID ein, z. B. C01ABCDEF",
    "Choose a provider": "Wähle einen Anbieter",
    "Choose a model": "Wähle ein Modell",
    "Choose at least one channel": "Wähle mindestens einen Kanal",
    "Choose a fallback model": "Wähle ein Ersatzmodell",
    "Enter what the agent says when it has no answer":
      "Gib ein, was der Agent sagt, wenn er keine Antwort findet",
    "A channel is listed twice": "Ein Kanal ist doppelt aufgeführt",
    "Use names separated by dots, e.g. source.title": "Namen mit Punkten getrennt, z. B. source.title",
    "Must be valid JSON": "Muss gültiges JSON sein",
    "Must be a JSON object": "Muss ein JSON-Objekt sein",
    'Must contain "{{query}}"': 'Muss "{{query}}" enthalten',
    "Enter the token URL": "Gib die Token-URL ein",
    "Enter the client ID": "Gib die Client-ID ein",
    "Enter the API's base URL": "Gib die Basis-URL der API ein",
    "Enter an API key": "Gib einen API-Schlüssel ein",
    "Use an emoji name without colons, e.g. eyes": "Emoji-Name ohne Doppelpunkte, z. B. eyes",
    "A bot token starts with xoxb-": "Ein Bot-Token beginnt mit xoxb-",
    "An app-level token starts with xapp-": "Ein App-Token beginnt mit xapp-",
  },
});

const generic = defineMessages({
  en: {
    required: "Required",
    tooLong: "At most {max} characters",
    tooFew: "Choose at least {min}",
    tooMany: "At most {max}",
    min: "At least {min}",
    max: "At most {max}",
    url: "Enter a full address, e.g. https://example.org",
    email: "Enter an email address",
    format: "Check the format",
    number: "Enter a number",
    choose: "Choose an option",
    invalid: "Check this value",
  },
  de: {
    required: "Pflichtfeld",
    tooLong: "Höchstens {max} Zeichen",
    tooFew: "Wähle mindestens {min}",
    tooMany: "Höchstens {max}",
    min: "Mindestens {min}",
    max: "Höchstens {max}",
    url: "Gib eine vollständige Adresse ein, z. B. https://example.org",
    email: "Gib eine E-Mail-Adresse ein",
    format: "Prüfe das Format",
    number: "Gib eine Zahl ein",
    choose: "Wähle eine Option",
    invalid: "Prüfe diesen Wert",
  },
});

/** A message from the shared schemas or the server, in the interface language when known. */
export function translateMessage(message: string, locale: Locale): string {
  const catalog = known[locale] as Record<string, string>;
  return catalog[message] ?? message;
}

type Issue = {
  code: string;
  origin?: string;
  format?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  expected?: string;
  input?: unknown;
};

/** A plain message for zod's built-in checks (custom messages of the schemas win). */
export function issueMessage(issue: Issue, locale: Locale): string {
  const t = translate(generic as Messages<typeof generic.en>, locale);
  switch (issue.code) {
    case "too_small":
      if (issue.origin === "string")
        return Number(issue.minimum) <= 1 ? t("required") : t("min", { min: String(issue.minimum) });
      if (issue.origin === "array") return t("tooFew", { min: String(issue.minimum) });
      return t("min", { min: String(issue.minimum) });
    case "too_big":
      if (issue.origin === "string") return t("tooLong", { max: String(issue.maximum) });
      if (issue.origin === "array") return t("tooMany", { max: String(issue.maximum) });
      return t("max", { max: String(issue.maximum) });
    case "invalid_format":
      if (issue.format === "url") return t("url");
      if (issue.format === "email") return t("email");
      return t("format");
    case "invalid_type":
      if (issue.expected === "number") return t("number");
      if (issue.input === null || issue.input === undefined || issue.input === "") return t("required");
      return t("invalid");
    case "invalid_value":
      return t("choose");
    default:
      return t("invalid");
  }
}

/**
 * A react-hook-form resolver for a shared schema, with messages in the
 * interface language. `Values` are the form's values (text fields stay
 * strings; the schema turns blanks into null), `Output` the API input.
 */
export function useSchemaResolver<Values extends FieldValues, Output>(
  schema: z.ZodType<Output, unknown>,
): Resolver<Values, unknown, Output> {
  const locale = useLocale();
  return useMemo(() => schemaResolver<Values, Output>(schema, locale), [schema, locale]);
}

export function schemaResolver<Values extends FieldValues, Output>(
  schema: z.ZodType<Output, unknown>,
  locale: Locale,
): Resolver<Values, unknown, Output> {
  const resolve = zodResolver(schema as never, {
    error: (issue: Issue) => issueMessage(issue, locale),
  }) as unknown as Resolver<Values, unknown, Output>;
  return async (values, context, options) => {
    const result = await resolve(values, context, options);
    translateErrors(result.errors, locale);
    return result;
  };
}

/** Plain error objects and lists, never the field's element (`ref`). */
function childErrors(error: object): object[] {
  return Object.entries(error)
    .filter(([key, value]) => key !== "ref" && key !== "types" && isPlain(value))
    .map(([, value]) => value as object);
}

function isPlain(value: unknown): value is object {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return Array.isArray(value) || prototype === Object.prototype || prototype === null;
}

function translateErrors(errors: object, locale: Locale) {
  for (const value of childErrors(errors)) {
    const error = value as { message?: unknown };
    if (typeof error.message === "string") error.message = translateMessage(error.message, locale);
    translateErrors(value, locale);
  }
}

/**
 * Shows the field messages of a failed request next to the fields
 * (`fields` keys are paths such as `config.url`). Returns the messages
 * that match no field, to show elsewhere.
 */
export function applyServerErrors<Values extends FieldValues>(
  form: Pick<UseFormReturn<Values>, "setError" | "getValues">,
  error: unknown,
  locale: Locale,
  aliases: Record<string, Path<Values>> = {},
): string[] {
  if (!(error instanceof ApiError) || !error.fields) return [];
  const unmatched: string[] = [];
  const values = form.getValues() as Record<string, unknown>;
  for (const [key, message] of Object.entries(error.fields)) {
    const path = aliases[key] ?? key;
    const root = path.split(".")[0]!;
    const text = translateMessage(message, locale);
    if (root in values) form.setError(path as Path<Values>, { type: "server", message: text });
    else unmatched.push(text);
  }
  return unmatched;
}

/** The first message of a field error, also of a list field whose items have errors. */
export function firstMessage(error: unknown): string | undefined {
  if (!isPlain(error)) return undefined;
  const value = error as { message?: unknown };
  if (typeof value.message === "string" && value.message) return value.message;
  for (const child of childErrors(error)) {
    const message = firstMessage(child);
    if (message) return message;
  }
  return undefined;
}
