import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { ActiveWizardBanner } from "@/components/ActiveWizardBanner";
import { auth, useAuth } from "@/lib/auth-mock";
import { db } from "@/lib/mock-store";
import { seedIfEmpty, checkExpiringRatesOnce } from "@/lib/notify";
import { startDestinationsSync } from "@/lib/destinations-remote";
import { startMastersSync, afterMastersReady } from "@/lib/masters-remote";
import { startCrmSync } from "@/lib/crm/crm-remote";
import { Button } from "@/components/ui/button";
import { canAccessPath, dashboardPathForUser, useAccessProfile } from "@/lib/crm/access";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    if (!(await auth.ready())) throw redirect({ to: "/login" });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const user = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const access = useAccessProfile();
  const hasSupabaseConfig = Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );

  useEffect(() => {
    if (!user) navigate({ to: "/login" });
  }, [user, navigate]);

  const userId = user?.id;
  const isSuperAdmin = access.accountReady && access.role === "Super Admin";

  useEffect(() => {
    if (!isSuperAdmin) return;
    seedIfEmpty();
    checkExpiringRatesOnce(db.get().rate_plans);
  }, [isSuperAdmin]);

  // Shared master data (hotels, rates, guides, entrances, activities, meals,
  // transport, other services): cloud record + realtime, account-based.
  useEffect(() => {
    if (!userId || !hasSupabaseConfig) return;
    const stopCrm = startCrmSync(true);
    if (!isSuperAdmin) return stopCrm;
    const stopMasters = startMastersSync();
    let disposed = false;
    let stopDestinations: (() => void) | null = null;
    // Destinations reconcile only after the shared master data is in place,
    // so a local-only cache can never delete cloud tours (or their pricing).
    afterMastersReady(() => {
      if (!disposed) stopDestinations = startDestinationsSync();
    });
    return () => {
      disposed = true;
      stopDestinations?.();
      stopCrm();
      stopMasters();
    };
  }, [userId, hasSupabaseConfig, isSuperAdmin]);

  useEffect(() => {
    if (!user || !access.accountReady || canAccessPath(access, pathname)) return;
    navigate({ to: dashboardPathForUser(user) });
  }, [access, navigate, pathname, user]);

  if (!user) return null;
  if (!access.accountReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">Account not linked / Contact Administrator</h1>
          <p className="mt-3 text-sm text-slate-500">
            This login is not mapped to an active employee record, or the account is suspended,
            disabled or exited. Ask an authorised administrator to review Team & Access.
          </p>
          <Button className="mt-6" onClick={() => auth.signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }
  if (!canAccessPath(access, pathname)) return null;

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        {/* Re-mount per-path so the "Hide" state resets on navigation */}
        {isSuperAdmin && <ActiveWizardBanner key={pathname} />}
        <main className="min-w-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
