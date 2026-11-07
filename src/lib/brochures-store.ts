import { useSyncExternalStore } from "react";
import type { SavedQuote, SavedRateSheetRow } from "./quotes-store";
import { quoteRoutingFingerprint, type RouteCityReference } from "./programme-routing-identity";
import { largeRecordStore, putAndVerifyLargeRecord } from "./large-record-store";

export type BrochureStatus = "Draft" | "Ready for Review" | "Published" | "Archived";
export type RoomSharing = "Single Sharing" | "Twin Sharing" | "Triple Sharing" | "Quad Sharing";

export interface BrochureScenario {
  id: string;
  pax: number;
  hotel_category: string;
  accommodation_option_id: string;
  transport: string;
  transport_variation_id?: string;
  validity_from?: string;
  validity_till?: string;
  occupancy: RoomSharing;
  price_per_person: number;
  group_total: number;
  currency: "INR";
}

export interface BrochureVersion {
  id: string;
  brochure_id: string;
  version: number;
  status: BrochureStatus;
  name: string;
  programme_id: string;
  programme_code?: string;
  programme_name: string;
  days_nights: string;
  pax_min: number;
  pax_max: number;
  validity_from: string;
  validity_till: string;
  source_quote_id: string;
  source_quote_hash?: string;
  route_fingerprint?: string;
  scenarios: BrochureScenario[];
  validation_errors: string[];
  coverage_warnings?: string[];
  created_at: string;
  created_by: string;
  updated_at: string;
}

const brochureLibraryStore = largeRecordStore<BrochureVersion>("brochure-library");

export interface BrochurePricingCoverage {
  configured_pax_range: string;
  transport_variations: number;
  hotel_options: number;
  occupancy_combinations: number;
  valid_scenarios: number;
  missing_or_invalid_scenarios: number;
  readiness: "Ready" | "Partial" | "Incomplete";
}

export interface PackagePriceLookup {
  programme_id: string;
  route_fingerprint: string;
  pax: number;
  hotel_category: string;
  transport_variation_id?: string;
  transport?: string;
  occupancy: RoomSharing;
  departure_date: string;
}

export type PackagePriceResult =
  | {
      available: true;
      brochure_id: string;
      brochure_version_id: string;
      version: number;
      scenario_id: string;
      price_per_person: number;
      group_total: number;
      currency: "INR";
      hotel_category: string;
      transport: string;
      validity_from: string;
      validity_till: string;
    }
  | { available: false; reason: "PRICE_ON_REQUEST" };

/** Return only an exact scenario from one explicitly linked immutable snapshot.
 * Unlike the Portal lookup below, internal itinerary drafting may reference a
 * Ready for Review snapshot with partial coverage; it never falls back to a
 * newer version or recalculates a price. */
export function lookupSavedBrochurePackagePrice(
  brochure: BrochureVersion,
  request: PackagePriceLookup,
): PackagePriceResult {
  if (
    brochure.status === "Archived" ||
    brochure.programme_id !== request.programme_id ||
    brochure.route_fingerprint !== request.route_fingerprint ||
    (!brochure.validity_from || brochure.validity_from > request.departure_date) ||
    (!brochure.validity_till || brochure.validity_till < request.departure_date)
  ) return { available: false, reason: "PRICE_ON_REQUEST" };
  const scenario = brochure.scenarios.find((item) =>
    item.pax === request.pax &&
    item.hotel_category === request.hotel_category &&
    item.occupancy === request.occupancy &&
    (!item.validity_from || item.validity_from <= request.departure_date) &&
    (!item.validity_till || item.validity_till >= request.departure_date) &&
    (request.transport_variation_id
      ? item.transport_variation_id === request.transport_variation_id
      : item.transport === request.transport),
  );
  return scenario ? {
    available: true,
    brochure_id: brochure.brochure_id,
    brochure_version_id: brochure.id,
    version: brochure.version,
    scenario_id: scenario.id,
    price_per_person: scenario.price_per_person,
    group_total: scenario.group_total,
    currency: scenario.currency,
    hotel_category: scenario.hotel_category,
    transport: scenario.transport,
    validity_from: scenario.validity_from || brochure.validity_from,
    validity_till: scenario.validity_till || brochure.validity_till,
  } : { available: false, reason: "PRICE_ON_REQUEST" };
}

export interface SavedBrochureCostingEligibility {
  eligible: boolean;
  reasons: string[];
}

