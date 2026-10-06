import { createFileRoute } from "@tanstack/react-router";
import SalesReview from "@/pages/queries/sales-review";
export const Route = createFileRoute("/_authenticated/queries/assisted")({
  component: () => <SalesReview mode="assistance" />,
});
