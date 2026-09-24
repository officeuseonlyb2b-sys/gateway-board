// Full-fidelity saved quotes persisted to localStorage.
import { useSyncExternalStore } from "react";
import type { QuoteDraft } from "./wizard/types";

const QUOTES_KEY = "mp_tourism_quotes";
const SEQ_KEY = "mp_tourism_quote_seq";

export interface SavedQuoteRates {
  sgl_net: number; sgl_gst_rate: number; sgl_gst_amt: number; sgl_total: number;
  dbl_net: number; dbl_gst_rate: number; dbl_gst_amt: number; dbl_total: number;
  trp_net: number; trp_gst_rate: number; trp_gst_amt: number; trp_total: number;
}
export interface SavedItineraryDay {
  day_number: number;
  date: string;
  city: string;
  hotel_name: string;
  hotel_category: string;
  room_category: string;
  meal_plan: string;
  season_label: string;
  validity_start: string;
  validity_end: string;
  rates: SavedQuoteRates;
  lunch_rate: number;
  dinner_rate: number;
}
export interface SavedAddons {
  travels: { name: string; days: number; vehicles: number; rate_per_day: number; total: number }[];
  miscellaneous: { name: string; pax: number; rate: number; unit: string; total: number }[];
  guide: { name: string; type: string; days: number; count: number; rate_per_day: number; total: number }[];
  entrances: { site_name: string; city: string; indian_pax: number; indian_rate: number; foreigner_pax: number; foreigner_rate: number; total: number }[];
  activities: { name: string; destination: string; pricing_type: string; qty: number; rate: number; total: number }[];
  optional_supplements?: { name: string; qty: number; rate: number; total: number }[];
  addons_total: number;
}
export interface SavedInclusions {
  accommodation_nights: number;
  breakfast_count: number;
  lunch_count: number;
  dinner_count: number;
  travels_included: boolean;
  guide_included: boolean;
}
export interface SavedTotals {
  room_net_sgl: number; room_net_dbl: number; room_net_trp: number;
  gst_rooms_sgl: number; gst_rooms_dbl: number; gst_rooms_trp: number;
  addons_total: number;
  markup_sgl: number; markup_dbl: number; markup_trp: number;
  gst_markup_sgl: number; gst_markup_dbl: number; gst_markup_trp: number;
  grand_sgl: number; grand_dbl: number; grand_trp: number;
}
export interface SavedAllocationRow {
  label: string;
  room_type_label: string;
  room_total: number;
  room_gst: number;
  room_net: number;
  shared_addons: number;
  markup_plus_gst: number;
  grand_total: number;
}
export interface SavedGroupRow {
  arrangement: string;   // e.g. "Double Sharing"
  rooms_label: string;   // e.g. "20 rooms" or "13 Triple + 1 Single"
  total_package: number;
  per_person: number;
  pax_covered: number;
}
/** One costing scenario = hotel category + vehicle + all add-ons, per person. */
export interface SavedScenarioPerson {
  label: string;
  room_label: string;
  hotel: number;
  transport: number;
  guide: number;
  activities: number;
  entrances: number;
  misc: number;
  meals: number;
  markup: number;
  gst5: number;
  total: number;
}
export interface SavedScenario {
  label: string;
  hotel_category: string;
  vehicle: string;
  pax: number;
  per_person_avg: number;
  grand_total: number;
  persons: SavedScenarioPerson[];
}
/** Final rate-sheet rows selected by Sales and locked with the quote version. */
export interface SavedRateSheetRow {
  option_key: string;
  option_label: string;
  vehicle: string;
  pax: number;
  single: number;
  double: number;
  triple: number;
  quad: number;
}
export interface SavedQuerySnapshot {
  program_id?: string;
  program_name?: string;
  routing?: string;
  pax_min?: number;
  pax_max?: number;
  hotel_categories: string[];
  bottom_line: number;
  top_line: number;
}
export type SavedQuoteStatus = "Generated" | "Sent" | "Superseded" | "Accepted" | "Void";
export interface SavedQuoteAuditEvent {
  at: string;
  by: string;
  action: "generated" | "sent" | "revision_created" | "superseded" | "accepted" | "voided";
  detail?: string;
}
export interface SavedQuote {
  id: string;
  query_id?: string;
  /** All versions of one quotation share the same family id/number. */
  family_id?: string;
  version: number;
  quote_number: string;
  display_number?: string;
  status: SavedQuoteStatus;
  saved_at: string;
  saved_by: string;
  generated_at?: string;
  generated_by?: string;
  revision_of_quote_id?: string;
  revision_reason?: string;
  /** Tamper-evident checksum of the finalised payload. */
  content_hash?: string;
  audit_log?: SavedQuoteAuditEvent[];
  /** Immutable input snapshot used only to create a new revision draft. */
  draft_snapshot?: QuoteDraft;
  tour_title: string;
  cities: string[];
  total_nights: number;
  travel_start: string;
  travel_end: string;
  itinerary: SavedItineraryDay[];
  addons: SavedAddons;
  inclusions: SavedInclusions;
  markup_percent: number;
  totals: SavedTotals;
  include_sgl: boolean;
  include_dbl: boolean;
  include_trp: boolean;
  allocations?: SavedAllocationRow[];
  is_group?: boolean;
  group_total_pax?: number;
  group_rows?: SavedGroupRow[];
  scenarios?: SavedScenario[];
  rate_sheet_rows?: SavedRateSheetRow[];
  /** Query-facing values captured from the quotation at save time. */
  query_snapshot?: SavedQuerySnapshot;
}



