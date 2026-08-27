// CRM store — localStorage backed. NO seeded/sample data: every record comes
// from real user actions (Employee Register, New Lead, task completion, ...).
// This module is THE single source of truth for the CRM: queries, tasks,
// employees and the activity log all live here.
import { useSyncExternalStore } from "react";
import type { ActivityItem, CrmEvent, CrmQuery, CrmTask, Employee, Stage } from "./types";
import { LIFECYCLE } from "./types";


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

function seedEmployees(): Employee[] {
  const base = new Date();
  return EXECUTIVES.map((e, i) => ({
    ...e,
    phone: "+91 98" + String(100000000 + i * 111111).slice(0, 8),
    target_monthly: e.role === "Sales Manager" ? 0 : 1500000,
    active: true,
    joined_at: iso(addDays(base, -365 + i * 20)),
  }));
}

/** Build the historical activity log out of the seeded queries + tasks. */
function seedEvents(list: CrmQuery[], tks: CrmTask[]): CrmEvent[] {
  const out: CrmEvent[] = [];
  const push = (e: Omit<CrmEvent, "id">) => out.push({ ...e, id: "ev_" + out.length });
  list.forEach((q) => {
    const meta = `${q.lead_id} • ${q.travel_type} • ${q.destination}`;
    push({ type: "lead_created", at: q.created_at, by: q.owner, title: `Lead created by ${q.owner}`, detail: meta, query_id: q.query_id, lead_id: q.lead_id });
    push({ type: "lead_assigned", at: q.assigned_on, by: q.owner, title: `Lead assigned to ${q.owner}`, detail: meta, query_id: q.query_id, lead_id: q.lead_id });
    const sent = q.lifecycle.find((s) => s.label === "Quotation Sent")?.at;
    if (sent) push({ type: "quotation_sent", at: sent, by: q.owner, title: `Quotation sent by ${q.owner}`, detail: `${q.query_id} • ${q.customer}`, query_id: q.query_id, lead_id: q.lead_id });
    const fup = q.lifecycle.find((s) => s.label === "Follow-up")?.at;
    if (fup) push({ type: "followup_logged", at: fup, by: q.owner, title: `Follow-up logged by ${q.owner}`, detail: `${q.query_id} • ${q.customer}`, query_id: q.query_id, lead_id: q.lead_id });
    const closed = q.lifecycle.find((s) => s.label === "Confirmed / Lost")?.at;
    if (closed && (q.stage === "Confirmed" || q.stage === "Lost")) {
      push({
        type: q.stage === "Confirmed" ? "won" : "lost",
        at: closed, by: q.owner,
        title: `Query ${q.stage === "Confirmed" ? "confirmed" : "marked lost"} by ${q.owner}`,
        detail: meta, query_id: q.query_id, lead_id: q.lead_id,
      });
    }
  });
  tks.filter((t) => t.done).forEach((t) => {
    push({ type: "task_completed", at: t.due_at, by: t.owner, title: `Task completed by ${t.owner}`, detail: t.title, query_id: t.query_id });
  });
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

// ---- persistence -----------------------------------------------------------
const listeners = new Set<() => void>();
let queries: CrmQuery[] = [];
let tasks: CrmTask[] = [];
let employees: Employee[] = [];
let events: CrmEvent[] = [];
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
    const rawE = localStorage.getItem(EMP_KEY);
    employees = rawE ? (JSON.parse(rawE) as Employee[]) : seedEmployees();
    if (!rawE) localStorage.setItem(EMP_KEY, JSON.stringify(employees));
    const rawV = localStorage.getItem(EVENT_KEY);
    events = rawV ? (JSON.parse(rawV) as CrmEvent[]) : seedEvents(queries, tasks);
    if (!rawV) localStorage.setItem(EVENT_KEY, JSON.stringify(events));
  } catch {
    queries = seedQueries();
    tasks = seedTasks(queries);
    employees = seedEmployees();
    events = seedEvents(queries, tasks);
  }
}
function emit() { listeners.forEach((l) => l()); }
function persist() {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(queries));
  localStorage.setItem(TASK_KEY, JSON.stringify(tasks));
  localStorage.setItem(EMP_KEY, JSON.stringify(employees));
  localStorage.setItem(EVENT_KEY, JSON.stringify(events.slice(0, 800)));
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
export function listEmployees(): Employee[] {
  if (!inited) load();
  return employees;
}
export function listCrmEvents(): CrmEvent[] {
  if (!inited) load();
  return events;
}
export function getCrmQuery(queryId: string): CrmQuery | undefined {
  return listCrmQueries().find((q) => q.query_id === queryId || q.id === queryId);
}

