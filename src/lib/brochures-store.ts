import { useSyncExternalStore } from "react";
import type { SavedQuote, SavedRateSheetRow } from "./quotes-store";

export type BrochureStatus = "Draft" | "Ready for Review" | "Published" | "Archived";
export type RoomSharing = "Single Sharing" | "Twin Sharing" | "Triple Sharing" | "Quad Sharing";

export interface BrochureScenario {
  id: string;
  pax: number;
  hotel_category: string;
  accommodation_option_id: string;
  transport: string;
  transport_variation_id?: string;
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
  scenarios: BrochureScenario[];
  validation_errors: string[];
  created_at: string;
  created_by: string;
  updated_at: string;
}

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
  pax: number;
  hotel_category: string;
  transport_variation_id?: string;
  transport?: string;
  occupancy: RoomSharing;
  departure_date: string;
}

export type PackagePriceResult =
  | { available: true; brochure_id: string; brochure_version_id: string; version: number; scenario_id: string; price_per_person: number; group_total: number; currency: "INR"; hotel_category: string; transport: string; validity_from: string; validity_till: string }
  | { available: false; reason: "PRICE_ON_REQUEST" };

const KEY = "mp_tourism_brochure_library_v1";
const listeners = new Set<() => void>();
const browser = () => typeof window !== "undefined";
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const EMPTY_BROCHURES: BrochureVersion[] = [];
let cachedSnapshot: BrochureVersion[] = EMPTY_BROCHURES;
let cacheInitialized = false;

function read(): BrochureVersion[] {
  if (!browser()) return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as BrochureVersion[]; } catch { return []; }
}
function refreshCache() {
  cachedSnapshot = read();
  cacheInitialized = true;
}
function getSnapshot() {
  if (!cacheInitialized) refreshCache();
  return cachedSnapshot;
}
function write(records: BrochureVersion[]) {
  localStorage.setItem(KEY, JSON.stringify(records));
  cachedSnapshot = records;
  cacheInitialized = true;
  listeners.forEach((listener) => listener());
}
export function useBrochures() {
  // React requires an Object.is-stable snapshot until a store notification.
  // Parsing localStorage here created a fresh array on each render and caused
  // /brochures to re-render indefinitely.
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot,
    () => EMPTY_BROCHURES,
  );
}
export function listBrochures() { return getSnapshot(); }

/** Coverage is intentionally limited to combinations captured by the immutable
 * pricing snapshot; it never guesses additional master-data combinations. */
export function brochurePricingCoverage(brochure: BrochureVersion): BrochurePricingCoverage {
  const valid = brochure.scenarios.length;
  const invalid = brochure.validation_errors.length;
  return {
    configured_pax_range: `${brochure.pax_min}–${brochure.pax_max} Pax`,
    transport_variations: new Set(brochure.scenarios.map((item) => item.transport_variation_id || item.transport)).size,
    hotel_options: new Set(brochure.scenarios.map((item) => item.accommodation_option_id)).size,
    occupancy_combinations: new Set(brochure.scenarios.map((item) => item.occupancy)).size,
    valid_scenarios: valid,
    missing_or_invalid_scenarios: invalid,
    readiness: !valid ? "Incomplete" : invalid ? "Partial" : "Ready",
  };
}

