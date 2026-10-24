// src/lib/crm/store.ts
// CRM store — immediate local cache synchronized to the shared database by
// crm-remote.ts. No seeded/sample data: every record comes from user actions.
import { useSyncExternalStore } from "react";
import type {
  ActivityItem,
  AssignmentCandidate,
  AssistanceAssignment,
  CrmEvent,
  CrmQuery,
  CrmTask,
  Employee,
  AssistanceContribution,
  QuotationReviewAssignment,
  ReviewChecklistItem,
  ReviewPriority,
  ReviewStatus,
  QueryReviewAssignment,
  QueryQuotationDraft,
  StandaloneQuotationReviewAssignment,
  Stage,
} from "./types";
import { LIFECYCLE } from "./types";
import { quoteContentHash } from "@/lib/quotes-store";
import {
  IMPORTED_QUERIES,
  IMPORTED_QUERY_EVENTS,
  IMPORTED_QUERY_TASKS,
  QUERY_TRACKER_DATASET_ID,
} from "./query-tracker-import.generated";

const KEY = "mp_crm_queries_v2";
const TASK_KEY = "mp_crm_tasks_v2";
const EMP_KEY = "mp_crm_employees_v3";
const EMPLOYEE_CACHE_VERSION_KEY = "mp_crm_employee_cache_version";
const EVENT_KEY = "mp_crm_events_v2";
const STANDALONE_REVIEW_KEY = "mp_crm_standalone_quotation_reviews_v1";
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
let assignmentCandidates: AssignmentCandidate[] = [];
export type CloudHydrationStatus = "idle" | "loading" | "ready" | "error";
let crmHydrationStatus: CloudHydrationStatus = "idle";
let employeeDirectoryStatus: CloudHydrationStatus = "idle";
let assignmentDirectoryStatus: CloudHydrationStatus = "idle";
let events: CrmEvent[] = [];
let standaloneQuotationReviews: StandaloneQuotationReviewAssignment[] = [];
let inited = false;
let storageSizesLogged = false;
const rejectedStorageWrites = new Map<string, string>();
let serializedQueryCache: { source: CrmQuery[]; value: string } | null = null;

