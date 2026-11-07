import { supabase } from "@/integrations/supabase/client";
import type { ItineraryRecord, ItineraryRoutingSnapshot } from "@/lib/itineraries-store";
import type { SavedProgram } from "@/lib/wizard/agents-store";

type CloudRoutingRow = {
  itinerary_id: string;
  programme_id: string;
  programme_code: string;
  programme_name: string;
  routing_fingerprint: string;
  nights: number;
  days_count: number;
  start_city: string;
  end_city: string;
  routing: ItineraryRoutingSnapshot["routing"];
  source_type: "quotation" | "manual";
  status: "active" | "inactive";
  updated_at: string;
};

export function cloudRoutingToProgramme(row: CloudRoutingRow): SavedProgram {
  return {
    id: row.programme_id,
    code: row.programme_code,
    name: row.programme_name,
    nights: row.nights,
    days: row.days_count,
    duration_label: `${row.nights} Nights / ${row.days_count} Days`,
    routing_summary: row.routing
      .map((day) => `${day.from_city || ""} → ${day.destination_city || ""}`)
      .join(" · "),
    routing: row.routing,
    cities: Array.from(
      new Set(
        [
          row.start_city,
          row.end_city,
          ...row.routing.flatMap((day) => [
            day.from_city || "",
            day.destination_city || "",
            day.overnight_city || "",
          ]),
        ].filter(Boolean),
      ),
    ),
    categories: [],
    departure_city: row.start_city,
    ending_city: row.end_city,
    travel_modes: [],
    inclusions: [],
    exclusions: [],
    source: row.source_type === "manual" ? "Manual" : "Quotation Builder",
    status: "Active",
    updated_at: row.updated_at,
  };
}

export async function listCloudSavedRoutingProgrammes(): Promise<SavedProgram[]> {
  const result = await (supabase as any)
    .from("crm_itinerary_routings")
    .select("*")
    .eq("status", "active")
    .order("programme_code");
  if (result.error) throw new Error(`CRM routing read failed: ${result.error.message}`);
  return ((result.data || []) as CloudRoutingRow[]).map(cloudRoutingToProgramme);
}

export async function syncRoutingToCloud(record: ItineraryRecord): Promise<void> {
  const snapshot = record.routingSnapshot;
  if (!snapshot) throw new Error("Only an explicitly saved routing can be synchronized.");
  const routing_payload = {
    itinerary_id: record.id,
    programme_id: snapshot.programmeId,
    programme_code: snapshot.programmeCode,
    programme_name: snapshot.programmeName,
    routing_fingerprint: snapshot.routingFingerprint,
    nights: snapshot.nights,
    days_count: snapshot.daysCount,
    start_city: snapshot.startCity,
    end_city: snapshot.endCity,
    routing: snapshot.routing,
    source_type: snapshot.sourceType || "quotation",
    status: "active",
    expected_fingerprint: snapshot.routingFingerprint,
  };
  const result = await (supabase as any).rpc("sync_crm_itinerary_routing", { routing_payload });
  if (result.error) throw new Error(`CRM routing sync failed: ${result.error.message}`);
}
