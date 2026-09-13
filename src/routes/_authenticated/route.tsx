import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
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

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!auth.current()) throw redirect({ to: "/login" });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const user = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!user) navigate({ to: "/login" });
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return;
    seedIfEmpty();
    checkExpiringRatesOnce(db.get().rate_plans);
  }, [user]);

  // Shared master data (hotels, rates, guides, entrances, activities, meals,
  // transport, other services): cloud record + realtime, account-based.
  useEffect(() => {
    if (!user) return;
    const stopMasters = startMastersSync();
    const stopCrm = startCrmSync();
    let stopDestinations: (() => void) | null = null;
    // Destinations reconcile only after the shared master data is in place,
    // so a local-only cache can never delete cloud tours (or their pricing).
    afterMastersReady(() => {
      stopDestinations = startDestinationsSync();
    });
    return () => {
      stopDestinations?.();
      stopCrm();
      stopMasters();
    };
  }, [user]);

  if (!user) return null;

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        {/* Re-mount per-path so the "Hide" state resets on navigation */}
        <ActiveWizardBanner key={pathname} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
