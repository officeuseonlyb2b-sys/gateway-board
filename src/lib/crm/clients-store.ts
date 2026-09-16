import { useSyncExternalStore } from "react";

export interface Client {
  id: string;
  client_code?: string;
  name: string;
  mobile: string;
  email: string;
  city?: string;
  state?: string;
  address?: string;
  pincode?: string;
  whatsapp?: string;
  gender?: string;
  source?: string;
  relationship_owner?: string;
  notes?: string;
  active: boolean;
  created_at: string;
}

const KEY = "mp_crm_clients_v1";
const listeners = new Set<() => void>();
let cache: Client[] = [];
let initialized = false;
const isBrowser = () => typeof window !== "undefined";

function read() {
  if (!isBrowser()) return [];
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? (value as Client[]) : [];
  } catch {
    return [];
  }
}
function load() {
  cache = read();
  initialized = true;
}
function save() {
  if (isBrowser()) localStorage.setItem(KEY, JSON.stringify(cache));
  listeners.forEach((listener) => listener());
}

export function addClient(input: Omit<Client, "id" | "created_at">) {
  if (!initialized) load();
  const duplicate = cache.find(
    (client) =>
      (input.email && client.email.toLowerCase() === input.email.toLowerCase()) ||
      (input.mobile && client.mobile.replace(/\D/g, "") === input.mobile.replace(/\D/g, "")),
  );
  if (duplicate) throw new Error(`Possible duplicate: ${duplicate.name}`);
  const client: Client = {
    ...input,
    id: `client_${Date.now()}`,
    client_code: `CLI-${String(cache.length + 1).padStart(6, "0")}`,
    created_at: new Date().toISOString(),
  };
  cache = [client, ...cache];
  save();
  return client;
}
export function useClients() {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => {
      if (!initialized) load();
      return cache;
    },
    () => [],
  );
}
