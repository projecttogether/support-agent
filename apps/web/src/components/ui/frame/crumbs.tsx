import { Fragment } from "react";
import { ChevronLeft } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../breadcrumb";
import { Button } from "../button";
import { useT } from "@/i18n";
import type { FrameLink } from "../app-frame";
import { frameMessages } from "./messages";

/** One step of the path to the current page; the last one is the page itself. */
export type Crumb = { label: string; href?: string };

/** At most three items: deeper paths keep the first step and the last two, with "…" between. */
export function visibleCrumbs(crumbs: Crumb[]): (Crumb | "more")[] {
  return crumbs.length > 3 ? [crumbs[0]!, "more", ...crumbs.slice(-2)] : crumbs;
}

/**
 * Where the page sits in the app, in the header: short, cut when long (the
 * full label shows on hover), the current page as text. On phones only the
 * way back: "‹ parent".
 */
export function FrameCrumbs(props: { crumbs: Crumb[]; link: FrameLink; compact: boolean }) {
  const t = useT(frameMessages);
  const { crumbs, compact } = props;
  const Link = props.link;
  if (crumbs.length === 0) return null;
  const parent = crumbs.length > 1 ? crumbs.at(-2) : undefined;

  if (compact && parent?.href) {
    return (
      <Button variant="ghost" size="sm" asChild className="text-muted-foreground -ml-2 min-w-0 gap-1 px-2">
        <Link href={parent.href} aria-label={t("back", { page: parent.label })}>
          <ChevronLeft aria-hidden="true" />
          <span className="truncate">{parent.label}</span>
        </Link>
      </Button>
    );
  }

  const shown = visibleCrumbs(crumbs);
  return (
    <Breadcrumb aria-label={t("breadcrumbs")} className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {shown.map((crumb, index) => {
          const last = index === shown.length - 1;
          return (
            <Fragment key={crumb === "more" ? "more" : `${index}-${crumb.label}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem className="min-w-0">
                {crumb === "more" ? (
                  <BreadcrumbEllipsis className="size-5" />
                ) : last ? (
                  <BreadcrumbPage className="block max-w-64 truncate" title={crumb.label}>
                    {crumb.label}
                  </BreadcrumbPage>
                ) : !crumb.href ? (
                  // A step without a page of its own (e.g. a group): text, not "the current page".
                  <span className="block max-w-40 truncate" title={crumb.label}>
                    {crumb.label}
                  </span>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href} className="block max-w-40 truncate" title={crumb.label}>
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
