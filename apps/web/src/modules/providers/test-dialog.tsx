import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { Provider } from "@support-agent/shared/api/providers";
import { CheckResultAlert } from "@/components/check-result";
import { ModelCombobox } from "@/components/model-combobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/i18n";
import { common } from "@/i18n/common";
import { errorMessage } from "@/lib/api";
import { useTestProvider } from "./api";
import { messages } from "./messages";

/** Sends a short request to a model of the provider and shows the result. */
export function ProviderTestDialog(props: { provider: Provider; onClose: () => void }) {
  const t = useT(messages);
  const tc = useT(common);
  const id = useId();
  const test = useTestProvider();
  const [model, setModel] = useState("");

  const run = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await test.mutateAsync({ id: props.provider.id, model });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form className="grid gap-5" onSubmit={(event) => void run(event)} noValidate>
          <DialogHeader>
            <DialogTitle>{t("testTitle", { name: props.provider.name })}</DialogTitle>
            <DialogDescription>{t("testText")}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`${id}-model`}>{t("model")}</FieldLabel>
            <ModelCombobox
              id={`${id}-model`}
              providerId={props.provider.id}
              value={model}
              onChange={setModel}
            />
          </Field>
          {test.data ? <CheckResultAlert result={test.data} /> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose}>
              {tc("close")}
            </Button>
            <Button type="submit" disabled={!model || test.isPending}>
              {test.isPending ? <Spinner /> : null}
              {test.isPending ? t("testing") : t("runTest")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
