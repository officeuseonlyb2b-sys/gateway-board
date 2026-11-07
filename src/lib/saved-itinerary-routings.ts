import type { ProgramRoutingRow, SavedProgram } from "@/lib/wizard/agents-store";

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

const DB_NAME = "mp-tourism-itinerary-master";
const STORE_NAME = "itineraries";

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
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onerror = () =>
      reject(request.error || new Error("Saved itinerary routing storage is unavailable."));
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.close();
        resolve([]);
        return;
      }
      const read = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      read.onerror = () => {
        database.close();
        reject(read.error || new Error("Saved itinerary routings could not be read."));
      };
      read.onsuccess = () => {
        database.close();
        resolve(savedRoutingProgrammes(read.result as StoredItinerary[]));
      };
    };
  });
}
