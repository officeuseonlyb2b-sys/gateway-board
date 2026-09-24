import { createFileRoute } from "@tanstack/react-router";
import Program360 from "@/pages/program-360";

export const Route = createFileRoute("/_authenticated/routing-programs/$id")({
  component: Program360,
});
