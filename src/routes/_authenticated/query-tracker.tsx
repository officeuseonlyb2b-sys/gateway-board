import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/query-tracker")({
  beforeLoad: () => {
    throw redirect({ to: "/queries/query-tracker" });
  },
});
