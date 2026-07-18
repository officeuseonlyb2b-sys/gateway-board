// Full-fidelity saved quotes persisted to localStorage.
import { useSyncExternalStore } from "react";

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
export interface SavedQuote {
  id: string;
  quote_number: string;
  saved_at: string;
  saved_by: string;
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
  const existing = list.findIndex((x) => x.id === q.id);
  if (existing >= 0) list[existing] = q; else list.unshift(q);
  saveAll(list);
}

export function deleteQuote(id: string): void {
  saveAll(loadQuotes().filter((q) => q.id !== id));
}

export function useSavedQuotes(): SavedQuote[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getSnapshot,
    () => [],
  );
}

