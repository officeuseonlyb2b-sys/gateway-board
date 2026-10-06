import { createFileRoute, redirect } from "@tanstack/react-router";
import { auth } from "@/lib/auth-mock";
import { dashboardPathForUser } from "@/lib/crm/access";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // On server, auth (localStorage) is unavailable — default to /login.
    // On client, check the current session.
    if (typeof window === "undefined") {
      throw redirect({ to: "/login" });
    }
    const user = await auth.ready();
    if (user) throw redirect({ to: dashboardPathForUser(user) });
    throw redirect({ to: "/login" });
  },
  component: () => null,
});
