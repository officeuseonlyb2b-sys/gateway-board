import { createFileRoute } from "@tanstack/react-router";
import DataReadiness from "@/pages/data-readiness";
export const Route = createFileRoute("/_authenticated/data-readiness")({
  component: DataReadiness,
});
