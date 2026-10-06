import { createFileRoute } from "@tanstack/react-router";
import MySalesDesk from "@/pages/queries/my-sales-desk";

export const Route = createFileRoute("/_authenticated/queries/my-sales-desk")({
  head: () => ({ meta: [{ title: "My Sales Desk — MP Tourism Hub" }] }),
  component: MySalesDesk,
});
