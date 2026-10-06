// Central metrics for the Query Management module.
// Every Query screen reads from this single derived layer.
import { useMemo } from "react";
import { useQueries } from "./store";
import { totalAmount, monthKey, monthLabel } from "./derive";
import { scoreQuery, type QueryPriority } from "./priority";
import type { FinalLeadStatus, QueryRecord } from "./types";

export interface ReportingContext {
  fy: string;          // "all" | "26-27"
  queryMonth: string;  // "all" | "2026-09"
  receivedPeriod: string; // all | 7d | 30d | 90d | fy
}

export const defaultReportingContext: ReportingContext = { fy: "all", queryMonth: "all", receivedPeriod: "all" };

export function fyOf(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(+d)) return "";
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

export interface EnrichedQuery extends QueryRecord {
  amount: number;
  fy: string;
  query_month_key: string;
  query_month_label: string;
  travel_month_key: string;
  priority: QueryPriority;
}

export function enrich(list: QueryRecord[], now = Date.now()): EnrichedQuery[] {
  return list.map((q) => ({
    ...q,
    amount: totalAmount(q),
    fy: fyOf(q.query_date),
    query_month_key: monthKey(q.query_date),
    query_month_label: monthLabel(q.query_date),
    travel_month_key: monthKey(q.tour_starting_date),
    priority: scoreQuery(q, now),
  }));
}

export function applyContext(list: EnrichedQuery[], ctx: ReportingContext, now = Date.now()): EnrichedQuery[] {
  return list.filter((q) => {
    if (ctx.fy !== "all" && q.fy !== ctx.fy) return false;
    if (ctx.queryMonth !== "all" && q.query_month_key !== ctx.queryMonth) return false;
    if (ctx.receivedPeriod !== "all") {
      const t = new Date(q.query_date + "T00:00:00").getTime();
      if (isNaN(t)) return false;
      const days = ctx.receivedPeriod === "7d" ? 7 : ctx.receivedPeriod === "30d" ? 30 : ctx.receivedPeriod === "90d" ? 90 : 365;
      if (now - t > days * 86400000) return false;
    }
    return true;
  });
}

export const OPEN_STATUSES: FinalLeadStatus[] = ["New", "Working", "Nurturing"];
export const isOpenQuery = (q: QueryRecord) => OPEN_STATUSES.includes(q.final_status);

export interface StageStat {
  status: FinalLeadStatus;
  count: number;
  pct: number;
  value: number;
}

export function useQueryMetrics(ctx: ReportingContext = defaultReportingContext) {
  const all = useQueries();
  return useMemo(() => {
    const now = Date.now();
    const enriched = enrich(all, now);
    const scoped = applyContext(enriched, ctx, now);

    const total = scoped.length;
    const open = scoped.filter(isOpenQuery);
    const won = scoped.filter((q) => q.final_status === "WIN");
    const lost = scoped.filter((q) => q.final_status === "LOST");
    const sum = (l: EnrichedQuery[]) => l.reduce((s, q) => s + q.amount, 0);

    const openValue = sum(open);
    const wonValue = sum(won);
    const closed = won.length + lost.length;
    const winRate = total ? (won.length / total) * 100 : 0;
    const closedWinRate = closed ? (won.length / closed) * 100 : 0;
    const avgWonFile = won.length ? wonValue / won.length : 0;
    const overdue = open.filter((q) => q.priority.overdueDays > 0 || (!q.priority.due && isOpenQuery(q)));
    const strictlyOverdue = open.filter((q) => q.priority.due && q.priority.overdueDays > 0);
    const attentionPct = open.length ? (strictlyOverdue.length / open.length) * 100 : 0;

    const stages: StageStat[] = (["New", "Working", "Nurturing", "WIN", "LOST"] as FinalLeadStatus[]).map((s) => {
      const l = scoped.filter((q) => q.final_status === s);
      return { status: s, count: l.length, pct: total ? (l.length / total) * 100 : 0, value: sum(l) };
    });

    // monthly trajectory
    const byMonth = new Map<string, { key: string; label: string; count: number; won: number; lost: number; value: number; wonValue: number }>();
    for (const q of scoped) {
      const key = q.query_month_key || "—";
      const row = byMonth.get(key) || { key, label: q.query_month_label || "—", count: 0, won: 0, lost: 0, value: 0, wonValue: 0 };
      row.count++;
      row.value += q.amount;
      if (q.final_status === "WIN") { row.won++; row.wonValue += q.amount; }
      if (q.final_status === "LOST") row.lost++;
      byMonth.set(key, row);
    }
    const monthly = [...byMonth.values()].sort((a, b) => (a.key < b.key ? -1 : 1));

    const group = (keyOf: (q: EnrichedQuery) => string) => {
      const m = new Map<string, { key: string; count: number; won: number; lost: number; value: number; wonValue: number }>();
      for (const q of scoped) {
        const key = keyOf(q) || "Unassigned";
        const row = m.get(key) || { key, count: 0, won: 0, lost: 0, value: 0, wonValue: 0 };
        row.count++;
        row.value += q.amount;
        if (q.final_status === "WIN") { row.won++; row.wonValue += q.amount; }
        if (q.final_status === "LOST") row.lost++;
        m.set(key, row);
      }
      return [...m.values()].sort((a, b) => b.count - a.count);
    };

    const advisors = group((q) => q.travel_advisor);
    const sources = group((q) => q.query_source_type);
    const markets = group((q) => q.query_market_source);

    const advisorNames = [...new Set(all.map((q) => q.travel_advisor).filter(Boolean))].sort();
    const fys = [...new Set(enriched.map((q) => q.fy).filter(Boolean))].sort().reverse();
    const months = [...new Set(enriched.map((q) => q.query_month_key).filter(Boolean))].sort().reverse();

    return {
      all: enriched, scoped, open, won, lost,
      total, openValue, wonValue, winRate, closedWinRate, avgWonFile,
      overdueCount: strictlyOverdue.length, attentionPct, overdue, strictlyOverdue,
      stages, monthly, advisors, sources, markets,
      advisorNames, fys, months,
      totalValue: sum(scoped),
    };
  }, [all, ctx.fy, ctx.queryMonth, ctx.receivedPeriod]);
}

export type QueryMetrics = ReturnType<typeof useQueryMetrics>;
