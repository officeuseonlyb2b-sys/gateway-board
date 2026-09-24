// Query Tracking records — localStorage backed store.
import { useSyncExternalStore } from "react";
import { addNotification } from "@/lib/notifications-store";
import type { QueryInput, QueryRecord } from "./types";

const KEY = "mp_tourism_queries";
const isBrowser = () => typeof window !== "undefined";
const listeners = new Set<() => void>();
let cache: QueryRecord[] = [];
let inited = false;

function read(): QueryRecord[] {
  if (!isBrowser()) return [];
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]") as QueryRecord[];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function refresh() { cache = read(); inited = true; }
function emit() { refresh(); listeners.forEach((l) => l()); }
function writeAll(list: QueryRecord[]) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(list));
  emit();
}

function uid() { return "q_" + Math.random().toString(36).slice(2, 10); }

/** Financial-year token, e.g. 26-27 for Apr 2026 - Mar 2027. */
export function fyToken(iso: string): string {
  const d = iso ? new Date(iso + "T00:00:00") : new Date();
  const base = isNaN(+d) ? new Date() : d;
  const y = base.getFullYear();
  const startYear = base.getMonth() >= 3 ? y : y - 1;
  return `${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`;
}

export function nextQueryNo(queryDate: string, list: QueryRecord[] = read()): string {
  const fy = fyToken(queryDate);
  const prefix = `EMP${fy}EMP`;
  const nums = list
    .filter((q) => q.query_no.startsWith(prefix))
    .map((q) => parseInt(q.query_no.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export function listQueries(): QueryRecord[] {
  if (!inited) refresh();
  return cache;
}

export function addQuery(input: QueryInput): QueryRecord {
  const list = read();
  const now = new Date().toISOString();
  const rec: QueryRecord = {
    ...input,
    id: uid(),
    serial: (list.reduce((m, q) => Math.max(m, q.serial || 0), 0) || 0) + 1,
    query_no: nextQueryNo(input.query_date, list),
    created_at: now,
    updated_at: now,
    won_at: input.final_status === "WIN" ? now : undefined,
  };
  writeAll([rec, ...list]);
  if (rec.final_status === "WIN") notifyWin(rec);
  return rec;
}

export function updateQuery(id: string, patch: Partial<QueryInput>): void {
  const list = read();
  const idx = list.findIndex((q) => q.id === id);
  if (idx < 0) return;
  const prev = list[idx];
  const next: QueryRecord = { ...prev, ...patch, updated_at: new Date().toISOString() };
  if (next.final_status === "WIN" && prev.final_status !== "WIN") {
    next.won_at = new Date().toISOString();
    notifyWin(next);
  }
  if (next.final_status !== "WIN") next.won_at = undefined;
  list[idx] = next;
  writeAll(list);
}

export function deleteQuery(id: string): void {
  writeAll(read().filter((q) => q.id !== id));
}

function notifyWin(rec: QueryRecord) {
  addNotification({
    kind: "success",
    category: "query_followup",
    title: `Query WON — ${rec.query_no}`,
    message: `${rec.query_source_name || rec.contact_person || "Query"} moved to Won Queries.`,
    href: "/query-tracking",
  });
}

/** Fire notifications for any follow-up reminder that is now due. */
export function checkFollowUpReminders(): void {
  if (!isBrowser()) return;
  const list = read();
  const now = Date.now();
  let changed = false;
  const updated = list.map((q) => {
    const fus = q.follow_ups.map((f, i) => {
      if (!f?.reminder_at || f.notified || f.done) return f;
      const t = new Date(f.reminder_at).getTime();
      if (isNaN(t) || t > now) return f;
      changed = true;
      addNotification({
        kind: "warning",
        category: "query_followup",
        title: `Follow-up #${i + 1} due — ${q.query_no}`,
        message: `${q.contact_person || q.query_source_name || "Lead"}${f.note ? ` — ${f.note}` : ""}`,
        href: "/query-tracking",
      });
      return { ...f, notified: true };
    });
    return { ...q, follow_ups: fus };
  });
  if (changed) writeAll(updated);
}

export function startFollowUpReminderTimer(intervalMs = 60_000): () => void {
  if (!isBrowser()) return () => {};
  checkFollowUpReminders();
  const t = setInterval(checkFollowUpReminders, intervalMs);
  return () => clearInterval(t);
}

export function useQueries(): QueryRecord[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => { if (!inited) refresh(); return cache; },
    () => [],
  );
}

export function useWonQueries(): QueryRecord[] {
  return useQueries().filter((q) => q.final_status === "WIN");
}

/* ------------------------------------------------------------------ */
/* Query Management — unlimited activity log + automation              */
/* ------------------------------------------------------------------ */

import type { QueryActivity, QueryActivityType, FinalLeadStatus } from "./types";

const aid = () => "a_" + Math.random().toString(36).slice(2, 10);

function patchRecord(id: string, fn: (q: QueryRecord) => QueryRecord) {
  const list = read();
  const idx = list.findIndex((q) => q.id === id);
  if (idx < 0) return;
  list[idx] = { ...fn(list[idx]), updated_at: new Date().toISOString() };
  writeAll(list);
}

export function getQuery(id: string): QueryRecord | undefined {
  return read().find((q) => q.id === id || q.query_no === id);
}

export function activitiesOf(q: QueryRecord): QueryActivity[] {
  return [...(q.activities || [])].sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Append an activity. Never overwrites history. */
export function logActivity(
  id: string,
  input: { type: QueryActivityType; note?: string; by?: string; due_at?: string },
): void {
  const entry: QueryActivity = {
    id: aid(),
    type: input.type,
    at: new Date().toISOString(),
    by: input.by || "Me",
    note: input.note || "",
    due_at: input.due_at || undefined,
    done: input.due_at ? false : undefined,
  };
  patchRecord(id, (q) => ({ ...q, activities: [...(q.activities || []), entry] }));

  // Automation: quotation sent -> follow-up in 3 days for the query owner.
  if (input.type === "quotation_sent") {
    const due = new Date(Date.now() + 3 * 86400000).toISOString();
    const rec = getQuery(id);
    scheduleFollowUp(id, due, "Auto follow-up after quotation", rec?.travel_advisor || input.by || "Me");
  }
}

/** Schedule an unlimited follow-up (activity with a due date). */
export function scheduleFollowUp(id: string, dueISO: string, note = "", by = "Me"): void {
  const entry: QueryActivity = {
    id: aid(), type: "followup", at: new Date().toISOString(), by, note, due_at: dueISO, done: false,
  };
  patchRecord(id, (q) => ({ ...q, activities: [...(q.activities || []), entry] }));
}

export function completeFollowUp(id: string, activityId: string, note = ""): void {
  const now = new Date().toISOString();
  patchRecord(id, (q) => ({
    ...q,
    activities: (q.activities || []).map((a) =>
      a.id === activityId ? { ...a, done: true, done_at: now, note: note || a.note } : a,
    ),
  }));
}

function closePendingFollowUps(q: QueryRecord): QueryRecord {
  const now = new Date().toISOString();
  return {
    ...q,
    activities: (q.activities || []).map((a) =>
      a.type === "followup" && !a.done ? { ...a, done: true, done_at: now } : a,
    ),
    follow_ups: (q.follow_ups || []).map((f) => ({ ...f, done: true })),
  };
}

/** Workflow: New -> Working -> Nurturing -> Won / Lost. */
export function setQueryStatus(
  id: string,
  status: FinalLeadStatus,
  opts: { by?: string; lossReason?: string } = {},
): void {
  const now = new Date().toISOString();
  const by = opts.by || "Me";
  patchRecord(id, (prev) => {
    const change: QueryActivity = {
      id: aid(), type: "status_change", at: now, by,
      note: `${prev.final_status} → ${status}${opts.lossReason ? ` — ${opts.lossReason}` : ""}`,
    };
    let next: QueryRecord = {
      ...prev,
      final_status: status,
      status_new: status === "New",
      status_working: status === "Working",
      status_nurturing: status === "Nurturing",
      loss_reason: status === "LOST" ? (opts.lossReason || prev.loss_reason || "Not specified") : prev.loss_reason,
      won_at: status === "WIN" ? (prev.won_at || now) : undefined,
      activities: [...(prev.activities || []), change],
    };
    if (status === "WIN" || status === "LOST") next = closePendingFollowUps(next);
    return next;
  });
  const rec = getQuery(id);
  if (rec && status === "WIN") notifyWin(rec);
}

/** Fire reminders + manager escalation for activity-based follow-ups. */
export function checkQueryAutomation(): void {
  if (!isBrowser()) return;
  const list = read();
  const now = Date.now();
  let changed = false;
  const updated = list.map((q) => {
    if (q.final_status === "WIN" || q.final_status === "LOST") return q;
    let rec = q;
    const acts = (q.activities || []).map((a) => {
      if (a.type !== "followup" || a.done || a.notified || !a.due_at) return a;
      const t = new Date(a.due_at).getTime();
      if (isNaN(t) || t > now) return a;
      changed = true;
      addNotification({
        kind: "warning",
        category: "query_followup",
        title: `Follow-up overdue — ${q.query_no}`,
        message: `${q.contact_person || q.query_source_name || "Query"}${a.note ? ` — ${a.note}` : ""}`,
        href: "/queries/follow-up-desk",
      });
      return { ...a, notified: true };
    });
    rec = { ...q, activities: acts };
    // 48h+ overdue => manager escalation (once)
    const worstOverdue = acts
      .filter((a) => a.type === "followup" && !a.done && a.due_at)
      .reduce((m, a) => Math.max(m, now - new Date(a.due_at!).getTime()), 0);
    if (!rec.escalated_at && worstOverdue >= 48 * 3600_000) {
      changed = true;
      rec = { ...rec, escalated_at: new Date().toISOString() };
      addNotification({
        kind: "error",
        category: "query_followup",
        title: `Escalation — ${q.query_no}`,
        message: `Follow-up overdue 48+ hours. Advisor: ${q.travel_advisor || "Unassigned"}.`,
        href: "/queries/follow-up-desk",
      });
    }
    return rec;
  });
  if (changed) writeAll(updated);
}

export function startQueryAutomationTimer(intervalMs = 60_000): () => void {
  if (!isBrowser()) return () => {};
  checkQueryAutomation();
  const t = setInterval(checkQueryAutomation, intervalMs);
  return () => clearInterval(t);
}

export function useQueryRecord(idOrNo: string): QueryRecord | undefined {
  return useQueries().find((q) => q.id === idOrNo || q.query_no === idOrNo);
}
