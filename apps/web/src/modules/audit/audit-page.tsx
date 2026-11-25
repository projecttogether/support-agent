import { ScrollText } from "lucide-react";
import { Page, PageHeader } from "@/components/ui/page";
import { Pager } from "@/components/ui/pager";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n";
import { useFormatter } from "@/lib/format";
import { useAudit } from "./api";
import { messages } from "./messages";

const PAGE_SIZE = 50;

export function AuditPage(props: { page: number; onPage: (page: number) => void }) {
  const t = useT(messages);
  const format = useFormatter();
  const audit = useAudit(PAGE_SIZE, (props.page - 1) * PAGE_SIZE);
  return (
    <Page>
      <PageHeader title={t("title")} description={t("description")} />
      {audit.isLoading ? (
        <LoadingState />
      ) : audit.isError || !audit.data ? (
        <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
      ) : audit.data.items.length === 0 ? (
        <EmptyState icon={<ScrollText />} title={t("empty")} />
      ) : (
        <>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colWhen")}</TableHead>
                  <TableHead>{t("colWho")}</TableHead>
                  <TableHead>{t("colWhat")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.data.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="align-top whitespace-nowrap">
                      {format.dateTime(entry.createdAt)}
                    </TableCell>
                    <TableCell className="align-top break-all whitespace-normal">
                      {entry.actorEmail ?? <span className="text-muted-foreground">{t("system")}</span>}
                    </TableCell>
                    <TableCell className="min-w-64 align-top whitespace-normal">
                      <div className="break-words">{entry.summary}</div>
                      <div className="text-muted-foreground font-mono text-xs">{entry.action}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Pager page={props.page} pageSize={PAGE_SIZE} total={audit.data.total} onPage={props.onPage} />
        </>
      )}
    </Page>
  );
}
