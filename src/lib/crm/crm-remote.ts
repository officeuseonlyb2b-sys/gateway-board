import { supabase } from "@/integrations/supabase/client";
import {
  getCrmSnapshot,
  hydrateCrm,
  onCrmPersist,
  replaceEmployeesFromCloud,
  replaceAssignmentCandidatesFromCloud,
  replaceQueryFromCloud,
  replaceStandaloneQuotationReviewsFromCloud,
  upsertStandaloneQuotationReviewFromCloud,
  listEmployees,
  setCrmHydrationStatus,
  setEmployeeDirectoryStatus,
  setAssignmentDirectoryStatus,
  listAssignmentCandidates,
  type CrmSnapshot,
} from "./store";
import { auth } from "@/lib/auth-mock";
import type {
  CrmEvent,
  CrmQuery,
  CrmTask,
  Employee,
  AssignmentCandidate,
  StandaloneQuotationReviewAssignment,
} from "./types";
import type { Json } from "@/integrations/supabase/types";
import { ingestNotification } from "@/lib/notifications-store";
import {
  IMPORTED_DATASET_MARKER,
  IMPORTED_QUERIES,
  IMPORTED_QUERY_EVENTS,
  IMPORTED_QUERY_TASKS,
  QUERY_TRACKER_MARKER_ID,
} from "./query-tracker-import.generated";

type CloudRow = { id: string; data: unknown };
type CloudQueryRow = CloudRow & { owner_user_id: string | null };
export type CrmQuerySaveResult = { ok: boolean; queryId: string; error?: unknown };

let started = false;
let ready = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pending: CrmSnapshot | null = null;
let pullTimer: ReturnType<typeof setTimeout> | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;
let syncGeneration = 0;
let ownerUserIdByQueryId = new Map<string, string | null>();
let cloudEventIds = new Set<string>();
let cloudQuerySignatures = new Map<string, string>();
let cloudTaskSignatures = new Map<string, string>();
let cloudReviewSignatures = new Map<string, string>();
let rejectedBackgroundQuerySignatures = new Map<string, string>();
let assignmentDirectoryFlight: Promise<void> | null = null;
let crmRefreshCalls = 0;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const asJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;
const signature = (value: unknown) => JSON.stringify(value);

function standaloneQuotationReviewRow(review: StandaloneQuotationReviewAssignment) {
  return {
    id: review.id,
    requester_employee_id: review.requested_by_employee_id,
    reviewer_employee_id: review.reviewer_employee_id,
    creator_employee_id: review.created_by_employee_id,
    prepared_by_employee_id:
      review.quotation_snapshot.prepared_by_employee_id || review.created_by_employee_id,
    assigned_to_employee_id: review.assigned_to_employee_id || review.reviewer_employee_id,
    draft_id: review.draft_id,
    snapshot_id: review.quotation_snapshot.quote.id,
    quotation_family_id: review.quotation_lineage_id || null,
    query_id: null,
    status: review.status,
    reason: review.instructions || "",
    priority: review.priority || "Normal",
    due_at: review.due_at || null,
    started_at: review.started_at || null,
    completed_at: review.completed_at || null,
    return_notes: review.status === "Returned" ? review.decision_note || null : null,
    snapshot: asJson(review.quotation_snapshot),
    data: asJson(review),
  };
}

function mergeById<T extends { id: string }>(remote: T[], local: T[]): T[] {
  const merged = new Map(remote.map((item) => [item.id, item]));
  local.forEach((item) => {
    if (!merged.has(item.id)) merged.set(item.id, item);
  });
  return [...merged.values()];
}

function unwrap<T>(rows: CloudRow[] | null): T[] {
  return (rows ?? []).map((row) => row.data as T).filter(Boolean);
}

async function readStandaloneQuotationReviews(): Promise<StandaloneQuotationReviewAssignment[]> {
  try {
    const result = await supabase.from("crm_standalone_quotation_reviews").select("id,data");
    if (result.error) throw result.error;
    return unwrap<StandaloneQuotationReviewAssignment>(result.data);
  } catch (error) {
    console.error("[crm] standalone quotation review refresh failed", error);
    return [];
  }
}

export async function persistStandaloneQuotationReview(
  review: StandaloneQuotationReviewAssignment,
): Promise<void> {
  const result = await supabase
    .from("crm_standalone_quotation_reviews")
    .insert(standaloneQuotationReviewRow(review))
    .select("id,data")
    .single();
  if (result.error) throw result.error;
  const persisted = result.data.data as unknown as StandaloneQuotationReviewAssignment;
  upsertStandaloneQuotationReviewFromCloud(persisted);

  const refreshed = await readStandaloneQuotationReviews();
  // The insert response remains authoritative if the optional follow-up list
  // refresh is unavailable; readStandaloneQuotationReviews already reports it.
  replaceStandaloneQuotationReviewsFromCloud(
    refreshed.some((item) => item.id === persisted.id) ? refreshed : [persisted, ...refreshed],
  );
}

