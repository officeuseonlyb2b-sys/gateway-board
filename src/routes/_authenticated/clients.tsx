import { createFileRoute } from "@tanstack/react-router";
import ClientsPage from "@/pages/clients";
export const Route = createFileRoute("/_authenticated/clients")({ component: ClientsPage });
