import { useId, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { CircleCheck, CircleX, MoreHorizontal, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  agentTestInputSchema,
  TEST_EXPECTATIONS,
  type AgentTest,
  type AgentTestInput,
} from "@support-agent/shared/api/agents";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { OutcomeBadge } from "@/components/status-badges";
import { useLocale, useT } from "@/i18n";
import { common } from "@/i18n/common";
import { errorMessage } from "@/lib/api";
import { useFormatter } from "@/lib/format";
import { applyServerErrors, useSchemaResolver } from "@/lib/validation";
import {
  useAgentTests,
  useDeleteAgentTest,
  useRunAgentTest,
  useRunAgentTests,
  useSaveAgentTest,
} from "./api";
import { messages } from "./messages";

type TestFormValues = { question: string; expectation: AgentTest["expectation"]; expectedUrl: string };

/** Adds or edits a saved test: a question and the expected behavior. */
export function TestDialog(props: {
  agentId: string;
  test?: AgentTest;
  initial?: AgentTestInput;
  onClose: () => void;
}) {
  const t = useT(messages);
  const tc = useT(common);
  const locale = useLocale();
  const id = useId();
  const save = useSaveAgentTest(props.agentId);
  const source = props.test ?? props.initial;
  const resolver = useSchemaResolver<TestFormValues, AgentTestInput>(agentTestInputSchema);
  const form = useForm<TestFormValues, unknown, AgentTestInput>({
    resolver,
    defaultValues: {
      question: source?.question ?? "",
      expectation: source?.expectation ?? "answer",
      expectedUrl: source?.expectedUrl ?? "",
    },
  });
  const expectation = useWatch({ control: form.control, name: "expectation" });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (input) => {
    try {
      await save.mutateAsync({
        ...input,
        expectedUrl: input.expectation === "answer" ? input.expectedUrl : null,
        id: props.test?.id,
      });
      toast.success(t("testSaved"));
      props.onClose();
    } catch (error) {
      applyServerErrors(form, error, locale);
      toast.error(errorMessage(error));
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form className="grid gap-5" onSubmit={(event) => void submit(event)} noValidate>
          <DialogHeader>
            <DialogTitle>{props.test ? t("editTest") : t("newTest")}</DialogTitle>
            <DialogDescription>{t("savedTestsHint")}</DialogDescription>
          </DialogHeader>
          <Field data-invalid={errors.question ? true : undefined}>
            <FieldLabel htmlFor={`${id}-question`}>{t("question")}</FieldLabel>
            <Textarea
              id={`${id}-question`}
              rows={3}
              maxLength={4000}
              aria-invalid={errors.question ? true : undefined}
              {...form.register("question")}
            />
            <FieldError errors={[errors.question]} />
          </Field>
          <Controller
            control={form.control}
            name="expectation"
            render={({ field }) => (
              <FieldSet className="gap-3">
                <FieldLegend variant="label" className="mb-1">
                  {t("expectation")}
                </FieldLegend>
                <RadioGroup value={field.value} onValueChange={field.onChange}>
                  {TEST_EXPECTATIONS.map((value) => (
                    <Field key={value} orientation="horizontal">
                      <RadioGroupItem value={value} id={`${id}-expect-${value}`} />
                      <FieldContent>
                        <FieldLabel htmlFor={`${id}-expect-${value}`}>{t(`expectation_${value}`)}</FieldLabel>
                        <FieldDescription>{t(`expectationHint_${value}`)}</FieldDescription>
                      </FieldContent>
                    </Field>
                  ))}
                </RadioGroup>
              </FieldSet>
            )}
          />
          {expectation === "answer" ? (
            <Field data-invalid={errors.expectedUrl ? true : undefined}>
              <FieldLabel htmlFor={`${id}-url`}>
                {t("expectedUrl")}{" "}
                <span className="text-muted-foreground font-normal">({tc("optional")})</span>
              </FieldLabel>
              <Input
                id={`${id}-url`}
                type="url"
                inputMode="url"
                maxLength={1000}
                spellCheck={false}
                placeholder="https://wiki.example.org/page"
                aria-invalid={errors.expectedUrl ? true : undefined}
                aria-describedby={`${id}-url-hint`}
                {...form.register("expectedUrl")}
              />
              <FieldDescription id={`${id}-url-hint`}>{t("expectedUrlHint")}</FieldDescription>
              <FieldError errors={[errors.expectedUrl]} />
            </Field>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : null}
              {tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResultBadge({ test }: { test: AgentTest }) {
  const t = useT(messages);
  if (test.lastPassed === null) return <Badge variant="secondary">{t("notRun")}</Badge>;
  return test.lastPassed ? (
    <Badge variant="outline" className="bg-success/15 text-success border-success/30">
      <CircleCheck aria-hidden />
      {t("passed")}
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
      <CircleX aria-hidden />
      {t("failed")}
    </Badge>
  );
}

function TestRow(props: {
  agentId: string;
  test: AgentTest;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useT(messages);
  const tc = useT(common);
  const format = useFormatter();
  const runOne = useRunAgentTest(props.agentId);
  const { test } = props;

  const run = async () => {
    try {
      const result = await runOne.mutateAsync(test.id);
      if (result.lastPassed) toast.success(t("testRan"));
      else toast.warning(result.lastFailure ?? t("testFailed"));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <li className="grid gap-2 rounded-md border p-3">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium break-words whitespace-pre-wrap">{test.question}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={props.busy || runOne.isPending}
          onClick={() => void run()}
        >
          {runOne.isPending ? <Spinner /> : <Play />}
          {t("runTest")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={t("actionsFor")}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={props.onEdit}>
              <Pencil />
              {tc("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={props.onDelete}>
              <Trash2 />
              {tc("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-muted-foreground text-sm break-words">
        {test.expectation === "silent"
          ? t("expectSilent")
          : test.expectation === "headline"
            ? t("expectHeadline")
            : test.expectedUrl
              ? t("expectAnswerUrl", { url: test.expectedUrl })
              : t("expectAnswer")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <ResultBadge test={test} />
        {test.lastOutcome ? <OutcomeBadge outcome={test.lastOutcome} /> : null}
        {test.lastRunAt ? (
          <span className="text-muted-foreground text-xs" title={format.dateTime(test.lastRunAt)}>
            {t("lastRun", { when: format.relative(test.lastRunAt) })}
          </span>
        ) : null}
      </div>
      {test.lastFailure ? <p className="text-destructive text-sm">{test.lastFailure}</p> : null}
      {test.lastAnswer ? (
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer">{t("lastAnswer")}</summary>
          <p className="bg-muted mt-2 rounded-md p-3 whitespace-pre-wrap">{test.lastAnswer}</p>
        </details>
      ) : null}
    </li>
  );
}

/** The agent's saved tests, run all at once against the saved agent. */
export function SavedTests(props: {
  agentId: string;
  dirty: boolean;
  onAdd: () => void;
  onEdit: (test: AgentTest) => void;
}) {
  const t = useT(messages);
  const tc = useT(common);
  const tests = useAgentTests(props.agentId);
  const run = useRunAgentTests(props.agentId);
  const remove = useDeleteAgentTest(props.agentId);
  const [deleting, setDeleting] = useState<AgentTest | null>(null);

  const runAll = async () => {
    try {
      const result = await run.mutateAsync();
      const text = t("runResult", { passed: result.passed, failed: result.failed });
      if (result.failed > 0) toast.warning(text);
      else toast.success(text);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("savedTests")}</h2>
        </CardTitle>
        <CardDescription>{t("savedTestsHint")}</CardDescription>
        <CardAction className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={props.onAdd}>
            <Plus />
            {t("addTest")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={run.isPending || !tests.data?.length}
            onClick={() => void runAll()}
          >
            {run.isPending ? <Spinner /> : <Play />}
            {run.isPending ? t("running") : t("runAll")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        {props.dirty ? (
          <Alert>
            <AlertDescription>{t("savedTestsDirty")}</AlertDescription>
          </Alert>
        ) : null}
        {tests.isLoading ? (
          <LoadingState />
        ) : tests.isError ? (
          <ErrorState error={tests.error} onRetry={() => void tests.refetch()} />
        ) : !tests.data?.length ? (
          <EmptyState title={t("noTests")} description={t("noTestsText")} />
        ) : (
          <ul className="grid gap-3">
            {tests.data.map((test) => (
              <TestRow
                key={test.id}
                agentId={props.agentId}
                test={test}
                busy={run.isPending}
                onEdit={() => props.onEdit(test)}
                onDelete={() => setDeleting(test)}
              />
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("deleteTest")}
        description={deleting?.question}
        destructive
        confirmLabel={tc("delete")}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success(t("testDeleted"));
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </Card>
  );
}
