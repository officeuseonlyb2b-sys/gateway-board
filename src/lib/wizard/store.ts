// Draft store — persists the wizard state in localStorage.
// If localStorage quota is exceeded, sessionStorage is used as a fallback.

import { useSyncExternalStore } from "react";

import { emptyDraft, hotelSelectionForDay, type QuoteDraft } from "./types";
import { normalizeQueryFor } from "@/lib/query-for";

const KEY = "mp_tourism_draft_quote";
const FALLBACK_KEY = "mp_tourism_draft_quote_session";

const listeners = new Set<() => void>();

let cache: QuoteDraft | null = null;
let cacheInit = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDraft: QuoteDraft | null = null;
let lastSerialized = "";
let unloadListenerInstalled = false;

const isBrowser = () => typeof window !== "undefined";

/** Additive migration for drafts created before the standalone/query-for changes. */
export function normalizeDraft(raw: QuoteDraft): QuoteDraft {
  const legacyRange =
    typeof raw.pax_range === "string" && raw.pax_range !== "auto" && raw.pax_range.includes("-");
  const legacyBounds =
    Number.isInteger(raw.pax_min) &&
    Number.isInteger(raw.pax_max) &&
    (raw.pax_min ?? 0) >= 1 &&
    (raw.pax_max ?? 0) >= (raw.pax_min ?? 0);
  const legacyEscortMode = raw.escort_ranges?.length
    ? "pax_range"
    : Object.values(raw.guide_day_escort ?? {}).some((charge) => charge > 0)
      ? "day_wise"
      : undefined;
  const hotelOptions = (
    Array.isArray(raw.hotel_options) ? raw.hotel_options : emptyDraft().hotel_options
  ).map((option) => {
    if (option.dynamic_allocations) return option;
    const dynamicDays = new Set(raw.dynamic_days ?? []);
    if (raw.allocation_mode === "dynamic") {
      raw.routing.filter((day) => day.overnight).forEach((day) => dynamicDays.add(day.day));
    }
    if (!dynamicDays.size) return option;
    const migrated: NonNullable<QuoteDraft["hotel_options"][number]["dynamic_allocations"]> = {};
    dynamicDays.forEach((dayNumber) => {
      const route = raw.routing.find((day) => day.day === dayNumber);
      const stay = route && hotelSelectionForDay(option, route);
      const mix = raw.day_room_mix?.[dayNumber];
      if (!mix) return;
      migrated[dayNumber] = (["single", "double", "triple", "quad"] as const)
        .filter((occupancy) => mix[occupancy] > 0)
        .map((occupancy) => ({
          id: `legacy-${option.key}-${dayNumber}-${occupancy}`,
          room_id: stay?.room_id ?? "",
          occupancy,
          rooms: mix[occupancy],
        }));
    });
    return { ...option, dynamic_allocations: migrated };
  });
  return {
    ...emptyDraft(),
    ...raw,
    hotel_options: hotelOptions,
    query_for: normalizeQueryFor(raw.query_for),
    // Brochure Trip Basics always prices an inclusive range. This repairs
    // legacy snapshots with valid bounds but stale exact/default mode.
    pax_mode:
      raw.query_type === "Brochure" && legacyBounds
        ? "range"
        : raw.pax_mode || (legacyRange || legacyBounds ? "range" : "exact"),
    escort_pricing_mode: raw.escort_pricing_mode ?? legacyEscortMode,
    escort_enabled: raw.escort_enabled ?? Boolean(raw.escort_pricing_mode || legacyEscortMode),
    children: Array.isArray(raw.children) ? raw.children : [],
    land_markup_percent: raw.land_markup_percent ?? raw.markup_percent ?? 10,
    hotel_markup_percent: raw.hotel_markup_percent ?? raw.markup_percent ?? 10,
    land_gst_percent: raw.land_gst_percent ?? 5,
    hotel_gst_percent: raw.hotel_gst_percent ?? 5,
  };
}

/**
 * Safely read a draft from storage.
 *
 * sessionStorage is checked first because it may contain the
 * latest draft when localStorage quota was exceeded.
 */
