import { createFileRoute } from "@tanstack/react-router";
import QueryWorkspace from "@/pages/queries/query-workspace";
import FollowUpDesk from "@/pages/queries/follow-up-desk"; // Apna FollowUpDesk page import karein

export const Route = createFileRoute(
  "/_authenticated/queries/$id",
)({
  component: RouteComponent,
});

function RouteComponent() {
  // URL se ID nikaalna
  const { id } = Route.useParams();

  // Agar URL "follow-up-desk" hai, toh FollowUpDesk dikhao
  if (id === "follow-up-desk") {
    return <FollowUpDesk />;
  }

  // Warna default QueryWorkspace dikhao
  return <QueryWorkspace />;
}