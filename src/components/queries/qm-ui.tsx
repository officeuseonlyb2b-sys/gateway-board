// Shared presentational + state bits for the Query Management module.
import { useSyncExternalStore, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { FinalLeadStatus } from "@/lib/queries/types";
import { defaultReportingContext, type ReportingContext } from "@/lib/queries/metrics";

/* ---------------- reporting context (shared across all Query screens) ------- */

const KEY = "mp_qm_reporting_context";
const listeners = new Set<() => void>();
let ctx: ReportingContext = { ...defaultReportingContext };
let inited = false;

function load() {
  inited = true;
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) ctx = { ...defaultReportingContext, ...JSON.parse(raw) };
  } catch { /* ignore */ }
}

export function setReportingContext(patch: Partial<ReportingContext>) {
  ctx = { ...ctx, ...patch };
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(ctx));
  listeners.forEach((l) => l());
}

export function useReportingContext(): ReportingContext {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => { if (!inited) load(); return ctx; },
    () => defaultReportingContext,
  );
}

/* ---------------- formatting ---------------- */

export const inr = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");

export function inrCompact(n: number): string {
  const v = Math.round(n || 0);
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)} Cr`;
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(2)} L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(1)}K`;
  return `₹${v}`;
}

export const fmtDay = (iso: string) =>
  iso ? new Date(iso.length > 10 ? iso : iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

export const fmtDateTime = (iso: string) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }) : "—";

/* ---------------- status ---------------- */

export const STATUS_TONE: Record<FinalLeadStatus, string> = {
  New: "bg-slate-100 text-slate-700 border-slate-200",
  Working: "bg-indigo-100 text-indigo-700 border-indigo-200",
  Nurturing: "bg-amber-100 text-amber-800 border-amber-200",
  WIN: "bg-emerald-100 text-emerald-700 border-emerald-200",
  LOST: "bg-rose-100 text-rose-700 border-rose-200",
};

export const STATUS_BAR: Record<FinalLeadStatus, string> = {
  New: "bg-slate-400",
  Working: "bg-indigo-500",
  Nurturing: "bg-amber-500",
  WIN: "bg-emerald-500",
  LOST: "bg-rose-500",
};

export function StatusPill({ status, className }: { status: FinalLeadStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap", STATUS_TONE[status], className)}>
      {status}
    </span>
  );
}

export function FlagChip({ label }: { label: string }) {
  const tone =
    label === "Manager Escalation" ? "bg-rose-50 text-rose-700 border-rose-200"
      : label === "High Value" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : label === "Travel Within 30 Days" ? "bg-sky-50 text-sky-700 border-sky-200"
      : label === "No Follow-up" ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-muted text-muted-foreground border-border";
  return <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium", tone)}>{label}</span>;
}

/* ---------------- layout helpers ---------------- */

export function KpiCard({
  label, value, sub, icon, tone = "default",
}: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: "default" | "danger" | "success" }) {
  return (
    <Card className="p-4 rounded-xl shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn(
            "mt-1.5 text-2xl font-bold tabular-nums truncate",
            tone === "danger" && "text-destructive",
            tone === "success" && "text-emerald-600",
          )}>{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground truncate">{sub}</p>}
        </div>
        {icon && <div className="rounded-lg bg-primary/10 text-primary p-2 shrink-0">{icon}</div>}
      </div>
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export const selectCls =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Financial Year / Query Month / Received period — drives every Query screen. */
export function ReportingFilters({ fys, months }: { fys: string[]; months: string[] }) {
  const c = useReportingContext();
  const monthLabel = (k: string) =>
    new Date(k + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={selectCls} value={c.fy} onChange={(e) => setReportingContext({ fy: e.target.value })}>
        <option value="all">All Financial Years</option>
        {fys.map((f) => <option key={f} value={f}>FY {f}</option>)}
      </select>
      <select className={selectCls} value={c.queryMonth} onChange={(e) => setReportingContext({ queryMonth: e.target.value })}>
        <option value="all">All Query Months</option>
        {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>
      <select className={selectCls} value={c.receivedPeriod} onChange={(e) => setReportingContext({ receivedPeriod: e.target.value })}>
        <option value="all">Received: Any time</option>
        <option value="7d">Received: Last 7 days</option>
        <option value="30d">Received: Last 30 days</option>
        <option value="90d">Received: Last 90 days</option>
        <option value="fy">Received: Last 12 months</option>
      </select>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-14 text-center text-sm text-muted-foreground">{message}</div>
  );
}
