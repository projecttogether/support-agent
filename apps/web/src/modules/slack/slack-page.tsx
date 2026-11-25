import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { AlertTriangle, ExternalLink, Plug, Save } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  slackSettingsUpdateSchema,
  type SlackCheckResult,
  type SlackSettings,
  type SlackSettingsUpdate,
} from "@support-agent/shared/api/slack";
import { CheckResultAlert } from "@/components/check-result";
import { CopyButton } from "@/components/ui/copy-button";
import { Page, PageHeader } from "@/components/ui/page";
import { SecretField, initialSecret, type SecretValue } from "@/components/ui/secret-field";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useDebounced } from "@/hooks/use-debounced";
import { useLocale, useT } from "@/i18n";
import { common } from "@/i18n/common";
import { ApiError, errorMessage } from "@/lib/api";
import { DEFAULT_APP_NAME, useAuthConfig } from "@/lib/auth-config";
import { applyServerErrors, firstMessage, translateMessage, useSchemaResolver } from "@/lib/validation";
import { useCheckSlack, useSlackChannels, useSlackManifest, useSlackSettings, useUpdateSlack } from "./api";
import { messages } from "./messages";

const NEW_APP_URL = "https://api.slack.com/apps?new_app=1";
const NONE = "none";

function Step(props: { title: string; description: ReactNode; children?: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{props.title}</h2>
        </CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      {props.children ? <CardContent className="grid gap-4">{props.children}</CardContent> : null}
    </Card>
  );
}

