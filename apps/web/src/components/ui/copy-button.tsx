import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./button";
import { useT } from "@/i18n";
import { common } from "./messages";

/** Copies text to the clipboard and confirms it. */
export function CopyButton(props: { text: string; label?: string; className?: string }) {
  const tc = useT(common);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(tc("error"));
    }
  };
  return (
    <Button type="button" variant="outline" size="sm" className={props.className} onClick={() => void copy()}>
      {copied ? <Check /> : <Copy />}
      {copied ? tc("copied") : (props.label ?? tc("copy"))}
    </Button>
  );
}
