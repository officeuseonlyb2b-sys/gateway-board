import { createFileRoute } from "@tanstack/react-router";
import FollowUpDeskPage from "@/pages/queries/follow-up-desk";

export const Route = createFileRoute("/_authenticated/queries/follow-up-desk")({
  head: () => ({
    meta: [
      { title: "Follow-up Control Desk — MP Tourism Hub" },
      { name: "description", content: "Track and action pending query follow-ups across the sales team." },
      { property: "og:title", content: "Follow-up Control Desk — MP Tourism Hub" },
      { property: "og:description", content: "Track and action pending query follow-ups across the sales team." },
    ],
  }),
  component: FollowUpDeskPage,
});
