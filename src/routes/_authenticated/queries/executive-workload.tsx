import { createFileRoute } from "@tanstack/react-router";
import ExecutiveWorkload from "@/pages/queries/executive-workload";
export const Route = createFileRoute("/_authenticated/queries/executive-workload")({
  component: ExecutiveWorkload,
});
