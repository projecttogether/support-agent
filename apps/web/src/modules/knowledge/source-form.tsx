import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { Controller, useForm, useWatch } from "react-hook-form";
import { ChevronDown, ChevronLeft, ExternalLink, Info, RotateCcw, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  DEFAULT_BODY_TEMPLATE,
  DEFAULT_SEARCH_API_CONFIG,
  knowledgeSourceCreateSchema,
  knowledgeSourceUpdateSchema,
  SEARCH_AUTH_KINDS,
  searchAuthKindSchema,
  type KnowledgeSource,
  type KnowledgeSourceCreate,
  type KnowledgeSourceUpdate,
  type SearchAuthKind,
  type SearchResult,
} from "@support-agent/shared/api/knowledge";
import { CheckResultAlert } from "@/components/check-result";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Page, PageHeader } from "@/components/ui/page";
import { SecretField, initialSecret, secretPayload, type SecretValue } from "@/components/ui/secret-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useLocale, useT } from "@/i18n";
import { common } from "@/i18n/common";
import { errorMessage } from "@/lib/api";
import { cn } from "@/components/ui/utils";
import { applyServerErrors, firstMessage, useSchemaResolver } from "@/lib/validation";
import {
  useCreateKnowledgeSource,
  useDeleteKnowledgeSource,
  useTestKnowledgeSource,
  useUpdateKnowledgeSource,
} from "./api";
import { messages } from "./messages";

export type KnowledgeFormValues = {
  name: string;
  description: string;
  config: {
    url: string;
    auth: SearchAuthKind;
    tokenUrl: string;
    clientId: string;
    scope: string;
    bodyTemplate: string;
    resultsPath: string;
    titlePath: string;
    urlPath: string;
    textPath: string;
    sectionPath: string;
    maxResults: number;
  };
  secret: SecretValue;
};

type Output = KnowledgeSourceCreate | KnowledgeSourceUpdate;

function toFormValues(source: KnowledgeSource | null): KnowledgeFormValues {
  const config = source?.config ?? DEFAULT_SEARCH_API_CONFIG;
  return {
    name: source?.name ?? "",
    description: source?.description ?? "",
    config: {
      url: source ? config.url : "",
      auth: config.auth,
      tokenUrl: config.tokenUrl ?? "",
      clientId: config.clientId ?? "",
      scope: config.scope ?? "",
      bodyTemplate: config.bodyTemplate,
      resultsPath: config.resultsPath,
      titlePath: config.titlePath,
      urlPath: config.urlPath,
      textPath: config.textPath,
      sectionPath: config.sectionPath ?? "",
      maxResults: config.maxResults,
    },
    secret: initialSecret(source?.hasSecret ?? false),
  };
}

/** Form values → the API input, checked with the shared schemas (errors keep the form's paths). */
function knowledgeFormSchema(editing: boolean): z.ZodType<Output, unknown> {
  const form = z.object({
    name: z.string(),
    description: z.string(),
    config: z.object({ auth: searchAuthKindSchema }).loose(),
    secret: z.object({ mode: z.enum(["keep", "replace", "remove"]), value: z.string() }),
  });
  if (editing) {
    return form
      .transform((values): unknown => ({
        name: values.name,
        description: values.description,
        config: values.config,
        // A source without authentication keeps no secret.
        secret: values.config.auth === "none" ? undefined : secretPayload(values.secret),
      }))
      .pipe(knowledgeSourceUpdateSchema);
  }
  return form
    .transform((values): unknown => ({
      name: values.name,
      description: values.description,
      kind: "search_api" as const,
      config: values.config,
      secret: values.config.auth === "none" ? null : values.secret.value,
    }))
    .pipe(knowledgeSourceCreateSchema);
}

