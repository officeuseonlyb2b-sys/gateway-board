import { createFileRoute } from "@tanstack/react-router";
import OperationsHandoffs from "@/pages/operations-handoffs";
export const Route = createFileRoute("/_authenticated/operations-handoffs")({
  component: OperationsHandoffs,
});
