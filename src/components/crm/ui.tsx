// Shared presentational bits for the CRM / Query Tracking module.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Stage } from "@/lib/crm/types";

export const inr = (n: number) => "₹ " + Math.round(n).toLocaleString("en-IN");

export const paxRangeLabel = (query: { pax: number; min_pax?: number; max_pax?: number }) => {
  const minimum = query.min_pax || query.pax || 0;
  const maximum = query.max_pax || query.pax || 0;
  if (!minimum && !maximum) return "Pax pending";
  if (minimum === maximum) return `${minimum} pax`;
  return `${minimum || maximum}–${maximum || minimum} pax`;
};

export const fmtDate = (iso: string) =>
  iso
    ? new Date(iso.length > 10 ? iso : iso + "T00:00:00").toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

export const fmtShort = (iso: string) =>
  iso
    ? new Date(iso.length > 10 ? iso : iso + "T00:00:00").toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      })
    : "—";

export const fmtTime = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "—";

const STAGE_STYLES: Record<Stage, string> = {
  New: "bg-destructive/10 text-destructive",
  "Requirement Review": "bg-purple-100 text-purple-700",
  Costing: "bg-amber-100 text-amber-700",
  "Quotation Sent": "bg-emerald-100 text-emerald-700",
  "Follow-up": "bg-sky-100 text-sky-700",
  Nurturing: "bg-violet-100 text-violet-700",
  Won: "bg-emerald-600/15 text-emerald-700",
  Lost: "bg-rose-100 text-rose-700",
};

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap",
        STAGE_STYLES[stage],
        className,
      )}
    >
      {stage}
    </span>
  );
}

export const STAGE_BAR: Record<string, string> = {
  New: "bg-sky-500",
  "Requirement Review": "bg-indigo-500",
  Costing: "bg-amber-500",
  "Quotation Sent": "bg-emerald-500",
  "Follow-up": "bg-violet-500",
  Nurturing: "bg-teal-500",
  Won: "bg-emerald-600",
  Lost: "bg-rose-500",
};

export type Tone = "blue" | "orange" | "green" | "purple" | "red" | "slate";
const TONES: Record<Tone, string> = {
  blue: "bg-sky-100 text-sky-700",
  orange: "bg-amber-100 text-amber-700",
  green: "bg-emerald-100 text-emerald-700",
  purple: "bg-violet-100 text-violet-700",
  red: "bg-rose-100 text-rose-700",
  slate: "bg-slate-100 text-slate-700",
};

export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "blue",
  trend,
  valueClass,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  trend?: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      {icon && (
        <div
          className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
            TONES[tone],
          )}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-xs text-foreground/60 font-medium truncate">{label}</div>
        <div className={cn("text-2xl font-bold leading-tight", valueClass)}>{value}</div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
          {hint}
          {trend}
        </div>
      </div>
    </div>
  );
}

export function Panel({
  title,
  icon,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-card border border-border rounded-xl", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            {icon}
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Bar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-full bg-muted w-full overflow-hidden">
      <div
        className={cn("h-full rounded-full bg-primary", className)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Trend({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span className={cn("text-[11px] font-medium", up ? "text-emerald-600" : "text-rose-600")}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