/** Keeps the library picker and library writer on the same immutable-source contract. */
export function savedBrochureCostingEligibility(
  quote: SavedQuote,
): SavedBrochureCostingEligibility {
  const source = quote.brochure_source;
  const reasons: string[] = [];
  if (!source?.programme_id?.trim())
    reasons.push("Programme not linked to a canonical Programme ID");
  if (quote.costing_complete !== true) reasons.push("Not finalised");
  if (
    !source?.validity_from ||
    !source?.validity_till ||
    source.validity_till < source.validity_from
  )
    reasons.push("Invalid validity");
  if (
    !source ||
    !Number.isInteger(source.pax_min) ||
    !Number.isInteger(source.pax_max) ||
    source.pax_min < 1 ||
    source.pax_max < source.pax_min
  )
    reasons.push("Invalid Pax range");
  const rows = quote.rate_sheet_rows || [];
  if (!rows.length) reasons.push("Missing Pax-range pricing");
  else if (source) {
    const expected = Array.from(
      { length: source.pax_max - source.pax_min + 1 },
      (_, index) => source.pax_min + index,
    );
    const missing = expected.filter((pax) => !rows.some((row) => row.pax === pax));
    if (missing.length) reasons.push(`Missing Pax-range pricing for ${missing.join(", ")} Pax`);
  }
  return { eligible: reasons.length === 0, reasons };
}

const KEY = "mp_tourism_brochure_library_v1";
const listeners = new Set<() => void>();
const browser = () => typeof window !== "undefined";
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const EMPTY_BROCHURES: BrochureVersion[] = [];
let cachedSnapshot: BrochureVersion[] = EMPTY_BROCHURES;
let cacheInitialized = false;
let indexedBrochureCache = new Map<string, BrochureVersion>();
let indexedBrochureHydration: Promise<void> | null = null;

function read(): BrochureVersion[] {
  if (!browser()) return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as BrochureVersion[];
  } catch {
    return [];
  }
}
function refreshCache() {
  const merged = new Map(read().map((item) => [item.id, item]));
  indexedBrochureCache.forEach((item, id) => merged.set(id, item));
  cachedSnapshot = [...merged.values()].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  cacheInitialized = true;
}
function hydrateIndexedBrochures(): Promise<void> {
  if (!browser()) return Promise.resolve();
  if (indexedBrochureHydration) return indexedBrochureHydration;
  indexedBrochureHydration = brochureLibraryStore.getAll()
    .then((records) => {
      indexedBrochureCache = new Map(records.map((record) => [record.id, record as BrochureVersion]));
      refreshCache();
      listeners.forEach((listener) => listener());
    })
    .catch((error: unknown) => {
      console.error("[brochures] browser-local IndexedDB read failed", error);
      refreshCache();
      listeners.forEach((listener) => listener());
    });
  return indexedBrochureHydration;
}
function getSnapshot() {
  if (!cacheInitialized) refreshCache();
  void hydrateIndexedBrochures();
  return cachedSnapshot;
}
function write(records: BrochureVersion[]) {
  localStorage.setItem(KEY, JSON.stringify(records));
  refreshCache();
  listeners.forEach((listener) => listener());
}
export function useBrochures() {
  // React requires an Object.is-stable snapshot until a store notification.
  // Parsing localStorage here created a fresh array on each render and caused
  // /brochures to re-render indefinitely.
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    () => EMPTY_BROCHURES,
  );
}
export function listBrochures() {
  const records = getSnapshot();
  return records;
}

async function allBrochures(): Promise<BrochureVersion[]> {
  const [legacy, indexed] = await Promise.all([Promise.resolve(read()), brochureLibraryStore.getAll()]);
  indexedBrochureCache = new Map(indexed.map((item) => [item.id, item as BrochureVersion]));
  refreshCache();
  return [...new Map([...legacy, ...indexedBrochureCache.values()].map((item) => [item.id, item])).values()];
}

async function persistBrochureRecords(records: BrochureVersion[]): Promise<void> {
  const indexedIds = new Set(indexedBrochureCache.keys());
  const localRecords = records.filter((record) => !indexedIds.has(record.id));
  const indexedRecords = records.filter((record) => indexedIds.has(record.id));
  // Keep the legacy localStorage records intact; only update that existing
  // collection, and persist the larger/new records in IndexedDB.
  if (localRecords.length !== read().length || JSON.stringify(localRecords) !== JSON.stringify(read())) {
    write(localRecords);
  }
  for (const record of indexedRecords) {
    const persisted = await putAndVerifyLargeRecord(record, brochureLibraryStore);
    indexedBrochureCache.set(persisted.id, persisted);
  }
  refreshCache();
  listeners.forEach((listener) => listener());
}

