import type { ReactNode } from "react";
import { AlertCircle, Inbox } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./empty";
import { Spinner } from "./spinner";
import { Button } from "./button";
import { useT } from "@/i18n";
import { common, errorMessage } from "./messages";

export function LoadingState({ label }: { label?: string }) {
  const t = useT(common);
  return (
    <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm" role="status">
      <Spinner />
      <span>{label ?? t("loading")}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT(common);
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertCircle />
        </EmptyMedia>
        <EmptyTitle>{t("error")}</EmptyTitle>
        <EmptyDescription>{errorMessage(error)}</EmptyDescription>
      </EmptyHeader>
      {onRetry ? (
        <EmptyContent>
          <Button variant="outline" onClick={onRetry}>
            {t("retry")}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

export function EmptyState(props: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">{props.icon ?? <Inbox />}</EmptyMedia>
        <EmptyTitle>{props.title}</EmptyTitle>
        {props.description ? <EmptyDescription>{props.description}</EmptyDescription> : null}
      </EmptyHeader>
      {props.action ? <EmptyContent>{props.action}</EmptyContent> : null}
    </Empty>
  );
}
