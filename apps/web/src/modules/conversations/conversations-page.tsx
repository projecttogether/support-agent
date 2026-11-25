import { useId } from "react";
import { MessagesSquare } from "lucide-react";
import { OUTCOMES, type Outcome } from "@support-agent/shared/api/agents";
import { Page, PageHeader } from "@/components/ui/page";
import { Pager } from "@/components/ui/pager";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { OutcomeBadge, outcomeMessages } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n";
import { useFormatter } from "@/lib/format";
import { mrkdwnToText } from "@/lib/mrkdwn";
import { useAgents } from "@/modules/agents/api";
import { useExchanges } from "./api";
import { ExchangeSheet, FeedbackLabel } from "./exchange-sheet";
import { messages } from "./messages";

export const PAGE_SIZE = 50;
const ALL = "all";

export type ConversationsSearch = {
  agentId?: string;
  outcome?: Outcome;
  feedback?: "helpful" | "not_helpful";
  page?: number;
  /** The conversation open in the side sheet. */
  exchange?: string;
};

function FilterSelect(props: {
  label: string;
  value: string | undefined;
  allLabel: string;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
}) {
  const id = useId();
  return (
    <Field className="w-full sm:w-52">
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      <Select
        value={props.value ?? ALL}
        onValueChange={(value) => props.onChange(value === ALL ? undefined : value)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{props.allLabel}</SelectItem>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function ConversationsPage(props: {
  search: ConversationsSearch;
  onSearch: (search: ConversationsSearch) => void;
}) {
  const t = useT(messages);
  const to = useT(outcomeMessages);
  const format = useFormatter();
  const agents = useAgents();
  const { search } = props;
  const page = search.page ?? 1;
  const exchanges = useExchanges({
    agentId: search.agentId,
    outcome: search.outcome,
    feedback: search.feedback,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const filtered = Boolean(search.agentId || search.outcome || search.feedback);
  // Changing a filter starts again at the first page.
  const setFilter = (change: Partial<ConversationsSearch>) =>
    props.onSearch({ ...search, ...change, page: undefined, exchange: undefined });
  const open = (id: string) => props.onSearch({ ...search, exchange: id });

  return (
    <Page>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label={t("agent")}
          value={search.agentId}
          allLabel={t("allAgents")}
          options={(agents.data ?? []).map((agent) => ({ value: agent.id, label: agent.name }))}
          onChange={(agentId) => setFilter({ agentId })}
        />
        <FilterSelect
          label={t("outcome")}
          value={search.outcome}
          allLabel={t("allOutcomes")}
          options={OUTCOMES.map((outcome) => ({ value: outcome, label: to(outcome) }))}
          onChange={(outcome) => setFilter({ outcome: outcome as Outcome | undefined })}
        />
        <FilterSelect
          label={t("feedback")}
          value={search.feedback}
          allLabel={t("allFeedback")}
          options={[
            { value: "helpful", label: t("helpful") },
            { value: "not_helpful", label: t("notHelpful") },
          ]}
          onChange={(feedback) => setFilter({ feedback: feedback as ConversationsSearch["feedback"] })}
        />
        {filtered ? (
          <Button variant="ghost" onClick={() => props.onSearch({ exchange: search.exchange })}>
            {t("resetFilters")}
          </Button>
        ) : null}
      </div>

      {exchanges.isLoading ? (
        <LoadingState />
      ) : exchanges.isError || !exchanges.data ? (
        <ErrorState error={exchanges.error} onRetry={() => void exchanges.refetch()} />
      ) : exchanges.data.items.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare />}
          title={filtered ? t("emptyFiltered") : t("empty")}
          description={filtered ? undefined : t("emptyText")}
          action={
            filtered ? (
              <Button variant="outline" onClick={() => props.onSearch({})}>
                {t("resetFilters")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colWhen")}</TableHead>
                  <TableHead>{t("colQuestion")}</TableHead>
                  <TableHead>{t("colOutcome")}</TableHead>
                  <TableHead>{t("colAgent")}</TableHead>
                  <TableHead>{t("colChannel")}</TableHead>
                  <TableHead>{t("colFeedback")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exchanges.data.items.map((exchange) => (
                  <TableRow
                    key={exchange.id}
                    className="cursor-pointer"
                    data-state={search.exchange === exchange.id ? "selected" : undefined}
                    onClick={() => open(exchange.id)}
                  >
                    <TableCell
                      className="text-muted-foreground align-top"
                      title={format.dateTime(exchange.createdAt)}
                    >
                      {format.relative(exchange.createdAt)}
                    </TableCell>
                    <TableCell className="max-w-96 min-w-56 align-top whitespace-normal">
                      <button
                        type="button"
                        className="focus-visible:ring-ring/50 line-clamp-2 rounded-sm text-left outline-none focus-visible:ring-[3px]"
                        aria-label={`${t("open")}: ${exchange.question ? mrkdwnToText(exchange.question).slice(0, 80) : t("removed")}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          open(exchange.id);
                        }}
                      >
                        {exchange.question !== null ? (
                          mrkdwnToText(exchange.question)
                        ) : (
                          <span className="text-muted-foreground italic">{t("removed")}</span>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="align-top">
                      <OutcomeBadge outcome={exchange.outcome} />
                    </TableCell>
                    <TableCell className="align-top">{exchange.agentName ?? t("deletedAgent")}</TableCell>
                    <TableCell className="align-top">
                      {exchange.channelName ? `#${exchange.channelName}` : exchange.channelId}
                    </TableCell>
                    <TableCell className="align-top">
                      <FeedbackLabel feedback={exchange.feedback} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={exchanges.data.total}
            onPage={(next) => props.onSearch({ ...search, page: next > 1 ? next : undefined })}
          />
        </>
      )}

      <ExchangeSheet
        id={search.exchange}
        onClose={() => props.onSearch({ ...search, exchange: undefined })}
      />
    </Page>
  );
}
