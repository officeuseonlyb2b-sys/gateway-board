// src/lib/crm/store.ts
// CRM store — immediate local cache synchronized to the shared database by
// crm-remote.ts. No seeded/sample data: every record comes from user actions.
import { useSyncExternalStore } from "react";
import type { ActivityItem, CrmEvent, CrmQuery, CrmTask, Employee, Stage } from "./types";
import { LIFECYCLE } from "./types";
import type { FollowupOutcome, FollowupType, QuerySubStage } from "./types";
import { MEANINGFUL_EVENTS } from "./types";
import { addNotification } from "@/lib/notifications-store";


const KEY = "mp_crm_queries_v2";
const TASK_KEY = "mp_crm_tasks_v2";
const EMP_KEY = "mp_crm_employees_v2";
const EVENT_KEY = "mp_crm_events_v2";
const isBrowser = () => typeof window !== "undefined";

// ---- helpers ---------------------------------------------------------------


function iso(d: Date) { return d.toISOString(); }
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

// ---- persistence -----------------------------------------------------------
const listeners = new Set<() => void>();
const persistListeners = new Set<(snapshot: CrmSnapshot) => void>();
let queries: CrmQuery[] = [];
let tasks: CrmTask[] = [];
let employees: Employee[] = [];
let events: CrmEvent[] = [];
let inited = false;

