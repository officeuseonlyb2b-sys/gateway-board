import { createFileRoute } from "@tanstack/react-router";
import SalesTeam from "@/pages/sales-team";
export const Route = createFileRoute("/_authenticated/sales-team")({ component: SalesTeam });
