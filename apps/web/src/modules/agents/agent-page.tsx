import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { ChevronLeft, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  agentInputSchema,
  type Agent,
  type AgentInput,
  type AgentTest,
  type AgentTestInput,
} from "@support-agent/shared/api/agents";
import { Page, PageHeader } from "@/components/ui/page";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { EnabledBadge } from "@/components/status-badges";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocale, useT } from "@/i18n";
import { common } from "@/i18n/common";
import { ApiError, errorMessage } from "@/lib/api";
import { applyServerErrors, useSchemaResolver } from "@/lib/validation";
import { useAgent, useCreateAgent, useDeleteAgent, useUpdateAgent } from "./api";
import { AgentSettings } from "./agent-settings";
import { draftFromValues, toFormValues, type AgentFormValues } from "./form";
import { messages } from "./messages";
import { SavedTests, TestDialog } from "./saved-tests";
import { TestConsole } from "./test-console";

export type AgentTab = "settings" | "test";

function DeleteSection({ agent, onDeleted }: { agent: Agent; onDeleted: () => void }) {
  const t = useT(messages);
  const tc = useT(common);
  const remove = useDeleteAgent();
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>
          <h2>{t("sectionDelete")}</h2>
        </CardTitle>
        <CardDescription>{t("deleteHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 />
          {tc("delete")}
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={t("deleteConfirm", { name: agent.name })}
          description={t("deleteText")}
          destructive
          confirmLabel={tc("delete")}
          onConfirm={async () => {
            try {
              await remove.mutateAsync(agent.id);
              toast.success(t("deleted"));
              onDeleted();
            } catch (error) {
              toast.error(errorMessage(error));
              throw error;
            }
          }}
        />
      </CardContent>
    </Card>
  );
}

function TestTab(props: {
  agentId: string;
  dirty: boolean;
  getDraft: () => ReturnType<typeof draftFromValues>;
  onInvalidDraft: () => void;
}) {
  const [dialog, setDialog] = useState<{ test?: AgentTest; initial?: AgentTestInput } | null>(null);
  return (
    <div className="grid gap-6">
      <TestConsole
        agentId={props.agentId}
        getDraft={props.getDraft}
        onInvalidDraft={props.onInvalidDraft}
        onSaveAsTest={(initial) => setDialog({ initial })}
      />
      <SavedTests
        agentId={props.agentId}
        dirty={props.dirty}
        onAdd={() => setDialog({})}
        onEdit={(test) => setDialog({ test })}
      />
      {dialog ? (
        <TestDialog
          agentId={props.agentId}
          test={dialog.test}
          initial={dialog.initial}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Creates or edits an agent. The form lives above the tabs, so the test
 * console asks the agent as it is in the form, unsaved changes included.
 */
export function AgentEditor(props: {
  agent: Agent | null;
  tab: AgentTab;
  onTab: (tab: AgentTab) => void;
  onReload?: () => Promise<Agent | undefined>;
}) {
  const t = useT(messages);
  const tc = useT(common);
  const locale = useLocale();
  const navigate = useNavigate();
  const create = useCreateAgent();
  const update = useUpdateAgent();
  const { agent } = props;
  const resolver = useSchemaResolver<AgentFormValues, AgentInput>(agentInputSchema);
  const form = useForm<AgentFormValues, unknown, AgentInput>({
    resolver,
    defaultValues: toFormValues(agent),
  });
  // The version the form started from; a newer saved version means someone else changed the agent.
  const [baseVersion, setBaseVersion] = useState(agent?.version ?? 0);
  const [conflict, setConflict] = useState(false);
  const leaving = useRef(false);
  const { isDirty, isSubmitting } = form.formState;

  // Without own changes, follow changes others saved.
  useEffect(() => {
    if (agent && agent.version !== baseVersion && !isDirty && !conflict) {
      form.reset(toFormValues(agent));
      setBaseVersion(agent.version);
    }
  }, [agent, baseVersion, isDirty, conflict, form]);

  useBlocker({
    // Tabs change the search only; leaving the page with unsaved changes asks first.
    shouldBlockFn: ({ current, next }) =>
      current.pathname !== next.pathname &&
      !leaving.current &&
      form.formState.isDirty &&
      !window.confirm(t("leaveConfirm")),
    enableBeforeUnload: () => !leaving.current && form.formState.isDirty,
  });

  const save = form.handleSubmit(
    async (input) => {
      try {
        if (agent) {
          const saved = await update.mutateAsync({ id: agent.id, version: baseVersion, ...input });
          form.reset(toFormValues(saved));
          setBaseVersion(saved.version);
          toast.success(t("saved"));
        } else {
          const saved = await create.mutateAsync(input);
          leaving.current = true;
          toast.success(t("created"));
          await navigate({ to: "/agents/$agentId", params: { agentId: saved.id } });
        }
      } catch (error) {
        if (error instanceof ApiError && error.code === "version_conflict" && agent) {
          setConflict(true);
          return;
        }
        applyServerErrors(form, error, locale);
        props.onTab("settings");
        toast.error(errorMessage(error));
      }
    },
    () => {
      props.onTab("settings");
      toast.error(t("fixErrors"));
    },
  );

  const reload = async () => {
    const fresh = await props.onReload?.();
    if (!fresh) return;
    form.reset(toFormValues(fresh));
    setBaseVersion(fresh.version);
    setConflict(false);
  };

  const getDraft = useCallback(() => draftFromValues(form.getValues()), [form]);
  const showInvalid = useCallback(() => {
    props.onTab("settings");
    void form.trigger();
  }, [form, props]);

  return (
    <Page className="pb-0">
      <div className="grid gap-2">
        <Button asChild variant="link" className="text-muted-foreground h-auto w-fit p-0">
          <Link to="/agents">
            <ChevronLeft />
            {t("backToList")}
          </Link>
        </Button>
        <PageHeader
          title={agent?.name || t("newTitle")}
          actions={agent ? <EnabledBadge enabled={agent.enabled} on={t("on")} off={t("off")} /> : null}
        />
      </div>

      {conflict ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{t("conflict")}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>
              {t("conflictReload")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={props.tab} onValueChange={(value) => props.onTab(value as AgentTab)}>
        <TabsList>
          <TabsTrigger value="settings">{t("tabSettings")}</TabsTrigger>
          <TabsTrigger value="test">{t("tabTest")}</TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className="mt-4">
          <form onSubmit={(event) => void save(event)} noValidate aria-label={t("tabSettings")}>
            <AgentSettings
              form={form}
              agent={agent}
              deleteSection={
                agent ? (
                  <DeleteSection
                    agent={agent}
                    onDeleted={() => {
                      leaving.current = true;
                      void navigate({ to: "/agents" });
                    }}
                  />
                ) : null
              }
            />
          </form>
        </TabsContent>
        <TabsContent value="test" className="mt-4">
          {agent ? (
            <TestTab agentId={agent.id} dirty={isDirty} getDraft={getDraft} onInvalidDraft={showInvalid} />
          ) : (
            <div className="grid gap-6">
              <TestConsole agentId={null} getDraft={getDraft} onInvalidDraft={showInvalid} />
              <Alert>
                <AlertDescription>{t("saveFirst")}</AlertDescription>
              </Alert>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Outside the tabs: saving works from the test tab too. */}
      <div className="bg-background/95 sticky bottom-0 z-10 -mx-4 border-t px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isDirty ? <span className="text-muted-foreground mr-auto text-sm">{t("unsaved")}</span> : null}
          {agent && isDirty ? (
            <Button type="button" variant="outline" onClick={() => form.reset()}>
              {tc("discard")}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={isSubmitting || (Boolean(agent) && !isDirty) || conflict}
            onClick={() => void save()}
          >
            {isSubmitting ? <Spinner /> : <Save />}
            {agent ? tc("save") : tc("create")}
          </Button>
        </div>
      </div>
    </Page>
  );
}

/** An existing agent, loaded by id. */
export function AgentPage(props: { agentId: string; tab: AgentTab; onTab: (tab: AgentTab) => void }) {
  const agent = useAgent(props.agentId);
  if (agent.isLoading) return <LoadingState />;
  if (agent.isError || !agent.data) {
    return (
      <Page>
        <ErrorState error={agent.error} onRetry={() => void agent.refetch()} />
      </Page>
    );
  }
  return (
    <AgentEditor
      key={agent.data.id}
      agent={agent.data}
      tab={props.tab}
      onTab={props.onTab}
      onReload={async () => (await agent.refetch()).data}
    />
  );
}
