import { createFileRoute } from "@tanstack/react-router";
import { WizardPage } from "../costing";

export const Route = createFileRoute("/_authenticated/brochures/new")({
  head: () => ({ meta: [{ title: "New Brochure Costing — MP Tourism Hub" }] }),
  validateSearch: (search: Record<string, unknown>): { id?: string; programId?: string } => ({
    id: typeof search.id === "string" ? search.id : undefined,
    programId: typeof search.programId === "string" ? search.programId : undefined,
  }),
  component: () => <WizardPage workflowMode="brochure" />,
});
