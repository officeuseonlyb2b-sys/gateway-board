import type { ProgramRoutingRow, SavedProgram } from "@/lib/wizard/agents-store";

export type ItineraryStatus = "Routing Saved" | "Draft" | "Published";
export type ManualSectionKey = "highlights" | "inclusions" | "exclusions" | "facts" | "notes";
export type ItineraryFieldSource = "Programme" | "Brochure Costing" | "Excel" | "Manual";

export interface ItineraryDay {
  day: number;
  title: string;
  route: string;
  cities: string[];
  overnightCity: string;
  travelMode?: string;
  tourTitles?: string[];
  meals: string;
  description: string;
  sightseeing: string;
  activities: string;
  hotelNotes: string;
}

export interface ItineraryRecord {
  id: string;
  title: string;
  code: string;
  programmeId: string;
  programmeName: string;
  programmeCode: string;
  costingQuoteId?: string;
  brochureId?: string;
  brochureVersionId?: string;
  /** Server-confirmed portal approval record; never inferred from local status. */
  portalSnapshot?: { id: string; status: "Pending" | "Approved" | "Rejected"; version: number; submittedAt?: string; approvedAt?: string };
  portalPublication?: { packageId: string; revision: number; url: string; status: "published"; publishedAt: string };
  costingVersion?: number;
  pricingValidity?: { from: string; till: string };
  pricingCoverage?: { readiness: "Ready" | "Partial" | "Incomplete"; warnings: string[] };
  routingFingerprint?: string;
  contentVersion: number;
  nights: number | null;
  daysCount: number | null;
  startCity: string;
  endCity: string;
  popular: boolean;
  groupOnly: boolean;
  route: string;
  overview: string;
  banner?: { assetKey: string; name: string; type: string; size: number };
  days: ItineraryDay[];
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  facts: string[];
  notes: string[];
  status: ItineraryStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  sourceQuotationId?: string;
  routingSnapshot?: ItineraryRoutingSnapshot;
  importIdentity?: string;
  importedAt?: string;
  importWarnings?: string[];
  sourcePricing?: unknown[];
  sourceHotelSupplements?: unknown[];
  fieldSources?: Partial<Record<"title" | "code" | "nights" | "daysCount" | "startCity" | "endCity" | "route" | "overview" | "days" | "highlights" | "inclusions" | "exclusions" | "facts" | "notes", ItineraryFieldSource>>;
}

export interface ItineraryRoutingSnapshot {
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
  sourceQuotationId: string;
  /** The explicit action that created this durable routing snapshot. */
  sourceType?: "quotation" | "manual";
  savedAt: string;
}

/**
 * Eligibility is intentionally derived from the immutable routing snapshot,
 * never from the broad legacy Programme Master cache.  This also protects the
 * quotation selector from partially authored itinerary content records.
 */
export function hasCompleteSavedRouting(record: ItineraryRecord): boolean {
  const snapshot = record.routingSnapshot;
  if (!snapshot || !snapshot.programmeId || !snapshot.programmeName || !snapshot.programmeCode || !snapshot.routingFingerprint) return false;
  if (snapshot.programmeId !== record.programmeId || snapshot.nights < 1 || snapshot.daysCount !== snapshot.nights + 1) return false;
  const touringDays = snapshot.routing.filter((row) => row.day > 0).sort((left, right) => left.day - right.day);
  if (touringDays.length !== snapshot.daysCount || touringDays.some((row, index) => row.day !== index + 1)) return false;
  if (touringDays.filter((row) => Boolean(row.overnight_city)).length !== snapshot.nights) return false;
  return snapshot.routing.every((row) => Boolean(row.from_city?.trim()) && Boolean(row.destination_city?.trim()));
}

