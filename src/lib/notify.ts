// Global notification helper. Thin wrapper on top of notifications-store.
// Any component can import and call `notify.success(...)` from anywhere.
import {
  addNotification as storeAdd,
  type NotifCategory,
  type NotifKind,
} from "@/lib/notifications-store";

export type NotifType = "success" | "warning" | "info" | "alert";

const TYPE_TO_KIND: Record<NotifType, NotifKind> = {
  success: "success",
  warning: "warning",
  info: "info",
  alert: "error",
};

function push(
  type: NotifType,
  title: string,
  message: string,
  category: NotifCategory = "system",
  href?: string,
) {
  storeAdd({ kind: TYPE_TO_KIND[type], category, title, message, href });
}

export const notify = {
  success: (title: string, message: string, href?: string, category: NotifCategory = "system") =>
    push("success", title, message, category, href),
  info: (title: string, message: string, href?: string, category: NotifCategory = "system") =>
    push("info", title, message, category, href),
  warning: (title: string, message: string, href?: string, category: NotifCategory = "system") =>
    push("warning", title, message, category, href),
  alert: (title: string, message: string, href?: string, category: NotifCategory = "system") =>
    push("alert", title, message, category, href),
};

/** Seed demo notifications on very first load (once ever, gated by localStorage). */
export function seedIfEmpty() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem("mp_notif_seeded")) return;
  localStorage.setItem("mp_notif_seeded", "1");
  notify.info(
    "Welcome to MP Tourism Hub",
    "Your operations dashboard is ready. Start by adding hotels or creating a quotation.",
  );
  notify.warning(
    "Rate Plans Need Attention",
    "Some rate plans may expire soon. Review and update them for accurate costing.",
    "/hotels",
    "rate_expiring",
  );
  notify.success("System Ready", "All modules are configured and ready to use.");
}

/** Check expiring rate plans once per session. */
export function checkExpiringRatesOnce(ratePlans: { validity_end: string }[]) {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem("mp_expiry_checked")) return;
  sessionStorage.setItem("mp_expiry_checked", "1");
  const now = Date.now();
  const in30 = now + 30 * 24 * 60 * 60 * 1000;
  const count = ratePlans.filter((p) => {
    const t = new Date(p.validity_end).getTime();
    return !isNaN(t) && t >= now && t <= in30;
  }).length;
  if (count > 0) {
    notify.warning(
      "Rate Plans Expiring Soon",
      `${count} rate plan(s) are expiring within 30 days. Review and update them.`,
      "/hotels",
      "rate_expiring",
    );
  }
}
