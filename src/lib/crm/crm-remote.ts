import { supabase } from "@/integrations/supabase/client";
import {
  getCrmSnapshot,
  hydrateCrm,
  onCrmPersist,
  replaceEmployeesFromCloud,
  listEmployees,
  type CrmSnapshot,
} from "./store";
import { auth } from "@/lib/auth-mock";
import type { CrmEvent, CrmQuery, CrmTask, Employee } from "./types";
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

let started = false;
let ready = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pending: CrmSnapshot | null = null;
let pullTimer: ReturnType<typeof setTimeout> | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;
let syncGeneration = 0;
let ownerUserIdByQueryId = new Map<string, string | null>();
let cloudEventIds = new Set<string>();

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const asJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;

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

async function readCloud(): Promise<CrmSnapshot> {
  const [queryResult, taskResult, employeeResult, eventResult] = await Promise.all([
    supabase.from("crm_queries").select("id,data,owner_user_id"),
    supabase.from("crm_tasks").select("id,data"),
    readEmployeeRows(),
    supabase.from("crm_events").select("id,data").order("at", { ascending: false }).limit(800),
  ]);
  const error = queryResult.error ?? taskResult.error ?? eventResult.error;
  if (error) throw error;
  ownerUserIdByQueryId = new Map(
    ((queryResult.data ?? []) as CloudQueryRow[]).map((row) => [row.id, row.owner_user_id]),
  );
  cloudEventIds = new Set((eventResult.data ?? []).map((row) => row.id));
  return {
    queries: unwrap<CrmQuery>(queryResult.data),
    tasks: unwrap<CrmTask>(taskResult.data),
    employees: employeeResult,
    events: unwrap<CrmEvent>(eventResult.data),
  };
}

async function upsertSnapshot(snapshot: CrmSnapshot): Promise<void> {
  const userId = auth.current()?.id;
  const actor = listEmployees().find(
    (employee) =>
      employee.auth_user_id === userId && employee.active && employee.account_status === "Active",
  );
  if (!actor) return;
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
    (teamIds.has(query.owner || "") ||
      (!query.owner &&
        (query.primary_unit === actor.unit ||
          Boolean(actor.unit && query.participating_units?.includes(actor.unit)))));
  const writableQueries = snapshot.queries.filter(
    (query) =>
      superAdmin ||
      [query.owner].includes(actor.id) ||
      [query.owner].includes(actor.name) ||
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
      managerCanWriteQuery(query),
  );
  const writableQueryIds = new Set(writableQueries.map((query) => query.query_id));
  const writableEvents = snapshot.events.filter(
    (event) =>
      (superAdmin || Boolean(event.query_id && writableQueryIds.has(event.query_id))) &&
      (superAdmin || !cloudEventIds.has(event.id)),
  );
  const operations = [
    writableQueries.length
      ? supabase.from("crm_queries").upsert(
          writableQueries.map((q) => ({
            id: q.id,
            query_id: q.query_id,
            owner: q.owner,
            owner_user_id:
              listEmployees().find(
                (employee) => employee.id === q.owner || employee.name === q.owner,
              )?.auth_user_id ??
              ownerUserIdByQueryId.get(q.id) ??
              ([q.owner].includes(actor.id) || [q.owner].includes(actor.name) ? userId : null),
            stage: q.stage,
            data: asJson(q),
          })),
          { onConflict: "id" },
        )
      : Promise.resolve({ error: null }),
    superAdmin && snapshot.tasks.length
      ? supabase.from("crm_tasks").upsert(
          snapshot.tasks.map((task) => ({
            id: task.id,
            query_id: task.query_id || null,
            owner: task.owner,
            done: task.done,
            data: asJson(task),
          })),
          { onConflict: "id" },
        )
      : Promise.resolve({ error: null }),
    writableEvents.length
      ? superAdmin
        ? supabase.from("crm_events").upsert(
            writableEvents.map((event) => ({
              id: event.id,
              query_id: event.query_id ?? null,
              at: event.at,
              data: asJson(event),
            })),
            { onConflict: "id" },
          )
        : supabase.from("crm_events").insert(
            writableEvents.map((event) => ({
              id: event.id,
              query_id: event.query_id ?? null,
              at: event.at,
              data: asJson(event),
            })),
          )
      : Promise.resolve({ error: null }),
  ];
  const results = await Promise.all(operations);
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;
  writableEvents.forEach((event) => cloudEventIds.add(event.id));
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
  };

  // Employee records are read-only here; only server account actions write them.
  await upsertSnapshot({
    queries: snapshot.queries,
    tasks: clone(IMPORTED_QUERY_TASKS),
    employees: snapshot.employees,
    events: [clone(IMPORTED_DATASET_MARKER), ...clone(IMPORTED_QUERY_EVENTS)],
  });
  return snapshot;
}

export async function pushCrmSnapshotNow(snapshot = getCrmSnapshot()): Promise<void> {
  await upsertSnapshot(snapshot);
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
  };
  hydrateCrm(merged);
  ready = true;
  const recoveredLocalRecords =
    superAdmin &&
    (merged.queries.length !== remote.queries.length ||
      merged.tasks.length !== remote.tasks.length ||
      merged.events.length !== remote.events.length);
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
  const directory = await supabase.rpc("crm_review_employee_directory");
  if (directory.error) throw directory.error;
  const knownIds = new Set(records.map((employee) => employee.id));
  records.push(
    ...directory.data
      .filter((row) => !knownIds.has(row.id))
      .map((row): Employee => ({
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
      })),
  );
  return records;
}

export async function refreshEmployees() {
  const userId = auth.current()?.id;
  if (!userId) return;
  const records = await readEmployeeRows();
  if (auth.current()?.id === userId) replaceEmployeesFromCloud(records);
}

export function startCrmSync(includeBusiness = true): () => void {
  if (started) return () => {};
  started = true;
  const run = ++syncGeneration;
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
  void (includeBusiness ? pullAndMerge(run) : refreshEmployees()).catch((error) => {
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
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_events" }, pull);
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
  };
}
