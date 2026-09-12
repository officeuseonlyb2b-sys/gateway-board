// Draft store — persists the wizard state in localStorage.
// If localStorage quota is exceeded, sessionStorage is used as a fallback.

import { useSyncExternalStore } from "react";

import { emptyDraft, type QuoteDraft } from "./types";

const KEY = "mp_tourism_draft_quote";
const FALLBACK_KEY = "mp_tourism_draft_quote_session";

const listeners = new Set<() => void>();

let cache: QuoteDraft | null = null;
let cacheInit = false;

const isBrowser = () => typeof window !== "undefined";

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
      return JSON.parse(fallbackRaw) as QuoteDraft;
    }
  } catch {
    // Ignore storage/JSON errors and continue to localStorage.
  }

  // Then try normal localStorage.
  try {
    const raw = localStorage.getItem(KEY);

    return raw ? (JSON.parse(raw) as QuoteDraft) : null;
  } catch {
    return null;
  }
}

/**
 * Notify subscribers and refresh the in-memory cache.
 */
function emit() {
  refresh();
  listeners.forEach((l) => l());
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
  return read();
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
export function writeDraft(d: QuoteDraft) {
  if (!isBrowser()) return;

  const next: QuoteDraft = {
    ...d,
    updated_at: new Date().toISOString(),
  };

  const serialized = JSON.stringify(next);

  let saved = false;

  // ---------------------------------------------------------
  // 1. Try localStorage first
  // ---------------------------------------------------------
  try {
    localStorage.setItem(KEY, serialized);

    // LocalStorage succeeded, so remove any old fallback copy.
    try {
      sessionStorage.removeItem(FALLBACK_KEY);
    } catch {
      // Ignore sessionStorage errors.
    }

    saved = true;
  } catch (error) {
    // localStorage quota exceeded or unavailable.
    console.warn(
      "[draft-store] localStorage quota exceeded/unavailable. Using sessionStorage fallback.",
      error,
    );
  }

  // ---------------------------------------------------------
  // 2. Fallback to sessionStorage
  // ---------------------------------------------------------
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

  // ---------------------------------------------------------
  // 3. Always update the in-memory cache.
  //
  // This is important: even if both browser storage
  // mechanisms fail, the React wizard must not crash.
  // ---------------------------------------------------------
  cache = next;
  cacheInit = true;

  listeners.forEach((l) => l());
}

/**
 * Clear the saved draft from all available storage.
 */
export function clearDraft() {
  if (!isBrowser()) return;

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

  writeDraft(d);

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