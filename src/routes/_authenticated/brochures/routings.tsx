import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/brochures/routings")({
  beforeLoad: () => {
    throw redirect({ to: "/brochures/itinerary-master" });
  },
});
