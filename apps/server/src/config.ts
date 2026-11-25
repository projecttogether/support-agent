import { z } from "zod";

/**
 * Settings from the environment. Read them only through `config()`; blank
 * values count as unset. Document every variable in docs/configuration.md.
 * Everything else (providers, agents, Slack) is configured in the admin
 * interface and stored in the database.
 */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());
const withDefault = <T extends z.ZodType>(schema: T, fallback: z.input<T>) =>
  z.preprocess(blankToUndefined, schema.default(fallback as never));
const flag = (fallback: boolean) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== ""
        ? ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
        : undefined,
    z.boolean().default(fallback),
  );

/**
 * Secrets published in .env.example (and earlier versions of it). Anyone can
 * read them, so they are allowed only for development on this machine.
 */
const EXAMPLE_SECRETS = {
  AUTH_SECRET: ["change-me-to-a-long-random-value", "development-secret-development-secret"],
  ENCRYPTION_KEY: ["ZGV2ZWxvcG1lbnQta2V5LWRldmVsb3BtZW50LWtleSE="],
};
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const schema = z
  .object({
    NODE_ENV: withDefault(z.enum(["development", "test", "production"]), "development"),
    /** Which part of the application this process runs. */
    APP_ROLE: withDefault(z.enum(["all", "web", "bot", "migrate"]), "all"),
    PORT: withDefault(z.coerce.number().int().min(1).max(65535), 3000),
    HOST: withDefault(z.string(), "0.0.0.0"),
    /** The public URL of the admin interface, e.g. https://support-agent.example.org */
    APP_URL: withDefault(z.url(), "http://localhost:3000"),
    APP_NAME: withDefault(z.string().min(1).max(100), "Support Agent"),
    DATABASE_URL: z.string().min(1),
    DATABASE_POOL_SIZE: withDefault(z.coerce.number().int().min(1).max(200), 10),
    /** Signs sessions. At least 32 characters. */
    AUTH_SECRET: z.string().min(32),
    /** Encrypts stored API keys and tokens. 32 bytes, base64. */
    ENCRYPTION_KEY: z.string().min(1),
    LOG_LEVEL: withDefault(z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]), "info"),
    /**
     * Reverse proxies in front of the app that append to X-Forwarded-For:
     * `true` (one), a number of hops, or `false`/0 (use the socket address).
     */
    TRUST_PROXY: z.preprocess((value) => {
      if (typeof value !== "string" || value.trim() === "") return undefined;
      const text = value.trim().toLowerCase();
      if (["true", "yes", "on"].includes(text)) return 1;
      if (["false", "no", "off"].includes(text)) return 0;
      return text;
    }, z.coerce.number().int().min(0).max(10).default(0)),
    /** Apply database migrations when the process starts (single-container setups). */
    RUN_MIGRATIONS: flag(false),
    /** Directory with the built web app. */
    WEB_DIST_DIR: optional(z.string()),
    MIGRATIONS_DIR: optional(z.string()),
    /** Sign-in with an OpenID Connect provider (Keycloak, Microsoft Entra ID, Google, Slack, …). */
    OIDC_ISSUER: z.url(),
    OIDC_CLIENT_ID: z.string().min(1),
    OIDC_CLIENT_SECRET: z.string().min(1),
    OIDC_PROVIDER_NAME: withDefault(z.string().max(40), "single sign-on"),
    OIDC_SCOPES: withDefault(z.string(), "openid email profile"),
    /** Proof Key for Code Exchange; turn off only for providers that reject it. */
    OIDC_PKCE: flag(true),
    /** Comma-separated email addresses that are always admins (first sign-in and recovery). */
    ADMIN_EMAILS: withDefault(z.string(), ""),
    /**
     * The bot exits when Slack stays unreachable this long, so the container
     * platform restarts it. 0 turns the watchdog off.
     */
    BOT_WATCHDOG_SECONDS: withDefault(z.coerce.number().int().min(0).max(86_400), 300),
    /** The bot touches this file every 30 seconds while connected to Slack, for container health checks. */
    BOT_HEARTBEAT_FILE: optional(z.string()),
    /** Questions the bot works on at the same time. */
    BOT_CONCURRENCY: withDefault(z.coerce.number().int().min(1).max(50), 4),
    /** Slack's Web API base URL; only for tests against a stand-in. */
    SLACK_API_URL: optional(z.url()),
    /** The commit an image was built from (12 characters), set by the Deploy workflow; unset in images built from source. */
    APP_VERSION: optional(z.string().max(100)),
    /** Error reports to Sentry or a compatible service; off when unset. */
    SENTRY_DSN: optional(z.url()),
    SENTRY_ENVIRONMENT: optional(z.string().max(64)),
    SENTRY_RELEASE: optional(z.string().max(200)),
  })
  .superRefine((value, ctx) => {
    // A .env copied from .env.example may still say NODE_ENV=development, so
    // a public APP_URL counts as production too.
    // An invalid APP_URL has its own issue; refinements run despite it.
    const local = LOCAL_HOSTS.has(URL.parse(value.APP_URL)?.hostname ?? "");
    if (value.NODE_ENV === "production" || !local) {
      for (const key of ["AUTH_SECRET", "ENCRYPTION_KEY"] as const) {
        if (EXAMPLE_SECRETS[key].includes(value[key])) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "Replace the example value: openssl rand -base64 32",
          });
        }
      }
    }
    const key = Buffer.from(value.ENCRYPTION_KEY, "base64");
    if (key.length !== 32) {
      ctx.addIssue({ code: "custom", path: ["ENCRYPTION_KEY"], message: "Must be 32 bytes, base64-encoded" });
    }
    for (const email of splitList(value.ADMIN_EMAILS)) {
      if (!z.email().safeParse(email).success) {
        ctx.addIssue({
          code: "custom",
          path: ["ADMIN_EMAILS"],
          message: "Each entry must be an email address",
        });
      }
    }
  });

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export type Config = z.infer<typeof schema> & { adminEmails: string[] };

let cached: Config | undefined;

/** A missing or invalid variable. Its message names variables and rules, never values. */
export class ConfigError extends Error {
  override name = "ConfigError";
}

export function config(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new ConfigError(`Invalid configuration:\n${problems}`);
  }
  const value = parsed.data;
  cached = {
    ...value,
    APP_URL: value.APP_URL.replace(/\/+$/, ""),
    adminEmails: splitList(value.ADMIN_EMAILS),
  };
  return cached;
}

/** Tests only: forget the cached configuration after changing process.env. */
export function resetConfigForTests() {
  cached = undefined;
}
