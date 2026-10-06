import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import ProgramsPage from "@/pages/programs";

export const Route = createFileRoute("/_authenticated/routing-programs")({
  head: () => ({ meta: [{ title: "Routing & Programs — MP Tourism Hub" }] }),
  component: ProgramsRoute,
});

function ProgramsRoute() {
  const { id } = useParams({ strict: false }) as { id?: string };
  return id ? <Outlet /> : <ProgramsPage />;
}
