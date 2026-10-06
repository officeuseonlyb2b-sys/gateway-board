// Auto-derived (formula) fields for Query Tracking records.
import { classifyDate, type PeriodRule } from "./periods";
import type { QueryRecord } from "./types";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function dayName(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return isNaN(+d) ? "" : DAY_NAMES[d.getDay()];
}

export function monthLabel(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(+d)) return "";
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function monthKey(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 7);
}

export function nights(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0;
  const a = new Date(startISO + "T00:00:00").getTime();
  const b = new Date(endISO + "T00:00:00").getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function durationLabel(startISO: string, endISO: string): string {
  if (!startISO || !endISO) return "";
  const n = nights(startISO, endISO);
  return `${n} Night${n === 1 ? "" : "s"} & ${n + 1} Day${n + 1 === 1 ? "" : "s"}`;
}

export function totalAmount(q: Pick<QueryRecord, "no_of_pax" | "per_person_cost" | "total_query_amount">): number {
  if (q.total_query_amount !== null && q.total_query_amount !== undefined) return q.total_query_amount;
  return (Number(q.no_of_pax) || 0) * (Number(q.per_person_cost) || 0);
}

export interface DerivedQuery {
  query_day: string;
  query_month: string;
  tour_starting_day: string;
  tour_ending_day: string;
  tour_duration: string;
  travel_month: string;
  travel_month_key: string;
  travel_period: string;
  total_amount: number;
}

export function derive(q: QueryRecord, rules?: PeriodRule[]): DerivedQuery {
  return {
    query_day: dayName(q.query_date),
    query_month: monthLabel(q.query_date),
    tour_starting_day: dayName(q.tour_starting_date),
    tour_ending_day: dayName(q.tour_ending_date),
    tour_duration: durationLabel(q.tour_starting_date, q.tour_ending_date),
    travel_month: monthLabel(q.tour_starting_date),
    travel_month_key: monthKey(q.tour_starting_date),
    travel_period: classifyDate(q.tour_starting_date, rules),
    total_amount: totalAmount(q),
  };
}