function isQuotaExceeded(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

function safeSetStorage(key: string, value: string): boolean {
  const signature = `${value.length}:${value.slice(0, 96)}:${value.slice(-96)}`;
  // Preserve the existing cache after a quota rejection and avoid repeatedly
  // attempting the same oversized cloud-authoritative snapshot.
  if (rejectedStorageWrites.get(key) === signature) return false;
  try {
    if (localStorage.getItem(key) === value) return true;
    localStorage.setItem(key, value);
    rejectedStorageWrites.delete(key);
    return true;
  } catch (error) {
    const approximateBytes = value.length * 2;
    if (isQuotaExceeded(error)) {
      rejectedStorageWrites.set(key, signature);
      console.error("[crm] local cache quota exceeded", { key, approximateBytes, error });
      return false;
    }
    // CRM state is cloud-authoritative. A browser cache failure must remain
    // visible for diagnosis, but must never prevent in-memory hydration.
    console.error("[crm] local cache write failed", { key, approximateBytes, error });
    return false;
  }
}

function serializedQueriesForCache(): string {
  if (serializedQueryCache?.source === queries) return serializedQueryCache.value;
  const value = JSON.stringify(queries);
  serializedQueryCache = { source: queries, value };
  return value;
}

function compactTasksForCache(records: CrmTask[]): CrmTask[] {
  const ordered = [
    ...records.filter((task) => !task.query_id),
    ...records.filter((task) => task.query_id && !task.done),
    ...records.filter((task) => task.query_id && task.done),
  ];
  const unique = new Map<string, CrmTask>();
  for (const task of ordered) {
    if (unique.has(task.id)) continue;
    unique.set(task.id, {
      id: task.id,
      title: task.title,
      query_id: task.query_id,
      due_at: task.due_at,
      owner: task.owner,
      done: task.done,
      priority: task.priority,
      category: task.category,
      assigned_by: task.assigned_by,
      assigned_at: task.assigned_at,
      completed_at: task.completed_at,
      closed_reason: task.closed_reason,
    });
    if (unique.size >= 250) break;
  }
  return [...unique.values()];
}

function logLocalStorageSizes() {
  if (!import.meta.env.DEV || storageSizesLogged || !isBrowser()) return;
  storageSizesLogged = true;
  const keys = [
    TASK_KEY,
    KEY,
    EVENT_KEY,
    EMP_KEY,
    STANDALONE_REVIEW_KEY,
    "mp_tourism_drafts",
    "mp_tourism_draft_quote",
    "mp_tourism_quotes",
  ];
  console.info(
    "[crm] local storage sizes",
    keys.map((key) => {
      const value = localStorage.getItem(key) || "";
      const bytes = value.length * 2;
      return { key, bytes, kb: Number((bytes / 1024).toFixed(1)) };
    }),
  );
}

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
  logLocalStorageSizes();
  const storedQueries = parse<CrmQuery>(localStorage.getItem(KEY));
  const storedTasks = parse<CrmTask>(localStorage.getItem(TASK_KEY));
  const compactStoredTasks = compactTasksForCache(storedTasks);
  const compactStoredTaskJson = JSON.stringify(compactStoredTasks);
  const existingStoredTaskJson = localStorage.getItem(TASK_KEY) || "[]";
  if (compactStoredTaskJson.length < existingStoredTaskJson.length) {
    // crm_tasks is authoritative in Supabase. Retain a small startup projection
    // while dropping repeated progress history from this regenerable cache only.
    safeSetStorage(TASK_KEY, compactStoredTaskJson);
  }
  const storedEvents = parse<CrmEvent>(localStorage.getItem(EVENT_KEY));
  standaloneQuotationReviews = parse<StandaloneQuotationReviewAssignment>(
    localStorage.getItem(STANDALONE_REVIEW_KEY),
  );
  migrateEmployeeCache();
  // Never restore employee identities from browser storage for authorization.
  // Preserve only a row already verified by the live auth bootstrap.

  if (localStorage.getItem(DATASET_KEY) !== QUERY_TRACKER_DATASET_ID) {
    // This release intentionally replaces the prior Query Tracker dataset.
    // Preserve employees and standalone tasks/events; remove only records tied
    // to the superseded Queries before loading the authoritative Excel import.
    queries = clone(IMPORTED_QUERIES).map(normalizeQuery);
    tasks = [...clone(IMPORTED_QUERY_TASKS), ...storedTasks.filter((task) => !task.query_id)];
    events = [...clone(IMPORTED_QUERY_EVENTS), ...storedEvents.filter((event) => !event.query_id)];
    safeSetStorage(KEY, serializedQueriesForCache());
    safeSetStorage(TASK_KEY, JSON.stringify(compactTasksForCache(tasks)));
    safeSetStorage(EVENT_KEY, JSON.stringify(events.slice(0, 800)));
    safeSetStorage(DATASET_KEY, QUERY_TRACKER_DATASET_ID);
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

export function setCrmHydrationStatus(status: CloudHydrationStatus) {
  crmHydrationStatus = status;
  emit();
}

export function setEmployeeDirectoryStatus(status: CloudHydrationStatus) {
  employeeDirectoryStatus = status;
  emit();
}
export function setAssignmentDirectoryStatus(status: CloudHydrationStatus) {
  assignmentDirectoryStatus = status;
  emit();
}
export interface CrmSnapshot {
  queries: CrmQuery[];
  tasks: CrmTask[];
  employees: Employee[];
  events: CrmEvent[];
  standaloneQuotationReviews: StandaloneQuotationReviewAssignment[];
}

export function getCrmSnapshot(): CrmSnapshot {
  if (!inited) load();
  return { queries, tasks, employees, events, standaloneQuotationReviews };
}

export function migrateEmployeeCache() {
  if (!isBrowser()) return;
  if (localStorage.getItem(EMPLOYEE_CACHE_VERSION_KEY) !== "3") {
    localStorage.removeItem("mp_crm_employees_v2");
    localStorage.removeItem("mp_crm_employee_roster_revision");
    localStorage.removeItem(EMP_KEY);
    safeSetStorage(EMPLOYEE_CACHE_VERSION_KEY, "3");
  }
}

/** Replace only the read cache with rows fetched from Supabase. Never triggers a cloud push. */
export function replaceEmployeesFromCloud(records: Employee[]) {
  migrateEmployeeCache();
  employees = records;
  if (isBrowser()) safeSetStorage(EMP_KEY, JSON.stringify(employees));
  emit();
}
/** Replace the minimal, RLS-authorized assignment directory only. */
export function replaceAssignmentCandidatesFromCloud(records: AssignmentCandidate[]) {
  assignmentCandidates = records;
  emit();
}

export function hydrateCrm(snapshot: CrmSnapshot) {
  migrateEmployeeCache();
  inited = true;
  queries = snapshot.queries.map(normalizeQuery);
  tasks = snapshot.tasks;
  employees = snapshot.employees;
  events = snapshot.events;
  standaloneQuotationReviews = snapshot.standaloneQuotationReviews || [];
  crmHydrationStatus = "ready";
  employeeDirectoryStatus = "ready";
  // Publish authoritative in-memory state before attempting the optional
  // browser cache, so storage pressure cannot starve employee/reviewer hooks.
  emit();
  if (isBrowser()) {
    safeSetStorage(KEY, serializedQueriesForCache());
    safeSetStorage(TASK_KEY, JSON.stringify(compactTasksForCache(tasks)));
    safeSetStorage(EMP_KEY, JSON.stringify(employees));
    safeSetStorage(EVENT_KEY, JSON.stringify(events.slice(0, 800)));
    safeSetStorage(STANDALONE_REVIEW_KEY, JSON.stringify(standaloneQuotationReviews));
  }
}

export function onCrmPersist(listener: (snapshot: CrmSnapshot) => void) {
  persistListeners.add(listener);
  return () => persistListeners.delete(listener);
}

function persist() {
  if (!isBrowser()) return;
  safeSetStorage(KEY, serializedQueriesForCache());
  safeSetStorage(TASK_KEY, JSON.stringify(compactTasksForCache(tasks)));
  safeSetStorage(EMP_KEY, JSON.stringify(employees));
  safeSetStorage(EVENT_KEY, JSON.stringify(events.slice(0, 800)));
  safeSetStorage(STANDALONE_REVIEW_KEY, JSON.stringify(standaloneQuotationReviews));
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
/** Stable employee IDs are stored as owners; convert only at the presentation edge. */
export function ownerDisplayName(owner?: string): string {
  if (!inited) load();
  if (!owner || owner === "Unassigned") return "Awaiting Assignment";
  return employees.find((employee) => employee.id === owner)?.name || owner;
}
export function listAssignmentCandidates(): AssignmentCandidate[] {
  return assignmentCandidates;
}
export function listCrmEvents(): CrmEvent[] {
  if (!inited) load();
  return events;
}
export function getCrmQuery(queryId: string): CrmQuery | undefined {
  return listCrmQueries().find((q) => q.query_id === queryId || q.id === queryId);
}

/** Replace one cloud-confirmed Query without scheduling a stale whole-store overwrite. */
export function replaceQueryFromCloud(record: CrmQuery) {
  if (!inited) load();
  const normalized = normalizeQuery(record);
  queries = queries.map((query) => (query.id === normalized.id ? normalized : query));
  if (!queries.some((query) => query.id === normalized.id)) queries.push(normalized);
  if (isBrowser()) safeSetStorage(KEY, serializedQueriesForCache());
  emit();
}

export function getQueryQuotationDraft(draftId: string): QueryQuotationDraft | undefined {
  return listCrmQueries()
    .flatMap((query) => query.quotation_drafts ?? [])
    .find((draft) => draft.id === draftId);
}

export function upsertQueryQuotationDraft(
  queryId: string,
  input: Omit<QueryQuotationDraft, "query_id" | "created_at" | "updated_at"> & {
    created_at?: string;
    updated_at?: string;
  },
) {
  if (!inited) load();
  const now = new Date().toISOString();
  queries = queries.map((query) => {
    if (query.query_id !== queryId && query.id !== queryId) return query;
    const drafts = query.quotation_drafts ?? [];
    const existing = drafts.find((draft) => draft.id === input.id);
    const next: QueryQuotationDraft = {
      ...input,
      query_id: query.query_id,
      created_at: input.created_at || existing?.created_at || now,
      updated_at: input.updated_at || now,
    };
    return {
      ...query,
      quotation_drafts: existing
        ? drafts.map((draft) => (draft.id === next.id ? next : draft))
        : [next, ...drafts],
    };
  });
  persist();
}

export function removeQueryQuotationDraft(queryId: string, draftId: string) {
  if (!inited) load();
  queries = queries.map((query) =>
    query.query_id === queryId || query.id === queryId
      ? {
          ...query,
          quotation_drafts: (query.quotation_drafts ?? []).filter((draft) => draft.id !== draftId),
        }
      : query,
  );
  persist();
}

// ---- activity log ----------------------------------------------------------
/** Event types that should NOT bump "last activity" (system generated). */
const PASSIVE_EVENTS = new Set([
  "followup_overdue",
  "task_overdue",
  "followup_missed",
  "lead_viewed",
]);

function logEvent(
  e: Omit<CrmEvent, "id" | "at"> & { at?: string },
  options: { updateQueryActivity?: boolean } = {},
) {
  const at = e.at ?? iso(new Date());
  events = [
    { id: "ev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7), at, ...e },
    ...events,
  ];
  if (options.updateQueryActivity !== false && e.query_id && !PASSIVE_EVENTS.has(e.type)) {
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

function logWorkflowEvent(e: Omit<CrmEvent, "id" | "at"> & { at?: string }) {
  logEvent(e, { updateQueryActivity: false });
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
          last_followup_by: actor,
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
  auth_user_id?: string;
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
  login_email_pending?: boolean;
}

/** Persist explicit review/support access inside the authoritative Query JSON record. */
export function setQueryCollaboration(
  queryId: string,
  patch: Pick<
    CrmQuery,
    "shared_with_employee_ids" | "reviewer_employee_ids" | "assistance_employee_ids"
  >,
  by: string,
) {
  if (!inited) load();
  const query = getCrmQuery(queryId);
  if (!query) throw new Error("Query not found.");
  queries = queries.map((item) =>
    item.id === query.id
      ? {
          ...item,
          shared_with_employee_ids: [...new Set(patch.shared_with_employee_ids || [])],
          reviewer_employee_ids: [...new Set(patch.reviewer_employee_ids || [])],
          assistance_employee_ids: [...new Set(patch.assistance_employee_ids || [])],
          last_updated_by: by,
          last_activity_at: iso(new Date()),
        }
      : item,
  );
  logEvent({
    type: "note_added",
    by,
    title: "Review and assistance access updated",
    detail: "Explicit reviewers, assistants and shared users were updated.",
    query_id: query.query_id,
    lead_id: query.lead_id,
  });
  persist();
}

/** Formal review assignment, persisted in the authoritative Query JSON and CRM event stream. */
export function requestQueryReview(
  queryId: string,
  input: {
    reviewerEmployeeId: string;
    requestedByEmployeeId: string;
    dueAt?: string;
    instructions?: string;
    priority?: ReviewPriority;
  },
) {
  if (!inited) load();
  const query = getCrmQuery(queryId);
  if (!query) throw new Error("Query not found.");
  const requestedAt = iso(new Date());
  const assignment: QueryReviewAssignment = {
    id: crypto.randomUUID(),
    reviewer_employee_id: input.reviewerEmployeeId,
    requested_by_employee_id: input.requestedByEmployeeId,
    created_at: requestedAt,
    requested_at: requestedAt,
    due_at: input.dueAt,
    reason: input.instructions,
    instructions: input.instructions,
    priority: input.priority ?? "Normal",
    status: "Requested",
    assignment_history: [
      {
        employee_id: input.reviewerEmployeeId,
        assigned_by_employee_id: input.requestedByEmployeeId,
        assigned_at: requestedAt,
      },
    ],
    checklist: [
      "Query details checked",
      "Pax/travel details checked",
      "Routing checked",
      "Programme checked",
      "Commercial requirement checked",
      "Follow-up/action checked",
    ].map((label) => ({ label, status: "Pending" as const })),
  };
  queries = queries.map((item) =>
    item.id === query.id
      ? {
          ...item,
          review_support: {
            ...item.review_support,
            query_reviews: [...(item.review_support?.query_reviews || []), assignment],
          },
        }
      : item,
  );
  logWorkflowEvent({
    type: "note_added",
    by: input.requestedByEmployeeId,
    at: assignment.requested_at,
    title: "Query review requested",
    detail: `Review requested from ${employees.find((employee) => employee.id === input.reviewerEmployeeId)?.name || input.reviewerEmployeeId}. Assignment ${assignment.id}`,
    query_id: query.query_id,
    lead_id: query.lead_id,
  });
  persist();
  return assignment;
}

export function assignQueryAssistance(
  queryId: string,
  input: {
    assistantEmployeeId: string;
    assignedByEmployeeId: string;
    dueAt?: string;
    reason?: string;
    areas: string[];
    priority?: ReviewPriority;
  },
) {
  if (!inited) load();
  const query = getCrmQuery(queryId);
  if (!query) throw new Error("Query not found.");
  const assignedAt = iso(new Date());
  const assignment = {
    id: crypto.randomUUID(),
    assistant_employee_id: input.assistantEmployeeId,
    assigned_by_employee_id: input.assignedByEmployeeId,
    created_at: assignedAt,
    assigned_at: assignedAt,
    due_at: input.dueAt,
    reason: input.reason,
    instructions: input.reason,
    priority: input.priority ?? "Normal",
    areas: input.areas,
    status: "Requested" as const,
    assignment_history: [
      {
        employee_id: input.assistantEmployeeId,
        assigned_by_employee_id: input.assignedByEmployeeId,
        assigned_at: assignedAt,
      },
    ],
    contributions: [],
  };
  queries = queries.map((item) =>
    item.id === query.id
      ? {
          ...item,
          review_support: {
            ...item.review_support,
            assistance: [...(item.review_support?.assistance || []), assignment],
          },
        }
      : item,
  );
  logWorkflowEvent({
    type: "note_added",
    by: input.assignedByEmployeeId,
    at: assignment.assigned_at,
    title: "Assistance assigned",
    detail: `Assistance assigned to ${employees.find((employee) => employee.id === input.assistantEmployeeId)?.name || input.assistantEmployeeId}. Assignment ${assignment.id}`,
    query_id: query.query_id,
    lead_id: query.lead_id,
  });
  persist();
  return assignment;
}

function updateReviewAssignment(
  queryId: string,
  kind: "query" | "quotation",
  assignmentId: string,
  updater: (
    assignment: QueryReviewAssignment | QuotationReviewAssignment,
  ) => QueryReviewAssignment | QuotationReviewAssignment,
) {
  const key = kind === "query" ? "query_reviews" : "quotation_reviews";
  let updated: QueryReviewAssignment | QuotationReviewAssignment | undefined;
  queries = queries.map((query) => {
    if (query.id !== queryId && query.query_id !== queryId) return query;
    const assignments = query.review_support?.[key] ?? [];
    return {
      ...query,
      review_support: {
        ...query.review_support,
        [key]: assignments.map((assignment) => {
          if (assignment.id !== assignmentId) return assignment;
          updated = updater(assignment);
          return updated;
        }),
      },
    };
  });
  if (!updated) throw new Error("Review request not found.");
  return updated;
}

export function updateReviewChecklist(
  queryId: string,
  kind: "query" | "quotation",
  assignmentId: string,
  checklist: ReviewChecklistItem[],
  by: string,
) {
  const assignment = getCrmQuery(queryId)?.review_support?.[
    kind === "query" ? "query_reviews" : "quotation_reviews"
  ]?.find((item) => item.id === assignmentId);
  if (!assignment || assignment.reviewer_employee_id !== by || assignment.status !== "In Review")
    throw new Error("Only the assigned reviewer may update an active review checklist.");
  updateReviewAssignment(queryId, kind, assignmentId, (assignment) => ({
    ...assignment,
    checklist,
  }));
  logWorkflowEvent({
    type: "note_added",
    by,
    title: `${kind === "query" ? "Query" : "Quotation"} review checklist updated`,
    query_id: getCrmQuery(queryId)?.query_id,
  });
  persist();
}

export function setReviewStatus(
  queryId: string,
  kind: "query" | "quotation",
  assignmentId: string,
  status: ReviewStatus,
  by: string,
  note?: string,
) {
  if (status === "Returned" && !note?.trim()) throw new Error("Return instructions are required.");
  const now = iso(new Date());
  const currentQuery = getCrmQuery(queryId);
  const key = kind === "query" ? "query_reviews" : "quotation_reviews";
  const current = currentQuery?.review_support?.[key]?.find((item) => item.id === assignmentId);
  if (!current) throw new Error("Review request not found.");
  const activeStatuses = ["Requested", "Assigned", "In Review", "Pending Review", "Under Review"];
  if (["In Review", "Approved", "Returned"].includes(status) && current.reviewer_employee_id !== by)
    throw new Error("Only the assigned reviewer may act on this review.");
  if (status === "Cancelled" && current.requested_by_employee_id !== by)
    throw new Error("Only the requester may cancel this review.");
  if (status === "Cancelled" && !activeStatuses.includes(current.status))
    throw new Error("Only an active review request can be cancelled.");
  if (status === "In Review" && !activeStatuses.includes(current.status))
    throw new Error("Only an active review request can be started.");
  if (["Approved", "Returned"].includes(status) && current.status !== "In Review")
    throw new Error("Start the review before approving or returning it.");
  const updated = updateReviewAssignment(queryId, kind, assignmentId, (assignment) => ({
    ...assignment,
    status,
    started_at: status === "In Review" ? assignment.started_at || now : assignment.started_at,
    completed_at: ["Approved", "Returned", "Cancelled"].includes(status)
      ? now
      : assignment.completed_at,
    decision_note: note?.trim() || assignment.decision_note,
    review_notes: note?.trim() || assignment.review_notes,
    decided_at: ["Approved", "Returned", "Cancelled"].includes(status)
      ? now
      : assignment.decided_at,
  }));
  const query = getCrmQuery(queryId);
  logWorkflowEvent({
    type: "note_added",
    by,
    at: now,
    title: `${kind === "query" ? "Query" : "Quotation"} review ${status.toLowerCase()}`,
    detail: note?.trim(),
    query_id: query?.query_id,
    lead_id: query?.lead_id,
  });
  persist();
  return updated;
}

export function requestQuotationReview(
  queryId: string,
  input: {
    quotationId: string;
    quotationVersion: number;
    reviewerEmployeeId: string;
    requestedByEmployeeId: string;
    dueAt?: string;
    instructions?: string;
    priority?: ReviewPriority;
  },
) {
  if (!inited) load();
  const query = getCrmQuery(queryId);
  if (!query) throw new Error("Query not found.");
  const version = query.costing_versions?.find(
    (item) => item.version === input.quotationVersion && item.quote.id === input.quotationId,
  );
  if (!version) throw new Error("Saved quotation version not found.");
  const requestedAt = iso(new Date());
  const assignment: QuotationReviewAssignment = {
    id: crypto.randomUUID(),
    quotation_id: input.quotationId,
    quotation_version: input.quotationVersion,
    quotation_snapshot: clone(version),
    reviewer_employee_id: input.reviewerEmployeeId,
    requested_by_employee_id: input.requestedByEmployeeId,
    created_at: requestedAt,
    requested_at: requestedAt,
    due_at: input.dueAt,
    reason: input.instructions,
    instructions: input.instructions,
    priority: input.priority ?? "Normal",
    status: "Requested",
    assignment_history: [
      {
        employee_id: input.reviewerEmployeeId,
        assigned_by_employee_id: input.requestedByEmployeeId,
        assigned_at: requestedAt,
      },
    ],
    checklist: [],
  };
  queries = queries.map((item) =>
    item.id === query.id
      ? {
          ...item,
          review_support: {
            ...item.review_support,
            quotation_reviews: [...(item.review_support?.quotation_reviews || []), assignment],
          },
        }
      : item,
  );
  logWorkflowEvent({
    type: "note_added",
    by: input.requestedByEmployeeId,
    title: `Quotation V${input.quotationVersion} review requested`,
    detail: input.instructions,
    query_id: query.query_id,
    lead_id: query.lead_id,
  });
  persist();
  return assignment;
}

export function requestDraftQuotationReview(
  queryId: string,
  input: {
    draftId: string;
    snapshot: import("@/lib/quotes-store").SavedQuote;
    reviewerEmployeeId: string;
    requestedByEmployeeId: string;
    instructions: string;
    priority?: ReviewPriority;
    dueAt?: string;
  },
) {
  if (!input.instructions.trim()) throw new Error("Review instructions are required.");
  const query = getCrmQuery(queryId);
  if (!query) throw new Error("Query not found.");
  const draft = query.quotation_drafts?.find((item) => item.id === input.draftId);
  if (!draft) throw new Error("Draft not found in the shared Query workspace.");
  const requester = employees.find((employee) => employee.id === input.requestedByEmployeeId);
  const reviewer = employees.find((employee) => employee.id === input.reviewerEmployeeId);
  if (!requester) throw new Error("The requesting CRM employee could not be resolved.");
  if (
    !reviewer ||
    !reviewer.active ||
    reviewer.account_status !== "Active" ||
    reviewer.employee_status === "Exited" ||
    reviewer.department !== "Sales"
  ) {
    throw new Error("The selected reviewer is not an active eligible CRM employee.");
  }
  const eligibleRoles =
    requester.role === "Sales Executive"
      ? ["Senior Sales Executive", "Sales Manager"]
      : requester.role === "Senior Sales Executive"
        ? ["Senior Sales Executive", "Sales Manager"]
        : requester.role === "Sales Manager"
          ? ["Senior Sales Executive", "Sales Manager"]
          : ["Sales Executive", "Senior Sales Executive", "Sales Manager"];
  if (
    reviewer.id === requester.id ||
    !eligibleRoles.includes(reviewer.role) ||
    (requester.unit?.trim() &&
      reviewer.unit?.trim() &&
      requester.unit.trim().toLowerCase() !== reviewer.unit.trim().toLowerCase())
  ) {
    throw new Error("The selected reviewer is outside the authorized review scope.");
  }
  const now = iso(new Date());
  const revision =
    (query.review_support?.query_reviews ?? []).filter(
      (review) => review.source_type === "draft" && review.draft_id === input.draftId,
    ).length + 1;
  const snapshotHash = input.snapshot.content_hash || quoteContentHash(input.snapshot);
  input.snapshot.content_hash = snapshotHash;
  const duplicate = (query.review_support?.query_reviews ?? []).some(
    (review) =>
      review.source_type === "draft" &&
      review.draft_id === input.draftId &&
      review.draft_snapshot_hash === snapshotHash &&
      !["Approved", "Returned", "Cancelled"].includes(review.status),
  );
  if (duplicate) throw new Error("Review is already pending for this exact draft snapshot.");
  const snapshot: import("./types").CostingVersion = {
    version: 0,
    saved_at: now,
    saved_by: input.snapshot.prepared_by_name || input.snapshot.saved_by,
    prepared_by_employee_id: input.snapshot.prepared_by_employee_id,
    prepared_by_auth_user_id: input.snapshot.prepared_by_auth_user_id,
    prepared_by_name: input.snapshot.prepared_by_name,
    prepared_by_role: input.snapshot.prepared_by_role,
    quote: JSON.parse(JSON.stringify(input.snapshot)),
  };
  const assignment: QueryReviewAssignment = {
    id: `qdr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    reviewer_employee_id: input.reviewerEmployeeId,
    requested_by_employee_id: input.requestedByEmployeeId,
    requested_at: now,
    created_at: now,
    instructions: input.instructions.trim(),
    priority: input.priority || "Normal",
    due_at: input.dueAt,
    status: "Requested",
    checklist: [],
    source_type: "draft",
    draft_id: input.draftId,
    draft_snapshot_revision: revision,
    draft_snapshot_hash: snapshotHash,
    draft_updated_at: draft.updated_at,
    quotation_lineage_id: draft.lineage_id || input.snapshot.family_id,
    quotation_snapshot: snapshot,
  };
  queries = queries.map((item) =>
    item.id === query.id
      ? {
          ...item,
          review_support: {
            ...(item.review_support || {}),
            query_reviews: [...(item.review_support?.query_reviews || []), assignment],
          },
          quotation_drafts: (item.quotation_drafts ?? []).map((record) =>
            record.id === input.draftId
              ? {
                  ...record,
                  latest_review_snapshot_at: now,
                  latest_review_snapshot_hash: snapshotHash,
                }
              : record,
          ),
        }
      : item,
  );
  logWorkflowEvent({
    type: "note_added",
    by: input.requestedByEmployeeId,
    at: now,
    title: `Draft review snapshot R${revision} requested`,
    detail: input.instructions.trim(),
    query_id: query.query_id,
    lead_id: query.lead_id,
  });
  persist();
  return assignment;
}

export function requestStandaloneQuotationReview(input: {
  draftId: string;
  draftName: string;
  draftUpdatedAt: string;
  snapshot: import("@/lib/quotes-store").SavedQuote;
  reviewerEmployeeId: string;
  requestedByEmployeeId: string;
  instructions: string;
  priority?: ReviewPriority;
  dueAt?: string;
  deferCloudSync?: boolean;
}) {
  if (!input.instructions.trim()) throw new Error("Review instructions are required.");
  const requester = employees.find((employee) => employee.id === input.requestedByEmployeeId);
  const reviewer = employees.find((employee) => employee.id === input.reviewerEmployeeId);
  if (!requester || !reviewer) throw new Error("The CRM employee record could not be resolved.");
  const roles =
    requester.role === "Sales Executive"
      ? ["Senior Sales Executive", "Sales Manager"]
      : requester.role === "Senior Sales Executive"
        ? ["Senior Sales Executive", "Sales Manager"]
        : requester.role === "Sales Manager"
          ? ["Senior Sales Executive", "Sales Manager"]
          : ["Sales Executive", "Senior Sales Executive", "Sales Manager"];
  if (
    reviewer.id === requester.id ||
    !reviewer.active ||
    reviewer.account_status !== "Active" ||
    reviewer.employee_status === "Exited" ||
    reviewer.department !== "Sales" ||
    !roles.includes(reviewer.role) ||
    (requester.unit?.trim() &&
      reviewer.unit?.trim() &&
      requester.unit.trim().toLowerCase() !== reviewer.unit.trim().toLowerCase())
  ) {
    throw new Error("The selected reviewer is not an active eligible CRM employee.");
  }
  const now = iso(new Date());
  const hash = input.snapshot.content_hash || quoteContentHash(input.snapshot);
  if (
    standaloneQuotationReviews.some(
      (review) =>
        review.draft_id === input.draftId &&
        review.draft_snapshot_hash === hash &&
        !["Approved", "Returned", "Cancelled"].includes(review.status),
    )
  ) {
    throw new Error("Review is already pending for this exact draft snapshot.");
  }
  input.snapshot.content_hash = hash;
  const revision =
    standaloneQuotationReviews.filter((review) => review.draft_id === input.draftId).length + 1;
  const assignment: StandaloneQuotationReviewAssignment = {
    id: `sqr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    source_type: "standalone_draft",
    query_id: null,
    draft_id: input.draftId,
    draft_name: input.draftName,
    created_by_employee_id: input.snapshot.prepared_by_employee_id || requester.id,
    reviewer_employee_id: reviewer.id,
    assigned_to_employee_id: reviewer.id,
    requested_by_employee_id: requester.id,
    requested_at: now,
    created_at: now,
    due_at: input.dueAt,
    instructions: input.instructions.trim(),
    priority: input.priority || "Normal",
    status: "Requested",
    checklist: [],
    draft_snapshot_revision: revision,
    draft_snapshot_hash: hash,
    draft_updated_at: input.draftUpdatedAt,
    quotation_lineage_id: input.snapshot.family_id,
    quotation_snapshot: {
      version: 0,
      saved_at: now,
      saved_by: input.snapshot.prepared_by_name || input.snapshot.saved_by,
      prepared_by_employee_id: input.snapshot.prepared_by_employee_id,
      prepared_by_auth_user_id: input.snapshot.prepared_by_auth_user_id,
      prepared_by_name: input.snapshot.prepared_by_name,
      prepared_by_role: input.snapshot.prepared_by_role,
      quote: clone(input.snapshot),
    },
  };
  standaloneQuotationReviews = [...standaloneQuotationReviews, assignment];
  if (input.deferCloudSync) {
    if (isBrowser())
      safeSetStorage(STANDALONE_REVIEW_KEY, JSON.stringify(standaloneQuotationReviews));
    emit();
  } else {
    persist();
  }
  return assignment;
}

export function setStandaloneQuotationReviewStatus(
  assignmentId: string,
  status: ReviewStatus,
  by: string,
  note?: string,
) {
  if (status === "Returned" && !note?.trim())
    throw new Error("Correction instructions are required.");
  const now = iso(new Date());
  standaloneQuotationReviews = standaloneQuotationReviews.map((review) =>
    review.id === assignmentId
      ? {
          ...review,
          status,
          started_at: status === "In Review" ? review.started_at || now : review.started_at,
          completed_at: ["Approved", "Returned", "Cancelled"].includes(status) ? now : undefined,
          decision_note: note?.trim() || review.decision_note,
          decided_at: ["Approved", "Returned"].includes(status) ? now : review.decided_at,
          review_notes: note?.trim() || review.review_notes,
        }
      : review,
  );
  void by;
  persist();
}

export function replaceStandaloneQuotationReviewsFromCloud(
  records: StandaloneQuotationReviewAssignment[],
) {
  if (!inited) load();
  standaloneQuotationReviews = records;
  if (isBrowser()) safeSetStorage(STANDALONE_REVIEW_KEY, JSON.stringify(records));
  emit();
}

export function upsertStandaloneQuotationReviewFromCloud(
  record: StandaloneQuotationReviewAssignment,
) {
  if (!inited) load();
  standaloneQuotationReviews = [
    ...standaloneQuotationReviews.filter((review) => review.id !== record.id),
    record,
  ];
  if (isBrowser())
    safeSetStorage(STANDALONE_REVIEW_KEY, JSON.stringify(standaloneQuotationReviews));
  emit();
}

export function removeStandaloneQuotationReviewFromLocal(assignmentId: string) {
  if (!inited) load();
  standaloneQuotationReviews = standaloneQuotationReviews.filter(
    (review) => review.id !== assignmentId,
  );
  persist();
}

export function setAssistanceStatus(
  queryId: string,
  assignmentId: string,
  status: AssistanceAssignment["status"],
  by: string,
  summary?: string,
) {
  if (status === "Completed" && !summary?.trim())
    throw new Error("A completion summary is required.");
  const current = getCrmQuery(queryId)?.review_support?.assistance?.find(
    (assignment) => assignment.id === assignmentId,
  );
  if (!current) throw new Error("Assistance request not found.");
  if (
    ["Assigned", "In Progress", "Completed"].includes(status) &&
    current.assistant_employee_id !== by
  )
    throw new Error("Only the assigned helper may update this assistance request.");
  if (status === "Cancelled" && current.assigned_by_employee_id !== by)
    throw new Error("Only the requester may cancel this assistance request.");
  if (status === "Cancelled" && !["Requested", "Assigned", "In Progress"].includes(current.status))
    throw new Error("Only active assistance can be cancelled.");
  if (status === "In Progress" && !["Assigned", "In Progress"].includes(current.status))
    throw new Error("Accept assistance before starting it.");
  if (status === "Assigned" && current.status !== "Requested")
    throw new Error("Only requested assistance can be accepted.");
  if (status === "Completed" && current.status !== "In Progress")
    throw new Error("Start assistance before completing it.");
  const now = iso(new Date());
  let found = false;
  queries = queries.map((query) => {
    if (query.id !== queryId && query.query_id !== queryId) return query;
    return {
      ...query,
      review_support: {
        ...query.review_support,
        assistance: (query.review_support?.assistance || []).map((assignment) => {
          if (assignment.id !== assignmentId) return assignment;
          found = true;
          return {
            ...assignment,
            status,
            started_at:
              status === "In Progress" ? assignment.started_at || now : assignment.started_at,
            completion_summary: summary?.trim() || assignment.completion_summary,
            completed_by_employee_id:
              status === "Completed" ? by : assignment.completed_by_employee_id,
            completed_at: status === "Completed" ? now : assignment.completed_at,
          };
        }),
      },
    };
  });
  if (!found) throw new Error("Assistance request not found.");
  const query = getCrmQuery(queryId);
  logWorkflowEvent({
    type: "note_added",
    by,
    at: now,
    title: `Assistance ${status.toLowerCase()}`,
    detail: summary?.trim(),
    query_id: query?.query_id,
    lead_id: query?.lead_id,
  });
  persist();
}

export function reassignReviewSupport(
  queryId: string,
  kind: "query" | "quotation" | "assistance",
  assignmentId: string,
  newEmployeeId: string,
  by: string,
) {
  if (!inited) load();
  const query = getCrmQuery(queryId);
  const actor = employees.find((employee) => employee.id === by);
  const owner = employees.find(
    (employee) => employee.id === query?.owner || employee.name === query?.owner,
  );
  const target = employees.find((employee) => employee.id === newEmployeeId);
  if (!query || !actor || !target) throw new Error("Query or employee not found.");
  if (actor.role !== "Sales Manager" && actor.role !== "Super Admin")
    throw new Error("Only a Sales Manager can reassign team workflow.");
  if (
    actor.role !== "Super Admin" &&
    (!owner || owner.department !== "Sales" || owner.unit !== actor.unit)
  )
    throw new Error("This Query is outside your authorized team scope.");
  if (
    !target.active ||
    target.account_status !== "Active" ||
    target.employee_status === "Exited" ||
    target.department !== "Sales" ||
    !["Senior Sales Executive", "Sales Manager"].includes(target.role) ||
    (actor.role !== "Super Admin" && target.unit !== actor.unit)
  )
    throw new Error("Select an active Senior Sales Executive or Manager in your team.");
  const currentReview =
    kind === "query"
      ? query.review_support?.query_reviews?.find((item) => item.id === assignmentId)
      : kind === "quotation"
        ? query.review_support?.quotation_reviews?.find((item) => item.id === assignmentId)
        : undefined;
  const currentAssignee =
    kind === "assistance"
      ? query.review_support?.assistance?.find((item) => item.id === assignmentId)
          ?.assistant_employee_id
      : currentReview?.reviewer_employee_id;
  if (!currentAssignee) throw new Error("Workflow assignment not found.");
  if (currentAssignee === newEmployeeId) throw new Error("Choose a different assignee.");

  const now = iso(new Date());
  let previousAssignee: string | undefined;
  let found = false;
  const reviewSupport = { ...query.review_support };
  const reassignReview = <T extends QueryReviewAssignment | QuotationReviewAssignment>(
    assignment: T,
  ): T => {
    if (assignment.id !== assignmentId) return assignment;
    if (["Approved", "Returned", "Cancelled"].includes(assignment.status))
      throw new Error("Completed review cannot be reassigned.");
    found = true;
    previousAssignee = assignment.reviewer_employee_id;
    return {
      ...assignment,
      reviewer_employee_id: newEmployeeId,
      status: "Assigned",
      started_at: undefined,
      completed_at: undefined,
      decided_at: undefined,
      decision_note: undefined,
      checklist: assignment.checklist.map((item) => ({ ...item, status: "Pending" as const })),
      assignment_history: [
        ...(assignment.assignment_history || [
          {
            employee_id: assignment.reviewer_employee_id,
            assigned_by_employee_id: assignment.requested_by_employee_id,
            assigned_at: assignment.requested_at,
          },
        ]),
        { employee_id: newEmployeeId, assigned_by_employee_id: by, assigned_at: now },
      ],
    } as T;
  };
  if (kind === "assistance") {
    reviewSupport.assistance = (reviewSupport.assistance || []).map((assignment) => {
      if (assignment.id !== assignmentId) return assignment;
      if (["Completed", "Cancelled"].includes(assignment.status))
        throw new Error("Completed assistance cannot be reassigned.");
      found = true;
      previousAssignee = assignment.assistant_employee_id;
      return {
        ...assignment,
        assistant_employee_id: newEmployeeId,
        status: "Assigned",
        started_at: undefined,
        assignment_history: [
          ...(assignment.assignment_history || [
            {
              employee_id: assignment.assistant_employee_id,
              assigned_by_employee_id: assignment.assigned_by_employee_id,
              assigned_at: assignment.assigned_at,
            },
          ]),
          { employee_id: newEmployeeId, assigned_by_employee_id: by, assigned_at: now },
        ],
      };
    });
  } else if (kind === "query") {
    reviewSupport.query_reviews = (reviewSupport.query_reviews || []).map(reassignReview);
  } else {
    reviewSupport.quotation_reviews = (reviewSupport.quotation_reviews || []).map(reassignReview);
  }
  if (!found) throw new Error("Workflow assignment not found.");

  const updated = {
    ...query,
    review_support: reviewSupport,
  };
  queries = queries.map((item) => (item.id === query.id ? updated : item));
  logWorkflowEvent({
    type: "note_added",
    by,
    at: now,
    title: `${kind === "assistance" ? "Assistance" : `${kind} review`} reassigned`,
    detail: `${previousAssignee || "Unassigned"} → ${newEmployeeId}`,
    query_id: query.query_id,
    lead_id: query.lead_id,
  });
  persist();
}

export function addAssistanceContribution(
  queryId: string,
  assignmentId: string,
  contribution: AssistanceContribution,
) {
  const assignment = getCrmQuery(queryId)?.review_support?.assistance?.find(
    (item) => item.id === assignmentId,
  );
  if (
    !assignment ||
    assignment.assistant_employee_id !== contribution.employee_id ||
    assignment.status !== "In Progress"
  )
    throw new Error("Only the assigned helper may add updates to in-progress assistance.");
  let found = false;
  queries = queries.map((query) => {
    if (query.id !== queryId && query.query_id !== queryId) return query;
    return {
      ...query,
      review_support: {
        ...query.review_support,
        assistance: (query.review_support?.assistance || []).map((assignment) => {
          if (assignment.id !== assignmentId) return assignment;
          found = true;
          return {
            ...assignment,
            contributions: [...assignment.contributions, contribution],
          };
        }),
      },
    };
  });
  if (!found) throw new Error("Assistance request not found.");
  logWorkflowEvent({
    type: "note_added",
    by: contribution.employee_id,
    at: contribution.at,
    title: "Assistance contribution added",
    detail: contribution.note,
    query_id: getCrmQuery(queryId)?.query_id,
  });
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
  agent_contact_id?: string;
  client_id?: string;
  relationship_owner?: string;
  primary_unit?: string;
  participating_units?: string[];
  mobile?: string;
  email?: string;
  adults?: number;
  children?: number;
  ss?: number;
  child_ages?: number[];
  pax_mode?: "exact" | "range";
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
    agent_contact_id: input.agent_contact_id,
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
    ss: input.ss ?? 0,
    child_ages: input.child_ages ?? [],
    pax_mode: input.pax_mode ?? "range",
    min_pax: input.pax_mode === "exact" ? undefined : (input.min_pax ?? input.pax),
    max_pax: input.pax_mode === "exact" ? undefined : (input.max_pax ?? input.pax),
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
  if (stage === "Quotation Sent") {
    const latestVersion = Math.max(
      0,
      ...(current.costing_versions || []).map((item) => item.version),
    );
    const quotationReviews = (current.review_support?.quotation_reviews || [])
      .filter((review) => review.quotation_version <= latestVersion)
      .sort((left, right) => left.requested_at.localeCompare(right.requested_at));
    const currentVersionReview = quotationReviews
      .filter((review) => review.quotation_version === latestVersion)
      .at(-1);
    const activeReview = quotationReviews.some(
      (review) =>
        review.quotation_version === latestVersion &&
        ["Requested", "Assigned", "In Review", "Pending Review", "Under Review"].includes(
          review.status,
        ),
    );
    const returnedPriorVersion = quotationReviews.some(
      (review) => review.quotation_version < latestVersion && review.status === "Returned",
    );
    if (activeReview || currentVersionReview?.status === "Returned") {
      throw new Error(
        `Quotation V${latestVersion} is not cleared for sending until its review is approved or cancelled.`,
      );
    }
    if (returnedPriorVersion && currentVersionReview?.status !== "Approved") {
      throw new Error(
        `Quotation V${latestVersion} must be approved after the previous version was returned.`,
      );
    }
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
      last_status_changed_by: actor,
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
      last_quotation_sent_by: stage === "Quotation Sent" ? actor : q.last_quotation_sent_by,
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
    if (previous.some((item) => item.quote.id === quote.id)) return q;
    const version =
      quote.version || previous.reduce((max, item) => Math.max(max, item.version), 0) + 1;
    const scenarioValues = (quote.scenarios ?? [])
      .map((scenario) => scenario.grand_total)
      .filter((value) => Number.isFinite(value) && value > 0);
    const sellingPrice = scenarioValues.length
      ? Math.max(...scenarioValues)
      : Math.max(quote.totals.grand_sgl, quote.totals.grand_dbl, quote.totals.grand_trp);
    const scenarioCosts = (quote.scenarios ?? []).map((scenario) =>
      scenario.persons.reduce(
        (sum, person) =>
          sum +
          person.hotel +
          person.transport +
          person.guide +
          person.activities +
          person.entrances +
          person.misc +
          person.meals,
        0,
      ),
    );
    const costPrice = scenarioCosts.length
      ? Math.max(...scenarioCosts)
      : Math.max(quote.totals.room_net_sgl, quote.totals.room_net_dbl, quote.totals.room_net_trp) +
        quote.totals.addons_total;
    const bottomLine =
      quote.query_snapshot?.bottom_line ||
      (scenarioValues.length ? Math.min(...scenarioValues) : sellingPrice);
    const topLine =
      quote.query_snapshot?.top_line ||
      (scenarioValues.length ? Math.max(...scenarioValues) : sellingPrice);
    const categoryRank = (value: string) => {
      const normalized = value.toLowerCase();
      if (normalized.includes("budget")) return 1;
      const stars = Number(normalized.match(/([1-5])\s*star/)?.[1] || 0);
      if (stars)
        return (
          stars * 10 + (normalized.includes("deluxe") || normalized.includes("superior") ? 1 : 0)
        );
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
    const minPax =
      quote.query_snapshot?.pax_min ||
      (scenarioPax.length ? Math.min(...scenarioPax) : q.min_pax || q.pax);
    const maxPax =
      quote.query_snapshot?.pax_max ||
      quote.group_total_pax ||
      (scenarioPax.length ? Math.max(...scenarioPax) : q.max_pax || q.pax);
    return {
      ...q,
      stage: q.stage === "New" || q.stage === "Requirement Review" ? "Costing" : q.stage,
      stage_changed_at:
        q.stage === "New" || q.stage === "Requirement Review" ? iso(now) : q.stage_changed_at,
      costing_started_at: q.costing_started_at || iso(now),
      costing_completed_at: iso(now),
      last_costing_prepared_by: by,
      last_quotation_prepared_by: by,
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
          // A generated version is immutable. `draftId` is intentionally not
          // retained as an edit link; revisions are cloned from quote snapshot.
          draft_id: undefined,
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
      last_followup_by: actor,
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

export function useAssignmentCandidates(): AssignmentCandidate[] {
  return useSyncExternalStore(
    subscribe,
    () => assignmentCandidates,
    () => EMPTY,
  );
}

export function useCrmHydrationStatus(): CloudHydrationStatus {
  return useSyncExternalStore(
    subscribe,
    () => crmHydrationStatus,
    () => "idle",
  );
}

export function useEmployeeDirectoryStatus(): CloudHydrationStatus {
  return useSyncExternalStore(
    subscribe,
    () => employeeDirectoryStatus,
    () => "idle",
  );
}
export function useAssignmentDirectoryStatus(): CloudHydrationStatus {
  return useSyncExternalStore(
    subscribe,
    () => assignmentDirectoryStatus,
    () => "idle",
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
export function useStandaloneQuotationReviews(): StandaloneQuotationReviewAssignment[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!inited) load();
      return standaloneQuotationReviews;
    },
    () => EMPTY,
  );
}

// ---- derived helpers -------------------------------------------------------
export const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
