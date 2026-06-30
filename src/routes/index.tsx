import { createFileRoute, redirect } from "@tanstack/react-router";
import { auth } from "@/lib/auth-mock";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (auth.current()) throw redirect({ to: "/dashboard" });
    throw redirect({ to: "/login" });
  },
  component: () => null,
});
