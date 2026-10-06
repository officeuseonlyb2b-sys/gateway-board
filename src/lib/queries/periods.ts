// Editable date-classification lookup ("Travel Period Marked As"),
// mirroring the reference calendar table in the QTS sheet.
import { useSyncExternalStore } from "react";

export interface PeriodRule {
  id: string;
  label: string;      // e.g. "Long Weekend - Holi"
  start: string;      // yyyy-mm-dd
  end: string;        // yyyy-mm-dd (inclusive)
  priority: number;   // higher wins when ranges overlap
}

const KEY = "mp_tourism_query_period_rules";
const isBrowser = () => typeof window !== "undefined";
const listeners = new Set<() => void>();
let cache: PeriodRule[] = [];
let inited = false;

function uid() { return "pr_" + Math.random().toString(36).slice(2, 9); }

function seed(): PeriodRule[] {
  return [
    { id: uid(), label: "Holi Weekend", start: "2027-03-12", end: "2027-03-15", priority: 30 },
    { id: uid(), label: "Long Weekend - Independence Day", start: "2026-08-14", end: "2026-08-16", priority: 20 },
    { id: uid(), label: "Long Weekend - Gandhi Jayanti", start: "2026-10-02", end: "2026-10-04", priority: 20 },
    { id: uid(), label: "Diwali Period", start: "2026-11-05", end: "2026-11-12", priority: 40 },
    { id: uid(), label: "Christmas & New Year Period", start: "2026-12-20", end: "2027-01-02", priority: 50 },
    { id: uid(), label: "Long Weekend - Republic Day", start: "2027-01-23", end: "2027-01-26", priority: 20 },
  ];
}

function read(): PeriodRule[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    const list = JSON.parse(raw) as PeriodRule[];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function refresh() { cache = read(); inited = true; }
function emit() { refresh(); listeners.forEach((l) => l()); }
function writeAll(list: PeriodRule[]) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(list));
  emit();
}

export function listPeriodRules(): PeriodRule[] {
  if (!inited) refresh();
  return cache;
}
export function addPeriodRule(r: Omit<PeriodRule, "id">) {
  writeAll([...read(), { ...r, id: uid() }]);
}
export function updatePeriodRule(id: string, patch: Partial<PeriodRule>) {
  writeAll(read().map((r) => (r.id === id ? { ...r, ...patch } : r)));
}
export function deletePeriodRule(id: string) {
  writeAll(read().filter((r) => r.id !== id));
}

export function usePeriodRules(): PeriodRule[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => { if (!inited) refresh(); return cache; },
    () => [],
  );
}

/** Classify a date into a travel-period label. Falls back to weekday/weekend. */
export function classifyDate(iso: string, rules: PeriodRule[] = listPeriodRules()): string {
  if (!iso) return "";
  const t = new Date(iso + "T00:00:00").getTime();
  if (isNaN(t)) return "";
  const hits = rules
    .filter((r) => {
      const s = new Date(r.start + "T00:00:00").getTime();
      const e = new Date(r.end + "T23:59:59").getTime();
      return !isNaN(s) && !isNaN(e) && t >= s && t <= e;
    })
    .sort((a, b) => b.priority - a.priority);
  if (hits.length) return hits[0].label;
  const dow = new Date(iso + "T00:00:00").getDay();
  return dow === 0 || dow === 5 || dow === 6
    ? "Regular Dates - Weekend"
    : "Regular Dates - Weekday";
}
