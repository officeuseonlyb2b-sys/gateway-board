// Simple per-user CRM role (Sales Executive / Sales Manager), persisted locally.
import { useSyncExternalStore } from "react";

export type CrmRole = "Sales Executive" | "Sales Manager";
const KEY = "mp_crm_role";
const listeners = new Set<() => void>();
let cache: CrmRole = "Sales Executive";
let inited = false;

function load() {
  inited = true;
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(KEY);
  cache = raw === "Sales Manager" ? "Sales Manager" : "Sales Executive";
}

export function getCrmRole(): CrmRole {
  if (!inited) load();
  return cache;
}

export function setCrmRole(role: CrmRole) {
  cache = role;
  if (typeof window !== "undefined") localStorage.setItem(KEY, role);
  listeners.forEach((l) => l());
}

export function useCrmRole(): CrmRole {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => { if (!inited) load(); return cache; },
    () => "Sales Executive" as CrmRole,
  );
}

export function useIsManager(): boolean {
  return useCrmRole() === "Sales Manager";
}
