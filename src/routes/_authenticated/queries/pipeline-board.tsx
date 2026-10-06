import { createFileRoute } from "@tanstack/react-router";
import PipelineBoard from "@/pages/queries/pipeline-board";

export const Route = createFileRoute(
  "/_authenticated/queries/pipeline-board",
)({
  component: PipelineBoard,
});