import { createFileRoute } from "@tanstack/react-router";
import AdminConsole from "@/pages/admin-console";
export const Route = createFileRoute("/_authenticated/admin-console")({ component: AdminConsole });