export async function persistStandaloneQuotationReviewUpdate(assignmentId: string): Promise<void> {
  const review = getCrmSnapshot().standaloneQuotationReviews.find(
    (item) => item.id === assignmentId,
  );
  if (!review) throw new Error("The standalone review could not be resolved.");
  const result = await supabase
    .from("crm_standalone_quotation_reviews")
    .update(standaloneQuotationReviewRow(review))
    .eq("id", review.id)
    .select("id,data")
    .single();
  if (result.error) throw result.error;
  upsertStandaloneQuotationReviewFromCloud(
    result.data.data as unknown as StandaloneQuotationReviewAssignment,
  );
}

export async function persistQueryQuotationReview(queryId: string): Promise<void> {
  const query = getCrmSnapshot().queries.find(
    (item) => item.query_id === queryId || item.id === queryId,
  );
  if (!query) throw new Error("The linked Query could not be resolved.");
  const result = await supabase
    .from("crm_queries")
    .update({ data: asJson(query) })
    .eq("id", query.id)
    .select("id,data")
    .single();
  if (result.error) throw result.error;
  replaceQueryFromCloud(result.data.data as unknown as CrmQuery);
}

async function readCloud(): Promise<CrmSnapshot> {
  const [queryResult, taskResult, employeeResult, eventResult] = await Promise.all([
    supabase.from("crm_queries").select("id,data,owner_user_id"),
    supabase.from("crm_tasks").select("id,data"),
    readEmployeeRows(),
    supabase.from("crm_events").select("id,data").order("at", { ascending: false }).limit(800),
  ]);
  const error = queryResult.error ?? taskResult.error ?? eventResult.error;
  if (error) throw error;
  const standaloneQuotationReviews = await readStandaloneQuotationReviews();
  ownerUserIdByQueryId = new Map(
    ((queryResult.data ?? []) as CloudQueryRow[]).map((row) => [row.id, row.owner_user_id]),
  );
  cloudEventIds = new Set((eventResult.data ?? []).map((row) => row.id));
  const queries = ((queryResult.data ?? []) as CloudQueryRow[]).map((row) => {
    const data = row.data as CrmQuery;
    return { ...data, id: row.id, query_id: data.query_id || row.id };
  });
  const tasks = unwrap<CrmTask>(taskResult.data);
  cloudQuerySignatures = new Map(queries.map((query) => [query.id, signature(query)]));
  cloudTaskSignatures = new Map(tasks.map((task) => [task.id, signature(task)]));
  cloudReviewSignatures = new Map(
    standaloneQuotationReviews.map((review) => [review.id, signature(review)]),
  );
  return {
    queries,
    tasks,
    employees: employeeResult,
    events: unwrap<CrmEvent>(eventResult.data),
    standaloneQuotationReviews,
  };
}

function currentActiveEmployee(): Employee | undefined {
  const userId = auth.current()?.id;
  return listEmployees().find(
    (employee) =>
      employee.auth_user_id === userId &&
      employee.active &&
      employee.account_status === "Active" &&
      employee.employee_status !== "Exited",
  );
}

function activeQueryOwner(query: CrmQuery): Employee | undefined {
  return listEmployees().find(
    (employee) =>
      (employee.id === query.owner || employee.name === query.owner) &&
      employee.active &&
      employee.account_status === "Active" &&
      employee.employee_status !== "Exited",
  );
}

function isUnassignedQuery(query: CrmQuery): boolean {
  return !query.owner || query.owner === "Unassigned";
}

function resolvedOwnerUserId(query: CrmQuery): string | null {
  if (isUnassignedQuery(query)) return null;
  return (
    activeQueryOwner(query)?.auth_user_id ??
    listAssignmentCandidates().find((candidate) => candidate.id === query.owner)?.auth_user_id ??
    ownerUserIdByQueryId.get(query.id) ??
    null
  );
}

function queryRow(query: CrmQuery) {
  return {
    id: query.id,
    query_id: query.query_id,
    owner: query.owner,
    owner_user_id: resolvedOwnerUserId(query),
    stage: query.stage,
    data: asJson(query),
  };
}

