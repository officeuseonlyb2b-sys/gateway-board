import { supabase } from "@/integrations/supabase/client";
import {
  getCrmSnapshot,
  hydrateCrm,
  onCrmPersist,
  type CrmSnapshot,
} from "./store";
import type { CrmEvent, CrmQuery, CrmTask, Employee } from "./types";

type CloudRow = { id: string; data: unknown };

let started = false;
let ready = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pending: CrmSnapshot | null = null;
let pullTimer: ReturnType<typeof setTimeout> | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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
    supabase.from("crm_queries").select("id,data"),
    supabase.from("crm_tasks").select("id,data"),
    supabase.from("crm_employees").select("id,data"),
    supabase.from("crm_events").select("id,data").order("at", { ascending: false }).limit(800),
  ]);
  const error = queryResult.error ?? taskResult.error ?? employeeResult.error ?? eventResult.error;
  if (error) throw error;
  return {
    queries: unwrap<CrmQuery>(queryResult.data),
    tasks: unwrap<CrmTask>(taskResult.data),
    employees: unwrap<Employee>(employeeResult.data),
    events: unwrap<CrmEvent>(eventResult.data),
  };
}

async function upsertSnapshot(snapshot: CrmSnapshot): Promise<void> {
  const operations = [
    snapshot.queries.length
      ? supabase.from("crm_queries").upsert(snapshot.queries.map((q) => ({
        id: q.id, query_id: q.query_id, owner: q.owner, stage: q.stage, data: clone(q),
      })), { onConflict: "id" })
      : Promise.resolve({ error: null }),
    snapshot.tasks.length
      ? supabase.from("crm_tasks").upsert(snapshot.tasks.map((task) => ({
        id: task.id, query_id: task.query_id || null, owner: task.owner, done: task.done, data: clone(task),
      })), { onConflict: "id" })
      : Promise.resolve({ error: null }),
    snapshot.employees.length
      ? supabase.from("crm_employees").upsert(snapshot.employees.map((employee) => ({
        id: employee.id, data: clone(employee),
      })), { onConflict: "id" })
      : Promise.resolve({ error: null }),
    snapshot.events.length
      ? supabase.from("crm_events").upsert(snapshot.events.map((event) => ({
        id: event.id, query_id: event.query_id ?? null, at: event.at, data: clone(event),
      })), { onConflict: "id" })
      : Promise.resolve({ error: null }),
  ];
  const results = await Promise.all(operations);
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;
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

async function pullAndMerge() {
  const local = getCrmSnapshot();
  const remote = await readCloud();
  const merged: CrmSnapshot = {
    queries: mergeById(remote.queries, local.queries),
    tasks: mergeById(remote.tasks, local.tasks),
    employees: mergeById(remote.employees, local.employees),
    events: mergeById(remote.events, local.events).slice(0, 800),
  };
  hydrateCrm(merged);
  ready = true;
  const recoveredLocalRecords =
    merged.queries.length !== remote.queries.length ||
    merged.tasks.length !== remote.tasks.length ||
    merged.employees.length !== remote.employees.length ||
    merged.events.length !== remote.events.length;
  if (recoveredLocalRecords) await upsertSnapshot(merged);
}

export function startCrmSync(): () => void {
  if (started) return () => {};
  started = true;
  void pullAndMerge().catch((error) => console.error("[crm] load failed", error));
  const offPersist = onCrmPersist(schedulePush);

  channel = supabase
    .channel("crm-shared")
    .on("postgres_changes", { event: "*", schema: "public", table: "crm_queries" }, schedulePull)
    .on("postgres_changes", { event: "*", schema: "public", table: "crm_tasks" }, schedulePull)
    .on("postgres_changes", { event: "*", schema: "public", table: "crm_employees" }, schedulePull)
    .on("postgres_changes", { event: "*", schema: "public", table: "crm_events" }, schedulePull)
    .subscribe();

  return () => {
    offPersist();
    if (pushTimer) clearTimeout(pushTimer);
    if (pullTimer) clearTimeout(pullTimer);
    if (pending) void upsertSnapshot(pending).catch((error) => console.error("[crm] save failed", error));
    if (channel) supabase.removeChannel(channel);
    channel = null;
    pending = null;
    ready = false;
    started = false;
  };
}

function schedulePull() {
  if (pullTimer) clearTimeout(pullTimer);
  pullTimer = setTimeout(() => {
    pullTimer = null;
    void readCloud()
      .then(hydrateCrm)
      .catch((error) => console.error("[crm] realtime refresh failed", error));
  }, 250);
}