const occupancyRates: Array<[RoomSharing, keyof Pick<SavedRateSheetRow, "single" | "double" | "triple" | "quad">]> = [
  ["Single Sharing", "single"], ["Twin Sharing", "double"], ["Triple Sharing", "triple"], ["Quad Sharing", "quad"],
];
function scenariosFromQuote(quote: SavedQuote): BrochureScenario[] {
  return (quote.rate_sheet_rows || []).flatMap((row, rowIndex) => occupancyRates.flatMap(([occupancy, rateKey]) => {
    const price = row[rateKey];
    if (!Number.isFinite(price) || price <= 0) return [];
    return [{ id: `${row.option_key}-${row.transport_variation_id || row.vehicle}-${row.pax}-${occupancy}`, pax: row.pax, hotel_category: row.option_label, accommodation_option_id: row.option_key, transport: row.vehicle, transport_variation_id: row.transport_variation_id, occupancy, price_per_person: price, group_total: price * row.pax, currency: "INR" as const }];
  }));
}
export function createBrochureFromQuote(quote: SavedQuote, createdBy: string, name?: string): BrochureVersion {
  const source = quote.brochure_source;
  if (!source?.programme_id) throw new Error("Only a Brochure costing with a canonical Programme ID can become a pricing library.");
  // Saving the same immutable snapshot again is idempotent. It must not
  // create a second library record merely because a user retries Step 10.
  const existing = read().find((item) => item.source_quote_id === quote.id);
  if (existing) return existing;
  const scenarios = scenariosFromQuote(quote);
  // Preserve unresolved snapshot issues: a partly priced brochure is a valid
  // draft, but cannot be published simply because some rows are priced.
  const validation_errors = [
    ...(quote.costing_complete === false ? quote.validation_warnings || [] : []),
    ...(!scenarios.length ? ["No valid, non-zero saved pricing scenarios were found in this costing snapshot."] : []),
  ].filter((message, index, values) => Boolean(message) && values.indexOf(message) === index);
  const at = new Date().toISOString();
  const record: BrochureVersion = { id: uid(), brochure_id: uid(), version: 1, status: "Draft", name: name?.trim() || source.programme_name, programme_id: source.programme_id, programme_code: source.programme_code, programme_name: source.programme_name, days_nights: `${quote.total_nights + 1}D / ${quote.total_nights}N`, pax_min: source.pax_min, pax_max: source.pax_max, validity_from: source.validity_from || "", validity_till: source.validity_till || "", source_quote_id: quote.id, source_quote_hash: quote.content_hash, scenarios, validation_errors, created_at: at, created_by: createdBy, updated_at: at };
  write([record, ...read()]);
  return record;
}
export function setBrochureStatus(id: string, status: BrochureStatus): BrochureVersion {
  const records = read(); const record = records.find((item) => item.id === id);
  if (!record) throw new Error("Brochure version not found.");
  if (status === "Published" && (record.validation_errors.length || !record.validity_from || !record.validity_till || !record.scenarios.length)) throw new Error("A brochure needs valid dates and at least one valid saved scenario before publishing.");
  const next = { ...record, status, updated_at: new Date().toISOString() };
  // A successor takes over the same brochure identity. Historical snapshots
  // remain intact but are never eligible for a new package lookup.
  write(records.map((item) => {
    if (item.id === id) return next;
    if (status === "Published" && item.brochure_id === record.brochure_id && item.status === "Published")
      return { ...item, status: "Archived" as const, updated_at: next.updated_at };
    return item;
  })); return next;
}
export function duplicateBrochureVersion(id: string, createdBy: string): BrochureVersion {
  const source = read().find((item) => item.id === id); if (!source) throw new Error("Brochure version not found.");
  const at = new Date().toISOString(); const next = { ...source, id: uid(), version: source.version + 1, status: "Draft" as const, created_at: at, updated_at: at, created_by: createdBy };
  write([next, ...read()]); return next;
}
/** Exact-match portal contract. It intentionally has no nearest-pax or fallback behaviour. */
export function lookupPublishedPackagePriceInRecords(records: BrochureVersion[], request: PackagePriceLookup): PackagePriceResult {
  const matched = records.filter((brochure) => brochure.status === "Published" && brochure.programme_id === request.programme_id && (!brochure.validity_from || brochure.validity_from <= request.departure_date) && (!brochure.validity_till || brochure.validity_till >= request.departure_date)).sort((a, b) => b.version - a.version || b.updated_at.localeCompare(a.updated_at));
  for (const brochure of matched) {
    const scenario = brochure.scenarios.find((item) => item.pax === request.pax && item.hotel_category === request.hotel_category && item.occupancy === request.occupancy && (request.transport_variation_id ? item.transport_variation_id === request.transport_variation_id : item.transport === request.transport));
    if (scenario) return { available: true, brochure_id: brochure.brochure_id, brochure_version_id: brochure.id, version: brochure.version, scenario_id: scenario.id, price_per_person: scenario.price_per_person, group_total: scenario.group_total, currency: scenario.currency, hotel_category: scenario.hotel_category, transport: scenario.transport, validity_from: brochure.validity_from, validity_till: brochure.validity_till };
  }
  return { available: false, reason: "PRICE_ON_REQUEST" };
}
export function lookupPublishedPackagePrice(request: PackagePriceLookup): PackagePriceResult {
  return lookupPublishedPackagePriceInRecords(read(), request);
}