const listeners = new Set<() => void>();
let cachedSnapshot: SavedQuote[] = [];
let cacheInitialized = false;

function readFromStorage(): SavedQuote[] {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem(QUOTES_KEY) || "[]"); } catch { return []; }
}
function refreshCache() { cachedSnapshot = readFromStorage(); cacheInitialized = true; }
function emit() { refreshCache(); listeners.forEach((l) => l()); }
const isBrowser = () => typeof window !== "undefined";

export function loadQuotes(): SavedQuote[] {
  return readFromStorage();
}

function getSnapshot(): SavedQuote[] {
  if (!cacheInitialized) refreshCache();
  return cachedSnapshot;
}

function saveAll(list: SavedQuote[]) {
  localStorage.setItem(QUOTES_KEY, JSON.stringify(list));
  emit();
}


export function nextQuoteNumber(): string {
  if (!isBrowser()) return "QT-0000-000";
  const cur = parseInt(localStorage.getItem(SEQ_KEY) || "0", 10) + 1;
  localStorage.setItem(SEQ_KEY, String(cur));
  const yr = new Date().getFullYear();
  return `QT-${yr}-${String(cur).padStart(3, "0")}`;
}

export function saveQuote(q: SavedQuote): void {
  const list = loadQuotes();
  if (list.some((x) => x.id === q.id)) {
    throw new Error("Generated quotations are immutable. Create a revised version instead.");
  }
  const now = q.generated_at || q.saved_at || new Date().toISOString();
  const normalized: SavedQuote = {
    ...q,
    version: q.version || 1,
    family_id: q.family_id || q.id,
    status: q.status || "Generated",
    generated_at: now,
    generated_by: q.generated_by || q.saved_by,
    display_number: q.display_number || `${q.quote_number}-V${q.version || 1}`,
    audit_log: q.audit_log?.length
      ? q.audit_log
      : [{ at: now, by: q.saved_by, action: "generated", detail: "Quotation finalised and locked" }],
  };
  normalized.content_hash = normalized.content_hash || quoteChecksum(normalized);
  if (normalized.version > 1 && normalized.family_id) {
    const previousIndex = list.findIndex(
      (item) => item.family_id === normalized.family_id && item.status !== "Void" && item.status !== "Superseded",
    );
    if (previousIndex >= 0) {
      const previous = list[previousIndex];
      list[previousIndex] = {
        ...previous,
        status: "Superseded",
        audit_log: [
          ...(previous.audit_log ?? []),
          {
            at: now,
            by: normalized.saved_by,
            action: "superseded",
            detail: `Superseded by ${normalized.display_number}`,
          },
        ],
      };
    }
  }
  list.unshift(normalized);
  saveAll(list);
}

