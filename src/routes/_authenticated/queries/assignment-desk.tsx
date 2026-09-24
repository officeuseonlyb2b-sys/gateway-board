import { createFileRoute } from "@tanstack/react-router";
import AssignmentDesk from "@/pages/queries/assignment-desk";

export const Route = createFileRoute("/_authenticated/queries/assignment-desk")({
  component: AssignmentDesk,
});
