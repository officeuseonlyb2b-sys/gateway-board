import { createFileRoute } from "@tanstack/react-router";
import TeamAccess from "@/pages/team-access";
export const Route = createFileRoute("/_authenticated/team-access")({ component: TeamAccess });
