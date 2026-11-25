import { useId } from "react";
import { useForm } from "react-hook-form";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { appSettingsSchema, type AppSettings } from "@support-agent/shared/api/settings";
import { Page, PageHeader } from "@/components/ui/page";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useLocale, useT } from "@/i18n";
import { common } from "@/i18n/common";
import { errorMessage } from "@/lib/api";
import { applyServerErrors, useSchemaResolver } from "@/lib/validation";
import { useSaveSettings, useSettings } from "./api";
import { messages } from "./messages";

type Values = { retentionDays: number; errorMessage: string; workingReaction: string };

function SettingsForm({ settings }: { settings: AppSettings }) {
  const t = useT(messages);
  const tc = useT(common);
  const locale = useLocale();
  const id = useId();
  const save = useSaveSettings();
  const resolver = useSchemaResolver<Values, AppSettings>(appSettingsSchema);
  const form = useForm<Values, unknown, AppSettings>({
    resolver,
    defaultValues: {
      retentionDays: settings.retentionDays,
      errorMessage: settings.errorMessage,
      workingReaction: settings.workingReaction ?? "",
    },
  });
  const { errors, isDirty, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (input) => {
    try {
      const saved = await save.mutateAsync(input);
      form.reset({
        retentionDays: saved.retentionDays,
        errorMessage: saved.errorMessage,
        workingReaction: saved.workingReaction ?? "",
      });
      toast.success(t("saved"));
    } catch (error) {
      applyServerErrors(form, error, locale);
      toast.error(errorMessage(error));
    }
  });

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Card>
        <CardContent>
          <FieldGroup className="gap-6">
            <Field data-invalid={errors.retentionDays ? true : undefined}>
              <FieldLabel htmlFor={`${id}-retention`}>{t("retention")}</FieldLabel>
              <Input
                id={`${id}-retention`}
                type="number"
                inputMode="numeric"
                min={0}
                max={3650}
                className="w-32"
                aria-describedby={`${id}-retention-hint`}
                aria-invalid={errors.retentionDays ? true : undefined}
                {...form.register("retentionDays", { valueAsNumber: true })}
              />
              <FieldDescription id={`${id}-retention-hint`}>{t("retentionHint")}</FieldDescription>
              <FieldError errors={[errors.retentionDays]} />
            </Field>
            <Field data-invalid={errors.errorMessage ? true : undefined}>
              <FieldLabel htmlFor={`${id}-error`}>{t("errorMessage")}</FieldLabel>
              <Textarea
                id={`${id}-error`}
                rows={3}
                maxLength={1000}
                aria-describedby={`${id}-error-hint`}
                aria-invalid={errors.errorMessage ? true : undefined}
                {...form.register("errorMessage")}
              />
              <FieldDescription id={`${id}-error-hint`}>{t("errorMessageHint")}</FieldDescription>
              <FieldError errors={[errors.errorMessage]} />
            </Field>
            <Field data-invalid={errors.workingReaction ? true : undefined}>
              <FieldLabel htmlFor={`${id}-reaction`}>{t("workingReaction")}</FieldLabel>
              <InputGroup className="w-full sm:w-64">
                <InputGroupAddon>:</InputGroupAddon>
                <InputGroupInput
                  id={`${id}-reaction`}
                  maxLength={64}
                  spellCheck={false}
                  autoComplete="off"
                  className="font-mono"
                  placeholder="eyes"
                  aria-describedby={`${id}-reaction-hint`}
                  aria-invalid={errors.workingReaction ? true : undefined}
                  {...form.register("workingReaction")}
                />
                <InputGroupAddon align="inline-end">:</InputGroupAddon>
              </InputGroup>
              <FieldDescription id={`${id}-reaction-hint`}>{t("workingReactionHint")}</FieldDescription>
              <FieldError errors={[errors.workingReaction]} />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          {isDirty ? (
            <Button type="button" variant="outline" onClick={() => form.reset()}>
              {tc("discard")}
            </Button>
          ) : null}
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? <Spinner /> : <Save />}
            {tc("save")}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

export function SettingsPage() {
  const t = useT(messages);
  const settings = useSettings();
  return (
    <Page className="max-w-3xl">
      <PageHeader title={t("title")} description={t("description")} />
      {settings.isLoading ? (
        <LoadingState />
      ) : settings.isError || !settings.data ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <SettingsForm settings={settings.data} />
      )}
    </Page>
  );
}