export async function refreshCrmQuery(queryId: string): Promise<CrmQuery | undefined> {
  let result = await supabase
    .from("crm_queries")
    .select("id,data,owner_user_id")
    .eq("id", queryId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    result = await supabase
      .from("crm_queries")
      .select("id,data,owner_user_id")
      .eq("query_id", queryId)
      .maybeSingle();
    if (result.error) throw result.error;
  }
  if (!result.data) return undefined;
  ownerUserIdByQueryId.set(result.data.id, result.data.owner_user_id);
  const cloud = result.data.data as unknown as CrmQuery;
  const refreshed = { ...cloud, id: result.data.id, query_id: cloud.query_id || queryId };
  replaceQueryFromCloud(refreshed);
  return refreshed;
}

/**
 * Assign one existing cloud Query.  Assignment is deliberately not routed
 * through snapshot sync: an unrelated legacy row must never make this update
 * fail or turn it into an INSERT/upsert RLS check.
 */
export async function assignCrmQueryNow(
  queryId: string,
  employeeId: string,
  assignedBy: string,
  reason?: string,
) {
  const before = getCrmSnapshot().queries.find(
    (query) => query.id === queryId || query.query_id === queryId,
  );
  if (!before) throw new Error("The Query could not be resolved.");
  const actor = currentActiveEmployee();
  const assignee = listAssignmentCandidates().find((candidate) => candidate.id === employeeId);
  if (!actor || !assignee?.auth_user_id)
    throw new Error("The selected Sales employee could not be resolved for assignment.");

  // Build the audited next document without mutating the store.  Calling the
  // store assignment helpers here emits a whole-snapshot persistence event,
  // which used to make an unrelated legacy row part of this assignment.
  const assignedAt = new Date().toISOString();
  const isReassignment = !isUnassignedQuery(before) || before.assignment_status === "Assigned";
  const assignment = {
    assigned_at: assignedAt,
    assigned_by: actor.id,
    assigned_to: assignee.id,
    ...(isReassignment ? { assigned_from: before.owner } : {}),
    ...(reason ? { reason } : {}),
  };
  const updated: CrmQuery = {
    ...before,
    id: before.id,
    owner: assignee.id,
    assignment_status: "Assigned",
    assigned_on: assignedAt,
    assigned_at: assignedAt,
    assigned_by: actor.id,
    assignment_history: [...(before.assignment_history || []), assignment],
    last_updated_by: actor.id,
    last_activity_at: assignedAt,
    lifecycle: (before.lifecycle || []).map((step) =>
      step.label === "Assigned" ? { ...step, at: assignedAt } : step,
    ),
    activities: [
      {
        id: `assignment_${before.id}_${Date.now()}`,
        title: `${isReassignment ? "Reassigned" : "Assigned"} to ${assignee.name}${reason ? ` — ${reason}` : ""}`,
        at: assignedAt,
        by: actor.name,
      },
      ...(before.activities || []),
    ],
  };

  try {
    const result = await supabase
      .from("crm_queries")
      .update({
        owner: employeeId,
        owner_user_id: assignee.auth_user_id,
        data: asJson({
          ...updated,
          owner: assignee.id,
        }),
      })
      .eq("id", before.id)
      .select("id,data,owner_user_id")
      .single();
    if (result.error) throw result.error;
    ownerUserIdByQueryId.set(result.data.id, result.data.owner_user_id);
    replaceQueryFromCloud({
      ...(result.data.data as unknown as CrmQuery),
      id: result.data.id,
      query_id: updated.query_id || before.query_id,
    });
  } catch (error) {
    const supabaseError = error as { code?: string; message?: string };
    console.error("[crm] targeted assignment failed", {
      query_id: before.query_id,
      row_id: before.id,
      manager_employee_id: actor.id,
      assignee_employee_id: assignee.id,
      assignee_role: assignee.role,
      resolved_owner_user_id: assignee.auth_user_id,
      previous_owner: before.owner,
      assignment_status_before: before.assignment_status,
      error_code: supabaseError?.code,
      error_message: supabaseError?.message || String(error),
    });
    await refreshCrmQuery(before.id).catch(() => {});
    throw error;
  }
}

