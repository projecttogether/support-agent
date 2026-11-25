import type { ReactNode } from "react";
import { ExternalLink, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Exchange } from "@support-agent/shared/api/exchanges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { OutcomeBadge } from "@/components/status-badges";
import { SlackMessage } from "@/components/slack-message";
import { useT } from "@/i18n";
import { useFormatter } from "@/lib/format";
import { useExchange } from "./api";
import { messages } from "./messages";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-1.5">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

export function FeedbackLabel({ feedback }: { feedback: number }) {
  const t = useT(messages);
  if (feedback > 0)
    return (
      <span className="inline-flex items-center gap-1">
        <ThumbsUp className="text-success size-4" aria-hidden />
        {t("helpful")}
      </span>
    );
  if (feedback < 0)
    return (
      <span className="inline-flex items-center gap-1">
        <ThumbsDown className="text-destructive size-4" aria-hidden />
        {t("notHelpful")}
      </span>
    );
  return <span className="text-muted-foreground">{t("noFeedback")}</span>;
}

function Details({ exchange }: { exchange: Exchange }) {
  const t = useT(messages);
  const format = useFormatter();
  const removed = exchange.question === null;
  return (
    <div className="grid gap-5 px-4 pb-6">
      <div className="flex flex-wrap items-center gap-2">
        <OutcomeBadge outcome={exchange.outcome} />
        {exchange.usedFallback ? <Badge variant="secondary">{t("usedFallback")}</Badge> : null}
      </div>
      <Section title={t("question")}>
        {exchange.question !== null ? (
          <p className="text-sm break-words whitespace-pre-wrap">{exchange.question}</p>
        ) : (
          <p className="text-muted-foreground text-sm italic">{t("removed")}</p>
        )}
        {exchange.slackUserId ? (
          <p className="text-muted-foreground text-xs">{t("askedBy", { user: exchange.slackUserId })}</p>
        ) : null}
      </Section>
      <Section title={t("answer")}>
        {exchange.answer !== null ? (
          <div className="rounded-md border p-3">
            <SlackMessage text={exchange.answer} />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm italic">
            {removed ? t("removed") : t("nothingPosted")}
          </p>
        )}
      </Section>
      {exchange.reason ? (
        <Section title={t("reason")}>
          <p className="text-muted-foreground text-sm">{exchange.reason}</p>
        </Section>
      ) : null}
      {exchange.error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("error")}</AlertTitle>
          <AlertDescription className="break-words">{exchange.error}</AlertDescription>
        </Alert>
      ) : null}
      <Section title={t("sources")}>
        {exchange.sources.length ? (
          <ul className="grid list-disc gap-1 pl-5 text-sm">
            {exchange.sources.map((source, index) => (
              <li key={index} className="break-words">
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline-offset-2 hover:underline"
                  >
                    {source.title}
                  </a>
                ) : (
                  source.title
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{t("noSources")}</p>
        )}
      </Section>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">{t("agent")}</dt>
        <dd>{exchange.agentName ?? t("deletedAgent")}</dd>
        <dt className="text-muted-foreground">{t("colChannel")}</dt>
        <dd className="break-all">
          {exchange.channelName ? `#${exchange.channelName}` : exchange.channelId}
        </dd>
        <dt className="text-muted-foreground">{t("model")}</dt>
        <dd className="font-mono break-all">
          {[exchange.provider, exchange.model].filter(Boolean).join(" · ") || "—"}
        </dd>
        <dt className="text-muted-foreground">{t("latency")}</dt>
        <dd>{exchange.latencyMs !== null ? `${format.number(exchange.latencyMs)} ms` : "—"}</dd>
        <dt className="text-muted-foreground">{t("tokens")}</dt>
        <dd>
          {t("tokensValue", {
            input: format.number(exchange.inputTokens),
            output: format.number(exchange.outputTokens),
          })}
        </dd>
        <dt className="text-muted-foreground">{t("feedback")}</dt>
        <dd>
          <FeedbackLabel feedback={exchange.feedback} />
        </dd>
      </dl>
      {exchange.permalink ? (
        <Button asChild variant="outline" className="w-fit">
          <a href={exchange.permalink} target="_blank" rel="noreferrer noopener">
            <ExternalLink />
            {t("openInSlack")}
          </a>
        </Button>
      ) : null}
    </div>
  );
}

/** One conversation in a side sheet, loaded by id (so the address can link to it). */
export function ExchangeSheet(props: { id: string | undefined; onClose: () => void }) {
  const t = useT(messages);
  const format = useFormatter();
  const exchange = useExchange(props.id);
  return (
    <Sheet open={Boolean(props.id)} onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("details")}</SheetTitle>
          <SheetDescription>
            {exchange.data ? format.dateTime(exchange.data.createdAt) : null}
          </SheetDescription>
        </SheetHeader>
        {exchange.isLoading ? (
          <LoadingState />
        ) : exchange.isError || !exchange.data ? (
          <ErrorState error={exchange.error} onRetry={() => void exchange.refetch()} />
        ) : (
          <Details exchange={exchange.data} />
        )}
      </SheetContent>
    </Sheet>
  );
}
