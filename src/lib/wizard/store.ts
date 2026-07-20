// Draft store — persists the wizard state in localStorage.
import { useSyncExternalStore } from "react";
import { emptyDraft, type QuoteDraft } from "./types";

const KEY = "mp_tourism_draft_quote";
const listeners = new Set<() => void>();
let cache: QuoteDraft | null = null;
let cacheInit = false;

const isBrowser = () => typeof window !== "undefined";

function read(): QuoteDraft | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QuoteDraft) : null;
  } catch {
    return null;
  }
}

function refresh() {
  cache = read();
  cacheInit = true;
}

function emit() {
  refresh();
  listeners.forEach((l) => l());
}

function getSnapshot(): QuoteDraft | null {
  if (!cacheInit) refresh();
  return cache;
}

export function loadDraft(): QuoteDraft | null {
  return read();
}

export function writeDraft(d: QuoteDraft) {
  if (!isBrowser()) return;
  const next = { ...d, updated_at: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(next));
  emit();
}

export function clearDraft() {
  if (!isBrowser()) return;
  localStorage.removeItem(KEY);
  emit();
}

export function initDraft(): QuoteDraft {
  const d = emptyDraft();
  console.log("[store] initDraft called, writing step 1");
  writeDraft(d);
  return d;
}

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
