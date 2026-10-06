// Tracks the "currently active" quotation wizard session, so that other
// pages can show a "Continue Quotation" banner when the user navigates
// away without explicitly closing the wizard. Persists to sessionStorage
// so a hard reload while inside the wizard restores state.
import { useSyncExternalStore } from "react";

const KEY = "mp_active_wizard";

export interface ActiveWizard {
  draftId: string | null;
  programName: string;
  step: number;
  savedAt: string; // ISO
}

const isBrowser = () => typeof window !== "undefined";
const listeners = new Set<() => void>();
let cache: ActiveWizard | null = null;
let inited = false;

function read(): ActiveWizard | null {
  if (!isBrowser()) return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActiveWizard) : null;
  } catch { return null; }
}

function refresh() { cache = read(); inited = true; }
function emit() { refresh(); listeners.forEach((l) => l()); }
function snap(): ActiveWizard | null { if (!inited) refresh(); return cache; }

export function setActiveWizard(a: ActiveWizard | null) {
  if (!isBrowser()) return;
  if (a) sessionStorage.setItem(KEY, JSON.stringify(a));
  else sessionStorage.removeItem(KEY);
  emit();
}

export function getActiveWizard(): ActiveWizard | null { return read(); }

export function useActiveWizard(): ActiveWizard | null {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    snap,
    () => null,
  );
}
