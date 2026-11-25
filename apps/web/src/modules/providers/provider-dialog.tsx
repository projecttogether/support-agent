import { useId, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  PROVIDER_DEFAULT_BASE_URLS,
  PROVIDER_KINDS,
  PROVIDER_LABELS,
  providerCreateSchema,
  providerUpdateSchema,
  type Provider,
  type ProviderCreate,
  type ProviderKind,
  type ProviderUpdate,
} from "@support-agent/shared/api/providers";
import { SecretField, initialSecret, secretPayload, type SecretValue } from "@/components/ui/secret-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useLocale, useT } from "@/i18n";
import { common } from "@/i18n/common";
import { errorMessage } from "@/lib/api";
import { applyServerErrors, firstMessage, useSchemaResolver } from "@/lib/validation";
import { useCreateProvider, useUpdateProvider } from "./api";
import { messages } from "./messages";

export type ProviderFormValues = { kind: ProviderKind; name: string; baseUrl: string; apiKey: SecretValue };

const secretSchema = z.object({ mode: z.enum(["keep", "replace", "remove"]), value: z.string() });

/** Form values → the API input, checked with the shared schema (errors keep the form's paths). */
export function providerFormSchema(editing: boolean): z.ZodType<ProviderCreate | ProviderUpdate, unknown> {
  const form = z.object({
    kind: z.enum(PROVIDER_KINDS),
    name: z.string(),
    baseUrl: z.string(),
    apiKey: secretSchema,
  });
  if (editing) {
    return form
      .transform((values): unknown => ({
        name: values.name,
        baseUrl: values.baseUrl,
        apiKey: secretPayload(values.apiKey),
      }))
      .pipe(providerUpdateSchema);
  }
  return form
    .transform((values): unknown => ({
      kind: values.kind,
      name: values.name,
      baseUrl: values.baseUrl,
      apiKey: values.apiKey.value,
    }))
    .pipe(providerCreateSchema);
}

/** Adds a provider, or edits its name, base URL and key (the kind stays). */
export function ProviderDialog(props: { provider: Provider | null; onClose: () => void }) {
  const t = useT(messages);
  const tc = useT(common);
  const locale = useLocale();
  const id = useId();
  const create = useCreateProvider();
  const update = useUpdateProvider();
  const { provider } = props;
  const schema = useMemo(() => providerFormSchema(Boolean(provider)), [provider]);
  const resolver = useSchemaResolver<ProviderFormValues, ProviderCreate | ProviderUpdate>(schema);
  const form = useForm<ProviderFormValues, unknown, ProviderCreate | ProviderUpdate>({
    resolver,
    defaultValues: {
      kind: provider?.kind ?? "anthropic",
      name: provider?.name ?? "",
      baseUrl: provider?.baseUrl ?? "",
      apiKey: initialSecret(provider?.hasApiKey ?? false),
    },
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const { errors, isSubmitting } = form.formState;
  const defaultUrl = PROVIDER_DEFAULT_BASE_URLS[kind];

  const submit = form.handleSubmit(async (input) => {
    try {
      if (provider) {
        await update.mutateAsync({ id: provider.id, ...(input as ProviderUpdate) });
        toast.success(t("saved"));
      } else {
        await create.mutateAsync(input as ProviderCreate);
        toast.success(t("created"));
      }
      props.onClose();
    } catch (error) {
      applyServerErrors(form, error, locale);
      toast.error(errorMessage(error));
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form className="grid gap-5" onSubmit={(event) => void submit(event)} noValidate>
          <DialogHeader>
            <DialogTitle>{provider ? t("editTitle") : t("createTitle")}</DialogTitle>
            <DialogDescription>{t("dialogText")}</DialogDescription>
          </DialogHeader>
          <Controller
            control={form.control}
            name="kind"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor={`${id}-kind`}>{t("kind")}</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={Boolean(provider)}>
                  <SelectTrigger
                    id={`${id}-kind`}
                    className="w-full"
                    aria-describedby={provider ? `${id}-kind-hint` : undefined}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_KINDS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {PROVIDER_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {provider ? (
                  <FieldDescription id={`${id}-kind-hint`}>{t("kindLocked")}</FieldDescription>
                ) : null}
              </Field>
            )}
          />
          <Field data-invalid={errors.name ? true : undefined}>
            <FieldLabel htmlFor={`${id}-name`}>{t("name")}</FieldLabel>
            <Input
              id={`${id}-name`}
              maxLength={80}
              autoComplete="off"
              placeholder={t("namePlaceholder")}
              aria-invalid={errors.name ? true : undefined}
              {...form.register("name")}
            />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field data-invalid={errors.baseUrl ? true : undefined}>
            <FieldLabel htmlFor={`${id}-base-url`}>{t("baseUrl")}</FieldLabel>
            <Input
              id={`${id}-base-url`}
              type="url"
              inputMode="url"
              maxLength={500}
              spellCheck={false}
              placeholder={defaultUrl ?? "https://llm.example.org/v1"}
              aria-invalid={errors.baseUrl ? true : undefined}
              aria-describedby={`${id}-base-url-hint`}
              {...form.register("baseUrl")}
            />
            <FieldDescription id={`${id}-base-url-hint`}>
              {defaultUrl ? t("baseUrlHint") : t("baseUrlRequired")}
            </FieldDescription>
            <FieldError errors={[errors.baseUrl]} />
          </Field>
          <Controller
            control={form.control}
            name="apiKey"
            render={({ field, fieldState }) => (
              <SecretField
                id={`${id}-api-key`}
                label={t("apiKey")}
                stored={provider?.hasApiKey ?? false}
                hint={provider?.apiKeyHint}
                value={field.value}
                onChange={field.onChange}
                removable={kind === "openai_compatible"}
                description={kind === "openai_compatible" ? t("apiKeyOptional") : undefined}
                error={firstMessage(fieldState.error)}
              />
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : null}
              {provider ? tc("save") : tc("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