function parse<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as T[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function load() {
  inited = true;
  if (!isBrowser()) return;
  queries = parse<CrmQuery>(localStorage.getItem(KEY));
  tasks = parse<CrmTask>(localStorage.getItem(TASK_KEY));
  employees = parse<Employee>(localStorage.getItem(EMP_KEY));
  events = parse<CrmEvent>(localStorage.getItem(EVENT_KEY));
}

function emit() { listeners.forEach((l) => l()); }
export interface CrmSnapshot {
  queries: CrmQuery[];
  tasks: CrmTask[];
  employees: Employee[];
  events: CrmEvent[];
}

export function getCrmSnapshot(): CrmSnapshot {
  if (!inited) load();
  return { queries, tasks, employees, events };
}

export function hydrateCrm(snapshot: CrmSnapshot) {
  inited = true;
  queries = snapshot.queries.map(normalizeQuery);
  tasks = snapshot.tasks.map(normalizeTask);
  employees = snapshot.employees;
  events = snapshot.events;
  if (isBrowser()) {
    localStorage.setItem(KEY, JSON.stringify(queries));
    localStorage.setItem(TASK_KEY, JSON.stringify(tasks));
    localStorage.setItem(EMP_KEY, JSON.stringify(employees));
    localStorage.setItem(EVENT_KEY, JSON.stringify(events.slice(0, 800)));
  }
  emit();
}

function normalizeQuery(q: CrmQuery): CrmQuery {
  return {
    ...q,
    owner: q.owner || "Unassigned",
    sub_stage: q.sub_stage ?? (q.owner && q.owner !== "Unassigned" ? "First Contact" : "Unassigned"),
    next_action: q.next_action || "Review Requirement",
    next_action_due: q.next_action_due || q.followup_due || q.created_at,
    lifecycle: Array.isArray(q.lifecycle) ? q.lifecycle : buildLifecycle(q.stage || "New", new Date(q.created_at)),
    activities: Array.isArray(q.activities) ? q.activities : [],
    commercials: q.commercials ?? { cost_price: 0, selling_price: 0, commission_pct: 0 },
  };
}

function normalizeTask(t: CrmTask): CrmTask {
  return { ...t, item_kind: t.item_kind ?? "task", status: t.status ?? (t.done ? "completed" : "pending"), updates: t.updates ?? [] };
}

export function onCrmPersist(listener: (snapshot: CrmSnapshot) => void) {
  persistListeners.add(listener);
  return () => persistListeners.delete(listener);
}

function persist() {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(queries));
  localStorage.setItem(TASK_KEY, JSON.stringify(tasks));
  localStorage.setItem(EMP_KEY, JSON.stringify(employees));
  localStorage.setItem(EVENT_KEY, JSON.stringify(events.slice(0, 800)));
  emit();
  const snapshot = getCrmSnapshot();
  persistListeners.forEach((listener) => listener(snapshot));
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
/** Event types that should NOT bump "last activity" (system generated). */
const PASSIVE_EVENTS = new Set(["followup_overdue", "task_overdue", "followup_missed", "lead_viewed"]);

function logEvent(e: Omit<CrmEvent, "id" | "at"> & { at?: string }) {
  const at = e.at ?? iso(new Date());
  events = [{ id: "ev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7), at, ...e }, ...events];
  if (e.query_id && MEANINGFUL_EVENTS.includes(e.type) && !PASSIVE_EVENTS.has(e.type)) {
    queries = queries.map((q) =>
      q.query_id === e.query_id ? { ...q, last_activity_at: at, last_updated_by: e.by } : q,
    );
  }
}

export function recordActivity(input: Omit<CrmEvent, "id" | "at"> & { at?: string }) {
  if (!inited) load();
  logEvent(input);
  persist();
}

/** Generic lead-activity logger used by the timeline quick actions. */
export function logLeadActivity(
  queryId: string,
  type: CrmEvent["type"],
  opts: { title?: string; detail?: string; by?: string; prev?: string; next?: string } = {},
) {
  if (!inited) load();
  const q = queries.find((x) => x.query_id === queryId || x.id === queryId);
  const actor = opts.by || q?.owner || "System";
  logEvent({
    type,
    by: actor,
    title: opts.title ?? `${type.replace(/_/g, " ")} by ${actor}`,
    detail: opts.detail,
    query_id: q?.query_id ?? queryId,
    lead_id: q?.lead_id,
    prev_value: opts.prev,
    new_value: opts.next,
  });
  persist();
}

/** Log a call attempt against a lead. */
export function logCall(queryId: string, connected: boolean, note?: string, by?: string) {
  const q = getCrmQuery(queryId);
  const actor = by || q?.owner || "System";
  logLeadActivity(queryId, connected ? "call_connected" : "call_not_connected", {
    by: actor,
    title: connected ? `Call connected by ${actor}` : `Call not connected (${actor})`,
    detail: note || (q ? `${q.contact_person || q.customer} • ${q.mobile || "no number"}` : undefined),
  });
}

/** Change the priority of a lead (audited). */
export function setQueryPriority(queryId: string, priority: string, by?: string) {
  if (!inited) load();
  const q = queries.find((x) => x.query_id === queryId || x.id === queryId);
  if (!q || q.priority === priority) return;
  const actor = by || q.owner || "System";
  queries = queries.map((x) => (x.id === q.id ? { ...x, priority } : x));
  logEvent({
    type: "priority_changed", by: actor,
    title: `Priority changed by ${actor}`,
    detail: `${q.priority || "—"} → ${priority} • ${q.customer}`,
    query_id: q.query_id, lead_id: q.lead_id,
    prev_value: q.priority, new_value: priority,
  });
  persist();
}

/** Schedule (or reschedule) the next follow-up for a lead. */
export function scheduleFollowup(
  queryId: string,
  dueISO: string,
  note?: string,
  by?: string,
  type: FollowupType = "Customer Call",
  dedupeKey?: string,
) {
  if (!inited) load();
  const q = queries.find((x) => x.query_id === queryId || x.id === queryId);
  if (!q) return;
  const actor = by || q.owner || "System";
  const prev = q.followup_due;
  queries = queries.map((x) =>
    x.id === q.id ? { ...x, followup_due: dueISO, next_action_due: dueISO, next_action: note || type, followup_note: note ?? x.followup_note, followup_done_at: undefined } : x,
  );
  const key = dedupeKey ?? `followup:${q.query_id}:${dueISO}:${type}`;
  const existing = tasks.some((task) => task.dedupe_key === key && !task.done && task.status !== "cancelled");
  if (!existing) {
    tasks = [{
      id: `tk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: note || type,
      query_id: q.query_id,
      due_at: dueISO,
      owner: q.owner,
      owner_user_id: q.owner_user_id,
      priority: q.priority || "Medium",
      note,
      purpose: note,
      item_kind: "followup",
      followup_type: type,
      status: "pending",
      done: false,
      assigned_by: actor,
      assigned_at: iso(new Date()),
      dedupe_key: key,
      updates: [],
    }, ...tasks];
  }
  logEvent({
    type: "followup_created", by: actor,
    title: `Follow-up added by ${actor}`,
    detail: `${note ? note + " • " : ""}Scheduled for ${new Date(dueISO).toLocaleString("en-GB")}`,
    query_id: q.query_id, lead_id: q.lead_id,
    prev_value: prev, new_value: dueISO,
  });
  persist();
}

/** Mark the current follow-up as completed, optionally scheduling the next one. */
export function completeFollowup(
  queryId: string,
  note?: string,
  nextDue?: string,
  by?: string,
  outcome: FollowupOutcome = "Connected",
) {
  if (!inited) load();
  const q = queries.find((x) => x.query_id === queryId || x.id === queryId);
  if (!q) return;
  const actor = by || q.owner || "System";
  const now = new Date();
  queries = queries.map((x) =>
    x.id === q.id
      ? {
        ...x,
        followup_done_at: iso(now),
        followup_due: nextDue ?? x.followup_due,
        next_action_due: nextDue ?? x.next_action_due,
        next_action: nextDue ? `Follow up: ${outcome}` : x.next_action,
        activities: [{ id: "a_" + now.getTime(), title: note || "Follow-up completed", at: iso(now), by: actor }, ...x.activities],
      }
      : x,
  );
  const current = tasks
    .filter((task) => task.query_id === q.query_id && task.item_kind === "followup" && !task.done)
    .sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
  if (current) {
    tasks = tasks.map((task) => task.id === current.id ? {
      ...task, done: true, status: "completed", outcome, completed_at: iso(now), completed_by: actor,
      next_followup_at: nextDue,
    } : task);
  }
  logEvent({
    type: "followup_completed", by: actor, at: iso(now),
    title: `Follow-up completed by ${actor}`,
    detail: `${q.query_id} • ${outcome}${note ? " • " + note : ""}`,
    query_id: q.query_id, lead_id: q.lead_id,
    outcome,
  });
  if (nextDue) {
    logEvent({
      type: "followup_created", by: actor, at: iso(now),
      title: `Next follow-up added by ${actor}`,
      detail: `Scheduled for ${new Date(nextDue).toLocaleString("en-GB")}`,
      query_id: q.query_id, lead_id: q.lead_id, new_value: nextDue,
    });
  }
  if (nextDue) scheduleFollowup(q.query_id, nextDue, `Next follow-up after ${outcome}`, actor, current?.followup_type ?? "Customer Call");
  persist();
}

/** Lead age in hours since creation. */
export function leadAgeHours(q: CrmQuery): number {
  return Math.max(0, (Date.now() - new Date(q.created_at).getTime()) / 36e5);
}

/** Hours since the last real activity on the lead (falls back to creation). */
export function inactiveHours(q: CrmQuery): number {
  const at = q.last_activity_at || q.assigned_on || q.created_at;
  return Math.max(0, (Date.now() - new Date(at).getTime()) / 36e5);
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
  mobile?: string;
  email?: string;
  adults?: number;
  children?: number;
  traveler_type?: "indian" | "foreign" | "student";
  travel_type?: string;
  cost_price?: number;
  selling_price?: number;
  owner_user_id?: string;
  created_by?: string;
  query_id?: string;
}

export function createLead(input: NewLeadInput): { query: CrmQuery; assigned_to: string } {
  if (!inited) load();
  const now = new Date();
  const seq = Date.now() % 10000;
  const actor = input.created_by || input.owner || "System";
  const owner = input.owner || "Unassigned";
  const q: CrmQuery = {
    id: "cq_" + now.getTime(),
    query_id: input.query_id || codeId("QRY", now, seq),
    lead_id: codeId("LD", now, seq + 50),
    created_at: iso(now),
    assigned_on: iso(now),
    assigned_by: actor,
    last_updated_by: actor,
    last_activity_at: iso(now),

    lead_source: input.lead_source,
    customer: input.customer,
    contact_person: input.contact_person,
    mobile: input.mobile ?? "",
    email: input.email ?? "",
    market: input.market,
    priority: input.priority,
    requirement: input.requirement,
    enquiry_type: input.enquiry_type,
    travel_type: input.travel_type ?? "Family Tour",
    destination: input.destination,
    travel_start: input.travel_start,
    travel_end: input.travel_end,
    pax: input.pax,
    adults: input.adults ?? input.pax,
    children: input.children ?? 0,
    stage: "New",
    owner,
    owner_user_id: input.owner_user_id,
    sub_stage: owner === "Unassigned" ? "Unassigned" : "First Contact",
    value: 0,
    next_action: "Review Requirement",
    followup_due: iso(addDays(now, 1)),
    next_action_due: iso(addDays(now, 1)),
    lifecycle: buildLifecycle("New", now),
    activities: [{ id: `a_${now.getTime()}`, title: "Lead created", at: iso(now), by: actor }],
    commercials: {
      cost_price: input.cost_price ?? 0,
      selling_price: input.selling_price ?? 0,
      commission_pct: 10,
    },
    ...(input.traveler_type ? { traveler_type: input.traveler_type } : {}),
  };
  queries = [q, ...queries];
  logEvent({
    type: "lead_created", by: actor, at: iso(now),
    title: `Lead created by ${actor}`,
    detail: `${q.lead_id} • ${q.enquiry_type} • ${q.destination}`,
    query_id: q.query_id, lead_id: q.lead_id,
  });
  logEvent({
    type: "lead_assigned", by: actor, at: iso(now),
    title: owner === "Unassigned" ? "Lead awaiting assignment" : `Lead assigned to ${owner}`,
    detail: `${q.lead_id} • ${q.customer}`,
    query_id: q.query_id, lead_id: q.lead_id,
    assigned_to: owner,
  });
  tasks = [
    {
      id: "tk_" + now.getTime(),
      title: `Review new requirement (${q.query_id})`,
      query_id: q.query_id,
      due_at: iso(addDays(now, 1)),
      owner,
      owner_user_id: input.owner_user_id,
      note: `${q.pax} Pax ${q.enquiry_type}`,
      done: false,
      item_kind: "task",
      status: "pending",
      priority: input.priority,
      assigned_by: actor,
      assigned_at: iso(now),
      dedupe_key: `first-contact:${q.query_id}`,
      updates: [], // ✅ NEW: initialise updates array
    },
    ...tasks,
  ];
  addNotification({
    kind: owner === "Unassigned" ? "warning" : "info",
    category: "query_followup",
    title: owner === "Unassigned" ? "New query needs assignment" : "New query assigned",
    message: `${q.query_id} • ${q.customer} • Review requirement by ${new Date(q.followup_due).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    href: `/queries/${q.query_id}`,
    query_id: q.query_id,
    recipient_user_id: input.owner_user_id,
    recipient_name: owner,
    dedupe_key: `assignment:${q.query_id}:${owner}`,
  });
  persist();
  return { query: q, assigned_to: input.owner };
}

/** Reassign a query to another employee. Records a trackable event. */
export function reassignQuery(queryId: string, newOwner: string, by?: string, reason?: string) {
  if (!inited) load();
  const now = new Date();
  queries = queries.map((q) => {
    if (q.query_id !== queryId && q.id !== queryId) return q;
    if (q.owner === newOwner) return q;
    const actor = by || q.owner || newOwner;
    const from = q.owner;
    logEvent({
      type: "lead_reassigned", by: actor, at: iso(now),
      title: `${q.query_id} reassigned to ${newOwner}`,
      detail: `${from ? `From ${from} → ` : ""}${newOwner} • ${q.customer}${reason ? ` • Reason: ${reason}` : ""}`,
      query_id: q.query_id, lead_id: q.lead_id,
      assigned_to: newOwner, assigned_from: from, assign_reason: reason,
      prev_value: from, new_value: newOwner,
    });
    return {
      ...q,
      owner: newOwner,
      assigned_on: iso(now),
      assigned_by: actor,
      last_updated_by: actor,
      last_activity_at: iso(now),
      activities: [
        { id: "a_" + now.getTime(), title: `Reassigned from ${from || "unassigned"} to ${newOwner}${reason ? ` — ${reason}` : ""}`, at: iso(now), by: actor },
        ...q.activities,
      ],
    };

  });
  // open tasks for that query follow the new owner
  tasks = tasks.map((t) => (t.query_id === queryId && !t.done ? { ...t, owner: newOwner } : t));
  persist();
}

export interface NewTaskInput {
  title: string;
  query_id: string;
  due_at: string;
  owner: string;
  note?: string;
  priority?: string;
}

/** Create a task explicitly assigned to an employee. */
export function addTask(input: NewTaskInput, by?: string): CrmTask {
  if (!inited) load();
  const now = new Date();
  const actor = by || input.owner;
  const task: CrmTask = {
    id: "tk_" + now.getTime() + "_" + Math.random().toString(36).slice(2, 6),
    title: input.title,
    query_id: input.query_id,
    due_at: input.due_at || iso(addDays(now, 1)),
    owner: input.owner,
    note: input.note,
    priority: input.priority ?? "Medium",
    done: false,
    assigned_by: actor,
    assigned_at: iso(now),
    updates: [], // ✅ NEW: initialise empty updates array
  };
  tasks = [task, ...tasks];
  logEvent({
    type: "task_assigned", by: actor, at: iso(now),
    title: `Task assigned to ${input.owner}`,
    detail: `${task.title}${input.query_id ? ` • ${input.query_id}` : ""}`,
    query_id: input.query_id || undefined,
    assigned_to: input.owner, task_id: task.id,
  });
  persist();
  return task;
}

// ✅ NEW: Add a progress update to a task
export function addTaskUpdate(taskId: string, text: string, by?: string) {
  if (!inited) load();
  const now = new Date();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const actor = by || task.owner || "System";
  const update = {
    timestamp: iso(now),
    text: text.trim(),
    by: actor,
  };
  tasks = tasks.map(t =>
    t.id === taskId
      ? { ...t, updates: [...(t.updates || []), update] }
      : t
  );
  // Also log to event stream for admin audit
  logEvent({
    type: "task_updated", by: actor, at: iso(now),
    title: `Progress update on task: ${task.title}`,
    detail: text,
    task_id: taskId,
    query_id: task.query_id,
  });
  persist();
}

/** Reassign an existing task to another employee. */
export function reassignTask(id: string, newOwner: string, by?: string) {
  if (!inited) load();
  const now = new Date();
  const task = tasks.find((t) => t.id === id);
  if (!task || task.owner === newOwner) return;
  const actor = by || task.owner;
  tasks = tasks.map((t) => (t.id === id ? { ...t, owner: newOwner, assigned_by: actor, assigned_at: iso(now) } : t));
  logEvent({
    type: "task_reassigned", by: actor, at: iso(now),
    title: `Task reassigned to ${newOwner}`,
    detail: `${task.title} • From ${task.owner} → ${newOwner}`,
    query_id: task.query_id || undefined,
    assigned_to: newOwner, assigned_from: task.owner, task_id: task.id,
  });
  persist();
}

/** Chronological assignment history for a query (oldest first). */
export function assignmentHistory(queryId: string): CrmEvent[] {
  if (!inited) load();
  return events
    .filter((e) => e.query_id === queryId && (e.type === "lead_assigned" || e.type === "lead_reassigned"))
    .slice()
    .sort((a, b) => (a.at < b.at ? -1 : 1));
}

/** When the query entered its current stage (last stage event, else creation). */
export function stageEnteredAt(q: CrmQuery, log: CrmEvent[] = events): string {
  const last = log
    .filter((e) => e.query_id === q.query_id && e.to_stage)
    .sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  return last?.at ?? q.created_at;
}

/** Move a query to a new stage; records the lifecycle step, activity + event. */
export function setQueryStage(queryId: string, stage: Stage, by?: string) {
  if (!inited) load();
  const now = new Date();
  queries = queries.map((q) => {
    if (q.query_id !== queryId && q.id !== queryId) return q;
    if (q.stage === stage) return q;
    const actor = by ?? q.owner;
    const lifecycleLabel = stage === "Confirmed" || stage === "Lost" ? "Confirmed / Lost" : stage;
    const lifecycle = q.lifecycle.map((s) => (s.label === lifecycleLabel ? { ...s, at: iso(now) } : s));
    const enteredAt = stageEnteredAt(q);
    const durationHours = Math.max(0, (now.getTime() - new Date(enteredAt).getTime()) / 36e5);
    const activity: ActivityItem = { id: "a_" + now.getTime(), title: `Stage changed: ${q.stage} → ${stage}`, at: iso(now), by: actor };
    logEvent({
      type: stage === "Confirmed" ? "won" : stage === "Lost" ? "lost" : stage === "Quotation Sent" ? "quotation_sent" : "stage_changed",
      by: actor, at: iso(now),
      title:
        stage === "Confirmed" ? `Query confirmed by ${actor}`
          : stage === "Lost" ? `Query marked lost by ${actor}`
            : stage === "Quotation Sent" ? `Quotation sent by ${actor}`
              : `${q.query_id} moved to ${stage} by ${actor}`,
      detail: `${q.stage} → ${stage} • spent ${fmtDur(durationHours)} in ${q.stage} • ${q.customer}`,
      query_id: q.query_id, lead_id: q.lead_id,
      from_stage: q.stage, to_stage: stage, duration_hours: durationHours,
    });
    return { ...q, stage, lifecycle, activities: [activity, ...q.activities] };
  });
  persist();
}

export function updateQueryWorkflow(
  queryId: string,
  patch: { sub_stage?: QuerySubStage; next_action?: string; next_action_due?: string; requirement?: string },
  by?: string,
) {
  if (!inited) load();
  const q = getCrmQuery(queryId);
  if (!q) return false;
  if (isActiveStage(q.stage) && patch.next_action !== undefined && (!patch.next_action.trim() || !patch.next_action_due)) return false;
  const actor = by || q.owner || "System";
  queries = queries.map((item) => item.id === q.id ? { ...item, ...patch } : item);
  if (patch.sub_stage && patch.sub_stage !== q.sub_stage) logEvent({
    type: "sub_stage_changed", by: actor, title: `Sub-stage changed to ${patch.sub_stage}`,
    detail: `${q.sub_stage || "—"} → ${patch.sub_stage}`, query_id: q.query_id,
    prev_value: q.sub_stage, new_value: patch.sub_stage,
  });
  if (patch.requirement !== undefined && patch.requirement !== q.requirement) logEvent({
    type: "requirement_updated", by: actor, title: `Requirement updated by ${actor}`,
    detail: patch.requirement, query_id: q.query_id,
  });
  persist();
  return true;
}

const isActiveStage = (stage: Stage) => stage !== "Confirmed" && stage !== "Lost";

export function closeQuery(queryId: string, stage: "Confirmed" | "Lost", reason: string, by?: string) {
  const q = getCrmQuery(queryId);
  if (!q || (stage === "Lost" && !reason.trim())) return false;
  const now = iso(new Date());
  queries = queries.map((item) => item.id === q.id ? {
    ...item, stage, sub_stage: stage === "Confirmed" ? "Won" : "Lost",
    lost_reason: stage === "Lost" ? reason.trim() : undefined,
    next_action: "", next_action_due: undefined,
  } : item);
  tasks = tasks.map((task) => task.query_id === q.query_id && !task.done ? {
    ...task, status: "cancelled", cancelled_at: now, cancelled_reason: `${stage}: ${reason}`,
  } : task);
  logEvent({ type: stage === "Confirmed" ? "won" : "lost", by: by || q.owner || "System", at: now,
    title: stage === "Confirmed" ? "Query marked won" : "Query marked lost", detail: reason,
    reason, query_id: q.query_id, from_stage: q.stage, to_stage: stage });
  persist();
  return true;
}

export function reopenQuery(queryId: string, nextAction: string, nextDue: string, by?: string) {
  const q = getCrmQuery(queryId);
  if (!q || !nextAction.trim() || !nextDue) return false;
  const now = iso(new Date());
  queries = queries.map((item) => item.id === q.id ? {
    ...item, stage: "Follow-up", sub_stage: "Awaiting Response", reopened_at: now,
    next_action: nextAction.trim(), next_action_due: nextDue, followup_due: nextDue,
  } : item);
  logEvent({ type: "reopened", by: by || q.owner || "System", at: now, title: "Query reopened",
    detail: nextAction, query_id: q.query_id, from_stage: q.stage, to_stage: "Follow-up" });
  persist();
  return true;
}

export function saveQueryCosting(
  queryId: string,
  quote: import("@/lib/quotes-store").SavedQuote,
  draftId: string | undefined,
  by: string,
) {
  if (!inited) load();
  const now = new Date();
  queries = queries.map((q) => {
    if (q.query_id !== queryId && q.id !== queryId) return q;
    const previous = q.costing_versions ?? [];
    const duplicate = previous.find((item) => item.quote.id === quote.id);
    if (duplicate) return q;
    const version = previous.reduce((max, item) => Math.max(max, item.version), 0) + 1;
    const sellingPrice = Math.max(quote.totals.grand_sgl, quote.totals.grand_dbl, quote.totals.grand_trp);
    const costPrice = Math.max(quote.totals.room_net_sgl, quote.totals.room_net_dbl, quote.totals.room_net_trp)
      + quote.totals.addons_total;
    return {
      ...q,
      stage: q.stage === "New" || q.stage === "Requirement Review" ? "Costing" : q.stage,
      value: sellingPrice,
      commercials: { ...q.commercials, cost_price: costPrice, selling_price: sellingPrice },
      lifecycle: q.lifecycle.map((item) =>
        item.label === "Costing" && !item.at ? { ...item, at: iso(now) } : item,
      ),
      costing_versions: [
        ...previous,
        { version, saved_at: quote.saved_at, saved_by: by, draft_id: draftId, quote: { ...quote, version } },
      ],
       activities: [
        { id: `a_${now.getTime()}`, title: `Costing V${version} saved`, at: iso(now), by },
        ...q.activities,
      ],
    };
  });
  const savedQuery = getCrmQuery(queryId);
  const version = savedQuery?.costing_versions?.at(-1)?.version ?? 1;
  logEvent({ type: version > 1 ? "quotation_revised" : "quotation_created", by, at: iso(now),
    title: version > 1 ? `Quotation revised — V${version}` : "Quotation created",
    detail: quote.quote_number, query_id: savedQuery?.query_id ?? queryId, dedupe_key: `quote:${quote.id}` });
  persist();
}

export function markQuotationSent(queryId: string, by?: string) {
  const q = getCrmQuery(queryId);
  if (!q) return false;
  setQueryStage(q.query_id, "Quotation Sent", by);
  const due = iso(addDays(new Date(), 3));
  scheduleFollowup(q.query_id, due, "Quotation sent + 3 days follow-up", by, "Quotation Follow-up", `quote-followup:${q.query_id}:${due.slice(0, 10)}`);
  return true;
}

/** Human readable duration, e.g. "1d 4h" / "2h 15m". */
export function fmtDur(hours: number): string {
  if (!isFinite(hours) || hours <= 0) return "0m";
  const d = Math.floor(hours / 24);
  const h = Math.floor(hours % 24);
  const m = Math.round((hours - Math.floor(hours)) * 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

/** Free-text note against a query — fully audited. */
export function addNote(queryId: string, text: string, by?: string) {
  if (!inited) load();
  const now = new Date();
  queries = queries.map((q) => {
    if (q.query_id !== queryId && q.id !== queryId) return q;
    const actor = by ?? q.owner;
    logEvent({
      type: "note_added", by: actor, at: iso(now),
      title: `Note added by ${actor}`, detail: text,
      query_id: q.query_id, lead_id: q.lead_id,
    });
    return { ...q, activities: [{ id: "a_" + now.getTime(), title: text, at: iso(now), by: actor }, ...q.activities] };
  });
  persist();
}

/**
 * Detect items that have crossed their deadline and log one event each
 * (deduped by query/task id) so overdue alerts appear the moment they happen.
 */
export function sweepOverdue(): number {
  if (!inited) load();
  const now = Date.now();
  const openStages: Stage[] = ["New", "Requirement Review", "Costing", "Quotation Sent", "Follow-up", "Nurturing"];
  let logged = 0;

  queries.forEach((q) => {
    if (!openStages.includes(q.stage)) return;
    const due = new Date(q.followup_due).getTime();
    if (!due || due >= now) return;
    const already = events.some((e) => e.type === "followup_overdue" && e.query_id === q.query_id && e.detail?.includes(q.followup_due));
    if (already) return;
    logEvent({
      type: "followup_overdue", by: q.owner || "System", at: iso(new Date()),
      title: `Follow-up overdue — ${q.query_id}`,
      detail: `Due ${q.followup_due} • ${q.customer} • owner ${q.owner || "unassigned"}`,
      query_id: q.query_id, lead_id: q.lead_id,
      overdue_hours: (now - due) / 36e5,
    });
    logged++;
  });

  tasks.forEach((t) => {
    if (t.done) return;
    const due = new Date(t.due_at).getTime();
    if (!due || due >= now) return;
    const already = events.some((e) => e.type === "task_overdue" && e.task_id === t.id);
    if (already) return;
    logEvent({
      type: "task_overdue", by: t.owner || "System", at: iso(new Date()),
      title: `Task overdue — ${t.title}`,
      detail: `Due ${t.due_at} • owner ${t.owner || "unassigned"}`,
      query_id: t.query_id || undefined, task_id: t.id,
      overdue_hours: (now - due) / 36e5,
    });
    logged++;
  });

  queries.forEach((q) => {
    if (!isActiveStage(q.stage) || inactiveHours(q) < 48) return;
    const key = `manager-escalated:${q.query_id}:${q.last_activity_at || q.created_at}`;
    if (events.some((event) => event.dedupe_key === key)) return;
    logEvent({ type: "manager_escalated", by: "System", title: `Manager escalation — ${q.query_id}`,
      detail: `${q.owner || "Unassigned"} • ${inactiveHours(q).toFixed(1)}h inactive`, query_id: q.query_id,
      overdue_hours: inactiveHours(q), dedupe_key: key });
    queries = queries.map((item) => item.id === q.id ? { ...item, escalated_at: iso(new Date()) } : item);
    addNotification({ kind: "error", category: "query_followup", title: "Manager escalation",
      message: `${q.query_id} • ${q.customer} • ${inactiveHours(q).toFixed(1)} hours without meaningful activity`,
      href: `/queries/${q.query_id}`, query_id: q.query_id, dedupe_key: key });
    logged++;
  });

  if (logged) persist();
  return logged;
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;
/** Start the live overdue watcher (idempotent). */
export function startOverdueWatcher() {
  if (!isBrowser() || sweepTimer) return;
  sweepOverdue();
  sweepTimer = setInterval(sweepOverdue, 60_000);
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

export function toggleTask(id: string, by?: string) {
  if (!inited) load();
  const task = tasks.find((t) => t.id === id);
  const now = iso(new Date());
  tasks = tasks.map((t) => (t.id === id ? { ...t, done: !t.done, completed_at: t.done ? undefined : now } : t));
  if (task && !task.done) {
    logEvent({
      type: "task_completed", by: by || task.owner, at: now,
      title: `Task completed by ${by || task.owner}`,
      detail: task.title, query_id: task.query_id, task_id: task.id,
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