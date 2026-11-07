// Multiple named drafts persisted to localStorage.
import { useSyncExternalStore } from "react";
import type { QuoteDraft } from "./wizard/types";
import { normalizeDraft } from "./wizard/store";
import { getQuotationScope } from "./query-for";

const KEY = "mp_tourism_drafts";
const SESSION_KEY = "mp_tourism_drafts_session";
const LEGACY_KEY = "mp_tourism_draft_quote";

export interface DraftRecord {
  id: string;
  draft_name: string;
  created_at: string;
  updated_at: string;
  last_step: number;
  wizard_state: QuoteDraft;
}

/** Resolve persisted reach history into the active Query For flow. */
export function completedStepForScope(record: DraftRecord | null, state: QuoteDraft): number {
  if (!record) return state.step;
  const previousScope = getQuotationScope(
    record.wizard_state.query_for,
    record.wizard_state.commercial_mode,
  );
  const currentScope = getQuotationScope(state.query_for, state.commercial_mode);
  if (previousScope.queryFor === currentScope.queryFor)
    return Math.min(
      Math.max(record.last_step, state.step),
      currentScope.workflowSteps[currentScope.workflowSteps.length - 1] ?? state.step,
    );

  let commonPrefixLength = 0;
  while (
    commonPrefixLength < previousScope.workflowSteps.length &&
    commonPrefixLength < currentScope.workflowSteps.length &&
    previousScope.workflowSteps[commonPrefixLength] ===
      currentScope.workflowSteps[commonPrefixLength]
  ) {
    commonPrefixLength++;
  }
  const lastPreviouslyReachedIndex = previousScope.workflowSteps.reduce(
    (lastReached, step, index) => (step <= record.last_step ? index : lastReached),
    -1,
  );
  const lastCommonReachedIndex = Math.min(commonPrefixLength - 1, lastPreviouslyReachedIndex);
  return lastCommonReachedIndex >= 0 ? currentScope.workflowSteps[lastCommonReachedIndex] : 0;
}

const isBrowser = () => typeof window !== "undefined";
const listeners = new Set<() => void>();
let cache: DraftRecord[] = [];
let inited = false;
let lastStorageNotice: string | null = null;

export function getDraftStorageNotice(): string | null {
  return lastStorageNotice;
}

function isQuotaError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

function read(): DraftRecord[] {
  if (!isBrowser()) {
    return [];
  }
  if (inited) return cache;
  try {
    // A session copy is newer only when localStorage could not accept the last
    // write. Prefer it so a refresh does not silently roll back that draft.
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(KEY) || "[]";
    const list = JSON.parse(raw) as DraftRecord[];
    cache = Array.isArray(list) ? list : [];
    inited = true;
    return cache;
  } catch {
    return [];
  }
}
function refresh() {
  cache = read();
  inited = true;
}
function getSnapshot(): DraftRecord[] {
  if (!inited) refresh();
  return cache;
}

function writeAll(list: DraftRecord[]) {
  if (!isBrowser()) return;
  const serialized = JSON.stringify(list);
  try {
    localStorage.setItem(KEY, serialized);
    sessionStorage.removeItem(SESSION_KEY);
    lastStorageNotice = null;
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    try {
      // Do not delete or overwrite old local drafts to make room. This keeps
      // the current edit recoverable for the rest of the browser session.
      sessionStorage.setItem(SESSION_KEY, serialized);
      lastStorageNotice =
        "Browser local storage is full. This draft is saved for this browser session only; export it or free storage before closing the browser.";
    } catch (sessionError) {
      if (isQuotaError(sessionError)) {
        throw new Error(
          "Draft storage is full. Your existing drafts were not changed and this save could not be stored. Export or remove unneeded browser data, then try again.",
        );
      }
      throw sessionError;
    }
  }
  cache = list;
  inited = true;
  listeners.forEach((listener) => listener());
}

function uid() {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 14);
  return "d_" + random;
}

function cloneDraft(state: QuoteDraft): QuoteDraft {
  return normalizeDraft(JSON.parse(JSON.stringify(state)) as QuoteDraft);
}

function deriveName(state: QuoteDraft): string {
  if (state.program_name) return state.program_name;
  if (state.guest.name) return `Draft for ${state.guest.name}`;
  if (state.agent.name) return `Draft for ${state.agent.name}`;
  return `Untitled draft — ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`;
}

/** Upsert a draft. If id given and exists, updates; otherwise creates new. Returns id. */
export function upsertDraft(state: QuoteDraft, id?: string, name?: string): string {
  const list = read();
  const now = new Date().toISOString();
  if (id) {
    const idx = list.findIndex((d) => d.id === id);
    if (idx >= 0) {
      const next = [...list];
      next[idx] = {
        ...list[idx],
        draft_name: name || list[idx].draft_name || deriveName(state),
        updated_at: now,
        last_step: completedStepForScope(list[idx], state),
        wizard_state: cloneDraft(state),
      };
      writeAll(next);
      return id;
    }
  }
  const newId = id || uid();
  const next = [
    {
      id: newId,
      draft_name: name || deriveName(state),
      created_at: now,
      updated_at: now,
      last_step: state.step,
      wizard_state: cloneDraft(state),
    },
    ...list,
  ];
  writeAll(next);
  return newId;
}

export function getDraft(id: string): DraftRecord | null {
  const record = read().find((d) => d.id === id);
  return record ? { ...record, wizard_state: cloneDraft(record.wizard_state) } : null;
}

/** Create a fully independent editable draft. Finalized-version lineage is not duplicated. */
export function duplicateDraft(source: DraftRecord, name?: string): DraftRecord {
  const copiedState = cloneDraft(source.wizard_state);
  // Preserve completed workflow progress even when the source was last open
  // on an earlier editable step.
  copiedState.step = Math.max(copiedState.step, source.last_step);
  copiedState.revision_of_quote_id = undefined;
  copiedState.revision_of_quote_number = undefined;
  copiedState.revision_reason = undefined;
  copiedState.intended_version = undefined;
  copiedState.updated_at = new Date().toISOString();
  const copyName = name?.trim() || `${source.draft_name} — Copy`;
  const id = upsertDraft(copiedState, undefined, copyName);
  const created = getDraft(id);
  if (!created) throw new Error("The duplicate draft could not be read back after saving.");
  return created;
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
    const state = normalizeDraft(JSON.parse(raw) as QuoteDraft);
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
