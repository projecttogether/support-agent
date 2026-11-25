import { useId, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";
import { RotateCcw } from "lucide-react";
import {
  DEFAULT_INSTRUCTIONS,
  NO_ANSWER_MODES,
  REPLY_MODES,
  type Agent,
  type AgentInput,
} from "@support-agent/shared/api/agents";
import { PROVIDER_LABELS } from "@support-agent/shared/api/providers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ModelCombobox } from "@/components/model-combobox";
import { ErrorState } from "@/components/ui/states";
import { useIsAdmin } from "@/hooks/use-me";
import { useT } from "@/i18n";
import { firstMessage } from "@/lib/validation";
import { useKnowledgeSources } from "@/modules/knowledge/api";
import { useProviders } from "@/modules/providers/api";
import { ChannelPicker } from "./channel-picker";
import type { AgentFormValues } from "./form";
import { messages } from "./messages";

type AgentForm = UseFormReturn<AgentFormValues, unknown, AgentInput>;

const NONE = "none";

function Section(props: { title: string; description?: string; children: ReactNode }) {
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

function ProviderSelect(props: {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  allowNone?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useT(messages);
  const providers = useProviders();
  if (providers.isLoading) return <Skeleton className="h-9 w-full" />;
  if (providers.isError)
    return <ErrorState error={providers.error} onRetry={() => void providers.refetch()} />;
  const items = providers.data ?? [];
  if (items.length === 0 && !props.allowNone) {
    return <p className="text-muted-foreground text-sm">{t("noProviders")}</p>;
  }
  return (
    <Select
      value={props.value ?? NONE}
      onValueChange={(value) => props.onChange(value === NONE ? null : value)}
    >
      <SelectTrigger
        id={props.id}
        className="w-full"
        aria-invalid={props.invalid ? true : undefined}
        aria-describedby={props.describedBy}
      >
        <SelectValue placeholder={t("chooseProvider")} />
      </SelectTrigger>
      <SelectContent>
        {props.allowNone ? <SelectItem value={NONE}>{t("fallbackNone")}</SelectItem> : null}
        {!props.allowNone && !props.value ? (
          <SelectItem value={NONE} disabled>
            {t("chooseProvider")}
          </SelectItem>
        ) : null}
        {items.map((provider) => (
          <SelectItem key={provider.id} value={provider.id}>
            {provider.name}
            <span className="text-muted-foreground text-xs">{PROVIDER_LABELS[provider.kind]}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function KnowledgeList({ form }: { form: AgentForm }) {
  const t = useT(messages);
  const isAdmin = useIsAdmin();
  const sources = useKnowledgeSources();
  const baseId = useId();
  if (sources.isLoading) return <Skeleton className="h-16 w-full" />;
  if (sources.isError) return <ErrorState error={sources.error} onRetry={() => void sources.refetch()} />;
  if (!sources.data?.length) {
    return (
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
        <span>{t("noKnowledge")}</span>
        {isAdmin ? (
          <Button asChild variant="link" className="h-auto p-0">
            <Link to="/knowledge/new">{t("noKnowledgeAdmin")}</Link>
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <Controller
      control={form.control}
      name="knowledgeSourceIds"
      render={({ field, fieldState }) => (
        <FieldSet className="gap-3" data-invalid={fieldState.error ? true : undefined}>
          <FieldLegend variant="label" className="sr-only">
            {t("sectionKnowledge")}
          </FieldLegend>
          {sources.data.map((source) => {
            const id = `${baseId}-${source.id}`;
            const checked = field.value.includes(source.id);
            return (
              <Field key={source.id} orientation="horizontal">
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={(next) =>
                    field.onChange(
                      next === true
                        ? [...field.value, source.id]
                        : field.value.filter((item) => item !== source.id),
                    )
                  }
                />
                <FieldContent>
                  <FieldLabel htmlFor={id}>{source.name}</FieldLabel>
                  {source.description ? <FieldDescription>{source.description}</FieldDescription> : null}
                </FieldContent>
              </Field>
            );
          })}
          <FieldError errors={[fieldState.error]} />
        </FieldSet>
      )}
    />
  );
}

/** The fields of an agent: every part of AgentInput. */
export function AgentSettings(props: { form: AgentForm; agent: Agent | null; deleteSection?: ReactNode }) {
  const t = useT(messages);
  const { form } = props;
  const id = useId();
  const { errors } = form.formState;
  const [providerId, fallbackProviderId, noAnswerMode, headlineThreads] = useWatch({
    control: form.control,
    name: ["providerId", "fallbackProviderId", "noAnswerMode", "headlineThreads"],
  });
  const knownNames = Object.fromEntries(
    (props.agent?.channels ?? []).map((channel) => [channel.id, channel.name]),
  );

  return (
    <div className="grid gap-6">
      <Section title={t("sectionAgent")}>
        <Controller
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Switch id={`${id}-enabled`} checked={field.value} onCheckedChange={field.onChange} />
              <FieldContent>
                <FieldLabel htmlFor={`${id}-enabled`}>{t("enabled")}</FieldLabel>
                <FieldDescription>{t("enabledHint")}</FieldDescription>
              </FieldContent>
            </Field>
          )}
        />
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor={`${id}-name`}>{t("name")}</FieldLabel>
          <Input
            id={`${id}-name`}
            maxLength={80}
            autoComplete="off"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={`${id}-name-hint`}
            {...form.register("name")}
          />
          <FieldDescription id={`${id}-name-hint`}>{t("nameHint")}</FieldDescription>
          <FieldError errors={[errors.name]} />
        </Field>
        <Field data-invalid={errors.instructions ? true : undefined}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldLabel htmlFor={`${id}-instructions`}>{t("instructions")}</FieldLabel>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => form.setValue("instructions", DEFAULT_INSTRUCTIONS, { shouldDirty: true })}
            >
              <RotateCcw />
              {t("resetInstructions")}
            </Button>
          </div>
          <Textarea
            id={`${id}-instructions`}
            rows={12}
            className="min-h-48 font-mono text-sm"
            aria-invalid={errors.instructions ? true : undefined}
            aria-describedby={`${id}-instructions-hint`}
            {...form.register("instructions")}
          />
          <FieldDescription id={`${id}-instructions-hint`}>{t("instructionsHint")}</FieldDescription>
          <FieldError errors={[errors.instructions]} />
        </Field>
      </Section>

      <Section title={t("sectionModel")} description={t("sectionModelHint")}>
        <div className="grid gap-6 md:grid-cols-2">
          <Controller
            control={form.control}
            name="providerId"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={`${id}-provider`}>{t("provider")}</FieldLabel>
                <ProviderSelect
                  id={`${id}-provider`}
                  value={field.value}
                  invalid={Boolean(fieldState.error)}
                  onChange={(value) => {
                    if (value !== field.value) form.setValue("model", "", { shouldDirty: true });
                    field.onChange(value);
                  }}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="model"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={`${id}-model`}>{t("model")}</FieldLabel>
                <ModelCombobox
                  id={`${id}-model`}
                  providerId={providerId}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={Boolean(fieldState.error)}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="fallbackProviderId"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={`${id}-fallback-provider`}>{t("fallbackProvider")}</FieldLabel>
                <ProviderSelect
                  id={`${id}-fallback-provider`}
                  value={field.value}
                  allowNone
                  onChange={(value) => {
                    if (value !== field.value) form.setValue("fallbackModel", "", { shouldDirty: true });
                    field.onChange(value);
                  }}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          {fallbackProviderId ? (
            <Controller
              control={form.control}
              name="fallbackModel"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.error ? true : undefined}>
                  <FieldLabel htmlFor={`${id}-fallback-model`}>{t("fallbackModel")}</FieldLabel>
                  <ModelCombobox
                    id={`${id}-fallback-model`}
                    providerId={fallbackProviderId}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={Boolean(fieldState.error)}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          ) : null}
        </div>
      </Section>

      <Section title={t("sectionChannels")} description={t("sectionChannelsHint")}>
        <Controller
          control={form.control}
          name="channels"
          render={({ field, fieldState }) => (
            <ChannelPicker
              id={`${id}-channels`}
              agentId={props.agent?.id ?? null}
              value={field.value}
              onChange={field.onChange}
              knownNames={knownNames}
              error={firstMessage(fieldState.error)}
            />
          )}
        />
      </Section>

      <Section title={t("sectionKnowledge")} description={t("sectionKnowledgeHint")}>
        <KnowledgeList form={form} />
      </Section>

      <Section title={t("sectionReplies")}>
        <Controller
          control={form.control}
          name="replyMode"
          render={({ field }) => (
            <FieldSet className="gap-3">
              <FieldLegend variant="label" className="mb-1">
                {t("replyMode")}
              </FieldLegend>
              <RadioGroup value={field.value} onValueChange={field.onChange}>
                {REPLY_MODES.map((mode) => (
                  <Field key={mode} orientation="horizontal">
                    <RadioGroupItem value={mode} id={`${id}-reply-${mode}`} />
                    <FieldContent>
                      <FieldLabel htmlFor={`${id}-reply-${mode}`}>{t(`replyMode_${mode}`)}</FieldLabel>
                      <FieldDescription>{t(`replyModeHint_${mode}`)}</FieldDescription>
                    </FieldContent>
                  </Field>
                ))}
              </RadioGroup>
            </FieldSet>
          )}
        />
        <Controller
          control={form.control}
          name="followUpsInThreads"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Switch id={`${id}-follow-ups`} checked={field.value} onCheckedChange={field.onChange} />
              <FieldContent>
                <FieldLabel htmlFor={`${id}-follow-ups`}>{t("followUps")}</FieldLabel>
                <FieldDescription>{t("followUpsHint")}</FieldDescription>
              </FieldContent>
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="noAnswerMode"
          render={({ field }) => (
            <FieldSet className="gap-3">
              <FieldLegend variant="label" className="mb-1">
                {t("noAnswerMode")}
              </FieldLegend>
              <RadioGroup value={field.value} onValueChange={field.onChange}>
                {NO_ANSWER_MODES.map((mode) => (
                  <Field key={mode} orientation="horizontal">
                    <RadioGroupItem value={mode} id={`${id}-no-answer-${mode}`} />
                    <FieldContent>
                      <FieldLabel htmlFor={`${id}-no-answer-${mode}`}>{t(`noAnswerMode_${mode}`)}</FieldLabel>
                      <FieldDescription>{t(`noAnswerModeHint_${mode}`)}</FieldDescription>
                    </FieldContent>
                  </Field>
                ))}
              </RadioGroup>
            </FieldSet>
          )}
        />
        {noAnswerMode === "escalate" ? (
          <Field data-invalid={errors.escalationMessage ? true : undefined}>
            <FieldLabel htmlFor={`${id}-escalation`}>{t("escalationMessage")}</FieldLabel>
            <Textarea
              id={`${id}-escalation`}
              rows={3}
              maxLength={1000}
              aria-invalid={errors.escalationMessage ? true : undefined}
              {...form.register("escalationMessage")}
            />
            <FieldError errors={[errors.escalationMessage]} />
          </Field>
        ) : null}
        <Controller
          control={form.control}
          name="headlineThreads"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Switch id={`${id}-headlines`} checked={field.value} onCheckedChange={field.onChange} />
              <FieldContent>
                <FieldLabel htmlFor={`${id}-headlines`}>{t("headlines")}</FieldLabel>
                <FieldDescription>{t("headlinesHint")}</FieldDescription>
              </FieldContent>
            </Field>
          )}
        />
        {headlineThreads ? (
          <Field data-invalid={errors.headlineMessage ? true : undefined}>
            <FieldLabel htmlFor={`${id}-headline-message`}>{t("headlineMessage")}</FieldLabel>
            <Textarea
              id={`${id}-headline-message`}
              rows={3}
              maxLength={1000}
              aria-invalid={errors.headlineMessage ? true : undefined}
              {...form.register("headlineMessage")}
            />
            <FieldDescription>{t("headlineMessageHint")}</FieldDescription>
            <FieldError errors={[errors.headlineMessage]} />
          </Field>
        ) : null}
        <Controller
          control={form.control}
          name="readImages"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Switch id={`${id}-images`} checked={field.value} onCheckedChange={field.onChange} />
              <FieldContent>
                <FieldLabel htmlFor={`${id}-images`}>{t("readImages")}</FieldLabel>
                <FieldDescription>{t("readImagesHint")}</FieldDescription>
              </FieldContent>
            </Field>
          )}
        />
      </Section>

      <Section title={t("sectionAppearance")} description={t("sectionAppearanceHint")}>
        <div className="grid gap-6 md:grid-cols-2">
          <Field data-invalid={errors.displayName ? true : undefined}>
            <FieldLabel htmlFor={`${id}-display-name`}>{t("displayName")}</FieldLabel>
            <Input
              id={`${id}-display-name`}
              maxLength={80}
              autoComplete="off"
              aria-invalid={errors.displayName ? true : undefined}
              {...form.register("displayName")}
            />
            <FieldError errors={[errors.displayName]} />
          </Field>
          <Field data-invalid={errors.iconUrl ? true : undefined}>
            <FieldLabel htmlFor={`${id}-icon`}>{t("iconUrl")}</FieldLabel>
            <Input
              id={`${id}-icon`}
              type="url"
              inputMode="url"
              maxLength={500}
              placeholder="https://example.org/icon.png"
              spellCheck={false}
              aria-invalid={errors.iconUrl ? true : undefined}
              aria-describedby={`${id}-icon-hint`}
              {...form.register("iconUrl")}
            />
            <FieldDescription id={`${id}-icon-hint`}>{t("iconUrlHint")}</FieldDescription>
            <FieldError errors={[errors.iconUrl]} />
          </Field>
        </div>
      </Section>

      {props.deleteSection}
    </div>
  );
}