/** Stable, versioned package shape for a future authorised Portal endpoint. */
export interface PortalPackagePayload {
  schemaVersion: "1.0";
  itineraryId: string;
  programmeId: string | null;
  programmeName: string;
  programmeCode: string;
  contentVersion: number;
  costingQuoteId: string | null;
  brochureId: string | null;
  brochureVersionId: string | null;
  costingVersion: number | null;
  routingFingerprint: string | null;
  pricing: {
    sourceQuoteId: string | null;
    costingVersion: number | null;
    brochureId: string | null;
    brochureVersionId: string | null;
    routingFingerprint: string | null;
  };
  title: string;
  code: string;
  duration: { nights: number | null; days: number | null };
  startCity: string;
  endCity: string;
  route: string;
  overview: string;
  banner: { assetKey: string; name: string; type: string } | null;
  days: ItineraryDay[];
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  facts: string[];
  notes: string[];
  status: ItineraryStatus;
}

export function toPortalPackagePayload(record: ItineraryRecord): PortalPackagePayload {
  return {
    schemaVersion: "1.0",
    itineraryId: record.id,
    programmeId: record.programmeId || null,
    programmeName: record.programmeName,
    programmeCode: record.programmeCode,
    contentVersion: record.contentVersion,
    costingQuoteId: record.costingQuoteId || null,
    brochureId: record.brochureId || null,
    brochureVersionId: record.brochureVersionId || null,
    costingVersion: record.costingVersion ?? null,
    routingFingerprint: record.routingFingerprint || null,
    pricing: {
      sourceQuoteId: record.costingQuoteId || null,
      costingVersion: record.costingVersion ?? null,
      brochureId: record.brochureId || null,
      brochureVersionId: record.brochureVersionId || null,
      routingFingerprint: record.routingFingerprint || null,
    },
    title: record.title,
    code: record.code,
    duration: { nights: record.nights, days: record.daysCount },
    startCity: record.startCity,
    endCity: record.endCity,
    route: record.route,
    overview: record.overview,
    banner: record.banner ? { assetKey: record.banner.assetKey, name: record.banner.name, type: record.banner.type } : null,
    days: record.days,
    highlights: record.highlights,
    inclusions: record.inclusions,
    exclusions: record.exclusions,
    facts: record.facts,
    notes: record.notes,
    status: record.status,
  };
}

const DB_NAME = "mp-tourism-itinerary-master";
const DB_VERSION = 1;
const RECORDS = "itineraries";
const BANNERS = "banners";

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Persistent browser storage is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORDS)) database.createObjectStore(RECORDS, { keyPath: "id" });
      if (!database.objectStoreNames.contains(BANNERS)) database.createObjectStore(BANNERS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open itinerary storage."));
  });
}

async function runTransaction<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Itinerary storage request failed."));
      transaction.onabort = () => reject(transaction.error || new Error("Itinerary storage transaction was aborted."));
    });
  } finally {
    database.close();
  }
}

export async function listItineraries(): Promise<ItineraryRecord[]> {
  const records = await runTransaction<ItineraryRecord[]>(RECORDS, "readonly", (store) => store.getAll());
  return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

/** Routing Master contains only records created by an explicit routing save action. */
export function explicitlySavedRoutingItineraries(records: ItineraryRecord[]): ItineraryRecord[] {
  // Do not infer eligibility from a legacy Programme, a status label, or an
  // itinerary content draft. Both values are written and read back only by
  // the explicit "Save Routing to Itinerary Master" action.
  return records.filter(
    (record) =>
      (Boolean(record.sourceQuotationId) || record.routingSnapshot?.sourceType === "manual") &&
      hasCompleteSavedRouting(record),
  );
}

export async function listExplicitlySavedRoutingItineraries(): Promise<ItineraryRecord[]> {
  return explicitlySavedRoutingItineraries(await listItineraries());
}

/** Reconstruct active reusable Programmes from the durable routing snapshots. */
export async function listExplicitlySavedRoutingProgrammes(): Promise<SavedProgram[]> {
  const records = await listExplicitlySavedRoutingItineraries();
  const byId = new Map<string, SavedProgram>();
  for (const record of records) {
    const snapshot = record.routingSnapshot!;
    byId.set(snapshot.programmeId, {
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
          [snapshot.startCity, snapshot.endCity, ...snapshot.routing.flatMap((row) => [row.from_city || "", row.destination_city || "", row.overnight_city || ""])]
            .filter(Boolean),
        ),
      ),
      categories: [],
      departure_city: snapshot.startCity,
      ending_city: snapshot.endCity,
      travel_modes: [],
      inclusions: [],
      exclusions: [],
      source: snapshot.sourceType === "manual" ? "Manual" : "Quotation Builder",
      status: "Active",
      created_at: snapshot.savedAt,
      updated_at: snapshot.savedAt,
    });
  }
  return [...byId.values()].sort((left, right) => left.code.localeCompare(right.code));
}

