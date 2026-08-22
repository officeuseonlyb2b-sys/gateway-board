// CRM store — localStorage backed, seeded with realistic sample data so every
// stat card / chart in the module is derived from real records.
// This module is THE single source of truth for the CRM: queries, tasks,
// employees and the activity log all live here.
import { useSyncExternalStore } from "react";
import type { ActivityItem, CrmEvent, CrmEventType, CrmQuery, CrmTask, Employee, Executive, Stage } from "./types";
import { DESTINATIONS, LIFECYCLE, MARKETS, STAGES, TRAVEL_TYPES } from "./types";

const KEY = "mp_crm_queries_v1";
const TASK_KEY = "mp_crm_tasks_v1";
const EMP_KEY = "mp_crm_employees_v1";
const EVENT_KEY = "mp_crm_events_v1";
const isBrowser = () => typeof window !== "undefined";

export const EXECUTIVES: Executive[] = [
  { id: "ex1", name: "Rahul Sharma", role: "Sales Executive", email: "rahul@mptourism.in" },
  { id: "ex2", name: "Priya Singh", role: "Sales Executive", email: "priya@mptourism.in" },
  { id: "ex3", name: "Anjali Verma", role: "Sales Executive", email: "anjali@mptourism.in" },
  { id: "ex4", name: "Raina Sharma", role: "Sales Executive", email: "raina@mptourism.in" },
  { id: "ex5", name: "Aman Singh", role: "Sales Executive", email: "aman@mptourism.in" },
  { id: "ex6", name: "Vikram Rao", role: "Sales Manager", email: "vikram@mptourism.in" },
];


export const PARTNERS = [
  "ABC Travels", "Globe Tours", "Travel Arc", "India Routes", "Destiny Holidays",
  "Global Voyages", "Holiday Junction", "Explore India", "Heritage Trails", "Sunrise Tours",
];

const NEXT_ACTIONS = [
  "Follow-up Call", "Complete Hotel Rates", "Revisit on 25 Aug", "Review Requirement",
  "Call Client", "Send Quotation", "Share Itinerary", "Confirm Vehicle",
];

// ---- deterministic pseudo random ------------------------------------------
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const pick = <T,>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length) % arr.length];

function iso(d: Date) { return d.toISOString(); }
function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(base: Date, n: number) { const d = new Date(base); d.setDate(d.getDate() + n); return d; }

