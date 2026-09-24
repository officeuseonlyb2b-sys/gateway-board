import { createFileRoute } from "@tanstack/react-router";
import QueryDashboard from "@/pages/queries/query-dashboard";

export const Route = createFileRoute(
  "/_authenticated/queries/dashboard",
)({
  component: QueryDashboard,
});