/** Persist one Query without coupling its result to unrelated CRM snapshot rows. */
export async function saveCrmQueryNow(queryId: string): Promise<CrmQuerySaveResult> {
  const query = getCrmSnapshot().queries.find(
    (item) => item.id === queryId || item.query_id === queryId,
  );
  if (!query) return { ok: false, queryId, error: new Error("The Query could not be resolved.") };

  const actor = currentActiveEmployee();
  const ownerUserId = resolvedOwnerUserId(query);
  const unassigned = isUnassignedQuery(query);
  const actorMatchesCreatedBy = Boolean(
    actor && (query.created_by === actor.id || query.created_by === actor.name),
  );
  if (!actor) {
    const error = new Error(
      "The authenticated CRM employee could not be resolved for Query saving.",
    );
    console.error("[crm] targeted query save failed", {
      query_id: query.query_id,
      row_id: query.id,
      actor_employee_id: null,
      actor_role: null,
      owner: query.owner,
      resolved_owner_user_id: ownerUserId,
      created_by: query.created_by,
      unassigned,
      actor_matches_created_by: false,
      error_code: "CRM_EMPLOYEE_NOT_RESOLVED",
      error_message: error.message,
    });
    return {
      ok: false,
      queryId: query.query_id,
      error,
    };
  }

  const result = await supabase
    .from("crm_queries")
    .upsert(queryRow(query), { onConflict: "id" })
    .select("id,data,owner_user_id")
    .single();
  if (result.error) {
    console.error("[crm] targeted query save failed", {
      query_id: query.query_id,
      row_id: query.id,
      actor_employee_id: actor.id,
      actor_role: actor.role,
      owner: query.owner,
      resolved_owner_user_id: ownerUserId,
      created_by: query.created_by,
      unassigned,
      actor_matches_created_by: actorMatchesCreatedBy,
      error_code: result.error.code,
      error_message: result.error.message,
    });
    return { ok: false, queryId: query.query_id, error: result.error };
  }

  ownerUserIdByQueryId.set(query.id, result.data.owner_user_id);
  replaceQueryFromCloud(result.data.data as unknown as CrmQuery);
  // The returned row updates subscribers synchronously before navigation. A
  // targeted background read then reconciles any database-side normalization.
  void refreshCrmQuery(query.id).catch((error) =>
    console.error("[crm] targeted query refresh failed", {
      query_id: query.query_id,
      row_id: query.id,
      error,
    }),
  );
  return { ok: true, queryId: query.query_id };
}

