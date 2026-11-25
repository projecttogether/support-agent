import { useState } from "react";
import { Blocks, KeyRound, MoreHorizontal, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { PROVIDER_LABELS, type Provider } from "@support-agent/shared/api/providers";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Page, PageHeader } from "@/components/ui/page";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n";
import { common } from "@/i18n/common";
import { errorMessage } from "@/lib/api";
import { useDeleteProvider, useProviders } from "./api";
import { messages } from "./messages";
import { ProviderDialog } from "./provider-dialog";
import { ProviderTestDialog } from "./test-dialog";

type Open = { kind: "edit"; provider: Provider | null } | { kind: "test"; provider: Provider } | null;

export function ProvidersPage() {
  const t = useT(messages);
  const tc = useT(common);
  const providers = useProviders();
  const remove = useDeleteProvider();
  const [open, setOpen] = useState<Open>(null);
  const [deleting, setDeleting] = useState<Provider | null>(null);

  const addButton = (
    <Button onClick={() => setOpen({ kind: "edit", provider: null })}>
      <Plus />
      {t("add")}
    </Button>
  );

  return (
    <Page>
      <PageHeader title={t("title")} description={t("description")} actions={addButton} />
      {providers.isLoading ? (
        <LoadingState />
      ) : providers.isError ? (
        <ErrorState error={providers.error} onRetry={() => void providers.refetch()} />
      ) : !providers.data?.length ? (
        <EmptyState icon={<Blocks />} title={t("empty")} description={t("emptyText")} action={addButton} />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colKind")}</TableHead>
                <TableHead>{t("colBaseUrl")}</TableHead>
                <TableHead>{t("colKey")}</TableHead>
                <TableHead className="text-right">{t("colAgents")}</TableHead>
                <TableHead>
                  <span className="sr-only">{tc("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.data.map((provider) => (
                <TableRow key={provider.id}>
                  <TableCell className="font-medium">{provider.name}</TableCell>
                  <TableCell>{PROVIDER_LABELS[provider.kind]}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {provider.baseUrl ?? (
                      <span className="text-muted-foreground font-sans">{t("defaultUrl")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {provider.hasApiKey ? (
                      <Badge variant="secondary">
                        <KeyRound />
                        {provider.apiKeyHint
                          ? t("keyStored", { hint: provider.apiKeyHint })
                          : t("keyStoredNoHint")}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">{t("noKey")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{provider.agentCount}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("actionsFor", { name: provider.name })}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setOpen({ kind: "test", provider })}>
                          <Zap />
                          {t("test")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setOpen({ kind: "edit", provider })}>
                          <Pencil />
                          {tc("edit")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(provider)}>
                          <Trash2 />
                          {tc("delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {open?.kind === "edit" ? (
        <ProviderDialog provider={open.provider} onClose={() => setOpen(null)} />
      ) : null}
      {open?.kind === "test" ? (
        <ProviderTestDialog provider={open.provider} onClose={() => setOpen(null)} />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={t("deleteTitle", { name: deleting?.name ?? "" })}
        description={t("deleteText")}
        destructive
        confirmLabel={tc("delete")}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success(t("deleted"));
          } catch (error) {
            // 409: agents still use it; the message says which.
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </Page>
  );
}
