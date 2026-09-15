// Multiple named drafts persisted to localStorage.
import { useSyncExternalStore } from "react";
import type { QuoteDraft } from "./wizard/types";

const KEY = "mp_tourism_drafts";
const LEGACY_KEY = "mp_tourism_draft_quote";

/** Keep at most this many drafts. Oldest are pruned first when over quota. */
const MAX_DRAFTS = 15;
/** Soft byte cap. Browsers give localStorage ~5 MB; leave headroom. */
const MAX_BYTES = 4_000_000;

export interface DraftRecord {
  id: string;
  draft_name: string;
  created_at: string;
  updated_at: string;
  last_step: number;
  wizard_state: QuoteDraft;
}

const isBrowser = () => typeof window !== "undefined";
const listeners = new Set<() => void>();
let cache: DraftRecord[] = [];
let inited = false;

function read(): DraftRecord[] {
  if (!isBrowser()) return [];
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]") as DraftRecord[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function refresh() {
  cache = read();
  inited = true;
}
function emit() {
  refresh();
  listeners.forEach((l) => l());
}
function getSnapshot(): DraftRecord[] {
  if (!inited) refresh();
  return cache;
}

function isQuotaError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return (
      err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22 ||
      err.code === 1014
    );
  }
  if (err instanceof Error && err.name === "QuotaExceededError") return true;
  return false;
}

function timeOf(r: DraftRecord): number {
  const t = r.updated_at || r.created_at;
  const v = t ? new Date(t).getTime() : NaN;
  return Number.isFinite(v) ? v : 0;
}

/**
 * Quota-safe write.
 *  - Sorts newest-first so the freshest drafts survive pruning.
 *  - Caps the list to MAX_DRAFTS.
 *  - On QuotaExceededError, drops the oldest draft and retries.
 *  - Never throws; worst case the key is removed.
 */
function writeAll(list: DraftRecord[]) {
  if (!isBrowser()) return;

  const sorted = [...list].sort((a, b) => timeOf(b) - timeOf(a));
  let trimmed = sorted.slice(0, MAX_DRAFTS);

  if (trimmed.length === 0) {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* swallow */
    }
    emit();
    return;
  }

  // Drop entries until the payload fits, then setItem.
  // Loop shrinks by one each iteration so we never lose all data unless
  // even a single record can't fit — in which case we clear the key.
  for (;;) {
    let payload: string;
    try {
      payload = JSON.stringify(trimmed);
    } catch (err) {
      console.error("[drafts-store] Failed to serialize drafts:", err);
      return;
    }

    // Preemptive byte-cap check (avoids a throw for very large payloads).
    if (payload.length > MAX_BYTES && trimmed.length > 1) {
      trimmed = trimmed.slice(0, -1);
      continue;
    }

    try {
      localStorage.setItem(KEY, payload);
      emit();
      return;
    } catch (err) {
      if (!isQuotaError(err)) {
        console.error("[drafts-store] write failed:", err);
        return;
      }
      if (trimmed.length <= 1) {
        // Even a single draft doesn't fit — clear and bail out gracefully.
        try {
          localStorage.removeItem(KEY);
        } catch {
          /* swallow */
        }
        console.warn(
          "[drafts-store] Quota exceeded for a single draft. Storage cleared.",
        );
        emit();
        return;
      }
      // Drop the oldest draft and retry.
      trimmed = trimmed.slice(0, -1);
    }
  }
}

function uid() {
  return "d_" + Math.random().toString(36).slice(2, 10);
}

function deriveName(state: QuoteDraft): string {
  if (state.program_name) return state.program_name;
  if (state.guest.name) return `Draft for ${state.guest.name}`;
  if (state.agent.name) return `Draft for ${state.agent.name}`;
  return `Untitled draft — ${new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  })}`;
}

/** Upsert a draft. If id given and exists, updates; otherwise creates new. Returns id. */
export function upsertDraft(state: QuoteDraft, id?: string, name?: string): string {
  const list = read();
  const now = new Date().toISOString();
  if (id) {
    const idx = list.findIndex((d) => d.id === id);
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        draft_name: name || list[idx].draft_name || deriveName(state),
        updated_at: now,
        last_step: state.step,
        wizard_state: state,
      };
      writeAll(list);
      return id;
    }
  }
  const newId = id || uid();
  list.unshift({
    id: newId,
    draft_name: name || deriveName(state),
    created_at: now,
    updated_at: now,
    last_step: state.step,
    wizard_state: state,
  });
  writeAll(list);
  return newId;
}

export function getDraft(id: string): DraftRecord | null {
  return read().find((d) => d.id === id) ?? null;
}
export function deleteDraft(id: string): void {
  writeAll(read().filter((d) => d.id !== id));
}
export function renameDraft(id: string, name: string): void {
  const list = read().map((d) => (d.id === id ? { ...d, draft_name: name } : d));
  writeAll(list);
}
export function loadDrafts(): DraftRecord[] {
  return read();
}

/** Wipe all stored drafts. Useful when the user hits a storage error. */
export function clearAllDrafts(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* swallow */
  }
  emit();
}

export function useDrafts(): DraftRecord[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot,
    () => [],
  );
}
export function useDraftCount(): number {
  return useDrafts().length;
}

/** One-time migration: promote legacy single-slot draft into the new array. */
export function migrateLegacyDraft(): string | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as QuoteDraft;
    const list = read();
    if (list.some((d) => d.wizard_state.updated_at === state.updated_at)) {
      localStorage.removeItem(LEGACY_KEY);
      return null;
    }
    const id = upsertDraft(state, undefined, deriveName(state));
    localStorage.removeItem(LEGACY_KEY);
    return id;
  } catch {
    return null;
  }
}