import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { auth, useAuthLifecycle } from "@/lib/auth-mock";
import { dashboardPathForUser } from "@/lib/crm/access";

export const Route = createFileRoute("/")({
  ssr: false,
  component: IndexPage,
});

function IndexPage() {
  const authState = useAuthLifecycle();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authState.initialized) return;
    if (authState.sessionStatus === "signed_out") {
      auth.logRedirect("root route; Supabase confirmed signed out");
      navigate({ to: "/login" });
      return;
    }
    if (authState.user && authState.profileStatus === "ready") {
      auth.logRedirect("root route; session and employee profile ready");
      navigate({ to: dashboardPathForUser(authState.user) });
    }
  }, [authState, navigate]);

  if (authState.profileStatus === "error" || authState.profileStatus === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold">
            {authState.profileStatus === "denied"
              ? "Employee access is disabled"
              : "Employee verification temporarily unavailable"}
          </h1>
          <p role="alert" className="mt-3 text-sm text-slate-600">
            {authState.profileError || "Employee access details could not be verified."}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            {authState.profileStatus !== "denied" && (
              <Button onClick={() => void auth.revalidate()}>Retry access check</Button>
            )}
            <Button variant="outline" onClick={() => void auth.signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-sm text-slate-600">
      {!authState.initialized || authState.profileStatus === "loading"
        ? "Restoring your session…"
        : "Opening your workspace…"}
    </div>
  );
}