async function upsertSnapshot(snapshot: CrmSnapshot, requiredQueryId?: string): Promise<void> {
  const actor = currentActiveEmployee();
  if (!actor) {
    if (requiredQueryId)
      throw new Error("The authenticated CRM employee could not be resolved for Query saving.");
    return;
  }
  const superAdmin = actor.role === "Super Admin";
  const teamIds = new Set(
    listEmployees()
      .filter((employee) => employee.department === "Sales" && employee.unit === actor.unit)
      .filter(
        (employee) =>
          employee.active &&
          employee.account_status === "Active" &&
          employee.employee_status !== "Exited",
      )
      .flatMap((employee) => [employee.id, employee.name]),
  );
  const managerCanWriteQuery = (query: CrmQuery) =>
    actor.role === "Sales Manager" &&
    (Boolean(activeQueryOwner(query)?.auth_user_id && teamIds.has(query.owner || "")) ||
      (isUnassignedQuery(query) &&
        (query.primary_unit === actor.unit ||
          Boolean(actor.unit && query.participating_units?.includes(actor.unit)))));
  const writableQueries = snapshot.queries.filter((query) => {
    if (rejectedBackgroundQuerySignatures.get(query.id) === JSON.stringify(query)) return false;
    if (cloudQuerySignatures.get(query.id) === signature(query)) return false;
    return (
      superAdmin ||
      [query.owner].includes(actor.id) ||
      [query.owner].includes(actor.name) ||
      (isUnassignedQuery(query) &&
        (query.created_by === actor.id || query.created_by === actor.name)) ||
      query.review_support?.query_reviews?.some(
        (review) =>
          review.requested_by_employee_id === actor.id ||
          (review.reviewer_employee_id === actor.id && review.status !== "Cancelled"),
      ) ||
      query.review_support?.quotation_reviews?.some(
        (review) =>
          review.requested_by_employee_id === actor.id ||
          (review.reviewer_employee_id === actor.id && review.status !== "Cancelled"),
      ) ||
      query.review_support?.assistance?.some(
        (assignment) =>
          assignment.assigned_by_employee_id === actor.id ||
          (assignment.assistant_employee_id === actor.id && assignment.status !== "Cancelled"),
      ) ||
      managerCanWriteQuery(query)
    );
  });
  const writableBusinessQueryIds = new Set(writableQueries.map((query) => query.query_id));
  if (import.meta.env.DEV) {
    snapshot.queries
      .filter((query) => !writableQueries.includes(query))
      .forEach((query) =>
        console.warn("[crm] excluding non-writable local query from background sync", {
          query_id: query.query_id,
          row_id: query.id,
          actor_employee_id: actor.id,
        }),
      );
  }
  const queryRows = writableQueries.map((query) => ({
    query,
    row: queryRow(query),
  }));
  const savedBusinessQueryIds = new Set<string>();
  const persistQueries = async () => {
    if (!queryRows.length) return { error: null };
    const batch = await supabase.from("crm_queries").upsert(
      queryRows.map(({ row }) => row),
      { onConflict: "id" },
    );
    if (!batch.error) {
      queryRows.forEach(({ query }) => {
        rejectedBackgroundQuerySignatures.delete(query.id);
        cloudQuerySignatures.set(query.id, signature(query));
        savedBusinessQueryIds.add(query.query_id);
      });
      return batch;
    }

    // A stale local row can invalidate an entire PostgREST batch. Retry each
    // legitimately writable row independently so it cannot block a new Query.
    let requiredError: typeof batch.error | null = null;
    for (const { query, row } of queryRows) {
      const result = await supabase.from("crm_queries").upsert(row, { onConflict: "id" });
      if (!result.error) {
        rejectedBackgroundQuerySignatures.delete(query.id);
        cloudQuerySignatures.set(query.id, signature(query));
        savedBusinessQueryIds.add(query.query_id);
        continue;
      }
      if (!requiredQueryId) rejectedBackgroundQuerySignatures.set(query.id, JSON.stringify(query));
      if (query.query_id === requiredQueryId || query.id === requiredQueryId)
        requiredError = result.error;
      console.error("[crm] query save failed", {
        query_id: query.query_id,
        actor_employee_id: actor.id,
        actor_role: actor.role,
        unassigned: !query.owner,
        actor_matches_created_by: query.created_by === actor.id || query.created_by === actor.name,
        owner_user_id_resolved: Boolean(row.owner_user_id),
        error: result.error,
      });
    }
    // Background reconciliation is best-effort and reports failures per row.
    return { error: requiredQueryId ? requiredError : null };
  };
  const candidateEvents = snapshot.events.filter(
    (event) =>
      (superAdmin || Boolean(event.query_id && writableBusinessQueryIds.has(event.query_id))) &&
      (superAdmin || !cloudEventIds.has(event.id)),
  );
  const savedEventIds: string[] = [];
  const persistEvents = async () => {
    const writableEvents = candidateEvents.filter(
      (event) => superAdmin || Boolean(event.query_id && savedBusinessQueryIds.has(event.query_id)),
    );
    for (const event of writableEvents) {
      const row = {
        id: event.id,
        query_id: event.query_id ?? null,
        at: event.at,
        data: asJson(event),
      };
      const result = superAdmin
        ? await supabase.from("crm_events").upsert(row, { onConflict: "id" })
        : await supabase.from("crm_events").insert(row);
      if (result.error) {
        console.error("[crm] event save failed", {
          event_id: event.id,
          query_id: event.query_id ?? null,
          actor_employee_id: actor.id,
          error: result.error,
        });
      } else {
        savedEventIds.push(event.id);
      }
    }
    // Event persistence is isolated from successful Query persistence.
    return { error: null };
  };
  // Confirm Query writes before considering their linked events.
  const queryResult = await persistQueries();
  const changedTasks = snapshot.tasks.filter(
    (task) => cloudTaskSignatures.get(task.id) !== signature(task),
  );
  const changedReviews = snapshot.standaloneQuotationReviews.filter(
    (review) => cloudReviewSignatures.get(review.id) !== signature(review),
  );
  const taskOperation =
    superAdmin && changedTasks.length
      ? supabase.from("crm_tasks").upsert(
          changedTasks.map((task) => ({
            id: task.id,
            query_id: task.query_id || null,
            owner: task.owner,
            done: task.done,
            data: asJson(task),
          })),
          { onConflict: "id" },
        )
      : Promise.resolve({ error: null });
  const reviewOperation = changedReviews.length
    ? supabase
        .from("crm_standalone_quotation_reviews")
        .upsert(changedReviews.map(standaloneQuotationReviewRow), { onConflict: "id" })
    : Promise.resolve({ error: null });
  const operations = [
    Promise.resolve(queryResult),
    taskOperation,
    persistEvents(),
    reviewOperation,
  ];
  const results = await Promise.all(operations);
  if (!results[1].error)
    changedTasks.forEach((task) => cloudTaskSignatures.set(task.id, signature(task)));
  if (!results[3].error)
    changedReviews.forEach((review) => cloudReviewSignatures.set(review.id, signature(review)));
  if (requiredQueryId) {
    const queryError = results[0].error;
    if (queryError) throw queryError;
    results.slice(1).forEach((result) => {
      if (result.error) console.error("[crm] related snapshot save failed", result.error);
    });
  }
  const error = requiredQueryId ? null : results.find((result) => result.error)?.error;
  if (error) throw error;
  savedEventIds.forEach((eventId) => cloudEventIds.add(eventId));
}

