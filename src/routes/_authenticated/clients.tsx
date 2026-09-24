import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import ClientsPage from "@/pages/clients";

export const Route = createFileRoute("/_authenticated/clients")({ component: ClientsRoute });

function ClientsRoute() {
  const { id } = useParams({ strict: false }) as { id?: string };
  return id ? <Outlet /> : <ClientsPage />;
}
