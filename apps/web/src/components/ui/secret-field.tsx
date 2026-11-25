import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import { Button } from "./button";
import { SecretInput } from "./secret-input";
import { Badge } from "./badge";
import { KeyRound } from "lucide-react";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: {
    stored: "Stored",
    storedHint: "Stored ({hint})",
    replace: "Replace",
    keep: "Keep stored value",
    remove: "Remove",
    removed: "Removed when you save.",
    undo: "Undo",
    writeOnly: "Write-only: the stored value is never shown again.",
  },
  de: {
    stored: "Gespeichert",
    storedHint: "Gespeichert ({hint})",
    replace: "Ersetzen",
    keep: "Gespeicherten Wert behalten",
    remove: "Entfernen",
    removed: "Wird beim Speichern entfernt.",
    undo: "Rückgängig",
    writeOnly: "Nur schreibbar: Der gespeicherte Wert wird nie wieder angezeigt.",
  },
});

/** A write-only secret: keep the stored one, replace it, or remove it. */
export type SecretValue = { mode: "keep" | "replace" | "remove"; value: string };

export function initialSecret(stored: boolean): SecretValue {
  return { mode: stored ? "keep" : "replace", value: "" };
}

/** The API value: undefined keeps the stored secret, a string replaces it, null removes it. */
export function secretPayload(secret: SecretValue): string | null | undefined {
  if (secret.mode === "remove") return null;
  if (secret.mode === "replace" && secret.value.trim() !== "") return secret.value.trim();
  return undefined;
}

export function SecretField(props: {
  id: string;
  label: string;
  /** A value is stored on the server. */
  stored: boolean;
  /** The last characters of the stored value, e.g. "…3f9a". */
  hint?: string | null;
  value: SecretValue;
  onChange: (value: SecretValue) => void;
  /** Offer to remove the stored value. */
  removable?: boolean;
  placeholder?: string;
  description?: string;
  error?: string;
}) {
  const t = useT(messages);
  const { value, onChange } = props;
  const describedBy = `${props.id}-hint`;

  return (
    <Field data-invalid={props.error ? true : undefined}>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      {props.stored && value.mode !== "replace" ? (
        <div className="flex flex-wrap items-center gap-2" id={props.id} tabIndex={-1}>
          {value.mode === "keep" ? (
            <>
              <Badge variant="secondary">
                <KeyRound />
                {props.hint ? t("storedHint", { hint: props.hint }) : t("stored")}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange({ mode: "replace", value: "" })}
              >
                {t("replace")}
              </Button>
              {props.removable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange({ mode: "remove", value: "" })}
                >
                  {t("remove")}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <span className="text-muted-foreground text-sm">{t("removed")}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange({ mode: "keep", value: "" })}
              >
                {t("undo")}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <SecretInput
            id={props.id}
            autoComplete="off"
            className="min-w-0 flex-1"
            inputClassName="font-mono"
            value={value.value}
            placeholder={props.placeholder}
            aria-invalid={props.error ? true : undefined}
            aria-describedby={describedBy}
            autoFocus={props.stored}
            onChange={(event) => onChange({ mode: "replace", value: event.target.value })}
          />
          {props.stored ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ mode: "keep", value: "" })}
            >
              {t("keep")}
            </Button>
          ) : null}
        </div>
      )}
      <FieldDescription id={describedBy}>
        {props.description ? `${props.description} ` : ""}
        {t("writeOnly")}
      </FieldDescription>
      {props.error ? <FieldError>{props.error}</FieldError> : null}
    </Field>
  );
}
