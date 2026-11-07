import type { ProgramRoutingRow, SavedProgram } from "@/lib/wizard/agents-store";
import { listItineraries } from "@/lib/itineraries-store";

type RoutingSnapshot = {
  programmeId: string;
  programmeName: string;
  programmeCode: string;
  startCity: string;
  endCity: string;
  nights: number;
  daysCount: number;
  routingSummary: string;
  routingFingerprint: string;
  routing: ProgramRoutingRow[];
  sourceType?: "quotation" | "manual";
};

type StoredItinerary = {
  id: string;
  status?: string;
  sourceQuotationId?: string;
  routingSnapshot?: RoutingSnapshot;
};

function complete(snapshot: RoutingSnapshot | undefined): snapshot is RoutingSnapshot {
  if (
    !snapshot ||
    !snapshot.programmeId ||
    !snapshot.programmeCode ||
    !snapshot.programmeName ||
    !snapshot.routingFingerprint
  )
    return false;
  const days = snapshot.routing.filter((row) => row.day > 0).sort((a, b) => a.day - b.day);
  return (
    snapshot.nights >= 1 &&
    snapshot.daysCount === snapshot.nights + 1 &&
    days.length === snapshot.daysCount &&
    days.every(
      (row, index) =>
        row.day === index + 1 &&
        Boolean(row.from_city?.trim()) &&
        Boolean(row.destination_city?.trim()),
    ) &&
    days.filter((row) => Boolean(row.overnight_city)).length === snapshot.nights
  );
}

export function savedRoutingProgrammes(records: StoredItinerary[]): SavedProgram[] {
  const programmes = new Map<string, SavedProgram>();
  for (const record of records) {
    const snapshot = record.routingSnapshot;
    if (!complete(snapshot) || (!record.sourceQuotationId && snapshot.sourceType !== "manual")) continue;
    programmes.set(snapshot.programmeId, {
      id: snapshot.programmeId,
      code: snapshot.programmeCode,
      name: snapshot.programmeName,
      nights: snapshot.nights,
      days: snapshot.daysCount,
      duration_label: `${snapshot.nights} Nights / ${snapshot.daysCount} Days`,
      routing_summary: snapshot.routingSummary,
      routing: snapshot.routing,
      cities: Array.from(
        new Set(
          [
            snapshot.startCity,
            snapshot.endCity,
            ...snapshot.routing.flatMap((row) => [
              row.from_city || "",
              row.destination_city || "",
              row.overnight_city || "",
            ]),
          ].filter(Boolean),
        ),
      ),
      categories: [],
      departure_city: snapshot.startCity,
      travel_modes: [],
      inclusions: [],
      exclusions: [],
      source: "Manual",
      status: "Active",
    });
  }
  return [...programmes.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export async function listSavedItineraryRoutingProgrammes(): Promise<SavedProgram[]> {
  if (typeof indexedDB === "undefined") return [];
  return savedRoutingProgrammes(await listItineraries());
}
