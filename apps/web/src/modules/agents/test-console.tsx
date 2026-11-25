import { useId, useRef, useState, type FormEvent } from "react";
import { ImagePlus, MessageSquarePlus, Send, X } from "lucide-react";
import { toast } from "sonner";
import type { AgentInput, AgentTestInput, PreviewResult } from "@support-agent/shared/api/agents";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";
import { errorMessage } from "@/lib/api";
import { usePreview } from "./api";
import { IMAGE_TYPES, MAX_IMAGES, readImages, type ImageProblem, type TestImage } from "./images";
import { messages } from "./messages";
import { PreviewResultView } from "./test-result";

type ThreadMessage = { key: number; role: "person" | "agent"; text: string };

/** The test input that a result suggests: the question, and the behavior the agent showed. */
export function testFromResult(question: string, result: PreviewResult): AgentTestInput {
  const cited = result.sources.find((source) => result.citedRefs.includes(source.ref) && source.url);
  return {
    question,
    expectation: result.outcome === "silent" || result.outcome === "headline" ? result.outcome : "answer",
    expectedUrl: result.outcome === "answered" ? (cited?.url ?? null) : null,
  };
}

/**
 * Asks the agent a question as it is in the form (unsaved changes
 * included), with an optional earlier thread and images.
 */
export function TestConsole(props: {
  /** Null for a new agent: it is tested from the form alone. */
  agentId: string | null;
  getDraft: () => { ok: true; draft: AgentInput } | { ok: false; message: string };
  onInvalidDraft: () => void;
  /** Saved tests need a saved agent. */
  onSaveAsTest?: (input: AgentTestInput) => void;
}) {
  const t = useT(messages);
  const id = useId();
  const preview = usePreview(props.agentId);
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [mentioned, setMentioned] = useState(false);
  const [images, setImages] = useState<TestImage[]>([]);
  const [problems, setProblems] = useState<ImageProblem[]>([]);
  const nextKey = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const result = await readImages(Array.from(files), images.length);
    setImages((current) => [...current, ...result.images].slice(0, MAX_IMAGES));
    setProblems(result.problems);
  };

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    const draft = props.getDraft();
    if (!draft.ok) {
      toast.error(t("draftInvalid"));
      props.onInvalidDraft();
      return;
    }
    try {
      await preview.mutateAsync({
        question: question.trim(),
        thread: thread
          .filter((message) => message.text.trim() !== "")
          .map((message) => ({ role: message.role, text: message.text.trim() })),
        images: images.map((image) => ({ mediaType: image.mediaType, data: image.data })),
        mentioned,
        draft: draft.draft,
      });
      setAsked(question.trim());
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const problemText = (problem: ImageProblem) =>
    t(problem.problem === "type" ? "imageType" : problem.problem === "size" ? "imageSize" : "imageCount", {
      name: problem.name,
    });

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("consoleTitle")}</h2>
          </CardTitle>
          <CardDescription>{t("consoleHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-6" onSubmit={(event) => void ask(event)} noValidate>
            <FieldSet className="gap-3">
              <FieldLegend variant="label" className="mb-0">
                {t("thread")}
              </FieldLegend>
              <FieldDescription>{t("threadHint")}</FieldDescription>
              {thread.map((message, index) => (
                <div
                  key={message.key}
                  className="grid gap-2 rounded-md border p-3 sm:grid-cols-[9rem_1fr_auto]"
                >
                  <Field>
                    <FieldLabel htmlFor={`${id}-role-${message.key}`} className="sr-only">
                      {t("role")}
                    </FieldLabel>
                    <Select
                      value={message.role}
                      onValueChange={(role) =>
                        setThread((current) =>
                          current.map((item) =>
                            item.key === message.key
                              ? { ...item, role: role as ThreadMessage["role"] }
                              : item,
                          ),
                        )
                      }
                    >
                      <SelectTrigger id={`${id}-role-${message.key}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="person">{t("role_person")}</SelectItem>
                        <SelectItem value="agent">{t("role_agent")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${id}-text-${message.key}`} className="sr-only">
                      {t("messageText")}
                    </FieldLabel>
                    <Textarea
                      id={`${id}-text-${message.key}`}
                      rows={2}
                      maxLength={4000}
                      className="min-h-9"
                      value={message.text}
                      onChange={(event) =>
                        setThread((current) =>
                          current.map((item) =>
                            item.key === message.key ? { ...item, text: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("removeMessage", { number: index + 1 })}
                    onClick={() => setThread((current) => current.filter((item) => item.key !== message.key))}
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={thread.length >= 20}
                  onClick={() =>
                    setThread((current) => [
                      ...current,
                      {
                        key: nextKey.current++,
                        role: current.at(-1)?.role === "person" ? "agent" : "person",
                        text: "",
                      },
                    ])
                  }
                >
                  <MessageSquarePlus />
                  {t("addMessage")}
                </Button>
              </div>
            </FieldSet>

            <Field>
              <FieldLabel htmlFor={`${id}-question`}>{t("question")}</FieldLabel>
              <Textarea
                id={`${id}-question`}
                rows={3}
                maxLength={4000}
                required
                placeholder={t("questionPlaceholder")}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                id={`${id}-mentioned`}
                checked={mentioned}
                onCheckedChange={(checked) => setMentioned(checked === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor={`${id}-mentioned`}>{t("mentioned")}</FieldLabel>
                <FieldDescription>{t("mentionedHint")}</FieldDescription>
              </FieldContent>
            </Field>

            <FieldSet className="gap-3">
              <FieldLegend variant="label" className="mb-0">
                {t("images")}
              </FieldLegend>
              <FieldDescription id={`${id}-images-hint`}>{t("imagesHint")}</FieldDescription>
              {images.length ? (
                <ul className="flex flex-wrap gap-3">
                  {images.map((image, index) => (
                    <li key={`${image.name}-${index}`} className="relative">
                      <img
                        src={`data:${image.mediaType};base64,${image.data}`}
                        alt={image.name}
                        className="size-20 rounded-md border object-cover"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute -top-2 -right-2 size-6 rounded-full"
                        aria-label={t("removeImage", { name: image.name })}
                        onClick={() => setImages((current) => current.filter((_, item) => item !== index))}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <input
                ref={fileInput}
                type="file"
                accept={IMAGE_TYPES.join(",")}
                multiple
                hidden
                data-testid="image-input"
                onChange={(event) => {
                  void addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={images.length >= MAX_IMAGES}
                  aria-describedby={`${id}-images-hint`}
                  onClick={() => fileInput.current?.click()}
                >
                  <ImagePlus />
                  {t("addImages")}
                </Button>
              </div>
              {problems.length ? (
                <FieldError>
                  <ul className="grid gap-1">
                    {problems.map((problem, index) => (
                      <li key={index}>{problemText(problem)}</li>
                    ))}
                  </ul>
                </FieldError>
              ) : null}
            </FieldSet>

            <div>
              <Button type="submit" disabled={preview.isPending || question.trim() === ""}>
                {preview.isPending ? <Spinner /> : <Send />}
                {preview.isPending ? t("asking") : t("ask")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {preview.data ? (
        <PreviewResultView
          result={preview.data}
          onSaveAsTest={
            props.onSaveAsTest
              ? () => props.onSaveAsTest?.(testFromResult(asked || question.trim(), preview.data))
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
