// Account-based (cloud) persistence for ALL master data: hotels, rates,
// guides, entrance fees, activities, destinations & tours, transport,
// restaurants/meals and other services.
//
// The whole master store is kept in one shared database record so every
// signed-in team member sees identical data on any device or link. The
// browser copy is only a cache: on start we adopt the cloud record, and every
// local write is pushed back (debounced) as an UPDATE of the same row — never
// a delete, and never a blank overwrite.
import { supabase } from "@/integrations/supabase/client";
import { db, onMastersPersist, type DB } from "@/lib/mock-store";

const ROW_ID = "shared";

export type MasterSyncStatus = "idle" | "loading" | "ready" | "empty" | "denied" | "error";

export interface MasterSyncState {
  status: MasterSyncStatus;
  message: string;
  source: string;
}

let started = false;
let ready = false;
let readOnlyMode = false;
let myRev = "";
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pending: DB | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;
const onInitialPull: (() => void)[] = [];
const statusListeners = new Set<() => void>();
let syncState: MasterSyncState = { status: "idle", message: "", source: "" };

function setSyncState(next: MasterSyncState) {
  syncState = next;
  statusListeners.forEach((listener) => listener());
}

export function getMasterSyncState(): MasterSyncState {
  return syncState;
}

export function subscribeMasterSync(listener: () => void) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function classifyRemoteError(error: { code?: string; message?: string; details?: string } | null) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  if (
    error?.code === "42501" ||
    text.includes("row-level security") ||
    text.includes("permission denied") ||
    text.includes("not authorized")
  ) {
    return "denied" as const;
  }
  return "error" as const;
}

/** Record a costing-master read failure without replacing the catalogue with []. */
export function reportMasterSyncIssue(
  status: "denied" | "error" | "empty",
  error: unknown,
  source: string,
) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message)
      : error
        ? String(error)
        : status === "empty"
          ? "No shared costing master record is visible."
          : "Costing master data could not be loaded.";
  console.error(`[${source}] ${status}`, error ?? message);
  setSyncState({ status, message, source });
}

/** Runs cb once the shared master record has been adopted (or created). */
export function afterMastersReady(cb: () => void) {
  if (ready) cb();
  else onInitialPull.push(cb);
}

const newRev = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function isUsable(data: unknown): data is DB {
  const d = data as DB | null;
  return !!d && typeof d === "object" && Array.isArray(d.destination_cities);
}

async function pushNow(next: DB) {
  const rev = newRev();
  myRev = rev;
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("app_master_state").upsert(
    {
      id: ROW_ID,
      data: JSON.parse(JSON.stringify(next)),
      rev,
      updated_by: userData.user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) console.error("[masters] save failed", error);
}

function schedulePush(next: DB) {
  if (!ready) return;
  pending = next;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const payload = pending;
    pending = null;
    if (payload) void pushNow(payload);
  }, 600);
}

/** Adopt the cloud record. Only a managing session may publish a missing record. */
export async function pullMasters(): Promise<void> {
  const readOnly = readOnlyMode;
  setSyncState({
    status: "loading",
    message: "Loading shared costing masters.",
    source: "masters",
  });
  const { data, error } = await supabase
    .from("app_master_state")
    .select("data,rev")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) {
    const status = classifyRemoteError(error);
    reportMasterSyncIssue(status, error, "masters");
    return;
  }

  if (data && isUsable(data.data)) {
    myRev = (data.rev as string) ?? "";
    db.hydrateAll(data.data);
    ready = true;
    const counts = data.data;
    const emptyCatalogue =
      counts.destination_cities.length === 0 &&
      counts.hotels.length === 0 &&
      counts.guides.length === 0 &&
      counts.travel_options.length === 0 &&
      counts.entrance_sites.length === 0 &&
      counts.activities.length === 0 &&
      counts.miscellaneous_items.length === 0 &&
      (counts.restaurants?.length ?? 0) === 0;
    setSyncState({
      status: emptyCatalogue ? "empty" : "ready",
      message: emptyCatalogue
        ? "The shared costing master record exists, but it has no catalogue rows."
        : "",
      source: "masters",
    });
    return;
  }

  if (readOnly) {
    // SELECT that is hidden by RLS and a genuinely missing row look the same.
    // Do not publish this browser's local cache, and do not pretend it is cloud data.
    reportMasterSyncIssue(
      "empty",
      new Error(
        "Shared costing master row was not returned. It is missing, or this login is not allowed to read it.",
      ),
      "masters",
    );
    return;
  }

  // No shared record yet — publish what this managing account currently has.
  ready = true;
  await pushNow(db.get());
  setSyncState({ status: "ready", message: "", source: "masters" });
}

/** Initial pull + realtime subscription. Writers also push local master edits. */
export function startMastersSync(options?: { readOnly?: boolean }): () => void {
  if (started) return () => {};
  started = true;
  readOnlyMode = options?.readOnly === true;

  const initial = pullMasters();
  void initial.then(() => {
    onInitialPull.forEach((cb) => cb());
    onInitialPull.length = 0;
  });

  const offPersist = readOnlyMode ? () => {} : onMastersPersist((d) => schedulePush(d));

  channel = supabase
    .channel("masters-shared")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_master_state" },
      (payload) => {
        const row = payload.new as { rev?: string; data?: unknown } | null;
        if (!row || row.rev === myRev) return; // our own write
        if (!isUsable(row.data)) return;
        myRev = row.rev ?? "";
        db.hydrateAll(row.data);
      },
    )
    .subscribe();

  return () => {
    offPersist();
    if (pushTimer) clearTimeout(pushTimer);
    if (pending && !readOnlyMode) void pushNow(pending);
    pending = null;
    if (channel) supabase.removeChannel(channel);
    channel = null;
    started = false;
    ready = false;
    readOnlyMode = false;
  };
}