async function hasImportedDatasetMarker(): Promise<boolean> {
  const { data, error } = await supabase
    .from("crm_events")
    .select("id")
    .eq("id", QUERY_TRACKER_MARKER_ID)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function deleteQueryLinkedCloudRows(): Promise<void> {
  // Remove dependent query activity first, then tasks, then the Queries.
  // Standalone/common tasks and events are deliberately preserved.
  const eventResult = await supabase.from("crm_events").delete().not("query_id", "is", null);
  if (eventResult.error) throw eventResult.error;
  const taskResult = await supabase.from("crm_tasks").delete().not("query_id", "is", null);
  if (taskResult.error) throw taskResult.error;
  const queryResult = await supabase.from("crm_queries").delete().not("id", "is", null);
  if (queryResult.error) throw queryResult.error;
}

async function installImportedQueryDataset(
  remote: CrmSnapshot,
  local: CrmSnapshot,
): Promise<CrmSnapshot> {
  await deleteQueryLinkedCloudRows();

  const standaloneTasks = mergeById(
    remote.tasks.filter((task) => !task.query_id),
    local.tasks.filter((task) => !task.query_id),
  );
  const standaloneEvents = mergeById(
    remote.events.filter((event) => !event.query_id && event.id !== QUERY_TRACKER_MARKER_ID),
    local.events.filter((event) => !event.query_id && event.id !== QUERY_TRACKER_MARKER_ID),
  );
  const snapshot: CrmSnapshot = {
    queries: clone(IMPORTED_QUERIES),
    tasks: [...clone(IMPORTED_QUERY_TASKS), ...standaloneTasks],
    employees: remote.employees,
    events: [
      clone(IMPORTED_DATASET_MARKER),
      ...clone(IMPORTED_QUERY_EVENTS),
      ...standaloneEvents,
    ].slice(0, 800),
    standaloneQuotationReviews: remote.standaloneQuotationReviews,
  };

  // Employee records are read-only here; only server account actions write them.
  await upsertSnapshot({
    queries: snapshot.queries,
    tasks: clone(IMPORTED_QUERY_TASKS),
    employees: snapshot.employees,
    events: [clone(IMPORTED_DATASET_MARKER), ...clone(IMPORTED_QUERY_EVENTS)],
    standaloneQuotationReviews: snapshot.standaloneQuotationReviews,
  });
  return snapshot;
}

export async function pushCrmSnapshotNow(
  snapshot = getCrmSnapshot(),
  requiredQueryId?: string,
): Promise<void> {
  await upsertSnapshot(snapshot, requiredQueryId);
}

/** Allocate and persist the next immutable version while holding a database row lock. */
export async function finalizeQuotationVersion(
  queryId: string,
  quote: import("@/lib/quotes-store").SavedQuote,
  draftId?: string,
) {
  const current = getCrmSnapshot().queries.find(
    (query) => query.query_id === queryId || query.id === queryId,
  );
  if (!current) throw new Error("The linked CRM Query could not be resolved before saving.");
  const { data, error } = await supabase.rpc("finalize_crm_quotation_version", {
    // The RPC still supports the business query number, but persistence is
    // anchored to the canonical crm_queries primary key.
    p_query_id: current.id,
    p_quote: asJson(quote),
    p_draft_id: draftId ?? null,
  });
  if (error) throw error;
  if (!current || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The saved quotation could not be reconciled with its Query.");
  }
  const updated = {
    ...current,
    ...(data as unknown as CrmQuery),
    id: current.id,
    query_id: (data as unknown as CrmQuery).query_id || current.query_id,
  };
  replaceQueryFromCloud(updated);
  const version =
    updated.costing_versions?.find((item) => item.quote.id === quote.id) ??
    [...(updated.costing_versions ?? [])].sort((a, b) => b.version - a.version)[0];
  if (!version) throw new Error("The database did not return the saved quotation version.");
  // Confirm the committed row can be read back before the caller removes the
  // draft or displays success. This also refreshes the Query Details state.
  const refreshed = await refreshCrmQuery(current.id);
  const confirmed = refreshed?.costing_versions?.find((item) => item.quote.id === version.quote.id);
  if (!confirmed) {
    throw new Error("Supabase did not confirm the saved costing version. The draft was preserved.");
  }
  return confirmed;
}

function schedulePush(snapshot: CrmSnapshot) {
  if (!ready) return;
  pending = snapshot;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const next = pending;
    pending = null;
    if (next) void upsertSnapshot(next).catch((error) => console.error("[crm] save failed", error));
  }, 350);
}

