// Simple per-user CRM role (Sales Executive / Sales Manager), persisted locally.
import { useSyncExternalStore } from "react";
import type { AppRole } from "./types";

export type CrmRole = AppRole;
const KEY = "mp_crm_role";
const listeners = new Set<() => void>();
let cache: CrmRole = "Sales Executive";
let inited = false;

function load() {
  inited = true;
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(KEY);
  cache = [
    "Sales Executive",
    "Assistant Manager",
    "Sales Manager",
    "Sales Head",
    "Operations Executive",
    "Unit Head",
    "Administrator",
    "Owner / Director",
    "Product Executive",
    "Contracting Executive",
    "Vendor Executive",
  ].includes(raw || "")
    ? (raw as CrmRole)
    : "Sales Executive";
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
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => {
      if (!inited) load();
      return cache;
    },
    () => "Sales Executive" as CrmRole,
  );
}

export function useIsManager(): boolean {
  return [
    "Assistant Manager",
    "Sales Manager",
    "Sales Head",
    "Unit Head",
    "Administrator",
    "Owner / Director",
  ].includes(useCrmRole());
}