/** Date-coded id, e.g. QRY-2608-0187 */
export function codeId(prefix: string, date: Date, seq: number) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${prefix}-${dd}${mm}-${String(seq).padStart(4, "0")}`;
}

function buildLifecycle(stage: Stage, created: Date): { label: string; at?: string }[] {
  const order = ["New", "Requirement Review", "Costing", "Quotation Sent", "Follow-up"];
  const reachedIdx = order.indexOf(stage === "Nurturing" ? "Follow-up" : stage);
  return LIFECYCLE.map((label, i) => {
    if (label === "Assigned") return { label, at: iso(addDays(created, 0)) };
    if (label === "Confirmed / Lost") {
      return stage === "Confirmed" || stage === "Lost" ? { label, at: iso(addDays(created, 6)) } : { label };
    }
    const idx = order.indexOf(label);
    const done = stage === "Confirmed" || stage === "Lost" || (reachedIdx >= 0 && idx <= reachedIdx);
    return done ? { label, at: iso(addDays(created, Math.max(0, idx))) } : { label };
  });
}

function seedQueries(): CrmQuery[] {
  const r = rng(20260821);
  const today = new Date();
  const out: CrmQuery[] = [];
  for (let i = 0; i < 152; i++) {
    const created = addDays(today, -Math.floor(r() * 30));
    const stage = pick(r, STAGES);
    const owner = EXECUTIVES[Math.floor(r() * 5)].name;
    const start = addDays(today, 10 + Math.floor(r() * 80));
    const nights = 3 + Math.floor(r() * 7);
    const pax = 2 + Math.floor(r() * 10);
    const children = pax > 3 && r() > 0.6 ? 2 : 0;
    const value = (60000 + Math.floor(r() * 240000)) as number;
    const followOffset = Math.floor(r() * 9) - 3; // -3..+5 days
    const followDue = addDays(today, followOffset);
    followDue.setHours(16, 30, 0, 0);
    const customer = pick(r, PARTNERS);
    const seq = 40 + i;
    out.push({
      id: "cq_" + i,
      query_id: codeId("QRY", created, seq),
      lead_id: codeId("LD", created, seq + 50),
      created_at: iso(created),
      assigned_on: iso(created),
      lead_source: pick(r, ["Website", "Phone Call", "Referral", "Email", "Social Media"]),
      customer,
      contact_person: pick(r, ["Amit Sharma", "Neha Gupta", "Rohit Jain", "Sneha Patel", "Karan Mehra"]),
      mobile: "+91 98765 4" + String(1000 + Math.floor(r() * 8999)).slice(0, 4),
      email: "contact@" + customer.toLowerCase().replace(/[^a-z]/g, "") + ".com",
      market: pick(r, MARKETS),
      priority: pick(r, ["Normal", "High", "Low"]),
      requirement: `${nights} Nights / ${nights + 1} Days tour. 4★ hotels preferred. Innova Crysta vehicle. Guides with Hindi & English. Entrance fees & activities required.`,
      enquiry_type: "Tour Package",
      travel_type: pick(r, TRAVEL_TYPES),
      destination: pick(r, DESTINATIONS),
      travel_start: ymd(start),
      travel_end: ymd(addDays(start, nights)),
      pax,
      adults: pax - children,
      children,
      stage,
      owner,
      value,
      next_action: pick(r, NEXT_ACTIONS),
      followup_due: iso(followDue),
      lifecycle: buildLifecycle(stage, created),
      activities: [
        { id: "a1", title: `Quotation V2 emailed to ${customer}`, at: iso(addDays(today, -1)), by: owner },
        { id: "a2", title: "Costing V2 completed (Hotel changed in Khajuraho)", at: iso(addDays(today, -1)), by: owner },
        { id: "a3", title: "Client requested 4★ alternative", at: iso(addDays(today, -2)), by: owner, meta: "Phone Call" },
        { id: "a4", title: "Requirement reviewed & itinerary drafted", at: iso(addDays(today, -3)), by: owner },
      ],
      commercials: {
        cost_price: Math.round(value * 0.835),
        selling_price: value,
        commission_pct: 10,
      },
    });
  }
  return out;
}

function seedTasks(list: CrmQuery[]): CrmTask[] {
  const r = rng(99001);
  const today = new Date();
  return list.slice(0, 28).map((q, i) => {
    const due = addDays(today, i < 12 ? 0 : i < 20 ? 1 : -1);
    due.setHours(9 + (i % 9), i % 2 ? 30 : 0, 0, 0);
    return {
      id: "tk_" + i,
      title: pick(r, [
        "Follow-up Call with " + q.customer,
        "Complete hotel costing (" + q.destination + " Program)",
        "Review new requirement",
        "Check Taj Lakefront rate for client",
        "Send revised quotation V3",
      ]),
      query_id: q.query_id,
      due_at: iso(due),
      owner: q.owner,
      note: `${q.pax} Pax ${q.travel_type}`,
      done: i % 7 === 0,
    };
  });
}

// ---- persistence -----------------------------------------------------------
const listeners = new Set<() => void>();
let queries: CrmQuery[] = [];
let tasks: CrmTask[] = [];
let inited = false;

function load() {
  inited = true;
  if (!isBrowser()) return;
  try {
    const raw = localStorage.getItem(KEY);
    queries = raw ? (JSON.parse(raw) as CrmQuery[]) : seedQueries();
    if (!raw) localStorage.setItem(KEY, JSON.stringify(queries));
    const rawT = localStorage.getItem(TASK_KEY);
    tasks = rawT ? (JSON.parse(rawT) as CrmTask[]) : seedTasks(queries);
    if (!rawT) localStorage.setItem(TASK_KEY, JSON.stringify(tasks));
  } catch {
    queries = seedQueries();
    tasks = seedTasks(queries);
  }
}
function emit() { listeners.forEach((l) => l()); }
function persist() {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(queries));
  localStorage.setItem(TASK_KEY, JSON.stringify(tasks));
  emit();
}

export function listCrmQueries(): CrmQuery[] {
  if (!inited) load();
  return queries;
}
export function listCrmTasks(): CrmTask[] {
  if (!inited) load();
  return tasks;
}
export function getCrmQuery(queryId: string): CrmQuery | undefined {
  return listCrmQueries().find((q) => q.query_id === queryId || q.id === queryId);
}

export interface NewLeadInput {
  lead_source: string;
  customer: string;
  contact_person: string;
  market: string;
  enquiry_type: string;
  travel_start: string;
  travel_end: string;
  pax: number;
  destination: string;
  priority: string;
  requirement: string;
  owner: string;
}

export function createLead(input: NewLeadInput): { query: CrmQuery; assigned_to: string } {
  if (!inited) load();
  const now = new Date();
  const seq = queries.length + 40;
  const q: CrmQuery = {
    id: "cq_" + now.getTime(),
    query_id: codeId("QRY", now, seq),
    lead_id: codeId("LD", now, seq + 50),
    created_at: iso(now),
    assigned_on: iso(now),
    lead_source: input.lead_source,
    customer: input.customer,
    contact_person: input.contact_person,
    mobile: "",
    email: "",
    market: input.market,
    priority: input.priority,
    requirement: input.requirement,
    enquiry_type: input.enquiry_type,
    travel_type: "Family Tour",
    destination: input.destination,
    travel_start: input.travel_start,
    travel_end: input.travel_end,
    pax: input.pax,
    adults: input.pax,
    children: 0,
    stage: "New",
    owner: input.owner,
    value: 0,
    next_action: "Review Requirement",
    followup_due: iso(addDays(now, 1)),
    lifecycle: buildLifecycle("New", now),
    activities: [{ id: "a1", title: "Lead created", at: iso(now), by: input.owner }],
    commercials: { cost_price: 0, selling_price: 0, commission_pct: 10 },
  };
  queries = [q, ...queries];
  persist();
  return { query: q, assigned_to: input.owner };
}

export function toggleTask(id: string) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  persist();
}

function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }

export function useCrmQueries(): CrmQuery[] {
  return useSyncExternalStore(subscribe, () => { if (!inited) load(); return queries; }, () => []);
}
export function useCrmTasks(): CrmTask[] {
  return useSyncExternalStore(subscribe, () => { if (!inited) load(); return tasks; }, () => []);
}

// ---- derived helpers -------------------------------------------------------
export const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function teamActivity(list: CrmQuery[]): ActivityItem[] {
  return list
    .slice(0, 6)
    .map((q, i) => ({
      id: q.id + i,
      title: `${q.stage === "Confirmed" ? "Query confirmed" : q.stage === "Quotation Sent" ? "Quotation sent" : "Lead assigned"} by ${q.owner}`,
      at: q.activities[0]?.at ?? q.created_at,
      by: q.owner,
      meta: `${q.lead_id} • ${q.travel_type} • ${q.destination}`,
    }));
}
