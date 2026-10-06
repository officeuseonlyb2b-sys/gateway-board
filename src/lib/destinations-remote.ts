// Shared Destinations master data (cities + tours) backed by the cloud
// database, mirrored into the existing local store so every downstream module
// (Routing From/To, Entrances, Guide, Activities, Meals) keeps working exactly
// as before. The database is the source of truth; the local store is a cache.
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/mock-store";

type RemoteCity = { id: string; name: string };
type RemoteTour = { id: string; city_id: string; title: string; description: string | null };

let started = false;
let channel: ReturnType<typeof supabase.channel> | null = null;
let pulling: Promise<void> | null = null;

async function fetchAll(): Promise<{ cities: RemoteCity[]; tours: RemoteTour[] } | null> {
  const [{ data: cities, error: e1 }, { data: tours, error: e2 }] = await Promise.all([
    supabase.from("destination_cities").select("id,name"),
    supabase.from("destination_tours").select("id,city_id,title,description"),
  ]);
  if (e1 || e2) {
    console.error("[destinations] fetch failed", e1 ?? e2);
    return null;
  }
  return { cities: cities ?? [], tours: tours ?? [] };
}

/** First run only: push existing local master data up so nothing is lost. */
async function seedRemoteFromLocal() {
  const local = db.get();
  if (!local.destination_cities.length) return;
  const { error: ce } = await supabase
    .from("destination_cities")
    .upsert(local.destination_cities.map((c) => ({ id: c.id, name: c.name })), { onConflict: "id" });
  if (ce) {
    console.error("[destinations] seed cities failed", ce);
    return;
  }
  if (local.destination_tours.length) {
    const { error: te } = await supabase.from("destination_tours").upsert(
      local.destination_tours.map((t) => ({
        id: t.id,
        city_id: t.city_id,
        title: t.title,
        description: t.description ?? null,
      })),
      { onConflict: "id" },
    );
    if (te) console.error("[destinations] seed tours failed", te);
  }
}

/** Reconcile the local cache with the database (adds, renames, deletes). */
export function pullDestinations(): Promise<void> {
  if (pulling) return pulling;
  pulling = (async () => {
    const remote = await fetchAll();
    if (!remote) return;

    if (remote.cities.length === 0 && db.get().destination_cities.length > 0) {
      await seedRemoteFromLocal();
      const again = await fetchAll();
      if (!again) return;
      remote.cities = again.cities;
      remote.tours = again.tours;
    }

    const local = db.get();

    // Cities
    const localCityById = new Map(local.destination_cities.map((c) => [c.id, c]));
    const remoteCityIds = new Set(remote.cities.map((c) => c.id));
    for (const rc of remote.cities) {
      const lc = localCityById.get(rc.id);
      if (!lc) db.addDestinationCity(rc.name, rc.id);
      else if (lc.name !== rc.name) db.renameDestinationCity(rc.id, rc.name);
    }
    for (const lc of local.destination_cities) {
      if (!remoteCityIds.has(lc.id)) db.deleteDestinationCity(lc.id);
    }

    // Tours
    const after = db.get();
    const localTourById = new Map(after.destination_tours.map((t) => [t.id, t]));
    const remoteTourIds = new Set(remote.tours.map((t) => t.id));
    for (const rt of remote.tours) {
      const lt = localTourById.get(rt.id);
      if (!lt) {
        db.addDestinationTour({
          city_id: rt.city_id,
          title: rt.title,
          description: rt.description ?? undefined,
          forcedId: rt.id,
        });
      } else if (lt.title !== rt.title || (lt.description ?? "") !== (rt.description ?? "")) {
        db.updateDestinationTour(rt.id, { title: rt.title, description: rt.description ?? "" });
      }
    }
    for (const lt of after.destination_tours) {
      if (!remoteTourIds.has(lt.id)) db.deleteDestinationTour(lt.id);
    }
  })().finally(() => {
    pulling = null;
  });
  return pulling;
}

/**
 * Start the shared sync: initial pull + a single realtime subscription for
 * INSERT/UPDATE/DELETE on both tables. Safe to call repeatedly.
 */
export function startDestinationsSync(): () => void {
  if (started) return () => {};
  started = true;

  void pullDestinations();

  channel = supabase
    .channel("destinations-shared")
    .on("postgres_changes", { event: "*", schema: "public", table: "destination_cities" }, () => {
      void pullDestinations();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "destination_tours" }, () => {
      void pullDestinations();
    })
    .subscribe();

  return () => {
    if (channel) supabase.removeChannel(channel);
    channel = null;
    started = false;
  };
}

/** Write helpers — the UI calls these instead of writing to the local store. */
export const destinationsRemote = {
  async addCity(name: string) {
    const id = `dc_${crypto.randomUUID()}`;
    const { error } = await supabase.from("destination_cities").insert({ id, name: name.trim() });
    if (error) throw new Error(error.message);
    await pullDestinations();
    return id;
  },
  async renameCity(id: string, name: string) {
    const { error } = await supabase
      .from("destination_cities")
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    await pullDestinations();
  },
  async deleteCity(id: string) {
    const { error } = await supabase.from("destination_cities").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await pullDestinations();
  },
  async addTour(input: { city_id: string; title: string; description?: string }) {
    const id = `dt_${crypto.randomUUID()}`;
    const { error } = await supabase.from("destination_tours").insert({
      id,
      city_id: input.city_id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
    });
    if (error) throw new Error(error.message);
    await pullDestinations();
    return id;
  },
  async updateTour(id: string, patch: { title?: string; description?: string }) {
    const { error } = await supabase
      .from("destination_tours")
      .update({
        ...(patch.title != null ? { title: patch.title.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description.trim() || null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    await pullDestinations();
  },
  async deleteTour(id: string) {
    const { error } = await supabase.from("destination_tours").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await pullDestinations();
  },
};
