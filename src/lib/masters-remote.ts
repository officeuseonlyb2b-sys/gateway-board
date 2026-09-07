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

let started = false;
let ready = false;
let myRev = "";
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pending: DB | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;

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

/** Adopt the cloud record, or create it from the current local data. */
export async function pullMasters(): Promise<void> {
  const { data, error } = await supabase
    .from("app_master_state")
    .select("data,rev")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) {
    console.error("[masters] load failed", error);
    return;
  }

  if (data && isUsable(data.data)) {
    myRev = (data.rev as string) ?? "";
    db.hydrateAll(data.data);
    ready = true;
    return;
  }

  // No shared record yet — publish what this account currently has.
  ready = true;
  await pushNow(db.get());
}

/** Initial pull + realtime subscription + push-on-write. Safe to call twice. */
export function startMastersSync(): () => void {
  if (started) return () => {};
  started = true;

  void pullMasters();

  const offPersist = onMastersPersist((d) => schedulePush(d));

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
    if (pending) void pushNow(pending);
    if (channel) supabase.removeChannel(channel);
    channel = null;
    started = false;
    ready = false;
  };
}
