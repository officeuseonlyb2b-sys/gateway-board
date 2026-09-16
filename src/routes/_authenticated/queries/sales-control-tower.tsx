import { createFileRoute } from "@tanstack/react-router";
import SalesControlTower from "@/pages/queries/sales-control-tower";

export const Route = createFileRoute("/_authenticated/queries/sales-control-tower")({
  head: () => ({ meta: [{ title: "Sales Control Tower — MP Tourism Hub" }] }),
  component: SalesControlTower,
});
