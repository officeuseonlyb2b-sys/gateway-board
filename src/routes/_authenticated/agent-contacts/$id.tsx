import { createFileRoute } from "@tanstack/react-router";
import AgentContact360 from "@/pages/agent-contact-360";

export const Route = createFileRoute("/_authenticated/agent-contacts/$id")({
  component: AgentContact360,
});
