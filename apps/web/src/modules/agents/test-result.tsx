import { useState } from "react";
import { ChevronDown, ExternalLink, Save } from "lucide-react";
import type { PreviewResult, RetrievedSource } from "@support-agent/shared/api/agents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OutcomeBadge } from "@/components/status-badges";
import { SlackMessage } from "@/components/slack-message";
import { useT } from "@/i18n";
import { useFormatter } from "@/lib/format";
import { cn } from "@/components/ui/utils";
import { messages } from "./messages";

function SourceItem({ source, cited }: { source: RetrievedSource; cited: boolean }) {
  const t = useT(messages);
  const [open, setOpen] = useState(false);
  return (
    <li className={cn("rounded-md border p-3", cited && "border-success/40 bg-success/5")}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-start gap-2">
          <Badge variant="outline" className="font-mono">
            {source.ref}
          </Badge>
          <div className="grid min-w-0 flex-1 gap-0.5">
            {source.url ? (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 font-medium break-words underline-offset-2 hover:underline"
              >
                {source.title}
                <ExternalLink className="size-3.5 shrink-0" aria-hidden />
              </a>
            ) : (
              <span className="font-medium break-words">{source.title}</span>
            )}
            <span className="text-muted-foreground text-xs break-words">
              {source.knowledgeSourceName}
              {source.section ? ` · ${source.section}` : ""}
            </span>
          </div>
          {cited ? (
            <Badge variant="outline" className="bg-success/15 text-success border-success/30">
              {t("cited")}
            </Badge>
          ) : null}
        </div>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="link" size="sm" className="mt-1 h-auto p-0">
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
            {open ? t("hideText") : t("showText")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="bg-muted mt-2 max-h-80 overflow-y-auto rounded-md p-3 text-sm whitespace-pre-wrap">
            {source.text}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

/** What the agent did with a test question, and why. */
export function PreviewResultView(props: { result: PreviewResult; onSaveAsTest?: () => void }) {
  const t = useT(messages);
  const format = useFormatter();
  const { result } = props;
  const ms = (value: number | null) => (value === null ? "—" : `${format.number(value)} ms`);

  return (
    <Card aria-live="polite">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <h3>{t("result")}</h3>
          <OutcomeBadge outcome={result.outcome} />
          {result.usedFallback ? <Badge variant="secondary">{t("usedFallback")}</Badge> : null}
        </CardTitle>
        {props.onSaveAsTest ? (
          <CardAction>
            <Button type="button" variant="outline" size="sm" onClick={props.onSaveAsTest}>
              <Save />
              {t("saveAsTest")}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-5">
        {result.error ? (
          <Alert variant="destructive">
            <AlertTitle>{t("errorDetail")}</AlertTitle>
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        ) : null}
        {result.reason ? (
          <section className="grid gap-1">
            <h4 className="text-sm font-medium">{t("reason")}</h4>
            <p className="text-muted-foreground text-sm">{result.reason}</p>
          </section>
        ) : null}

        <section className="grid gap-2">
          <h4 className="text-sm font-medium">{t("slackMessage")}</h4>
          {result.slackText ? (
            <div className="bg-background rounded-md border p-4">
              <SlackMessage text={result.slackText} />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("noMessage")}</p>
          )}
        </section>

        <section className="grid gap-2">
          <h4 className="text-sm font-medium">{t("searchQueries")}</h4>
          {result.searchQueries.length ? (
            <ul className="flex flex-wrap gap-2">
              {result.searchQueries.map((query, index) => (
                <li key={index}>
                  <Badge variant="secondary" className="font-normal whitespace-normal">
                    {query}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{t("noSearch")}</p>
          )}
        </section>

        <section className="grid gap-2">
          <h4 className="text-sm font-medium">{t("sources")}</h4>
          {result.sources.length ? (
            <ul className="grid gap-2">
              {result.sources.map((source) => (
                <SourceItem key={source.ref} source={source} cited={result.citedRefs.includes(source.ref)} />
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{t("noSources")}</p>
          )}
        </section>

        <section className="grid gap-2">
          <h4 className="text-sm font-medium">{t("details")}</h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("providerModel")}</dt>
            <dd className="font-mono break-all">
              {[result.provider, result.model].filter(Boolean).join(" · ") || "—"}
            </dd>
            <dt className="text-muted-foreground">{t("timings")}</dt>
            <dd>
              {t("timingTriage")} {ms(result.timings.triageMs)} · {t("timingSearch")}{" "}
              {ms(result.timings.searchMs)} · {t("timingAnswer")} {ms(result.timings.answerMs)} ·{" "}
              <span className="font-medium">
                {t("timingTotal")} {ms(result.timings.totalMs)}
              </span>
            </dd>
            <dt className="text-muted-foreground">{t("tokens")}</dt>
            <dd>
              {t("tokensValue", {
                input: format.number(result.usage.inputTokens),
                output: format.number(result.usage.outputTokens),
              })}
            </dd>
          </dl>
        </section>
      </CardContent>
    </Card>
  );
}
