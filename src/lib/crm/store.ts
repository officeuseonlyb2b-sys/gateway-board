// src/lib/crm/store.ts
// CRM store — immediate local cache synchronized to the shared database by
// crm-remote.ts. No seeded/sample data: every record comes from user actions.
import { useSyncExternalStore } from "react";
import type { ActivityItem, CrmEvent, CrmQuery, CrmTask, Employee, Stage } from "./types";
import { LIFECYCLE } from "./types";
import {
  IMPORTED_QUERIES,
  IMPORTED_QUERY_EVENTS,
  IMPORTED_QUERY_TASKS,
  QUERY_TRACKER_DATASET_ID,
} from "./query-tracker-import.generated";

const KEY = "mp_crm_queries_v2";
const TASK_KEY = "mp_crm_tasks_v2";
const EMP_KEY = "mp_crm_employees_v2";
const EVENT_KEY = "mp_crm_events_v2";
const DATASET_KEY = "mp_crm_query_dataset_revision";
const LEGACY_QUERY_KEY = "mp_tourism_queries";
const isBrowser = () => typeof window !== "undefined";

// ---- helpers ---------------------------------------------------------------

function iso(d: Date) {
  return d.toISOString();
}
function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

/** Date-coded id, e.g. QRY-2608-0187 */
export function codeId(prefix: string, date: Date, seq: number) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${prefix}-${dd}${mm}-${String(seq).padStart(4, "0")}`;
}

function buildLifecycle(stage: Stage, created: Date): { label: string; at?: string }[] {
  const order = ["New", "Requirement Review", "Costing", "Quotation Sent", "Follow-up"];
  const reachedIdx = order.indexOf(stage === "Nurturing" ? "Follow-up" : stage);
  return LIFECYCLE.map((label) => {
    if (label === "New") return { label, at: iso(created) };
    if (label === "Assigned") return { label };
    if (label === "Won / Lost") return { label };
    const idx = order.indexOf(label);
    const done = stage === "Won" || stage === "Lost" || (reachedIdx >= 0 && idx <= reachedIdx);
    return done && label === "New" ? { label, at: iso(created) } : { label };
  });
}

function normalizeQuery(record: CrmQuery): CrmQuery {
  const legacyStage = record.stage as Stage | "Confirmed";
  const stage: Stage = legacyStage === "Confirmed" ? "Won" : legacyStage;
  const owner = record.owner === "Unassigned" ? "" : record.owner;
  const assigned = Boolean(owner);
  return {
    ...record,
    stage,
    owner,
    created_by: record.created_by || record.last_updated_by || "Imported",
    assignment_status: record.assignment_status || (assigned ? "Assigned" : "Awaiting Assignment"),
    assigned_at: record.assigned_at || (assigned ? record.assigned_on : undefined),
    stage_changed_at: record.stage_changed_at || record.created_at,
    assignment_history: record.assignment_history || [],
    work_status: stage === "Won" ? "Won" : stage === "Lost" ? "Lost" : "Open",
    primary_unit: record.primary_unit || "Madhya Pradesh",
    participating_units: record.participating_units || ["Madhya Pradesh"],
    customer_type:
      record.customer_type ||
      (/b2b|agent|partner/i.test(record.lead_source) ? "B2B Agent" : "B2C Client"),
    min_pax: record.min_pax ?? record.pax,
    max_pax: record.max_pax ?? record.pax,
    costing_basis: record.costing_basis || record.travel_type,
    commercials: {
      ...record.commercials,
      bottom_line: record.commercials?.bottom_line ?? record.commercials?.cost_price ?? 0,
      top_line:
        record.commercials?.top_line ?? record.commercials?.selling_price ?? record.value ?? 0,
    },
    lifecycle: record.lifecycle?.length
      ? record.lifecycle.map((step) =>
          step.label === "Confirmed / Lost" ? { ...step, label: "Won / Lost" } : step,
        )
      : buildLifecycle(stage, new Date(record.created_at)),
    activities: record.activities || [],
  };
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function load() {
  inited = true;
  if (!isBrowser()) return;
  const storedQueries = parse<CrmQuery>(localStorage.getItem(KEY));
  const storedTasks = parse<CrmTask>(localStorage.getItem(TASK_KEY));
  const storedEvents = parse<CrmEvent>(localStorage.getItem(EVENT_KEY));
  employees = parse<Employee>(localStorage.getItem(EMP_KEY));

  if (localStorage.getItem(DATASET_KEY) !== QUERY_TRACKER_DATASET_ID) {
    // This release intentionally replaces the prior Query Tracker dataset.
    // Preserve employees and standalone tasks/events; remove only records tied
    // to the superseded Queries before loading the authoritative Excel import.
    queries = clone(IMPORTED_QUERIES).map(normalizeQuery);
    tasks = [...clone(IMPORTED_QUERY_TASKS), ...storedTasks.filter((task) => !task.query_id)];
    events = [...clone(IMPORTED_QUERY_EVENTS), ...storedEvents.filter((event) => !event.query_id)];
    localStorage.setItem(KEY, JSON.stringify(queries));
    localStorage.setItem(TASK_KEY, JSON.stringify(tasks));
    localStorage.setItem(EVENT_KEY, JSON.stringify(events.slice(0, 800)));
    localStorage.setItem(DATASET_KEY, QUERY_TRACKER_DATASET_ID);
    localStorage.removeItem(LEGACY_QUERY_KEY);
    return;
  }

  queries = storedQueries.map(normalizeQuery);
  tasks = storedTasks;
  events = storedEvents;
}

function emit() {
  listeners.forEach((l) => l());
}
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
  tasks = snapshot.tasks;
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
const PASSIVE_EVENTS = new Set([
  "followup_overdue",
  "task_overdue",
  "followup_missed",
  "lead_viewed",
]);

function logEvent(e: Omit<CrmEvent, "id" | "at"> & { at?: string }) {
  const at = e.at ?? iso(new Date());
  events = [
    { id: "ev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7), at, ...e },
    ...events,
  ];
  if (e.query_id && !PASSIVE_EVENTS.has(e.type)) {
    queries = queries.map((q) =>
      q.query_id === e.query_id
        ? {
            ...q,
            last_activity_at: at,
            last_updated_by: e.by,
            first_action_at:
              q.first_action_at ||
              (q.assignment_status === "Assigned" &&
              e.type !== "lead_assigned" &&
              e.type !== "lead_reassigned"
                ? at
                : undefined),
          }
        : q,
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
    detail:
      note || (q ? `${q.contact_person || q.customer} • ${q.mobile || "no number"}` : undefined),
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
    type: "priority_changed",
    by: actor,
    title: `Priority changed by ${actor}`,
    detail: `${q.priority || "—"} → ${priority} • ${q.customer}`,
    query_id: q.query_id,
    lead_id: q.lead_id,
    prev_value: q.priority,
    new_value: priority,
  });
  persist();
}

/** Schedule (or reschedule) the next follow-up for a lead. */
export function scheduleFollowup(queryId: string, dueISO: string, note?: string, by?: string) {
  if (!inited) load();
  const q = queries.find((x) => x.query_id === queryId || x.id === queryId);
  if (!q) return;
  const actor = by || q.owner || "System";
  const prev = q.followup_due;
  queries = queries.map((x) =>
    x.id === q.id
      ? {
          ...x,
          followup_due: dueISO,
          revisit_at: dueISO,
          followup_note: note ?? x.followup_note,
          followup_done_at: undefined,
        }
      : x,
  );
  logEvent({
    type: "followup_created",
    by: actor,
    title: `Follow-up added by ${actor}`,
    detail: `${note ? note + " • " : ""}Scheduled for ${new Date(dueISO).toLocaleString("en-GB")}`,
    query_id: q.query_id,
    lead_id: q.lead_id,
    prev_value: prev,
    new_value: dueISO,
  });
  persist();
}

/** Mark the current follow-up as completed, optionally scheduling the next one. */
export function completeFollowup(queryId: string, note?: string, nextDue?: string, by?: string) {
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
          first_followup_at: x.first_followup_at || iso(now),
          last_followup_at: iso(now),
          followup_due: nextDue ?? x.followup_due,
          revisit_at: nextDue ?? x.revisit_at,
          activities: [
            {
              id: "a_" + now.getTime(),
              title: note || "Follow-up completed",
              at: iso(now),
              by: actor,
            },
            ...x.activities,
          ],
        }
      : x,
  );
  logEvent({
    type: "followup_completed",
    by: actor,
    at: iso(now),
    title: `Follow-up completed by ${actor}`,
    detail: `${q.query_id}${note ? " • " + note : ""}`,
    query_id: q.query_id,
    lead_id: q.lead_id,
  });
  if (nextDue) {
    logEvent({
      type: "followup_created",
      by: actor,
      at: iso(now),
      title: `Next follow-up added by ${actor}`,
      detail: `Scheduled for ${new Date(nextDue).toLocaleString("en-GB")}`,
      query_id: q.query_id,
      lead_id: q.lead_id,
      new_value: nextDue,
    });
  }
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
  department?: Employee["department"];
  unit?: string;
  data_scope?: Employee["data_scope"];
  manager_id?: string;
  designation?: string;
  unit_scope?: string[];
  permissions?: string[];
  employee_code?: string;
  employee_status?: Employee["employee_status"];
  account_status?: Employee["account_status"];
  dashboard_template?: Employee["dashboard_template"];
  destination_expertise?: string[];
  product_expertise?: string[];
  languages?: string[];
  permission_grants?: string[];
  permission_restrictions?: string[];
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
    employee_code: input.employee_code || `EMP-${String(employees.length + 1).padStart(4, "0")}`,
    employee_status: input.employee_status || "Active",
    account_status: input.account_status || "Active",
    dashboard_template:
      input.dashboard_template ||
      ([
        "Assistant Manager",
        "Sales Manager",
        "Sales Head",
        "Unit Head",
        "Administrator",
        "Owner / Director",
      ].includes(input.role)
        ? "Sales Control Tower"
        : "My Sales Desk"),
    department: input.department ?? "Sales",
    unit: input.unit ?? "Madhya Pradesh",
    data_scope:
      input.data_scope ??
      (input.role === "Assistant Manager" ||
      input.role === "Sales Manager" ||
      input.role === "Sales Head" ||
      input.role === "Unit Head" ||
      input.role === "Administrator" ||
      input.role === "Owner / Director"
        ? "Unit"
        : "Own"),
    manager_id: input.manager_id,
    designation: input.designation || input.role,
    unit_scope: input.unit_scope?.length ? input.unit_scope : [input.unit ?? "Madhya Pradesh"],
    permissions: input.permissions ?? [],
    destination_expertise: input.destination_expertise ?? [],
    product_expertise: input.product_expertise ?? [],
    languages: input.languages ?? [],
    permission_grants: input.permission_grants ?? [],
    permission_restrictions: input.permission_restrictions ?? [],
  };
  employees = [...employees, emp];
  persist();
  return emp;
}

export function updateEmployee(id: string, patch: Partial<EmployeeInput>) {
  if (!inited) load();
  employees = employees.map((e) =>
    e.id === id ? { ...e, ...patch, name: patch.name?.trim() ?? e.name } : e,
  );
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
  owner?: string;
  created_by?: string;
  customer_type?: CrmQuery["customer_type"];
  agent_id?: string;
  client_id?: string;
  relationship_owner?: string;
  primary_unit?: string;
  participating_units?: string[];
  mobile?: string;
  email?: string;
  adults?: number;
  children?: number;
  traveler_type?: "indian" | "foreign" | "student";
  travel_type?: string;
  cost_price?: number;
  selling_price?: number;
  min_pax?: number;
  max_pax?: number;
  costing_basis?: string;
  hotel_category_from?: string;
  hotel_category_to?: string;
  program_id?: string;
  program_name?: string;
  routing?: string;
  tour_start_city?: string;
  tour_end_city?: string;
  special_requirements?: string;
}

export function createLead(input: NewLeadInput): { query: CrmQuery; assigned_to: string } {
  if (!inited) load();
  const now = new Date();
  const seq = queries.length + 40;
  const creator = input.created_by || "Sales Desk";
  const requestedOwner = input.owner && input.owner !== "Unassigned" ? input.owner : "";
  const q: CrmQuery = {
    id: "cq_" + now.getTime(),
    query_id: codeId("QRY", now, seq),
    lead_id: codeId("LD", now, seq + 50),
    created_at: iso(now),
    assigned_on: "",
    created_by: creator,
    assignment_status: "Awaiting Assignment",
    assignment_history: [],
    work_status: "Open",
    primary_unit: input.primary_unit || "Madhya Pradesh",
    participating_units: input.participating_units?.length
      ? input.participating_units
      : ["Madhya Pradesh"],
    last_updated_by: creator,
    last_activity_at: iso(now),

    lead_source: input.lead_source,
    customer: input.customer,
    contact_person: input.contact_person,
    mobile: input.mobile ?? "",
    email: input.email ?? "",
    market: input.market,
    priority: input.priority,
    requirement: input.requirement,
    customer_type:
      input.customer_type ||
      (/b2b|agent|partner/i.test(input.lead_source) ? "B2B Agent" : "B2C Client"),
    agent_id: input.agent_id,
    client_id: input.client_id,
    relationship_owner: input.relationship_owner,
    enquiry_type: input.enquiry_type,
    travel_type: input.travel_type ?? "Family Tour",
    destination: input.destination,
    travel_start: input.travel_start,
    travel_end: input.travel_end,
    pax: input.pax,
    adults: input.adults ?? input.pax,
    children: input.children ?? 0,
    min_pax: input.min_pax ?? input.pax,
    max_pax: input.max_pax ?? input.pax,
    costing_basis: input.costing_basis || input.travel_type,
    hotel_category_from: input.hotel_category_from,
    hotel_category_to: input.hotel_category_to,
    program_id: input.program_id,
    program_name: input.program_name,
    routing: input.routing,
    tour_start_city: input.tour_start_city,
    tour_end_city: input.tour_end_city,
    special_requirements: input.special_requirements,
    stage: "New",
    stage_changed_at: iso(now),
    owner: "",
    value: 0,
    next_action: "Review Requirement",
    followup_due: "",
    lifecycle: buildLifecycle("New", now),
    activities: [
      {
        id: "a1",
        title: "Query created — awaiting managerial assignment",
        at: iso(now),
        by: creator,
      },
    ],
    commercials: {
      cost_price: input.cost_price ?? 0,
      selling_price: input.selling_price ?? 0,
      commission_pct: 10,
      bottom_line: input.cost_price ?? 0,
      top_line: input.selling_price ?? 0,
    },
    ...(input.traveler_type ? { traveler_type: input.traveler_type } : {}),
  };
  queries = [q, ...queries];
  logEvent({
    type: "lead_created",
    by: creator,
    at: iso(now),
    title: `Query created by ${creator}`,
    detail: `${q.lead_id} • ${q.enquiry_type} • ${q.destination}`,
    query_id: q.query_id,
    lead_id: q.lead_id,
  });
  persist();
  if (requestedOwner)
    assignQuery(q.query_id, requestedOwner, creator, "Assigned during query creation");
  return { query: getCrmQuery(q.query_id) || q, assigned_to: requestedOwner };
}

/** Initial manager assignment. Query creation and assignment remain distinct audited events. */
export function assignQuery(queryId: string, newOwner: string, by: string, reason?: string) {
  if (!inited) load();
  const q = getCrmQuery(queryId);
  if (!q || !newOwner.trim()) return;
  if (q.assignment_status === "Assigned") {
    reassignQuery(queryId, newOwner, by, reason);
    return;
  }
  const now = new Date();
  const at = iso(now);
  const assignment = { assigned_at: at, assigned_by: by, assigned_to: newOwner, reason };
  queries = queries.map((item) =>
    item.id === q.id
      ? {
          ...item,
          owner: newOwner,
          assignment_status: "Assigned",
          assigned_on: at,
          assigned_at: at,
          assigned_by: by,
          assignment_history: [...(item.assignment_history || []), assignment],
          lifecycle: item.lifecycle.map((step) =>
            step.label === "Assigned" ? { ...step, at } : step,
          ),
          activities: [
            {
              id: `a_${now.getTime()}`,
              title: `Assigned to ${newOwner}${reason ? ` — ${reason}` : ""}`,
              at,
              by,
            },
            ...item.activities,
          ],
        }
      : item,
  );
  logEvent({
    type: "lead_assigned",
    by,
    at,
    title: `Query assigned to ${newOwner}`,
    detail: `${q.query_id} • ${q.customer}${reason ? ` • ${reason}` : ""}`,
    query_id: q.query_id,
    lead_id: q.lead_id,
    assigned_to: newOwner,
  });
  tasks = [
    {
      id: `tk_${now.getTime()}`,
      title: `Review new requirement (${q.query_id})`,
      query_id: q.query_id,
      due_at: iso(addDays(now, 1)),
      owner: newOwner,
      note: `${q.pax} Pax • ${q.enquiry_type}`,
      done: false,
      assigned_by: by,
      assigned_at: at,
      category: "Query",
      priority: q.priority,
      updates: [],
    },
    ...tasks,
  ];
  persist();
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
      type: "lead_reassigned",
      by: actor,
      at: iso(now),
      title: `${q.query_id} reassigned to ${newOwner}`,
      detail: `${from ? `From ${from} → ` : ""}${newOwner} • ${q.customer}${reason ? ` • Reason: ${reason}` : ""}`,
      query_id: q.query_id,
      lead_id: q.lead_id,
      assigned_to: newOwner,
      assigned_from: from,
      assign_reason: reason,
      prev_value: from,
      new_value: newOwner,
    });
    return {
      ...q,
      owner: newOwner,
      assigned_on: iso(now),
      assigned_by: actor,
      assignment_status: "Assigned",
      assigned_at: iso(now),
      assignment_history: [
        ...(q.assignment_history || []),
        {
          assigned_at: iso(now),
          assigned_by: actor,
          assigned_to: newOwner,
          assigned_from: from,
          reason,
        },
      ],
      last_updated_by: actor,
      last_activity_at: iso(now),
      activities: [
        {
          id: "a_" + now.getTime(),
          title: `Reassigned from ${from || "unassigned"} to ${newOwner}${reason ? ` — ${reason}` : ""}`,
          at: iso(now),
          by: actor,
        },
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
  category?: CrmTask["category"];
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
    category: input.category ?? "General",
    done: false,
    assigned_by: actor,
    assigned_at: iso(now),
    updates: [], // ✅ NEW: initialise empty updates array
  };
  tasks = [task, ...tasks];
  logEvent({
    type: "task_assigned",
    by: actor,
    at: iso(now),
    title: `Task assigned to ${input.owner}`,
    detail: `${task.title}${input.query_id ? ` • ${input.query_id}` : ""}`,
    query_id: input.query_id || undefined,
    assigned_to: input.owner,
    task_id: task.id,
  });
  persist();
  return task;
}

// ✅ NEW: Add a progress update to a task
export function addTaskUpdate(taskId: string, text: string, by?: string) {
  if (!inited) load();
  const now = new Date();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;
  const actor = by || task.owner || "System";
  const update = {
    timestamp: iso(now),
    text: text.trim(),
    by: actor,
  };
  tasks = tasks.map((t) =>
    t.id === taskId ? { ...t, updates: [...(t.updates || []), update] } : t,
  );
  // Also log to event stream for admin audit
  logEvent({
    type: "task_updated",
    by: actor,
    at: iso(now),
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
  tasks = tasks.map((t) =>
    t.id === id ? { ...t, owner: newOwner, assigned_by: actor, assigned_at: iso(now) } : t,
  );
  logEvent({
    type: "task_reassigned",
    by: actor,
    at: iso(now),
    title: `Task reassigned to ${newOwner}`,
    detail: `${task.title} • From ${task.owner} → ${newOwner}`,
    query_id: task.query_id || undefined,
    assigned_to: newOwner,
    assigned_from: task.owner,
    task_id: task.id,
  });
  persist();
}

/** Chronological assignment history for a query (oldest first). */
export function assignmentHistory(queryId: string): CrmEvent[] {
  if (!inited) load();
  return events
    .filter(
      (e) => e.query_id === queryId && (e.type === "lead_assigned" || e.type === "lead_reassigned"),
    )
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
export function setQueryStage(
  queryId: string,
  stage: Stage,
  by?: string,
  closure?: { reason?: string; notes?: string },
) {
  if (!inited) load();
  const now = new Date();
  const current = queries.find((q) => q.query_id === queryId || q.id === queryId);
  if (!current) return;
  if (stage === "Lost" && !closure?.reason?.trim()) {
    throw new Error("A Lost reason is required before closing this query.");
  }
  if (current.assignment_status !== "Assigned" && stage !== "Lost") {
    throw new Error("Assign the query before moving it through the Sales lifecycle.");
  }
  queries = queries.map((q) => {
    if (q.query_id !== queryId && q.id !== queryId) return q;
    if (q.stage === stage) return q;
    const actor = by ?? q.owner;
    const lifecycleLabel = stage === "Won" || stage === "Lost" ? "Won / Lost" : stage;
    const lifecycle = q.lifecycle.map((s) =>
      s.label === lifecycleLabel ? { ...s, at: iso(now) } : s,
    );
    const enteredAt = stageEnteredAt(q);
    const durationHours = Math.max(0, (now.getTime() - new Date(enteredAt).getTime()) / 36e5);
    const activity: ActivityItem = {
      id: "a_" + now.getTime(),
      title: `Stage changed: ${q.stage} → ${stage}`,
      at: iso(now),
      by: actor,
    };
    logEvent({
      type:
        stage === "Won"
          ? "won"
          : stage === "Lost"
            ? "lost"
            : stage === "Quotation Sent"
              ? "quotation_sent"
              : "stage_changed",
      by: actor,
      at: iso(now),
      title:
        stage === "Won"
          ? `Query won by ${actor}`
          : stage === "Lost"
            ? `Query marked lost by ${actor}`
            : stage === "Quotation Sent"
              ? `Quotation sent by ${actor}`
              : `${q.query_id} moved to ${stage} by ${actor}`,
      detail: `${q.stage} → ${stage} • spent ${fmtDur(durationHours)} in ${q.stage} • ${q.customer}`,
      query_id: q.query_id,
      lead_id: q.lead_id,
      from_stage: q.stage,
      to_stage: stage,
      duration_hours: durationHours,
    });
    const assignedFirstAction = q.first_action_at || iso(now);
    const wonHandoff =
      stage === "Won"
        ? {
            id: `ops_${q.id}_${now.getTime()}`,
            status: "Awaiting Operations Acceptance" as const,
            created_at: iso(now),
            created_by: actor || "System",
          }
        : q.operations_handoff;
    return {
      ...q,
      stage,
      stage_changed_at: iso(now),
      requirement_completed_at:
        stage === "Costing" && !q.requirement_completed_at ? iso(now) : q.requirement_completed_at,
      costing_started_at:
        stage === "Costing" && !q.costing_started_at ? iso(now) : q.costing_started_at,
      costing_completed_at:
        stage === "Quotation Sent" && !q.costing_completed_at ? iso(now) : q.costing_completed_at,
      first_quotation_sent_at:
        stage === "Quotation Sent"
          ? q.first_quotation_sent_at || iso(now)
          : q.first_quotation_sent_at,
      latest_quotation_sent_at: stage === "Quotation Sent" ? iso(now) : q.latest_quotation_sent_at,
      nurturing_at: stage === "Nurturing" ? iso(now) : q.nurturing_at,
      work_status: stage === "Won" ? "Won" : stage === "Lost" ? "Lost" : "Open",
      first_action_at: assignedFirstAction,
      closed_at: stage === "Won" || stage === "Lost" ? iso(now) : undefined,
      lost_reason: stage === "Lost" ? closure?.reason?.trim() : undefined,
      lost_notes: stage === "Lost" ? closure?.notes?.trim() : undefined,
      operations_handoff: wonHandoff,
      lifecycle,
      activities: [activity, ...q.activities],
    };
  });
  const updated = getCrmQuery(queryId);
  if (stage === "Quotation Sent" && updated) {
    const due = iso(addDays(now, 3));
    queries = queries.map((q) =>
      q.id === updated.id ? { ...q, followup_due: due, next_action: "Follow up on quotation" } : q,
    );
    tasks = [
      {
        id: `tk_quote_${now.getTime()}`,
        title: `Follow up after quotation (${updated.query_id})`,
        query_id: updated.query_id,
        due_at: due,
        owner: updated.owner,
        note: "Automatically scheduled 3 days after quotation was sent.",
        done: false,
        assigned_by: by || updated.owner,
        assigned_at: iso(now),
        category: "Follow-up",
        priority: updated.priority,
        updates: [],
      },
      ...tasks,
    ];
    logEvent({
      type: "followup_created",
      by: by || updated.owner,
      at: iso(now),
      title: "Automatic +3 day quotation follow-up created",
      detail: `Due ${due}`,
      query_id: updated.query_id,
      lead_id: updated.lead_id,
      new_value: due,
    });
  }
  if ((stage === "Lost" || stage === "Won") && updated) {
    tasks = tasks.map((task) =>
      task.query_id === updated.query_id && !task.done
        ? { ...task, done: true, completed_at: iso(now), closed_reason: `Query marked ${stage}` }
        : task,
    );
    if (stage === "Lost") {
      logEvent({
        type: "lost_reason_recorded",
        by: by || updated.owner,
        at: iso(now),
        title: `Lost reason: ${closure?.reason}`,
        detail: closure?.notes,
        query_id: updated.query_id,
        lead_id: updated.lead_id,
      });
    } else {
      logEvent({
        type: "operations_handoff_created",
        by: by || updated.owner,
        at: iso(now),
        title: "Operations handoff created",
        detail: "Awaiting Operations Acceptance",
        query_id: updated.query_id,
        lead_id: updated.lead_id,
      });
    }
  }
  persist();
}

export function acceptOperationsHandoff(queryId: string, by: string, note?: string) {
  if (!inited) load();
  const now = iso(new Date());
  const q = getCrmQuery(queryId);
  if (!q?.operations_handoff) return;
  queries = queries.map((item) =>
    item.id === q.id
      ? {
          ...item,
          operations_handoff: {
            ...item.operations_handoff!,
            status: "Accepted",
            accepted_at: now,
            accepted_by: by,
            note,
          },
        }
      : item,
  );
  logEvent({
    type: "operations_handoff_accepted",
    by,
    at: now,
    title: "Operations handoff accepted",
    detail: note,
    query_id: q.query_id,
    lead_id: q.lead_id,
  });
  persist();
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
    const version = previous.reduce((max, item) => Math.max(max, item.version), 0) + 1;
    const sellingPrice = Math.max(
      quote.totals.grand_sgl,
      quote.totals.grand_dbl,
      quote.totals.grand_trp,
    );
    const costPrice =
      Math.max(quote.totals.room_net_sgl, quote.totals.room_net_dbl, quote.totals.room_net_trp) +
      quote.totals.addons_total;
    const scenarioValues = (quote.scenarios ?? [])
      .map((scenario) => scenario.grand_total)
      .filter((value) => Number.isFinite(value) && value > 0);
    const bottomLine = quote.query_snapshot?.bottom_line
      || (scenarioValues.length ? Math.min(...scenarioValues) : sellingPrice);
    const topLine = quote.query_snapshot?.top_line
      || (scenarioValues.length ? Math.max(...scenarioValues) : sellingPrice);
    const categoryRank = (value: string) => {
      const normalized = value.toLowerCase();
      if (normalized.includes("budget")) return 1;
      const stars = Number(normalized.match(/([1-5])\s*star/)?.[1] || 0);
      if (stars) return stars * 10 + (normalized.includes("deluxe") || normalized.includes("superior") ? 1 : 0);
      if (normalized.includes("luxury") || normalized.includes("experiential")) return 60;
      if (normalized.includes("homestay")) return 5;
      return 50;
    };
    const categories = [...(quote.query_snapshot?.hotel_categories ?? [])]
      .filter(Boolean)
      .sort((a, b) => categoryRank(a) - categoryRank(b));
    const scenarioPax = (quote.scenarios ?? [])
      .map((scenario) => scenario.pax)
      .filter((value) => Number.isFinite(value) && value > 0);
    const minPax = quote.query_snapshot?.pax_min
      || (scenarioPax.length ? Math.min(...scenarioPax) : q.min_pax || q.pax);
    const maxPax = quote.query_snapshot?.pax_max
      || quote.group_total_pax
      || (scenarioPax.length ? Math.max(...scenarioPax) : q.max_pax || q.pax);
    return {
      ...q,
      stage: q.stage === "New" || q.stage === "Requirement Review" ? "Costing" : q.stage,
      stage_changed_at:
        q.stage === "New" || q.stage === "Requirement Review" ? iso(now) : q.stage_changed_at,
      costing_started_at: q.costing_started_at || iso(now),
      costing_completed_at: iso(now),
      value: topLine,
      pax: maxPax || q.pax,
      adults: q.adults || maxPax || q.pax,
      min_pax: minPax || q.min_pax,
      max_pax: maxPax || q.max_pax,
      hotel_category_from: categories[0] || q.hotel_category_from,
      hotel_category_to: categories.at(-1) || q.hotel_category_to,
      program_id: quote.query_snapshot?.program_id || q.program_id,
      program_name: quote.query_snapshot?.program_name || q.program_name,
      destination: quote.query_snapshot?.program_name || q.destination,
      routing: quote.query_snapshot?.routing || q.routing,
      travel_start: quote.travel_start || q.travel_start,
      travel_end: quote.travel_end || q.travel_end,
      first_action_at: q.first_action_at || iso(now),
      commercials: {
        ...q.commercials,
        cost_price: costPrice,
        selling_price: sellingPrice,
        bottom_line: bottomLine,
        top_line: topLine,
        final_cost: costPrice,
        final_selling: sellingPrice,
        margin_value: sellingPrice - costPrice,
        margin_pct: sellingPrice ? ((sellingPrice - costPrice) / sellingPrice) * 100 : 0,
      },
      lifecycle: q.lifecycle.map((item) =>
        item.label === "Costing" && !item.at ? { ...item, at: iso(now) } : item,
      ),
      costing_versions: [
        ...previous,
        {
          version,
          saved_at: quote.saved_at,
          saved_by: by,
          draft_id: draftId,
          quote: { ...quote, version },
        },
      ],
      activities: [
        { id: `a_${now.getTime()}`, title: `Costing V${version} saved`, at: iso(now), by },
        ...q.activities,
      ],
    };
  });
  const updated = getCrmQuery(queryId);
  const latest = updated?.costing_versions?.at(-1);
  if (updated && latest) {
    logEvent({
      type: latest.version === 1 ? "quotation_started" : "quotation_updated",
      by,
      at: iso(now),
      title: `Costing V${latest.version} saved`,
      detail: `${latest.quote.quote_number} • ${updated.customer}`,
      query_id: updated.query_id,
      lead_id: updated.lead_id,
    });
  }
  persist();
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
      type: "note_added",
      by: actor,
      at: iso(now),
      title: `Note added by ${actor}`,
      detail: text,
      query_id: q.query_id,
      lead_id: q.lead_id,
    });
    return {
      ...q,
      activities: [
        { id: "a_" + now.getTime(), title: text, at: iso(now), by: actor },
        ...q.activities,
      ],
    };
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
  const openStages: Stage[] = [
    "New",
    "Requirement Review",
    "Costing",
    "Quotation Sent",
    "Follow-up",
    "Nurturing",
  ];
  let logged = 0;

  queries.forEach((q) => {
    if (!openStages.includes(q.stage)) return;
    const due = new Date(q.followup_due).getTime();
    if (!due || due >= now) return;
    const already = events.some(
      (e) =>
        e.type === "followup_overdue" &&
        e.query_id === q.query_id &&
        e.detail?.includes(q.followup_due),
    );
    if (already) return;
    logEvent({
      type: "followup_overdue",
      by: q.owner || "System",
      at: iso(new Date()),
      title: `Follow-up overdue — ${q.query_id}`,
      detail: `Due ${q.followup_due} • ${q.customer} • owner ${q.owner || "unassigned"}`,
      query_id: q.query_id,
      lead_id: q.lead_id,
      overdue_hours: (now - due) / 36e5,
    });
    if (
      (now - due) / 36e5 >= 48 &&
      !events.some(
        (e) =>
          e.type === "manager_escalated" &&
          e.query_id === q.query_id &&
          e.detail?.includes(q.followup_due),
      )
    ) {
      logEvent({
        type: "manager_escalated",
        by: "System",
        at: iso(new Date()),
        title: `Manager escalation — ${q.query_id}`,
        detail: `Follow-up overdue by more than 48 hours • ${q.owner || "unassigned"} • ${q.followup_due}`,
        query_id: q.query_id,
        lead_id: q.lead_id,
        overdue_hours: (now - due) / 36e5,
      });
    }
    logged++;
  });

  tasks.forEach((t) => {
    if (t.done) return;
    const due = new Date(t.due_at).getTime();
    if (!due || due >= now) return;
    const already = events.some((e) => e.type === "task_overdue" && e.task_id === t.id);
    if (already) return;
    logEvent({
      type: "task_overdue",
      by: t.owner || "System",
      at: iso(new Date()),
      title: `Task overdue — ${t.title}`,
      detail: `Due ${t.due_at} • owner ${t.owner || "unassigned"}`,
      query_id: t.query_id || undefined,
      task_id: t.id,
      overdue_hours: (now - due) / 36e5,
    });
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
      type: "followup_logged",
      by: actor,
      at: iso(now),
      title: `Follow-up logged by ${actor}`,
      detail: `${q.query_id} • ${note}`,
      query_id: q.query_id,
      lead_id: q.lead_id,
    });
    return {
      ...q,
      followup_due: nextDue ?? q.followup_due,
      activities: [
        { id: "a_" + now.getTime(), title: note || "Follow-up logged", at: iso(now), by: actor },
        ...q.activities,
      ],
    };
  });
  persist();
}

export function toggleTask(id: string) {
  if (!inited) load();
  const task = tasks.find((t) => t.id === id);
  const now = iso(new Date());
  tasks = tasks.map((t) =>
    t.id === id ? { ...t, done: !t.done, completed_at: t.done ? undefined : now } : t,
  );
  if (task && !task.done) {
    logEvent({
      type: "task_completed",
      by: task.owner,
      at: now,
      title: `Task completed by ${task.owner}`,
      detail: task.title,
      query_id: task.query_id,
      task_id: task.id,
    });
  }
  persist();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const EMPTY: never[] = [];

export function useCrmQueries(): CrmQuery[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!inited) load();
      return queries;
    },
    () => EMPTY,
  );
}
export function useCrmTasks(): CrmTask[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!inited) load();
      return tasks;
    },
    () => EMPTY,
  );
}
export function useEmployees(): Employee[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!inited) load();
      return employees;
    },
    () => EMPTY,
  );
}
export function useCrmEvents(): CrmEvent[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!inited) load();
      return events;
    },
    () => EMPTY,
  );
}

// ---- derived helpers -------------------------------------------------------
export const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