async function pullAndMerge(run: number) {
  const local = getCrmSnapshot();
  const remote = await readCloud();
  if (run !== syncGeneration) return;
  const hasMarker = await hasImportedDatasetMarker();
  if (run !== syncGeneration) return;
  if (!hasMarker) {
    const installed = await installImportedQueryDataset(remote, local);
    if (run !== syncGeneration) return;
    hydrateCrm(installed);
    ready = true;
    return;
  }
  const currentEmployee = remote.employees.find(
    (employee) => employee.auth_user_id === auth.current()?.id,
  );
  const superAdmin = currentEmployee?.role === "Super Admin";
  const merged: CrmSnapshot = {
    queries: superAdmin ? mergeById(remote.queries, local.queries) : remote.queries,
    tasks: superAdmin ? mergeById(remote.tasks, local.tasks) : remote.tasks,
    employees: remote.employees,
    events: superAdmin ? mergeById(remote.events, local.events).slice(0, 800) : remote.events,
    standaloneQuotationReviews: superAdmin
      ? mergeById(remote.standaloneQuotationReviews, local.standaloneQuotationReviews)
      : remote.standaloneQuotationReviews,
  };
  hydrateCrm(merged);
  ready = true;
  const recoveredLocalRecords =
    superAdmin &&
    (merged.queries.length !== remote.queries.length ||
      merged.tasks.length !== remote.tasks.length ||
      merged.events.length !== remote.events.length ||
      merged.standaloneQuotationReviews.length !== remote.standaloneQuotationReviews.length);
  if (recoveredLocalRecords) await upsertSnapshot(merged);
}

async function readEmployeeRows(): Promise<Employee[]> {
  const records: Employee[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await supabase
      .from("crm_employees")
      .select("id,data")
      .order("id")
      .range(offset, offset + 999);
    if (result.error) throw result.error;
    records.push(
      ...result.data.map((row) => ({ ...(row.data as unknown as Employee), id: row.id })),
    );
    if (result.data.length < 1000) break;
  }
  const employeeMasterRows = [...records];
  const directory = await supabase.rpc("crm_review_employee_directory");
  if (directory.error) throw directory.error;
  const knownIds = new Set(records.map((employee) => employee.id));
  directory.data.forEach((row) => {
    if (knownIds.has(row.id)) return;
    knownIds.add(row.id);
    records.push({
      id: row.id,
      name: row.name || "Sales employee",
      role: (row.role || "Employee") as Employee["role"],
      email: "",
      auth_user_id: row.auth_user_id || undefined,
      department: (row.department || "Sales") as Employee["department"],
      unit: row.unit || "",
      active: true,
      joined_at: "",
      account_status: "Active",
      employee_status: "Active",
    });
  });
  if (import.meta.env.DEV) {
    const actorId = auth.current()?.id;
    console.debug("[crm] employee directory result", {
      employee_master_rows: employeeMasterRows.length,
      actor_auth_user_id: actorId,
      employee_master: employeeMasterRows.map((employee) => ({
        id: employee.id,
        name: employee.name,
        role: employee.role,
        unit: employee.unit,
        self: employee.auth_user_id === actorId,
      })),
    });
  }
  return records;
}

async function readAssignmentCandidates(): Promise<AssignmentCandidate[]> {
  const result = await supabase.rpc("list_sales_assignment_candidates");
  if (result.error) throw result.error;
  const candidates = result.data
    .filter((row) => row.employee_id && row.name && row.role && row.unit && row.auth_user_id)
    .map((row): AssignmentCandidate => ({
      id: row.employee_id,
      name: row.name,
      role: row.role as AssignmentCandidate["role"],
      unit: row.unit,
      department: row.department || "",
      auth_user_id: row.auth_user_id,
    }));
  if (import.meta.env.DEV) {
    console.debug("[crm] assignment candidates loaded", {
      count: candidates.length,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        role: candidate.role,
        unit: candidate.unit,
        has_auth_link: Boolean(candidate.auth_user_id),
      })),
    });
  }
  return candidates;
}

export async function refreshEmployees() {
  const userId = auth.current()?.id;
  if (!userId) return;
  setEmployeeDirectoryStatus("loading");
  setAssignmentDirectoryStatus("loading");
  try {
    const [records, candidates] = await Promise.all([
      readEmployeeRows(),
      readAssignmentCandidates(),
    ]);
    if (auth.current()?.id === userId) {
      replaceEmployeesFromCloud(records);
      replaceAssignmentCandidatesFromCloud(candidates);
      setEmployeeDirectoryStatus("ready");
      setAssignmentDirectoryStatus("ready");
    }
  } catch (error) {
    if (auth.current()?.id === userId) {
      setEmployeeDirectoryStatus("error");
      setAssignmentDirectoryStatus("error");
    }
    throw error;
  }
}

