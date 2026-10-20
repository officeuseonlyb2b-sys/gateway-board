// Multiple named drafts persisted to localStorage.
import { useSyncExternalStore } from "react";
import type { QuoteDraft } from "./wizard/types";
import { normalizeDraft } from "./wizard/store";
import { getQuotationScope } from "./query-for";

const KEY = "mp_tourism_drafts";
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
    return Math.max(record.last_step, state.step);

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

function read(): DraftRecord[] {
  if (!isBrowser()) {
    return [];
  }
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

function writeAll(list: DraftRecord[]) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(list));
  emit();
}

function uid() {
  return "d_" + Math.random().toString(36).slice(2, 10);
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
      list[idx] = {
        ...list[idx],
        draft_name: name || list[idx].draft_name || deriveName(state),
        updated_at: now,
        last_step: completedStepForScope(list[idx], state),
        wizard_state: normalizeDraft(state),
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
  const record = read().find((d) => d.id === id);
  return record ? { ...record, wizard_state: normalizeDraft(record.wizard_state) } : null;
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
