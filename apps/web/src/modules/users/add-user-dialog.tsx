import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { ROLES, type Role } from "@support-agent/shared/roles";
import { userCreateSchema, type UserCreate } from "@support-agent/shared/api/users";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { useLocale, useT } from "@/i18n";
import { common } from "@/i18n/common";
import { errorMessage } from "@/lib/api";
import { applyServerErrors, useSchemaResolver } from "@/lib/validation";
import { useCreateUser } from "./api";
import { messages } from "./messages";

type Values = { email: string; name: string; role: Role };

/** Adds a person by email address; they sign in with single sign-on. */
export function AddUserDialog(props: { onClose: () => void }) {
  const t = useT(messages);
  const tc = useT(common);
  const locale = useLocale();
  const id = useId();
  const create = useCreateUser();
  const resolver = useSchemaResolver<Values, UserCreate>(userCreateSchema);
  const form = useForm<Values, unknown, UserCreate>({
    resolver,
    defaultValues: { email: "", name: "", role: "editor" },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (input) => {
    try {
      const user = await create.mutateAsync(input);
      toast.success(t("added", { email: user.email }));
      props.onClose();
    } catch (error) {
      applyServerErrors(form, error, locale);
      toast.error(errorMessage(error));
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-5" onSubmit={(event) => void submit(event)} noValidate>
          <DialogHeader>
            <DialogTitle>{t("addTitle")}</DialogTitle>
            <DialogDescription>{t("addText")}</DialogDescription>
          </DialogHeader>
          <Field data-invalid={errors.email ? true : undefined}>
            <FieldLabel htmlFor={`${id}-email`}>{t("email")}</FieldLabel>
            <Input
              id={`${id}-email`}
              type="email"
              autoComplete="off"
              maxLength={320}
              placeholder="name@example.org"
              aria-invalid={errors.email ? true : undefined}
              {...form.register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={errors.name ? true : undefined}>
            <FieldLabel htmlFor={`${id}-name`}>
              {t("name")} <span className="text-muted-foreground font-normal">({tc("optional")})</span>
            </FieldLabel>
            <Input
              id={`${id}-name`}
              autoComplete="off"
              maxLength={120}
              aria-invalid={errors.name ? true : undefined}
              {...form.register("name")}
            />
            <FieldError errors={[errors.name]} />
          </Field>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <FieldSet className="gap-3">
                <FieldLegend variant="label" className="mb-1">
                  {t("role")}
                </FieldLegend>
                <RadioGroup value={field.value} onValueChange={field.onChange}>
                  {ROLES.map((role) => (
                    <Field key={role} orientation="horizontal">
                      <RadioGroupItem value={role} id={`${id}-role-${role}`} />
                      <FieldContent>
                        <FieldLabel htmlFor={`${id}-role-${role}`}>{t(`role_${role}`)}</FieldLabel>
                        <FieldDescription>{t(`roleHint_${role}`)}</FieldDescription>
                      </FieldContent>
                    </Field>
                  ))}
                </RadioGroup>
              </FieldSet>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : null}
              {tc("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
