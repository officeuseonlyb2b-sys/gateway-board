import { createFileRoute, redirect } from "@tanstack/react-router";
import { auth } from "@/lib/auth-mock";
import { dashboardPathForEmail } from "@/lib/crm/access";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // On server, auth (localStorage) is unavailable — default to /login.
    // On client, check the current session.
    if (typeof window === "undefined") {
      throw redirect({ to: "/login" });
    }
    const user = auth.current();
    if (user) throw redirect({ to: dashboardPathForEmail(user.email) });
    throw redirect({ to: "/login" });
  },
  component: () => null,
});