/** Coverage is intentionally limited to combinations captured by the immutable
 * pricing snapshot; it never guesses additional master-data combinations. */
export function brochurePricingCoverage(brochure: BrochureVersion): BrochurePricingCoverage {
  const valid = brochure.scenarios.length;
  const invalid = brochure.validation_errors.length + (brochure.coverage_warnings?.length ?? 0);
  return {
    configured_pax_range: `${brochure.pax_min}–${brochure.pax_max} Pax`,
    transport_variations: new Set(
      brochure.scenarios.map((item) => item.transport_variation_id || item.transport),
    ).size,
    hotel_options: new Set(brochure.scenarios.map((item) => item.accommodation_option_id)).size,
    occupancy_combinations: new Set(brochure.scenarios.map((item) => item.occupancy)).size,
    valid_scenarios: valid,
    missing_or_invalid_scenarios: invalid,
    readiness: !valid ? "Incomplete" : invalid ? "Partial" : "Ready",
  };
}

const occupancyRates: Array<
  [RoomSharing, keyof Pick<SavedRateSheetRow, "single" | "double" | "triple" | "quad">]
> = [
  ["Single Sharing", "single"],
  ["Twin Sharing", "double"],
  ["Triple Sharing", "triple"],
  ["Quad Sharing", "quad"],
];
export function scenariosFromQuote(quote: SavedQuote): BrochureScenario[] {
  return (quote.rate_sheet_rows || []).flatMap((row, rowIndex) =>
    occupancyRates.flatMap(([occupancy, rateKey]) => {
      const price = row[rateKey];
      if (!Number.isFinite(price) || price <= 0) return [];
      return [
        {
          id: `${row.option_key}-${row.transport_variation_id || row.vehicle}-${row.pax}-${occupancy}-${row.brochure_validity_from || ""}-${row.brochure_validity_till || ""}`,
          pax: row.pax,
          hotel_category: row.option_label,
          accommodation_option_id: row.option_key,
          transport: row.vehicle,
          transport_variation_id: row.transport_variation_id,
          validity_from: row.brochure_validity_from,
          validity_till: row.brochure_validity_till,
          occupancy,
          price_per_person: price,
          group_total: price * row.pax,
          currency: "INR" as const,
        },
      ];
    }),
  );
}
export async function createBrochureFromQuote(
  quote: SavedQuote,
  createdBy: string,
  name?: string,
  cities: RouteCityReference[] = [],
): Promise<BrochureVersion> {
  const source = quote.brochure_source;
  const eligibility = savedBrochureCostingEligibility(quote);
  if (!eligibility.eligible)
    throw new Error(`This saved costing cannot seed a library: ${eligibility.reasons.join("; ")}.`);
  if (!source) throw new Error("This saved costing is not linked to a canonical Programme.");
  // Saving the same immutable snapshot again is idempotent. It must not
  // create a second library record merely because a user retries Step 10.
  const records = await allBrochures();
  const existing = records.find((item) => item.source_quote_id === quote.id);
  if (existing) return existing;
  const scenarios = scenariosFromQuote(quote);
  // Preserve unresolved snapshot issues: a partly priced brochure is a valid
  // draft, but cannot be published simply because some rows are priced.
  const validation_errors = [
    ...(quote.costing_complete === false ? quote.validation_warnings || [] : []),
    ...(!scenarios.length
      ? ["No valid, non-zero saved pricing scenarios were found in this costing snapshot."]
      : []),
  ].filter((message, index, values) => Boolean(message) && values.indexOf(message) === index);
  const at = new Date().toISOString();
  const routeFingerprint = quoteRoutingFingerprint(quote, cities);
  const sameRouteVersions = routeFingerprint
    ? records.filter((item) => item.programme_id === source.programme_id && item.route_fingerprint === routeFingerprint)
    : [];
  const lineage = sameRouteVersions.sort((left, right) => right.version - left.version)[0];
  const record: BrochureVersion = {
    id: uid(),
    brochure_id: lineage?.brochure_id || uid(),
    version: lineage ? lineage.version + 1 : 1,
    // This record is created only from a complete immutable costing snapshot;
    // it is final pricing, not an editable library draft or Portal publication.
    status: "Ready for Review",
    name: name?.trim() || source.programme_name,
    programme_id: source.programme_id,
    programme_code: source.programme_code,
    programme_name: source.programme_name,
    days_nights: `${quote.total_nights + 1}D / ${quote.total_nights}N`,
    pax_min: source.pax_min,
    pax_max: source.pax_max,
    validity_from: source.validity_from || "",
    validity_till: source.validity_till || "",
    source_quote_id: quote.id,
    source_quote_hash: quote.content_hash,
    route_fingerprint: routeFingerprint,
    scenarios,
    validation_errors,
    coverage_warnings: source.rate_coverage_gaps ?? [],
    created_at: at,
    created_by: createdBy,
    updated_at: at,
  };
  const persisted = await putAndVerifyLargeRecord(record, brochureLibraryStore);
  indexedBrochureCache.set(persisted.id, persisted);
  refreshCache();
  listeners.forEach((listener) => listener());
  return persisted;
}
export async function setBrochureStatus(id: string, status: BrochureStatus): Promise<BrochureVersion> {
  const records = await allBrochures();
  const record = records.find((item) => item.id === id);
  if (!record) throw new Error("Brochure version not found.");
  if (
    status === "Published" &&
    (record.validation_errors.length ||
      (record.coverage_warnings?.length ?? 0) > 0 ||
      !record.validity_from ||
      !record.validity_till ||
      !record.scenarios.length)
  )
    throw new Error(
      "A brochure needs valid dates and at least one valid saved scenario before publishing.",
    );
  const next = { ...record, status, updated_at: new Date().toISOString() };
  // A successor takes over the same brochure identity. Historical snapshots
  // remain intact but are never eligible for a new package lookup.
  const updatedRecords = records.map((item) => {
      if (item.id === id) return next;
      if (
        status === "Published" &&
        item.brochure_id === record.brochure_id &&
        item.status === "Published"
      )
        return { ...item, status: "Archived" as const, updated_at: next.updated_at };
      return item;
    });
  await persistBrochureRecords(updatedRecords);
  return next;
}
export async function duplicateBrochureVersion(id: string, createdBy: string): Promise<BrochureVersion> {
  const records = await allBrochures();
  const source = records.find((item) => item.id === id);
  if (!source) throw new Error("Brochure version not found.");
  const at = new Date().toISOString();
  const next = {
    ...source,
    id: uid(),
    version: source.version + 1,
    status: "Draft" as const,
    created_at: at,
    updated_at: at,
    created_by: createdBy,
  };
  if (indexedBrochureCache.has(source.id)) {
    const persisted = await putAndVerifyLargeRecord(next, brochureLibraryStore);
    indexedBrochureCache.set(persisted.id, persisted);
    refreshCache();
    listeners.forEach((listener) => listener());
    return persisted;
  }
  write([next, ...read()]);
  return next;
}
/** Exact-match portal contract. It intentionally has no nearest-pax or fallback behaviour. */
export function lookupPublishedPackagePriceInRecords(
  records: BrochureVersion[],
  request: PackagePriceLookup,
): PackagePriceResult {
  const matched = records
    .filter(
      (brochure) =>
        brochure.status === "Published" &&
        brochure.programme_id === request.programme_id &&
        brochure.route_fingerprint === request.route_fingerprint &&
        (!brochure.validity_from || brochure.validity_from <= request.departure_date) &&
        (!brochure.validity_till || brochure.validity_till >= request.departure_date),
    )
    .sort((a, b) => b.version - a.version || b.updated_at.localeCompare(a.updated_at));
  for (const brochure of matched) {
    const scenario = brochure.scenarios.find(
      (item) =>
        item.pax === request.pax &&
        item.hotel_category === request.hotel_category &&
        item.occupancy === request.occupancy &&
        (!item.validity_from || item.validity_from <= request.departure_date) &&
        (!item.validity_till || item.validity_till >= request.departure_date) &&
        (request.transport_variation_id
          ? item.transport_variation_id === request.transport_variation_id
          : item.transport === request.transport),
    );
    if (scenario)
      return {
        available: true,
        brochure_id: brochure.brochure_id,
        brochure_version_id: brochure.id,
        version: brochure.version,
        scenario_id: scenario.id,
        price_per_person: scenario.price_per_person,
        group_total: scenario.group_total,
        currency: scenario.currency,
        hotel_category: scenario.hotel_category,
        transport: scenario.transport,
        validity_from: scenario.validity_from || brochure.validity_from,
        validity_till: scenario.validity_till || brochure.validity_till,
      };
  }
  return { available: false, reason: "PRICE_ON_REQUEST" };
}
export function lookupPublishedPackagePrice(request: PackagePriceLookup): PackagePriceResult {
  return lookupPublishedPackagePriceInRecords(listBrochures(), request);
}