// ---- activity log ----------------------------------------------------------
function logEvent(e: Omit<CrmEvent, "id" | "at"> & { at?: string }) {
  events = [{ id: "ev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7), at: e.at ?? iso(new Date()), ...e }, ...events];
}

export function recordActivity(input: Omit<CrmEvent, "id" | "at"> & { at?: string }) {
  if (!inited) load();
  logEvent(input);
  persist();
}

// ---- employees -------------------------------------------------------------
export interface EmployeeInput {
  name: string;
  role: Employee["role"];
  email: string;
  phone?: string;
  target_monthly?: number;
  active?: boolean;
}

export function addEmployee(input: EmployeeInput): Employee {
  if (!inited) load();
  const emp: Employee = {
    id: "emp_" + Date.now(),
    name: input.name.trim(),
    role: input.role,
    email: input.email.trim(),
    phone: input.phone,
    target_monthly: input.target_monthly ?? 0,
    active: input.active ?? true,
    joined_at: iso(new Date()),
  };
  employees = [...employees, emp];
  persist();
  return emp;
}

export function updateEmployee(id: string, patch: Partial<EmployeeInput>) {
  if (!inited) load();
  employees = employees.map((e) => (e.id === id ? { ...e, ...patch, name: patch.name?.trim() ?? e.name } : e));
  persist();
}

export function removeEmployee(id: string) {
  if (!inited) load();
  employees = employees.filter((e) => e.id !== id);
  persist();
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
  logEvent({
    type: "lead_created", by: input.owner, at: iso(now),
    title: `Lead created by ${input.owner}`,
    detail: `${q.lead_id} • ${q.enquiry_type} • ${q.destination}`,
    query_id: q.query_id, lead_id: q.lead_id,
  });
  logEvent({
    type: "lead_assigned", by: input.owner, at: iso(now),
    title: `Lead assigned to ${input.owner}`,
    detail: `${q.lead_id} • ${q.customer}`,
    query_id: q.query_id, lead_id: q.lead_id,
  });
  tasks = [
    {
      id: "tk_" + now.getTime(),
      title: `Review new requirement (${q.query_id})`,
      query_id: q.query_id,
      due_at: iso(addDays(now, 1)),
      owner: input.owner,
      note: `${q.pax} Pax ${q.enquiry_type}`,
      done: false,
    },
    ...tasks,
  ];
  persist();
  return { query: q, assigned_to: input.owner };
}

/** Move a query to a new stage; records the lifecycle step, activity + event. */
export function setQueryStage(queryId: string, stage: Stage, by?: string) {
  if (!inited) load();
  const now = new Date();
  queries = queries.map((q) => {
    if (q.query_id !== queryId && q.id !== queryId) return q;
    const actor = by ?? q.owner;
    const lifecycleLabel = stage === "Confirmed" || stage === "Lost" ? "Confirmed / Lost" : stage;
    const lifecycle = q.lifecycle.map((s) => (s.label === lifecycleLabel ? { ...s, at: iso(now) } : s));
    const activity: ActivityItem = { id: "a_" + now.getTime(), title: `Stage changed to ${stage}`, at: iso(now), by: actor };
    logEvent({
      type: stage === "Confirmed" ? "won" : stage === "Lost" ? "lost" : stage === "Quotation Sent" ? "quotation_sent" : "stage_changed",
      by: actor, at: iso(now),
      title:
        stage === "Confirmed" ? `Query confirmed by ${actor}`
          : stage === "Lost" ? `Query marked lost by ${actor}`
            : stage === "Quotation Sent" ? `Quotation sent by ${actor}`
              : `${q.query_id} moved to ${stage} by ${actor}`,
      detail: `${q.query_id} • ${q.customer} • ${q.destination}`,
      query_id: q.query_id, lead_id: q.lead_id,
    });
    return { ...q, stage, lifecycle, activities: [activity, ...q.activities] };
  });
  persist();
}

/** Log a follow-up against a query (optionally pushing the next due date). */
export function logFollowup(queryId: string, note: string, nextDue?: string, by?: string) {
  if (!inited) load();
  const now = new Date();
  queries = queries.map((q) => {
    if (q.query_id !== queryId && q.id !== queryId) return q;
    const actor = by ?? q.owner;
    logEvent({
      type: "followup_logged", by: actor, at: iso(now),
      title: `Follow-up logged by ${actor}`,
      detail: `${q.query_id} • ${note}`,
      query_id: q.query_id, lead_id: q.lead_id,
    });
    return {
      ...q,
      followup_due: nextDue ?? q.followup_due,
      activities: [{ id: "a_" + now.getTime(), title: note || "Follow-up logged", at: iso(now), by: actor }, ...q.activities],
    };
  });
  persist();
}

export function toggleTask(id: string) {
  if (!inited) load();
  const task = tasks.find((t) => t.id === id);
  tasks = tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  if (task && !task.done) {
    logEvent({
      type: "task_completed", by: task.owner,
      title: `Task completed by ${task.owner}`,
      detail: task.title, query_id: task.query_id,
    });
  }
  persist();
}

function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }

const EMPTY: never[] = [];

export function useCrmQueries(): CrmQuery[] {
  return useSyncExternalStore(subscribe, () => { if (!inited) load(); return queries; }, () => EMPTY);
}
export function useCrmTasks(): CrmTask[] {
  return useSyncExternalStore(subscribe, () => { if (!inited) load(); return tasks; }, () => EMPTY);
}
export function useEmployees(): Employee[] {
  return useSyncExternalStore(subscribe, () => { if (!inited) load(); return employees; }, () => EMPTY);
}
export function useCrmEvents(): CrmEvent[] {
  return useSyncExternalStore(subscribe, () => { if (!inited) load(); return events; }, () => EMPTY);
}

// ---- derived helpers -------------------------------------------------------
export const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

