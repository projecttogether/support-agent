import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, Plus } from "lucide-react";
import { Page, PageHeader } from "@/components/ui/page";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n";
import { useKnowledgeSources } from "./api";
import { messages } from "./messages";

export function KnowledgePage() {
  const t = useT(messages);
  const navigate = useNavigate();
  const sources = useKnowledgeSources();
  const addButton = (
    <Button asChild>
      <Link to="/knowledge/new">
        <Plus />
        {t("add")}
      </Link>
    </Button>
  );
  return (
    <Page>
      <PageHeader title={t("title")} description={t("description")} actions={addButton} />
      {sources.isLoading ? (
        <LoadingState />
      ) : sources.isError ? (
        <ErrorState error={sources.error} onRetry={() => void sources.refetch()} />
      ) : !sources.data?.length ? (
        <EmptyState icon={<BookOpen />} title={t("empty")} description={t("emptyText")} action={addButton} />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colUrl")}</TableHead>
                <TableHead>{t("colAuth")}</TableHead>
                <TableHead className="text-right">{t("colAgents")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.data.map((source) => (
                <TableRow
                  key={source.id}
                  className="cursor-pointer"
                  onClick={() =>
                    void navigate({ to: "/knowledge/$sourceId", params: { sourceId: source.id } })
                  }
                >
                  <TableCell className="max-w-80 whitespace-normal">
                    <Link
                      to="/knowledge/$sourceId"
                      params={{ sourceId: source.id }}
                      className="font-medium underline-offset-4 hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {source.name}
                    </Link>
                    {source.description ? (
                      <p className="text-muted-foreground line-clamp-2 text-xs">{source.description}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{source.config.url}</TableCell>
                  <TableCell>{t(`auth_${source.config.auth}`)}</TableCell>
                  <TableCell className="text-right tabular-nums">{source.agentCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </Page>
  );
}
