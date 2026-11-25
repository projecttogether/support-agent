import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { Page } from "@/components/ui/page";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useT } from "@/i18n";
import { appRoute, requireAdmin } from "@/routes/app";
import { useKnowledgeSources } from "./api";
import { KnowledgePage } from "./knowledge-page";
import { messages } from "./messages";
import { SourceForm } from "./source-form";

const knowledgeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/knowledge",
  beforeLoad: requireAdmin,
  component: KnowledgePage,
});

const newSourceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/knowledge/new",
  beforeLoad: requireAdmin,
  component: () => <SourceForm source={null} />,
});

const sourceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/knowledge/$sourceId",
  beforeLoad: requireAdmin,
  component: function SourceRoute() {
    const t = useT(messages);
    const { sourceId } = sourceRoute.useParams();
    // There is no single-source endpoint; the list holds everything.
    const sources = useKnowledgeSources();
    if (sources.isLoading) return <LoadingState />;
    if (sources.isError) {
      return (
        <Page>
          <ErrorState error={sources.error} onRetry={() => void sources.refetch()} />
        </Page>
      );
    }
    const source = sources.data?.find((item) => item.id === sourceId);
    if (!source) {
      return (
        <Page>
          <EmptyState title={t("notFound")} />
        </Page>
      );
    }
    return <SourceForm key={source.id} source={source} />;
  },
});

export const routes: AnyRoute[] = [knowledgeRoute, newSourceRoute, sourceRoute];
