import { createFileRoute } from "@tanstack/react-router";
import SalesReview from "@/pages/queries/sales-review";
export const Route = createFileRoute("/_authenticated/queries/quotation-review")({
  component: () => <SalesReview mode="quotation" />,
});
