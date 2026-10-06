import { createFileRoute } from "@tanstack/react-router";
import QueryAnalytics from "@/pages/queries/query-analytics";

export const Route = createFileRoute(
  "/_authenticated/queries/analytics",
)({
  component: QueryAnalytics,
});