function Section(props: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{props.title}</h2>
        </CardTitle>
        {props.description ? <CardDescription>{props.description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-6">{props.children}</FieldGroup>
      </CardContent>
    </Card>
  );
}

function ResultItem({ result }: { result: SearchResult }) {
  const t = useT(messages);
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-md border p-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="grid gap-0.5">
          {result.url ? (
            <a
              href={result.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 font-medium break-words underline-offset-2 hover:underline"
            >
              {result.title}
              <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            </a>
          ) : (
            <span className="font-medium break-words">{result.title}</span>
          )}
          {result.section ? <span className="text-muted-foreground text-xs">{result.section}</span> : null}
        </div>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="link" size="sm" className="mt-1 h-auto p-0">
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
            {open ? t("hideText") : t("showText")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="bg-muted mt-2 max-h-80 overflow-y-auto rounded-md p-3 text-sm whitespace-pre-wrap">
            {result.text}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

/** Searches the saved source and shows what comes back. */
function TestPanel({ sourceId, dirty }: { sourceId: string; dirty: boolean }) {
  const t = useT(messages);
  const id = useId();
  const test = useTestKnowledgeSource();
  const [query, setQuery] = useState("");

  const run = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await test.mutateAsync({ id: sourceId, query: query.trim() });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Section title={t("sectionTest")} description={t("testHint")}>
      {dirty ? (
        <Alert>
          <Info />
          <AlertDescription>{t("testHint")}</AlertDescription>
        </Alert>
      ) : null}
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => void run(event)} noValidate>
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor={`${id}-query`}>{t("query")}</FieldLabel>
          <Input
            id={`${id}-query`}
            maxLength={500}
            placeholder={t("queryPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={!query.trim() || test.isPending}>
          {test.isPending ? <Spinner /> : <Search />}
          {test.isPending ? t("testing") : t("runTest")}
        </Button>
      </form>
      {test.data ? (
        <div className="grid gap-3" aria-live="polite">
          <CheckResultAlert result={test.data} />
          {test.data.ok ? (
            <>
              <p className="text-sm font-medium">{t("results", { count: test.data.results.length })}</p>
              {test.data.results.length ? (
                <ul className="grid gap-2">
                  {test.data.results.map((result, index) => (
                    <ResultItem key={index} result={result} />
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">{t("noResults")}</p>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}

function PathField(props: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  registration: ReturnType<ReturnType<typeof useForm<KnowledgeFormValues, unknown, Output>>["register"]>;
}) {
  return (
    <Field data-invalid={props.error ? true : undefined}>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <Input
        id={props.id}
        className="font-mono"
        maxLength={200}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.hint ? `${props.id}-hint` : undefined}
        {...props.registration}
      />
      {props.hint ? <FieldDescription id={`${props.id}-hint`}>{props.hint}</FieldDescription> : null}
      {props.error ? <FieldError>{props.error}</FieldError> : null}
    </Field>
  );
}

/** Creates or edits a knowledge source: the search API, its credentials and the response mapping. */
export function SourceForm({ source }: { source: KnowledgeSource | null }) {
  const t = useT(messages);
  const tc = useT(common);
  const locale = useLocale();
  const id = useId();
  const navigate = useNavigate();
  const create = useCreateKnowledgeSource();
  const update = useUpdateKnowledgeSource();
  const remove = useDeleteKnowledgeSource();
  const [deleting, setDeleting] = useState(false);
  const leaving = useRef(false);
  const schema = useMemo(() => knowledgeFormSchema(Boolean(source)), [source]);
  const resolver = useSchemaResolver<KnowledgeFormValues, Output>(schema);
  const form = useForm<KnowledgeFormValues, unknown, Output>({
    resolver,
    defaultValues: toFormValues(source),
  });
  const auth = useWatch({ control: form.control, name: "config.auth" });
  const { errors, isDirty, isSubmitting } = form.formState;
  const configErrors = errors.config ?? {};

  useBlocker({
    shouldBlockFn: ({ current, next }) =>
      current.pathname !== next.pathname &&
      !leaving.current &&
      form.formState.isDirty &&
      !window.confirm(t("unsaved")),
    enableBeforeUnload: () => !leaving.current && form.formState.isDirty,
  });

  const submit = form.handleSubmit(
    async (input) => {
      try {
        if (source) {
          const saved = await update.mutateAsync({ id: source.id, ...(input as KnowledgeSourceUpdate) });
          form.reset(toFormValues(saved));
          toast.success(t("saved"));
        } else {
          const saved = await create.mutateAsync(input as KnowledgeSourceCreate);
          leaving.current = true;
          toast.success(t("created"));
          await navigate({ to: "/knowledge/$sourceId", params: { sourceId: saved.id } });
        }
      } catch (error) {
        applyServerErrors(form, error, locale);
        toast.error(errorMessage(error));
      }
    },
    () => toast.error(t("fixErrors")),
  );

  return (
    <Page>
      <div className="grid gap-2">
        <Button asChild variant="link" className="text-muted-foreground h-auto w-fit p-0">
          <Link to="/knowledge">
            <ChevronLeft />
            {t("backToList")}
          </Link>
        </Button>
        <PageHeader
          title={source?.name || t("newTitle")}
          description={source ? t("usedBy", { count: source.agentCount }) : undefined}
        />
      </div>

      <form className="grid gap-6" onSubmit={(event) => void submit(event)} noValidate>
        <Section title={t("sectionBasics")}>
          <Field data-invalid={errors.name ? true : undefined}>
            <FieldLabel htmlFor={`${id}-name`}>{t("name")}</FieldLabel>
            <Input
              id={`${id}-name`}
              maxLength={80}
              autoComplete="off"
              aria-invalid={errors.name ? true : undefined}
              {...form.register("name")}
            />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field data-invalid={errors.description ? true : undefined}>
            <FieldLabel htmlFor={`${id}-description`}>
              {t("descriptionLabel")}{" "}
              <span className="text-muted-foreground font-normal">({tc("optional")})</span>
            </FieldLabel>
            <Textarea
              id={`${id}-description`}
              rows={2}
              maxLength={1000}
              aria-describedby={`${id}-description-hint`}
              aria-invalid={errors.description ? true : undefined}
              {...form.register("description")}
            />
            <FieldDescription id={`${id}-description-hint`}>{t("descriptionHint")}</FieldDescription>
            <FieldError errors={[errors.description]} />
          </Field>
        </Section>

        <Section title={t("sectionApi")} description={t("howItWorks")}>
          <Field data-invalid={configErrors.url ? true : undefined}>
            <FieldLabel htmlFor={`${id}-url`}>{t("url")}</FieldLabel>
            <Input
              id={`${id}-url`}
              type="url"
              inputMode="url"
              maxLength={500}
              spellCheck={false}
              className="font-mono"
              placeholder={DEFAULT_SEARCH_API_CONFIG.url}
              aria-invalid={configErrors.url ? true : undefined}
              {...form.register("config.url")}
            />
            <FieldError errors={[configErrors.url]} />
          </Field>
          <Controller
            control={form.control}
            name="config.auth"
            render={({ field }) => (
              <FieldSet className="gap-3">
                <FieldLegend variant="label" className="mb-1">
                  {t("auth")}
                </FieldLegend>
                <RadioGroup value={field.value} onValueChange={field.onChange}>
                  {SEARCH_AUTH_KINDS.map((kind) => (
                    <Field key={kind} orientation="horizontal">
                      <RadioGroupItem value={kind} id={`${id}-auth-${kind}`} />
                      <FieldContent>
                        <FieldLabel htmlFor={`${id}-auth-${kind}`}>{t(`auth_${kind}`)}</FieldLabel>
                        <FieldDescription>{t(`authHint_${kind}`)}</FieldDescription>
                      </FieldContent>
                    </Field>
                  ))}
                </RadioGroup>
              </FieldSet>
            )}
          />
          {auth === "oauth2_client_credentials" ? (
            <div className="grid gap-6 md:grid-cols-2">
              <Field data-invalid={configErrors.tokenUrl ? true : undefined} className="md:col-span-2">
                <FieldLabel htmlFor={`${id}-token-url`}>{t("tokenUrl")}</FieldLabel>
                <Input
                  id={`${id}-token-url`}
                  type="url"
                  inputMode="url"
                  maxLength={500}
                  spellCheck={false}
                  className="font-mono"
                  placeholder="https://login.example.org/oauth2/token"
                  aria-invalid={configErrors.tokenUrl ? true : undefined}
                  {...form.register("config.tokenUrl")}
                />
                <FieldError errors={[configErrors.tokenUrl]} />
              </Field>
              <Field data-invalid={configErrors.clientId ? true : undefined}>
                <FieldLabel htmlFor={`${id}-client-id`}>{t("clientId")}</FieldLabel>
                <Input
                  id={`${id}-client-id`}
                  maxLength={200}
                  spellCheck={false}
                  autoComplete="off"
                  className="font-mono"
                  aria-invalid={configErrors.clientId ? true : undefined}
                  {...form.register("config.clientId")}
                />
                <FieldError errors={[configErrors.clientId]} />
              </Field>
              <Field data-invalid={configErrors.scope ? true : undefined}>
                <FieldLabel htmlFor={`${id}-scope`}>{t("scope")}</FieldLabel>
                <Input
                  id={`${id}-scope`}
                  maxLength={500}
                  spellCheck={false}
                  autoComplete="off"
                  className="font-mono"
                  aria-describedby={`${id}-scope-hint`}
                  aria-invalid={configErrors.scope ? true : undefined}
                  {...form.register("config.scope")}
                />
                <FieldDescription id={`${id}-scope-hint`}>{t("scopeHint")}</FieldDescription>
                <FieldError errors={[configErrors.scope]} />
              </Field>
            </div>
          ) : null}
          {auth !== "none" ? (
            <Controller
              control={form.control}
              name="secret"
              render={({ field, fieldState }) => (
                <SecretField
                  id={`${id}-secret`}
                  label={t(`secret_${auth}`)}
                  stored={source?.hasSecret ?? false}
                  value={field.value}
                  onChange={field.onChange}
                  removable
                  error={firstMessage(fieldState.error)}
                />
              )}
            />
          ) : null}
        </Section>

        <Section title={t("sectionRequest")}>
          <Field data-invalid={configErrors.bodyTemplate ? true : undefined}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FieldLabel htmlFor={`${id}-body`}>{t("bodyTemplate")}</FieldLabel>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  form.setValue("config.bodyTemplate", DEFAULT_BODY_TEMPLATE, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                <RotateCcw />
                {t("resetBody")}
              </Button>
            </div>
            <Textarea
              id={`${id}-body`}
              rows={8}
              maxLength={5000}
              spellCheck={false}
              className="font-mono text-sm"
              aria-describedby={`${id}-body-hint`}
              aria-invalid={configErrors.bodyTemplate ? true : undefined}
              {...form.register("config.bodyTemplate")}
            />
            <FieldDescription id={`${id}-body-hint`}>{t("bodyTemplateHint")}</FieldDescription>
            <FieldError errors={[configErrors.bodyTemplate]} />
          </Field>
        </Section>

        <Section title={t("sectionMapping")} description={t("mappingHint")}>
          <div className="grid gap-6 md:grid-cols-2">
            <PathField
              id={`${id}-results`}
              label={t("resultsPath")}
              error={configErrors.resultsPath?.message}
              registration={form.register("config.resultsPath")}
            />
            <PathField
              id={`${id}-title`}
              label={t("titlePath")}
              error={configErrors.titlePath?.message}
              registration={form.register("config.titlePath")}
            />
            <PathField
              id={`${id}-url-path`}
              label={t("urlPath")}
              error={configErrors.urlPath?.message}
              registration={form.register("config.urlPath")}
            />
            <PathField
              id={`${id}-text`}
              label={t("textPath")}
              error={configErrors.textPath?.message}
              registration={form.register("config.textPath")}
            />
            <PathField
              id={`${id}-section`}
              label={t("sectionPath")}
              hint={t("sectionPathHint")}
              error={configErrors.sectionPath?.message}
              registration={form.register("config.sectionPath")}
            />
            <Field data-invalid={configErrors.maxResults ? true : undefined}>
              <FieldLabel htmlFor={`${id}-max`}>{t("maxResults")}</FieldLabel>
              <Input
                id={`${id}-max`}
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                className="w-28"
                aria-describedby={`${id}-max-hint`}
                aria-invalid={configErrors.maxResults ? true : undefined}
                {...form.register("config.maxResults", { valueAsNumber: true })}
              />
              <FieldDescription id={`${id}-max-hint`}>{t("maxResultsHint")}</FieldDescription>
              <FieldError errors={[configErrors.maxResults]} />
            </Field>
          </div>
        </Section>

        <div className="bg-background/95 sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          {isDirty ? <span className="text-muted-foreground mr-auto text-sm">{t("unsaved")}</span> : null}
          {source && isDirty ? (
            <Button type="button" variant="outline" onClick={() => form.reset()}>
              {tc("discard")}
            </Button>
          ) : null}
          <Button type="submit" disabled={isSubmitting || (Boolean(source) && !isDirty)}>
            {isSubmitting ? <Spinner /> : <Save />}
            {source ? tc("save") : tc("create")}
          </Button>
        </div>
      </form>

      {source ? <TestPanel sourceId={source.id} dirty={isDirty} /> : null}

      {source ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>
              <h2>{t("sectionDelete")}</h2>
            </CardTitle>
            <CardDescription>{t("deleteHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="destructive" onClick={() => setDeleting(true)}>
              <Trash2 />
              {tc("delete")}
            </Button>
          </CardContent>
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={t("deleteTitle", { name: source.name })}
            description={t("deleteText")}
            destructive
            confirmLabel={tc("delete")}
            onConfirm={async () => {
              try {
                await remove.mutateAsync(source.id);
                leaving.current = true;
                toast.success(t("deleted"));
                await navigate({ to: "/knowledge" });
              } catch (error) {
                toast.error(errorMessage(error));
                throw error;
              }
            }}
          />
        </Card>
      ) : null}
    </Page>
  );
}
