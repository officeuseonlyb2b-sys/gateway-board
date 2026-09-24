import { createFileRoute, redirect } from "@tanstack/react-router";
import { getCrmQuery } from "@/lib/crm/store";
export const Route = createFileRoute("/_authenticated/query/$queryId")({
  beforeLoad: ({ params }) => {
    const query = getCrmQuery(params.queryId);
    throw redirect({ to: "/queries/$id", params: { id: query?.id || params.queryId } });
  },
});
