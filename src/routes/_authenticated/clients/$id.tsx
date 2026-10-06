import { createFileRoute } from "@tanstack/react-router";
import Relationship360 from "@/pages/relationship-360";
export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: () => <Relationship360 type="client" />,
});
