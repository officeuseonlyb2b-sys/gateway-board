import { createFileRoute } from "@tanstack/react-router";
import { DraftsPage } from "../drafts";

export const Route = createFileRoute("/_authenticated/brochures/drafts")({
  head: () => ({ meta: [{ title: "Draft Brochures — MP Tourism Hub" }] }),
  component: () => <DraftsPage workspace="brochure" />,
});
