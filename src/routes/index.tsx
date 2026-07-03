import { createFileRoute, redirect } from "@tanstack/react-router";
import { auth } from "@/lib/auth-mock";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // On server, auth (localStorage) is unavailable — default to /login.
    // On client, check the current session.
    if (typeof window === "undefined") {
      throw redirect({ to: "/login" });
    }
    if (auth.current()) throw redirect({ to: "/dashboard" });
    throw redirect({ to: "/login" });
  },
  component: () => null,
});
