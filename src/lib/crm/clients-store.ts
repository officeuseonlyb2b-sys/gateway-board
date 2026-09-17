import { useSyncExternalStore } from "react";
import {
  IMPORTED_B2C_CLIENTS,
  RELATIONSHIP_MASTER_DATASET_ID,
} from "./relationship-master-import.generated";

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
const DATASET_KEY = "mp_crm_clients_dataset_revision";
const listeners = new Set<() => void>();
let cache: Client[] = [];
let initialized = false;
const isBrowser = () => typeof window !== "undefined";

function read() {
  if (!isBrowser()) return clone(IMPORTED_B2C_CLIENTS);
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    const existing = Array.isArray(value) ? (value as Client[]) : [];
    if (localStorage.getItem(DATASET_KEY) === RELATIONSHIP_MASTER_DATASET_ID) return existing;
    const merged = mergeImportedClients(existing);
    localStorage.setItem(KEY, JSON.stringify(merged));
    localStorage.setItem(DATASET_KEY, RELATIONSHIP_MASTER_DATASET_ID);
    return merged;
  } catch {
    const imported = clone(IMPORTED_B2C_CLIENTS);
    localStorage.setItem(KEY, JSON.stringify(imported));
    localStorage.setItem(DATASET_KEY, RELATIONSHIP_MASTER_DATASET_ID);
    return imported;
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

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const textKey = (value?: string) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");
const emailKey = (value?: string) => {
  const email = textKey(value);
  return ["", "-", "na", "n/a", "unknown"].includes(email) ? "" : email;
};
const phoneKey = (value?: string) => {
  const phone = (value || "").replace(/\D/g, "");
  return phone.length >= 7 ? phone : "";
};

function clientsMatch(
  client: Client,
  input: { name?: string; mobile?: string; email?: string; city?: string },
) {
  if (emailKey(input.email) && emailKey(client.email) === emailKey(input.email)) return true;
  if (phoneKey(input.mobile) && phoneKey(client.mobile) === phoneKey(input.mobile)) return true;
  return Boolean(
    input.name &&
    textKey(client.name) === textKey(input.name) &&
    textKey(client.city) === textKey(input.city),
  );
}

function mergeImportedClients(existing: Client[]): Client[] {
  const merged = [...existing];
  for (const imported of IMPORTED_B2C_CLIENTS) {
    const index = merged.findIndex((client) => clientsMatch(client, imported));
    if (index < 0) {
      merged.push({ ...imported });
      continue;
    }
    const current = merged[index];
    merged[index] = {
      ...imported,
      ...current,
      name: current.name || imported.name,
      mobile: current.mobile || imported.mobile,
      email: current.email || imported.email,
      city: current.city || imported.city,
      relationship_owner: current.relationship_owner || imported.relationship_owner,
      notes: current.notes || imported.notes,
    };
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

export function findClientByIdentity(input: {
  id?: string;
  name?: string;
  mobile?: string;
  email?: string;
  city?: string;
}) {
  if (!initialized) load();
  return cache.find(
    (client) => (input.id && client.id === input.id) || clientsMatch(client, input),
  );
}

export function addClient(input: Omit<Client, "id" | "created_at">) {
  if (!initialized) load();
  const duplicate = cache.find(
    (client) =>
      (emailKey(input.email) && emailKey(client.email) === emailKey(input.email)) ||
      (phoneKey(input.mobile) && phoneKey(client.mobile) === phoneKey(input.mobile)),
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

export function upsertClientFromQuery(input: Omit<Client, "id" | "created_at">) {
  if (!initialized) load();
  const existing = cache.find((client) => clientsMatch(client, input));
  if (!existing) return addClient(input);
  const updated: Client = {
    ...existing,
    name: existing.name || input.name,
    mobile: existing.mobile || input.mobile,
    email: existing.email || input.email,
    city: existing.city || input.city,
    source: existing.source || input.source,
    relationship_owner: existing.relationship_owner || input.relationship_owner,
    notes: existing.notes || input.notes,
    active: true,
  };
  cache = cache.map((client) => (client.id === existing.id ? updated : client));
  save();
  return updated;
}
export function useClients() {
  return useSyncExternalStore(
    (callback) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key !== KEY) return;
        load();
        callback();
      };
      listeners.add(callback);
      if (isBrowser()) window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(callback);
        if (isBrowser()) window.removeEventListener("storage", onStorage);
      };
    },
    () => {
      if (!initialized) load();
      return cache;
    },
    () => [],
  );
}
