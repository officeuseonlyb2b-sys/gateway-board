import { createFileRoute } from "@tanstack/react-router";
import QueryWorkspace from "@/pages/queries/query-workspace";

export const Route = createFileRoute("/_authenticated/queries/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  return <QueryWorkspace />;
}
