import type { ReactNode } from "react";
import { cn } from "./utils";

/** The header of a page: title, optional description, and actions on the right. */
export function PageHeader(props: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", props.className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{props.title}</h1>
        {props.description ? <p className="text-muted-foreground text-sm">{props.description}</p> : null}
      </div>
      {props.actions ? <div className="flex flex-wrap items-center gap-2">{props.actions}</div> : null}
    </div>
  );
}

/** The content area of a page: centred, at most 80 rem wide unless `wide`. */
export function Page(props: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 p-4 md:p-6",
        props.wide ? "max-w-none" : "max-w-7xl",
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}
