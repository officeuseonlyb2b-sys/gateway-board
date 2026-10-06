import { createFileRoute } from "@tanstack/react-router";
import QueryTracker from "@/pages/queries/query-tracker";

export const Route = createFileRoute(
  "/_authenticated/queries/query-tracker",
)({
  component: QueryTracker,
});