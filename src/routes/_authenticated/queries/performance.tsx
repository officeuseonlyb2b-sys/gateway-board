import { createFileRoute } from "@tanstack/react-router";
import PerformanceReview from "@/pages/queries/performance";
export const Route = createFileRoute("/_authenticated/queries/performance")({
  component: PerformanceReview,
});