/** Generated records are never deleted; an authorised user may only void one. */
export function voidQuote(id: string, reason: string, by: string): void {
  if (!reason.trim()) throw new Error("A reason is required to void a quotation.");
  const at = new Date().toISOString();
  const list = loadQuotes().map((quote) => quote.id === id ? {
    ...quote,
    status: "Void" as const,
    audit_log: [
      ...(quote.audit_log ?? []),
      { at, by, action: "voided" as const, detail: reason.trim() },
    ],
  } : quote);
  saveAll(list);
}

export function updateQuoteStatus(
  id: string,
  status: Exclude<SavedQuoteStatus, "Generated" | "Void">,
  by: string,
  detail?: string,
): void {
  const at = new Date().toISOString();
  const action = status === "Sent" ? "sent" : status === "Accepted" ? "accepted" : "superseded";
  saveAll(loadQuotes().map((quote) => quote.id === id ? {
    ...quote,
    status,
    audit_log: [...(quote.audit_log ?? []), { at, by, action, detail }],
  } : quote));
}

/** Backward-compatible symbol: deliberately refuses destructive deletion. */
export function deleteQuote(_id: string): never {
  throw new Error("Generated quotations cannot be deleted. Void the record with a reason instead.");
}

export function getSavedQuote(id: string): SavedQuote | undefined {
  return loadQuotes().find((quote) => quote.id === id);
}

export function latestQuoteForQuery(queryId: string): SavedQuote | undefined {
  return loadQuotes()
    .filter((quote) => quote.query_id === queryId && quote.status !== "Void")
    .sort((a, b) => (b.version || 1) - (a.version || 1) || b.saved_at.localeCompare(a.saved_at))[0];
}

export function quoteVersionContext(draft: QuoteDraft): {
  version: number;
  family_id?: string;
  quote_number?: string;
  revision_of_quote_id?: string;
} {
  if (!draft.linked_query_id) return { version: 1 };
  const parent = draft.revision_of_quote_id
    ? getSavedQuote(draft.revision_of_quote_id)
    : latestQuoteForQuery(draft.linked_query_id);
  if (!parent) return { version: 1 };
  return {
    version: (parent.version || 1) + 1,
    family_id: parent.family_id || parent.id,
    quote_number: parent.quote_number,
    revision_of_quote_id: parent.id,
  };
}

export function quoteToRevisionDraft(quote: SavedQuote, reason: string): QuoteDraft {
  if (!quote.draft_snapshot) throw new Error("This legacy quotation has no revision snapshot.");
  if (!reason.trim()) throw new Error("A revision reason is required.");
  const snapshot = JSON.parse(JSON.stringify(quote.draft_snapshot)) as QuoteDraft;
  return {
    ...snapshot,
    step: 1,
    revision_of_quote_id: quote.id,
    revision_of_quote_number: quote.display_number || `${quote.quote_number}-V${quote.version || 1}`,
    revision_reason: reason.trim(),
    intended_version: (quote.version || 1) + 1,
    updated_at: new Date().toISOString(),
  };
}

export function useSavedQuotes(): SavedQuote[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getSnapshot,
    () => [],
  );
}

function quoteChecksum(quote: SavedQuote): string {
  const protectedPayload = {
    query_id: quote.query_id,
    family_id: quote.family_id,
    version: quote.version,
    quote_number: quote.quote_number,
    saved_at: quote.saved_at,
    saved_by: quote.saved_by,
    tour_title: quote.tour_title,
    cities: quote.cities,
    itinerary: quote.itinerary,
    addons: quote.addons,
    totals: quote.totals,
    scenarios: quote.scenarios,
    rate_sheet_rows: quote.rate_sheet_rows,
    query_snapshot: quote.query_snapshot,
  };
  const text = JSON.stringify(protectedPayload);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `FNV1A-${(hash >>> 0).toString(16).padStart(8, "0").toUpperCase()}`;
}
