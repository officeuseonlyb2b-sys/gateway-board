// Query priority engine — scoring + flags for the Follow-up Desk.
import { totalAmount } from "./derive";
import type { QueryActivity, QueryRecord } from "./types";

export interface PendingFollowUp {
  id?: string;
  due_at: string;   // ISO
  note: string;
}

export const HIGH_VALUE_THRESHOLD = 200_000;

/** All pending follow-ups (unlimited activity log + legacy sheet columns). */
export function pendingFollowUps(q: QueryRecord): PendingFollowUp[] {
  const fromActivities: PendingFollowUp[] = (q.activities || [])
    .filter((a): a is QueryActivity & { due_at: string } => a.type === "followup" && !a.done && !!a.due_at)
    .map((a) => ({ id: a.id, due_at: a.due_at, note: a.note }));
  const legacy: PendingFollowUp[] = (q.follow_ups || [])
    .filter((f) => f && !f.done && (f.reminder_at || f.date))
    .map((f) => ({ due_at: f.reminder_at || `${f.date}T09:00`, note: f.note || "" }));
  return [...fromActivities, ...legacy].sort((a, b) => (a.due_at < b.due_at ? -1 : 1));
}

export function nextFollowUp(q: QueryRecord): PendingFollowUp | undefined {
  return pendingFollowUps(q)[0];
}

export function lastActivityAt(q: QueryRecord): string {
  const acts = q.activities || [];
  const latest = acts.reduce((m, a) => (a.at > m ? a.at : m), "");
  return latest || q.updated_at || q.created_at;
}

export function daysBetween(a: number, b: number) {
  return Math.floor((a - b) / 86400000);
}

export interface QueryPriority {
  score: number;
  overdueDays: number;
  staleDays: number;
  daysToTravel: number | null;
  value: number;
  flags: string[];
  escalated: boolean;
  due?: PendingFollowUp;
}

export function scoreQuery(q: QueryRecord, now = Date.now()): QueryPriority {
  const due = nextFollowUp(q);
  const value = totalAmount(q);
  const overdueMs = due ? now - new Date(due.due_at).getTime() : 0;
  const overdueDays = due && overdueMs > 0 ? Math.floor(overdueMs / 86400000) : 0;
  const staleDays = Math.max(0, daysBetween(now, new Date(lastActivityAt(q)).getTime()));
  const travelTs = q.tour_starting_date ? new Date(q.tour_starting_date + "T00:00:00").getTime() : NaN;
  const daysToTravel = isNaN(travelTs) ? null : Math.ceil((travelTs - now) / 86400000);

  const flags: string[] = [];
  let score = 0;

  // 1. Overdue days
  if (due && overdueMs > 0) score += Math.min(overdueDays, 30) * 8 + 10;
  // 2. Commercial value
  score += Math.min(value / 25_000, 30);
  if (value >= HIGH_VALUE_THRESHOLD) flags.push("High Value");
  // 3. Travel proximity
  if (daysToTravel !== null && daysToTravel >= 0) {
    if (daysToTravel <= 7) score += 30;
    else if (daysToTravel <= 30) score += 18;
    else if (daysToTravel <= 60) score += 8;
    if (daysToTravel <= 30) flags.push("Travel Within 30 Days");
  }
  // 4. Missing follow-up
  if (!due) { score += 15; flags.push("No Follow-up"); }
  // 5. Stale activity
  if (staleDays >= 7) { score += 10 + Math.min(staleDays - 7, 20); flags.push("Stale 7+ Days"); }
  // 6. Manager escalation
  const escalated = overdueMs >= 48 * 3600_000 || !!q.escalated_at;
  if (escalated) { score += 25; flags.push("Manager Escalation"); }

  return { score: Math.round(score), overdueDays, staleDays, daysToTravel, value, flags, escalated, due };
}

export type DuePeriod =
  | "all" | "overdue" | "today" | "tomorrow" | "this_week" | "next_7" | "this_month" | "none";

export const DUE_PERIODS: { value: DuePeriod; label: string }[] = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this_week", label: "This Week" },
  { value: "next_7", label: "Next 7 Days" },
  { value: "this_month", label: "This Month" },
  { value: "none", label: "No Action Scheduled" },
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function matchesDuePeriod(p: QueryPriority, period: DuePeriod, now = new Date()): boolean {
  if (period === "all") return true;
  if (!p.due) return period === "none";
  if (period === "none") return false;
  const t = new Date(p.due.due_at).getTime();
  const today = startOfDay(now);
  const day = 86400000;
  switch (period) {
    case "overdue": return t < now.getTime();
    case "today": return t >= today && t < today + day;
    case "tomorrow": return t >= today + day && t < today + 2 * day;
    case "this_week": {
      const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
      const weekStart = today - dow * day;
      return t >= weekStart && t < weekStart + 7 * day;
    }
    case "next_7": return t >= today && t < today + 7 * day;
    case "this_month": {
      const m = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const nm = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
      return t >= m && t < nm;
    }
    default: return true;
  }
}