function StatusCard({ settings }: { settings: SlackSettings }) {
  const t = useT(messages);
  const token = (stored: boolean, hint: string | null) =>
    stored ? (
      <Badge variant="secondary">{t("stored", { hint: hint ?? "…" })}</Badge>
    ) : (
      <span className="text-muted-foreground">{t("missing")}</span>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("status")}</h2>
        </CardTitle>
        {!settings.teamName ? <CardDescription>{t("notConnected")}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t("workspace")}</dt>
          <dd>{settings.teamName ?? "—"}</dd>
          <dt className="text-muted-foreground">{t("botName")}</dt>
          <dd>{settings.botName ? `@${settings.botName}` : "—"}</dd>
          <dt className="text-muted-foreground">{t("botToken")}</dt>
          <dd>{token(settings.hasBotToken, settings.botTokenHint)}</dd>
          <dt className="text-muted-foreground">{t("appToken")}</dt>
          <dd>{token(settings.hasAppToken, settings.appTokenHint)}</dd>
        </dl>
        {settings.missingScopes.length ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>
              {t("lastCheckMissing", { scopes: settings.missingScopes.join(", ") })}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ManifestStep() {
  const t = useT(messages);
  const id = useId();
  const appName = useAuthConfig()?.appName;
  const [name, setName] = useState<string | null>(null);
  const value = name ?? appName ?? DEFAULT_APP_NAME;
  const debounced = useDebounced(value.trim(), 400);
  const manifest = useSlackManifest(debounced);
  const json = manifest.data ? JSON.stringify(manifest.data, null, 2) : "";

  return (
    <Step title={t("step1")} description={t("step1Text")}>
      <Field>
        <FieldLabel htmlFor={`${id}-name`}>{t("appName")}</FieldLabel>
        <Input
          id={`${id}-name`}
          maxLength={35}
          value={value}
          onChange={(event) => setName(event.target.value)}
          aria-describedby={`${id}-name-hint`}
          className="sm:max-w-sm"
        />
        <FieldDescription id={`${id}-name-hint`}>{t("appNameHint")}</FieldDescription>
      </Field>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium" id={`${id}-manifest`}>
            {t("manifest")}
          </span>
          {json ? <CopyButton text={json} label={t("copyManifest")} /> : null}
        </div>
        {manifest.isError ? (
          <ErrorState error={manifest.error} onRetry={() => void manifest.refetch()} />
        ) : !manifest.data ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <pre
            className="bg-muted max-h-96 overflow-auto rounded-md p-3 font-mono text-xs"
            aria-labelledby={`${id}-manifest`}
            tabIndex={0}
          >
            <code>{json}</code>
          </pre>
        )}
      </div>
      <Button asChild variant="outline" className="w-fit">
        <a href={NEW_APP_URL} target="_blank" rel="noreferrer noopener">
          <ExternalLink />
          {t("openSlack")}
        </a>
      </Button>
    </Step>
  );
}

type TokenValues = { botToken: SecretValue; appToken: SecretValue };

const tokenSchema = z
  .object({
    botToken: z.object({ value: z.string() }).loose(),
    appToken: z.object({ value: z.string() }).loose(),
  })
  .transform((values): unknown => ({
    botToken: values.botToken.value.trim() || undefined,
    appToken: values.appToken.value.trim() || undefined,
  }))
  .pipe(slackSettingsUpdateSchema);

function CheckDetails({ result }: { result: SlackCheckResult }) {
  const t = useT(messages);
  return (
    <CheckResultAlert result={result}>
      {result.teamName ? <p>{t("checkTeam", { team: result.teamName })}</p> : null}
      {result.botName ? <p>{t("checkBot", { bot: `@${result.botName}` })}</p> : null}
      {result.missingScopes.length ? (
        <div className="grid gap-1">
          <p className="font-medium">{t("missingRequired")}</p>
          <p className="font-mono text-xs">{result.missingScopes.join(", ")}</p>
          <p>{t("missingRequiredText")}</p>
        </div>
      ) : null}
      {result.missingOptionalScopes.length ? (
        <div className="grid gap-1">
          <p className="font-medium">{t("missingOptional")}</p>
          <p className="font-mono text-xs">{result.missingOptionalScopes.join(", ")}</p>
        </div>
      ) : null}
      {result.ok && !result.missingScopes.length && !result.missingOptionalScopes.length ? (
        <p>{t("allScopes")}</p>
      ) : null}
    </CheckResultAlert>
  );
}

function TokensStep({ settings }: { settings: SlackSettings }) {
  const t = useT(messages);
  const locale = useLocale();
  const id = useId();
  const update = useUpdateSlack();
  const check = useCheckSlack();
  const resolver = useSchemaResolver<TokenValues, SlackSettingsUpdate>(tokenSchema);
  const form = useForm<TokenValues, unknown, SlackSettingsUpdate>({
    resolver,
    defaultValues: {
      botToken: initialSecret(settings.hasBotToken),
      appToken: initialSecret(settings.hasAppToken),
    },
  });
  const { isSubmitting } = form.formState;

  const save = form.handleSubmit(async (input) => {
    try {
      const saved = await update.mutateAsync(input);
      form.reset({ botToken: initialSecret(saved.hasBotToken), appToken: initialSecret(saved.hasAppToken) });
      toast.success(t("tokensSaved"));
    } catch (error) {
      applyServerErrors(form, error, locale);
      toast.error(errorMessage(error));
    }
  });

  const runCheck = async () => {
    try {
      await check.mutateAsync();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Step title={t("step4")} description={t("step4Text")}>
      <form className="grid gap-6" onSubmit={(event) => void save(event)} noValidate>
        <FieldGroup className="gap-6">
          <Controller
            control={form.control}
            name="botToken"
            render={({ field, fieldState }) => (
              <SecretField
                id={`${id}-bot`}
                label={t("botToken")}
                stored={settings.hasBotToken}
                hint={settings.botTokenHint}
                value={field.value}
                onChange={field.onChange}
                placeholder="xoxb-…"
                error={firstMessage(fieldState.error)}
              />
            )}
          />
          <Controller
            control={form.control}
            name="appToken"
            render={({ field, fieldState }) => (
              <SecretField
                id={`${id}-app`}
                label={t("appToken")}
                stored={settings.hasAppToken}
                hint={settings.appTokenHint}
                value={field.value}
                onChange={field.onChange}
                placeholder="xapp-…"
                error={firstMessage(fieldState.error)}
              />
            )}
          />
        </FieldGroup>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSubmitting || !form.formState.isDirty}>
            {isSubmitting ? <Spinner /> : <Save />}
            {t("saveTokens")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={check.isPending || !settings.hasBotToken}
            onClick={() => void runCheck()}
          >
            {check.isPending ? <Spinner /> : <Plug />}
            {check.isPending ? t("checking") : t("check")}
          </Button>
        </div>
      </form>
      {check.data ? <CheckDetails result={check.data} /> : null}
      <Alert>
        <AlertTitle>{t("optionalTitle")}</AlertTitle>
        <AlertDescription>{t("optionalText")}</AlertDescription>
      </Alert>
    </Step>
  );
}

function AlertChannelCard({ settings }: { settings: SlackSettings }) {
  const t = useT(messages);
  const tc = useT(common);
  const locale = useLocale();
  const id = useId();
  const channels = useSlackChannels();
  const update = useUpdateSlack();
  const [value, setValue] = useState(settings.alertChannelId ?? "");
  const [error, setError] = useState<string | null>(null);
  const sorted = useMemo(
    () => [...(channels.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [channels.data],
  );

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = slackSettingsUpdateSchema.shape.alertChannelId.safeParse(value.trim().toUpperCase());
    if (!parsed.success) {
      setError(translateMessage(parsed.error.issues[0]?.message ?? "", locale));
      return;
    }
    try {
      await update.mutateAsync({ alertChannelId: parsed.data ?? null });
      toast.success(t("alertSaved"));
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.fields?.alertChannelId : undefined;
      setError(message ? translateMessage(message, locale) : null);
      toast.error(errorMessage(cause));
    }
  };

  return (
    <Step title={t("alerts")} description={t("alertsText")}>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => void save(event)} noValidate>
        {channels.isLoading ? (
          <Skeleton className="h-9 w-64" />
        ) : channels.isError ? (
          <Field className="w-full sm:w-64" data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={`${id}-channel`}>{t("channelId")}</FieldLabel>
            <Input
              id={`${id}-channel`}
              value={value}
              placeholder="C01ABCDEF"
              className="font-mono"
              spellCheck={false}
              aria-describedby={`${id}-channel-hint`}
              aria-invalid={error ? true : undefined}
              onChange={(event) => setValue(event.target.value)}
            />
            <FieldDescription id={`${id}-channel-hint`}>{t("channelIdHint")}</FieldDescription>
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
        ) : (
          <Field className="w-full sm:w-72" data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={`${id}-channel`}>{t("alertChannel")}</FieldLabel>
            <Select value={value || NONE} onValueChange={(next) => setValue(next === NONE ? "" : next)}>
              <SelectTrigger id={`${id}-channel`} className="w-full" aria-invalid={error ? true : undefined}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("noAlertChannel")}</SelectItem>
                {value && !sorted.some((channel) => channel.id === value) ? (
                  <SelectItem value={value}>{value}</SelectItem>
                ) : null}
                {sorted.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    #{channel.name}
                    {channel.isPrivate || !channel.isMember ? (
                      <span className="text-muted-foreground text-xs">
                        {[
                          channel.isPrivate ? t("privateChannel") : null,
                          !channel.isMember ? t("notMember") : null,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
        )}
        <Button
          type="submit"
          variant="outline"
          disabled={update.isPending || value === (settings.alertChannelId ?? "")}
        >
          {update.isPending ? <Spinner /> : <Save />}
          {tc("save")}
        </Button>
      </form>
    </Step>
  );
}

export function SlackPage() {
  const t = useT(messages);
  const settings = useSlackSettings();
  return (
    <Page className="max-w-4xl">
      <PageHeader title={t("title")} description={t("description")} />
      {settings.isLoading ? (
        <LoadingState />
      ) : settings.isError || !settings.data ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <>
          <StatusCard settings={settings.data} />
          <ManifestStep />
          <Step title={t("step2")} description={t("step2Text")} />
          <Step title={t("step3")} description={t("step3Text")} />
          <TokensStep settings={settings.data} />
          <AlertChannelCard key={settings.data.alertChannelId ?? ""} settings={settings.data} />
        </>
      )}
    </Page>
  );
}
