import { Fragment } from "react";
import { parseMrkdwn, type Inline } from "@/lib/mrkdwn";
import { cn } from "@/components/ui/utils";

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.text}</Fragment>;
      case "bold":
        return (
          <strong key={index} className="font-semibold">
            <InlineNodes nodes={node.children} />
          </strong>
        );
      case "italic":
        return (
          <em key={index}>
            <InlineNodes nodes={node.children} />
          </em>
        );
      case "strike":
        return (
          <s key={index}>
            <InlineNodes nodes={node.children} />
          </s>
        );
      case "code":
        return (
          <code key={index} className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">
            {node.text}
          </code>
        );
      case "link":
        return (
          <a
            key={index}
            href={node.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary break-words underline underline-offset-2"
          >
            {node.label}
          </a>
        );
      case "mention":
        return (
          <span key={index} className="rounded bg-sky-500/10 px-0.5 text-sky-700 dark:text-sky-300">
            {node.text}
          </span>
        );
    }
  });
}

function Lines({ lines }: { lines: Inline[][] }) {
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 ? <br /> : null}
      <InlineNodes nodes={line} />
    </Fragment>
  ));
}

/** A Slack message (mrkdwn) shown about as Slack shows it. */
export function SlackMessage({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn("grid gap-2 text-sm leading-relaxed break-words", className)}
      data-testid="slack-message"
    >
      {parseMrkdwn(text).map((block, index) => {
        switch (block.type) {
          case "paragraph":
            return (
              <p key={index}>
                <Lines lines={block.lines} />
              </p>
            );
          case "quote":
            return (
              <blockquote key={index} className="border-muted-foreground/40 border-l-4 pl-3">
                <Lines lines={block.lines} />
              </blockquote>
            );
          case "code":
            return (
              <pre key={index} className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-xs">
                <code>{block.text}</code>
              </pre>
            );
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List
                key={index}
                className={cn("grid gap-1 pl-5", block.ordered ? "list-decimal" : "list-disc")}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <InlineNodes nodes={item} />
                  </li>
                ))}
              </List>
            );
          }
        }
      })}
    </div>
  );
}
