import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/manager-dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/queries/dashboard" });
  },
});
