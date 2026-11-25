import * as React from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./input-group";
import { defineMessages, useT } from "@/i18n";
import { common } from "./messages";

const messages = defineMessages({
  en: { show: "Show", hide: "Hide" },
  de: { show: "Anzeigen", hide: "Verbergen" },
});

/**
 * A secret or password: hidden until the eye button shows it. With `copyable`,
 * a copy button copies the value without showing it (secrets shown once).
 * `className` styles the box, `inputClassName` the text field.
 */
export function SecretInput({
  className,
  inputClassName,
  copyable,
  id,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { inputClassName?: string; copyable?: boolean }) {
  const t = useT(messages);
  const tc = useT(common);
  const fallbackId = React.useId();
  const inputId = id ?? fallbackId;
  const [shown, setShown] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const copy = async (button: HTMLElement) => {
    // The field's live value: the field may be uncontrolled.
    const input = button.closest("[data-slot=input-group]")?.querySelector("input");
    try {
      await navigator.clipboard.writeText(input?.value ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(tc("error"));
    }
  };
  return (
    <InputGroup className={className} data-disabled={props.disabled ? true : undefined}>
      <InputGroupInput
        spellCheck={false}
        autoCapitalize="off"
        {...props}
        id={inputId}
        type={shown ? "text" : "password"}
        // Nobody can read or copy a hidden read-only secret from the field (browsers block copying
        // from password fields). Without a tab stop, a dialog focuses the buttons instead of
        // selecting the dots.
        tabIndex={props.readOnly && !shown ? -1 : props.tabIndex}
        className={inputClassName}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={shown ? t("hide") : t("show")}
          title={shown ? t("hide") : t("show")}
          aria-controls={inputId}
          disabled={props.disabled}
          onClick={() => setShown((value) => !value)}
        >
          {shown ? <EyeOff /> : <Eye />}
        </InputGroupButton>
        {copyable ? (
          <InputGroupButton
            size="icon-xs"
            aria-label={copied ? tc("copied") : tc("copy")}
            title={copied ? tc("copied") : tc("copy")}
            onClick={(event) => void copy(event.currentTarget)}
          >
            {copied ? <Check /> : <Copy />}
          </InputGroupButton>
        ) : null}
      </InputGroupAddon>
    </InputGroup>
  );
}
