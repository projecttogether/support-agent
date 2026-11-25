import type { ReactNode } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import type { CheckResult } from "@support-agent/shared/api/common";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: { ok: "Connection works", failed: "Connection failed", latency: "Answered in {ms} ms" },
  de: { ok: "Verbindung funktioniert", failed: "Verbindung fehlgeschlagen", latency: "Antwort in {ms} ms" },
});

/** The result of a connection check (provider, knowledge source, Slack). */
export function CheckResultAlert({ result, children }: { result: CheckResult; children?: ReactNode }) {
  const t = useT(messages);
  return (
    <Alert variant={result.ok ? "default" : "destructive"} role="status">
      {result.ok ? <CircleCheck className="text-success" /> : <CircleX />}
      <AlertTitle>{result.ok ? t("ok") : t("failed")}</AlertTitle>
      <AlertDescription>
        <p>{result.message}</p>
        {result.latencyMs !== null ? <p>{t("latency", { ms: result.latencyMs })}</p> : null}
        {children}
      </AlertDescription>
    </Alert>
  );
}
