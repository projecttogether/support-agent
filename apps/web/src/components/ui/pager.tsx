import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
import { useT } from "@/i18n";
import { common } from "./messages";

/** Back/next for a paged list, with the page number and the total count. */
export function Pager(props: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const tc = useT(common);
  const pages = Math.max(1, Math.ceil(props.total / props.pageSize));
  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-2"
      aria-label={tc("page", { page: props.page, pages })}
    >
      <span className="text-muted-foreground text-sm">{tc("total", { count: props.total })}</span>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={props.page <= 1}
            onClick={() => props.onPage(props.page - 1)}
          >
            <ChevronLeft />
            {tc("back")}
          </Button>
          <span className="text-muted-foreground text-sm">{tc("page", { page: props.page, pages })}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={props.page >= pages}
            onClick={() => props.onPage(props.page + 1)}
          >
            {tc("next")}
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
