export interface LargeRecord {
  id: string;
}

export interface LargeRecordStore<T extends LargeRecord> {
  get(id: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  add(record: T): Promise<void>;
  put(record: T): Promise<void>;
}

const DB_NAME = "mp-tourism-brochure-local-storage";
const DB_VERSION = 1;
const QUOTE_STORE = "brochure-quotes";
const LIBRARY_STORE = "brochure-library";

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("IndexedDB is unavailable. Existing quote and draft data was not changed."),
    );
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(QUOTE_STORE)) {
        database.createObjectStore(QUOTE_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(LIBRARY_STORE)) {
        database.createObjectStore(LIBRARY_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error("Could not open browser-local Brochure storage."));
    request.onblocked = () => reject(new Error("Browser-local Brochure storage is blocked by another tab. Close older Hub tabs and retry."));
  });
}

function requestInTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    let result: T;
    let settled = false;
    const transaction = database.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      database.close();
      reject(request.error || new Error("Browser-local Brochure storage request failed."));
    };
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(result!);
    };
    transaction.onabort = () => {
      if (settled) return;
      settled = true;
      database.close();
      reject(transaction.error || new Error("Browser-local Brochure storage transaction was aborted."));
    };
    transaction.onerror = () => {
      if (settled) return;
      settled = true;
      database.close();
      reject(transaction.error || new Error("Browser-local Brochure storage transaction failed."));
    };
  })).catch((error: unknown) => {
    throw storageError(error);
  });
}

function storageError(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `Could not persist the complete Brochure snapshot in browser-local IndexedDB. No existing data was cleared or replaced. Keep this draft open, export a backup, and retry after checking browser storage availability. ${detail}`,
  );
}

export function indexedRecordStore<T extends LargeRecord>(storeName: "brochure-quotes" | "brochure-library"): LargeRecordStore<T> {
  return {
    get: (id) => requestInTransaction<T | undefined>(storeName, "readonly", (store) => store.get(id)),
    getAll: () => requestInTransaction<T[]>(storeName, "readonly", (store) => store.getAll()),
    add: async (record) => { await requestInTransaction<IDBValidKey>(storeName, "readwrite", (store) => store.add(record)); },
    put: async (record) => { await requestInTransaction<IDBValidKey>(storeName, "readwrite", (store) => store.put(record)); },
  };
}

/** An in-memory driver for deterministic storage/quota regression tests. */
export function memoryRecordStore<T extends LargeRecord>(): LargeRecordStore<T> {
  const records = new Map<string, T>();
  const clone = (record: T): T => structuredClone(record);
  return {
    async get(id) {
      const record = records.get(id);
      return record ? clone(record) : undefined;
    },
    async getAll() {
      return [...records.values()].map(clone);
    },
    async add(record) {
      if (records.has(record.id)) throw new Error(`Record already exists: ${record.id}`);
      records.set(record.id, clone(record));
    },
    async put(record) {
      records.set(record.id, clone(record));
    },
  };
}

const testStoreOverrides = new Map<string, LargeRecordStore<LargeRecord>>();

/** Inject an isolated in-memory driver in tests; production always uses IndexedDB. */
export function configureLargeRecordStoreForTesting(
  storeName: "brochure-quotes" | "brochure-library",
  store: LargeRecordStore<LargeRecord> | undefined,
): void {
  if (store) testStoreOverrides.set(storeName, store);
  else testStoreOverrides.delete(storeName);
}

export function largeRecordStore<T extends LargeRecord>(
  storeName: "brochure-quotes" | "brochure-library",
): LargeRecordStore<T> {
  const indexed = indexedRecordStore<T>(storeName);
  const active = () => (testStoreOverrides.get(storeName) as LargeRecordStore<T> | undefined) ?? indexed;
  return {
    get: (id) => active().get(id),
    getAll: () => active().getAll(),
    add: (record) => active().add(record),
    put: (record) => active().put(record),
  };
}

/** Write a complete immutable record and verify the full persisted payload by readback. */
export async function addAndVerifyLargeRecord<T extends LargeRecord>(
  record: T,
  store: LargeRecordStore<T>,
): Promise<T> {
  const serialized = JSON.stringify(record);
  try {
    const existing = await store.get(record.id);
    if (existing) {
      if (JSON.stringify(existing) !== serialized) {
        throw new Error("An immutable snapshot with this ID already exists with different content.");
      }
      return existing;
    }
    await store.add(record);
    const readback = await store.get(record.id);
    if (!readback || JSON.stringify(readback) !== serialized) {
      throw new Error("The saved snapshot did not match its complete readback payload.");
    }
    return readback;
  } catch (error) {
    throw storageError(error);
  }
}

/** Write a mutable library projection and verify its complete readback. */
export async function putAndVerifyLargeRecord<T extends LargeRecord>(
  record: T,
  store: LargeRecordStore<T>,
): Promise<T> {
  const serialized = JSON.stringify(record);
  try {
    await store.put(record);
    const readback = await store.get(record.id);
    if (!readback || JSON.stringify(readback) !== serialized) {
      throw new Error("The library record did not match its complete readback payload.");
    }
    return readback;
  } catch (error) {
    throw storageError(error);
  }
}