/** Load the assignment-only directory when an assignment control is actually rendered. */
export function refreshAssignmentCandidates(): Promise<void> {
  if (assignmentDirectoryFlight) return assignmentDirectoryFlight;
  const userId = auth.current()?.id;
  if (!userId) return Promise.resolve();
  setAssignmentDirectoryStatus("loading");
  assignmentDirectoryFlight = readAssignmentCandidates()
    .then((candidates) => {
      if (auth.current()?.id !== userId) return;
      replaceAssignmentCandidatesFromCloud(candidates);
      setAssignmentDirectoryStatus("ready");
    })
    .catch((error) => {
      if (auth.current()?.id === userId) setAssignmentDirectoryStatus("error");
      throw error;
    })
    .finally(() => {
      assignmentDirectoryFlight = null;
    });
  return assignmentDirectoryFlight;
}

export function startCrmSync(includeBusiness = true): () => void {
  if (started) return () => {};
  started = true;
  setEmployeeDirectoryStatus("loading");
  if (includeBusiness) setCrmHydrationStatus("loading");
  const run = ++syncGeneration;
  const hydrationStartedAt = typeof performance === "undefined" ? 0 : performance.now();
  crmRefreshCalls++;
  if (import.meta.env.DEV) console.info(`[boot] CRM refresh calls: ${crmRefreshCalls}`);
  const pull = () => {
    if (pullTimer) clearTimeout(pullTimer);
    pullTimer = setTimeout(() => {
      pullTimer = null;
      if (run !== syncGeneration) return;
      void (
        includeBusiness
          ? readCloud().then((snapshot) => {
              if (run === syncGeneration) hydrateCrm(snapshot);
            })
          : refreshEmployees()
      ).catch((error) => {
        // A transient realtime/pull failure must not erase the current
        // browser's resolved Employee Master profile or turn a valid session
        // into an apparent logout. The next sync/focus retry will reconcile.
        console.error("[crm] refresh failed", error);
      });
    }, 250);
  };
  const pullNotifications = async () => {
    const result = await supabase
      .from("crm_notifications")
      .select("id,kind,title,message,href,created_at,read")
      .order("created_at", { ascending: false })
      .limit(200);
    if (result.error) throw result.error;
    result.data.forEach((notification) =>
      ingestNotification({
        id: notification.id,
        kind: ["success", "warning", "info", "error"].includes(notification.kind)
          ? (notification.kind as "success" | "warning" | "info" | "error")
          : "info",
        category: "system",
        title: notification.title,
        message: notification.message,
        href: notification.href || undefined,
        created_at: notification.created_at,
        read: notification.read,
      }),
    );
  };
  void (includeBusiness ? pullAndMerge(run) : refreshEmployees())
    .then(() => {
      if (import.meta.env.DEV && typeof performance !== "undefined") {
        console.info(
          `[boot] initial page data hydrated: ${Math.round(performance.now() - hydrationStartedAt)}ms`,
        );
      }
    })
    .catch((error) => {
      setEmployeeDirectoryStatus("error");
      if (includeBusiness) setCrmHydrationStatus("error");
      console.error("[crm] initial refresh failed", error);
    });
  void pullNotifications().catch((error) =>
    console.error("[crm] notification refresh failed", error),
  );
  const offPersist = includeBusiness ? onCrmPersist(schedulePush) : () => {};

  channel = supabase
    .channel("crm-shared")
    .on("postgres_changes", { event: "*", schema: "public", table: "crm_employees" }, pull);
  if (includeBusiness)
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_queries" }, pull)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_tasks" }, pull)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_events" }, pull)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_standalone_quotation_reviews" },
        pull,
      );
  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "crm_notifications" },
    () => void pullNotifications(),
  );
  channel.subscribe();

  return () => {
    syncGeneration++;
    offPersist();
    if (pushTimer) clearTimeout(pushTimer);
    if (pullTimer) clearTimeout(pullTimer);
    if (channel) supabase.removeChannel(channel);
    channel = null;
    pending = null;
    ready = false;
    started = false;
    ownerUserIdByQueryId = new Map();
    cloudEventIds = new Set();
    cloudQuerySignatures = new Map();
    cloudTaskSignatures = new Map();
    cloudReviewSignatures = new Map();
    rejectedBackgroundQuerySignatures = new Map();
  };
}
