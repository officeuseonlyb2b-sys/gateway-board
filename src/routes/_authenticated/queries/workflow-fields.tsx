import { createFileRoute } from "@tanstack/react-router";
import WorkflowFields from "@/pages/queries/workflow-fields";

export const Route = createFileRoute(
  "/_authenticated/queries/workflow-fields",
)({
  component: WorkflowFields,
});