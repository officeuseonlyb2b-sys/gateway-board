import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { ActiveWizardBanner } from "@/components/ActiveWizardBanner";
import { auth, useAuthLifecycle } from "@/lib/auth-mock";
import { Button } from "@/components/ui/button";
import { canAccessPath, dashboardPathForUser, useAccessProfile } from "@/lib/crm/access";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const user = await auth.ready();
    if (!user && auth.lifecycle().sessionStatus === "signed_out") {
      auth.logRedirect("authenticated route; Supabase confirmed signed out");
      throw redirect({ to: "/login" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const authState = useAuthLifecycle();
  const user = authState.user;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const access = useAccessProfile();
  const hasSupabaseConfig = Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );

  useEffect(() => {
    if (!user && authState.initialized && authState.sessionStatus === "signed_out") {
      auth.logRedirect("authenticated layout; Supabase confirmed signed out");
      navigate({ to: "/login" });
    }
  }, [authState.initialized, authState.sessionStatus, user, navigate]);

  const userId = user?.id;
  const isSuperAdmin = access.canManageCostingMasters;
  const canReadMasters = access.canReadCostingMasters;
  const [masterSync, setMasterSync] = useState({ status: "idle", message: "" });

  // Shared master data (hotels, rates, guides, entrances, activities, meals,
  // transport, other services): cloud record + realtime, account-based.
  useEffect(() => {
    if (!userId || authState.profileStatus !== "ready" || !hasSupabaseConfig) return;
    let disposed = false;
    let stopCrm: (() => void) | null = null;
    let stopMasters: (() => void) | null = null;
    let stopDestinations: (() => void) | null = null;
    let unsubscribeMaster: (() => void) | null = null;
    const startBackgroundHydration = async () => {
      // These imports evaluate the large CRM/master stores. Keep them after the
      // first authenticated paint so local cache parsing cannot delay access.
      const crm = await import("@/lib/crm/crm-remote");
      if (disposed) return;
      stopCrm = crm.startCrmSync(true);
      if (!canReadMasters) return;
      const masters = await import("@/lib/masters-remote");
      if (disposed) return;
      const updateMasterState = () => setMasterSync(masters.getMasterSyncState());
      unsubscribeMaster = masters.subscribeMasterSync(updateMasterState);
      updateMasterState();
      stopMasters = masters.startMastersSync({ readOnly: !isSuperAdmin });
      masters.afterMastersReady(() => {
        if (disposed) return;
        void import("@/lib/destinations-remote").then(({ startDestinationsSync }) => {
          if (!disposed) stopDestinations = startDestinationsSync({ readOnly: !isSuperAdmin });
        });
      });
      if (isSuperAdmin) {
        const [{ db }, notifications] = await Promise.all([
          import("@/lib/mock-store"),
          import("@/lib/notify"),
        ]);
        if (!disposed) {
          notifications.seedIfEmpty();
          notifications.checkExpiringRatesOnce(db.get().rate_plans);
        }
      }
    };
    const frame = window.requestAnimationFrame(() => {
      auth.markShellRendered();
      window.setTimeout(() => void startBackgroundHydration(), 0);
    });
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      unsubscribeMaster?.();
      stopDestinations?.();
      stopCrm?.();
      stopMasters?.();
    };
  }, [userId, authState.profileStatus, hasSupabaseConfig, canReadMasters, isSuperAdmin]);

  useEffect(() => {
    if (!user || !access.accountReady || canAccessPath(access, pathname)) return;
    navigate({ to: dashboardPathForUser(user) });
  }, [access, navigate, pathname, user]);

  if (!authState.initialized || authState.sessionStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-sm text-slate-600">
        Restoring your session…
      </div>
    );
  }
  if (!user && authState.sessionStatus === "signed_out") return null;
  if (user && authState.profileStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-sm text-slate-600">
        Verifying your employee access…
      </div>
    );
  }
  if (user && authState.profileStatus === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold">Employee verification temporarily unavailable</h1>
          <p role="alert" className="mt-3 text-sm text-slate-600">
            {authState.profileError || "Employee access details are temporarily unavailable."}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={() => void auth.revalidate()}>Retry access check</Button>
            <Button variant="outline" onClick={() => void auth.signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }
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
          {masterSync.status === "denied" ||
          masterSync.status === "error" ||
          masterSync.status === "empty" ? (
            <div
              role="alert"
              className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950"
            >
              {masterSync.status === "denied"
                ? "Access denied while reading shared costing masters."
                : masterSync.status === "error"
                  ? "Costing master data could not be loaded."
                  : "No shared costing master record is visible."}{" "}
              {masterSync.message}
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