function read(): QuoteDraft | null {
  if (!isBrowser()) return null;

  // First try sessionStorage fallback.
  try {
    const fallbackRaw = sessionStorage.getItem(FALLBACK_KEY);

    if (fallbackRaw) {
      return normalizeDraft(JSON.parse(fallbackRaw) as QuoteDraft);
    }
  } catch {
    // Ignore storage/JSON errors and continue to localStorage.
  }

  // Then try normal localStorage.
  try {
    const raw = localStorage.getItem(KEY);

    return raw ? normalizeDraft(JSON.parse(raw) as QuoteDraft) : null;
  } catch {
    return null;
  }
}

/**
 * Refresh the in-memory cache.
 */
function refresh() {
  cache = read();
  cacheInit = true;
}

/**
 * Get the current draft snapshot for useSyncExternalStore.
 */
function getSnapshot(): QuoteDraft | null {
  if (!cacheInit) {
    refresh();
  }

  return cache;
}

/**
 * Load the current draft.
 */
export function loadDraft(): QuoteDraft | null {
  if (!cacheInit) refresh();
  return cache;
}

function persistDraft(next: QuoteDraft) {
  if (!isBrowser()) return;
  const serialized = JSON.stringify(next);
  if (serialized === lastSerialized) return;

  let saved = false;
  try {
    localStorage.setItem(KEY, serialized);
    try {
      sessionStorage.removeItem(FALLBACK_KEY);
    } catch {
      // Ignore sessionStorage errors.
    }
    saved = true;
  } catch (error) {
    console.warn(
      "[draft-store] localStorage quota exceeded/unavailable. Using sessionStorage fallback.",
      error,
    );
  }

  if (!saved) {
    try {
      sessionStorage.setItem(FALLBACK_KEY, serialized);
      saved = true;
    } catch (error) {
      console.warn(
        "[draft-store] sessionStorage also unavailable/full. Keeping draft in memory.",
        error,
      );
    }
  }
  if (saved) lastSerialized = serialized;
}

/** Flush pending autosave work before navigation or an explicit save boundary. */
export function flushDraftPersistence() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  if (!pendingDraft) return;
  const next = pendingDraft;
  pendingDraft = null;
  persistDraft(next);
}

/**
 * Persist the draft safely.
 *
 * Normal behavior:
 *   localStorage
 *
 * If localStorage quota is exceeded:
 *   sessionStorage fallback
 *
 * If both storages are unavailable/full:
 *   keep the latest draft in memory so the React app
 *   does NOT crash.
 */
export function writeDraft(d: QuoteDraft, options?: { immediate?: boolean }) {
  if (!isBrowser()) return;

  const next: QuoteDraft = {
    ...d,
    updated_at: new Date().toISOString(),
  };

  cache = next;
  cacheInit = true;
  listeners.forEach((l) => l());

  pendingDraft = next;
  if (options?.immediate) {
    flushDraftPersistence();
    return;
  }
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(flushDraftPersistence, 450);
  if (!unloadListenerInstalled && typeof window.addEventListener === "function") {
    window.addEventListener("pagehide", flushDraftPersistence);
    unloadListenerInstalled = true;
  }
}

/**
 * Clear the saved draft from all available storage.
 */
export function clearDraft() {
  if (!isBrowser()) return;

  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  pendingDraft = null;
  lastSerialized = "";

  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore localStorage errors.
  }

  try {
    sessionStorage.removeItem(FALLBACK_KEY);
  } catch {
    // Ignore sessionStorage errors.
  }

  cache = null;
  cacheInit = true;

  listeners.forEach((l) => l());
}

/**
 * Create and persist a fresh draft.
 */
export function initDraft(): QuoteDraft {
  const d = emptyDraft();

  writeDraft(d, { immediate: true });

  return d;
}

/**
 * React hook for accessing the current draft.
 */
export function useDraft(): QuoteDraft | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);

      return () => listeners.delete(cb);
    },
    getSnapshot,
    () => null,
  );
}