export async function saveItinerary(record: ItineraryRecord, options?: { replaceRoutingSnapshot?: boolean }): Promise<void> {
  const existing = await runTransaction<ItineraryRecord | undefined>(RECORDS, "readonly", (store) => store.get(record.id));
  const saved = existing?.routingSnapshot && !options?.replaceRoutingSnapshot
    ? {
        ...record,
        programmeId: existing.programmeId,
        programmeName: existing.programmeName,
        programmeCode: existing.programmeCode,
        sourceQuotationId: existing.sourceQuotationId,
        routingFingerprint: existing.routingFingerprint,
        routingSnapshot: existing.routingSnapshot,
      }
    : record;
  await runTransaction<IDBValidKey>(RECORDS, "readwrite", (store) => store.put(saved));
}

export async function saveItineraryBanner(assetKey: string, file: Blob): Promise<void> {
  await runTransaction<IDBValidKey>(BANNERS, "readwrite", (store) => store.put(file, assetKey));
}

export async function getItineraryBanner(assetKey: string): Promise<Blob | undefined> {
  return runTransaction<Blob | undefined>(BANNERS, "readonly", (store) => store.get(assetKey));
}

export async function removeItineraryBanner(assetKey: string): Promise<void> {
  await runTransaction<undefined>(BANNERS, "readwrite", (store) => store.delete(assetKey));
}

