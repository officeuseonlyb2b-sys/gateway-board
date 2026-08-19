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
