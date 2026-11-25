import { Link, useNavigate } from "@tanstack/react-router";
import { Bot, Plus } from "lucide-react";
import type { Agent } from "@support-agent/shared/api/agents";
import { Page, PageHeader } from "@/components/ui/page";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { EnabledBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n";
import { useProviders } from "@/modules/providers/api";
import { useAgents } from "./api";
import { messages } from "./messages";

const SHOWN_CHANNELS = 3;

function Channels({ agent }: { agent: Agent }) {
  const t = useT(messages);
  if (agent.channels.length === 0) return <span className="text-muted-foreground">{t("noChannels")}</span>;
  const shown = agent.channels.slice(0, SHOWN_CHANNELS);
  const more = agent.channels.length - shown.length;
  return (
    <span className="text-sm">
      {shown.map((channel) => (channel.name ? `#${channel.name}` : channel.id)).join(", ")}
      {more > 0 ? <span className="text-muted-foreground"> {t("moreChannels", { count: more })}</span> : null}
    </span>
  );
}

export function AgentsPage() {
  const t = useT(messages);
  const navigate = useNavigate();
  const agents = useAgents();
  const providers = useProviders();
  const providerName = (id: string | null) => providers.data?.find((provider) => provider.id === id)?.name;

  const newButton = (
    <Button asChild>
      <Link to="/agents/new">
        <Plus />
        {t("newAgent")}
      </Link>
    </Button>
  );

  return (
    <Page>
      <PageHeader title={t("title")} description={t("description")} actions={newButton} />
      {agents.isLoading ? (
        <LoadingState />
      ) : agents.isError ? (
        <ErrorState error={agents.error} onRetry={() => void agents.refetch()} />
      ) : !agents.data?.length ? (
        <EmptyState icon={<Bot />} title={t("empty")} description={t("emptyText")} action={newButton} />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead>{t("colChannels")}</TableHead>
                <TableHead>{t("colModel")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.data.map((agent) => (
                <TableRow
                  key={agent.id}
                  className="cursor-pointer"
                  onClick={() => void navigate({ to: "/agents/$agentId", params: { agentId: agent.id } })}
                >
                  <TableCell className="font-medium">
                    <Link
                      to="/agents/$agentId"
                      params={{ agentId: agent.id }}
                      className="underline-offset-4 hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {agent.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <EnabledBadge enabled={agent.enabled} on={t("on")} off={t("off")} />
                  </TableCell>
                  <TableCell className="max-w-72 whitespace-normal">
                    <Channels agent={agent} />
                  </TableCell>
                  <TableCell>
                    {agent.model ? (
                      <span className="grid">
                        <span className="font-mono text-sm">{agent.model}</span>
                        {providerName(agent.providerId) ? (
                          <span className="text-muted-foreground text-xs">
                            {providerName(agent.providerId)}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t("noModel")}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </Page>
  );
}