export function newItinerary(programme?: SavedProgram, actor = "Unknown"): ItineraryRecord {
  const now = new Date().toISOString();
  const id = globalThis.crypto?.randomUUID?.() || `itinerary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: ItineraryRecord = {
    id,
    title: "",
    code: "",
    programmeId: "",
    programmeName: "",
    programmeCode: "",
    contentVersion: 1,
    nights: null,
    daysCount: null,
    startCity: "",
    endCity: "",
    popular: false,
    groupOnly: false,
    route: "",
    overview: "",
    days: [],
    highlights: [],
    inclusions: [],
    exclusions: [],
    facts: [],
    notes: [],
    status: "Draft",
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
  };
  return programme ? hydrateItineraryFromProgramme(record, programme) : record;
}

export function hydrateItineraryFromProgramme(record: ItineraryRecord, programme: SavedProgram): ItineraryRecord {
  const count = Math.max(0, programme.days || programme.routing.length);
  const rows = programme.routing.length
    ? programme.routing.map((source, index) => {
        const from = source.from_city || (source.day === 1 || index === 0 ? programme.departure_city : "") || "";
        const destinations = source.to_cities?.length
          ? source.to_cities
          : [...(source.intermediate_cities || []), source.destination_city || source.overnight_city || ""];
        const stops = [from, ...destinations].filter((value) => Boolean(value));
        const titles = source.tour_titles?.length
          ? source.tour_titles
          : Object.values(source.tour_titles_by_city || {}).flat();
        const title = titles.length ? titles.join(" · ") : source.program_text || "";
        return {
          day: source.day,
          title,
          route: stops.filter((value, position, values) => position === 0 || value !== values[position - 1]).join(" → "),
          cities: stops.filter((value, position, values) => values.indexOf(value) === position),
          overnightCity: source.overnight_city || "",
          travelMode: source.travel_mode,
          tourTitles: titles.length ? titles : (source.program_text ? [source.program_text] : []),
          meals: "",
          description: source.program_text || title,
          sightseeing: "",
          activities: "",
          hotelNotes: "",
        } satisfies ItineraryDay;
      })
    : Array.from({ length: count }, (_, index) => ({
        day: index + 1,
        title: "",
        route: "",
        cities: [],
        overnightCity: "",
        meals: "",
        description: "",
        sightseeing: "",
        activities: "",
        hotelNotes: "",
      } satisfies ItineraryDay));
  const cities = programme.cities?.length ? programme.cities : Array.from(new Set(rows.flatMap((day) => day.cities)));
  const route = programme.routing_summary || rows.flatMap((day) => day.cities).filter((city, index, list) => list.indexOf(city) === index).join(" → ");
  const touringRows = rows.filter((day) => day.day > 0);
  const firstTouringRow = touringRows[0] || rows[0];
  const lastTouringRow = touringRows.at(-1) || rows.at(-1);
  return {
    ...record,
    programmeId: programme.id,
    programmeName: programme.name,
    programmeCode: programme.code,
    nights: programme.nights,
    daysCount: programme.days,
    startCity: firstTouringRow?.cities[0] || programme.departure_city || cities[0] || "",
    endCity: lastTouringRow?.cities.at(-1) || programme.ending_city || cities.at(-1) || "",
    route,
    days: rows,
    inclusions: record.inclusions.length ? record.inclusions : [...(programme.inclusions || [])],
    exclusions: record.exclusions.length ? record.exclusions : [...(programme.exclusions || [])],
    fieldSources: {
      ...record.fieldSources,
      nights: "Programme",
      daysCount: "Programme",
      startCity: "Programme",
      endCity: "Programme",
      route: "Programme",
      days: "Programme",
      ...(record.inclusions.length ? {} : { inclusions: "Programme" as const }),
      ...(record.exclusions.length ? {} : { exclusions: "Programme" as const }),
    },
  };
}

export function searchProgrammes(programmes: SavedProgram[], query: string): SavedProgram[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return programmes;
  return programmes.filter((programme) => [programme.name, programme.code, programme.id, programme.departure_city, programme.routing_summary, ...programme.cities, ...programme.routing.flatMap((row) => [row.from_city, row.destination_city, row.overnight_city, row.program_text])].filter(Boolean).join(" ").toLocaleLowerCase().includes(needle));
}

export function itineraryValidation(record: ItineraryRecord, programmes: SavedProgram[]): string[] {
  const errors: string[] = [];
  if (!record.title.trim()) errors.push("Itinerary title is required.");
  if (!record.code.trim()) errors.push("Itinerary code is required.");
  if (!programmes.some((programme) => programme.id === record.programmeId)) errors.push("Select a valid canonical Programme.");
  if (!record.startCity.trim()) errors.push("Start city is required.");
  if (!record.endCity.trim()) errors.push("End city is required.");
  if (!record.route.trim()) errors.push("Route / Circuit is required.");
  if (!record.overview.trim()) errors.push("Overview is required.");
  if (!record.banner) errors.push("A package banner image is required.");
  return errors;
}

export function bannerFileValidation(file: Pick<File, "type" | "size">): string | undefined {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Choose a JPG, PNG or WebP image.";
  if (file.size > 5 * 1024 * 1024) return "Banner images must be 5 MB or smaller.";
  return undefined;
}

export function findImportDuplicate(records: ItineraryRecord[], identity: string, code: string): ItineraryRecord | undefined {
  const normalizedCode = code.trim().toLocaleLowerCase();
  return records.find((record) => (identity && record.importIdentity === identity) || (normalizedCode && record.code.trim().toLocaleLowerCase() === normalizedCode));
}
