import assert from "node:assert/strict";
import { createServer } from "vite";

const DB_NAME = "mp-tourism-itinerary-master";

function makeDatabase(version, stores = {}) {
  return {
    version,
    stores: new Map(Object.entries(stores)),
  };
}

function makeIndexedDB(initialDatabases = new Map()) {
  const databases = new Map(initialDatabases);
  const connect = (database) => ({
    get version() { return database.version; },
    objectStoreNames: { contains: (name) => database.stores.has(name) },
    createObjectStore(name) {
      if (database.stores.has(name)) throw new DOMException(`Object store already exists: ${name}`, "ConstraintError");
      database.stores.set(name, new Map());
      return {};
    },
    transaction(name) {
      const records = database.stores.get(name);
      if (!records) throw new DOMException(`Object store not found: ${name}`, "NotFoundError");
      return {
        objectStore(storeName) {
          const store = database.stores.get(storeName);
          if (!store) throw new DOMException(`Object store not found: ${storeName}`, "NotFoundError");
          return {
            getAll: () => requestResult([...store.values()]),
            get: (key) => requestResult(store.get(key)),
            put(value, key) {
              const id = key ?? value.id;
              store.set(id, value);
              return requestResult(id);
            },
            add(value, key) {
              const id = key ?? value.id;
              if (store.has(id)) throw new DOMException(`Record already exists: ${id}`, "ConstraintError");
              store.set(id, value);
              return requestResult(id);
            },
            delete(key) {
              store.delete(key);
              return requestResult(undefined);
            },
          };
        },
      };
    },
    close() {},
  });

  return {
    open(name, requestedVersion) {
      const request = {};
      queueMicrotask(() => {
        let database = databases.get(name);
        let oldVersion = 0;
        if (!database) {
          database = makeDatabase(requestedVersion || 1);
          databases.set(name, database);
        } else if (requestedVersion && requestedVersion > database.version) {
          oldVersion = database.version;
          database.version = requestedVersion;
        }
        request.result = connect(database);
        if (database.version > oldVersion) {
          request.onupgradeneeded?.({ oldVersion, newVersion: database.version, target: request });
        }
        request.onsuccess?.({ target: request });
      });
      return request;
    },
    database: (name) => databases.get(name),
  };
}

function requestResult(result) {
  const request = {};
  queueMicrotask(() => {
    request.result = result;
    request.onsuccess?.({ target: request });
  });
  return request;
}

const localValues = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (key) => localValues.get(key) ?? null,
  setItem: (key, value) => localValues.set(key, String(value)),
  removeItem: (key) => localValues.delete(key),
  clear: () => localValues.clear(),
};

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const itineraryStore = await vite.ssrLoadModule("/src/lib/itineraries-store.ts");
  const savedRoutingReader = await vite.ssrLoadModule("/src/lib/saved-itinerary-routings.ts");
  const { emptyDraft } = await vite.ssrLoadModule("/src/lib/wizard/types.ts");
  const routingSave = await vite.ssrLoadModule("/src/lib/wizard/customized-routing-save.ts");

  // Fresh installation: the routing reader is allowed to be the first opener,
  // but it must initialize both stores at schema version 2.
  const freshIndexedDB = makeIndexedDB();
  globalThis.indexedDB = freshIndexedDB;
  assert.deepEqual(await savedRoutingReader.listSavedItineraryRoutingProgrammes(), []);
  const freshDatabase = freshIndexedDB.database(DB_NAME);
  assert.equal(freshDatabase.version, 2);
  assert.deepEqual([...freshDatabase.stores.keys()].sort(), ["banners", "itineraries"]);
  assert.deepEqual(await itineraryStore.listItineraries(), [], "Itinerary Master listing works on a fresh install.");

  // An old reader may already have created version 1 without any stores.
  // The shared reader must upgrade that database before opening a transaction.
  const emptyV1 = makeIndexedDB(new Map([[DB_NAME, makeDatabase(1)]]));
  globalThis.indexedDB = emptyV1;
  assert.deepEqual(await savedRoutingReader.listSavedItineraryRoutingProgrammes(), []);
  const upgradedEmpty = emptyV1.database(DB_NAME);
  assert.equal(upgradedEmpty.version, 2);
  assert.deepEqual([...upgradedEmpty.stores.keys()].sort(), ["banners", "itineraries"]);

  const cities = [
    { id: "city-agra", name: "Agra" },
    { id: "city-mathura", name: "Mathura" },
  ];
  const routeDay = (day, from, to, overnight) => ({
    day,
    date: "",
    city_id: overnight ? cities.find((city) => city.name === overnight).id : "",
    to_city_id: cities.find((city) => city.name === to).id,
    to_city_ids: [cities.find((city) => city.name === to).id],
    from_city: from,
    to_city: to,
    program: `Day ${day}`,
    program_mode: "text",
    overnight: Boolean(overnight),
    travel_by: "Road",
  });
  const quoteDraft = {
    ...emptyDraft(),
    query_type: "B2B",
    program_mode: "new",
    save_program_as_new: true,
    program_name: "Version Two Migration Routing",
    new_program_name: "Version Two Migration Routing",
    program_code: "DBV2-001",
    new_program_code: "DBV2-001",
    nights: 1,
    departure_city: "Agra",
    tour_start_city: "Agra",
    tour_end_city: "Agra",
    routing: [
      routeDay(1, "Agra", "Mathura", "Mathura"),
      routeDay(2, "Mathura", "Agra", ""),
    ],
  };
  const savedQuotationRouting = await routingSave.saveCustomizedRoutingToItineraryMaster(
    quoteDraft,
    cities,
    "IndexedDB migration test",
    "QUOTE-DBV2-001",
  );
  assert.equal(savedQuotationRouting.itinerary.sourceQuotationId, "QUOTE-DBV2-001");
  assert.equal(upgradedEmpty.stores.get("itineraries").get(savedQuotationRouting.itinerary.id).routingSnapshot.programmeId, "DBV2-001");
  assert.equal((await itineraryStore.listItineraries()).length, 1, "Quotation Builder routing save is visible in Itinerary Master after upgrading an empty v1 database.");
  assert.equal((await savedRoutingReader.listSavedItineraryRoutingProgrammes()).some((item) => item.id === "DBV2-001"), true);

  // A populated v1 database is upgraded in place. Store objects, historical
  // itinerary records and banner blobs must all survive unchanged.
  const existingRecord = savedQuotationRouting.itinerary;
  const historicalRecord = { id: "historical-itinerary", title: "Preserved historical itinerary", updatedAt: "2020-01-01T00:00:00.000Z" };
  const banner = new Blob(["historical-banner-bytes"], { type: "image/webp" });
  const itineraryRecords = new Map([[existingRecord.id, existingRecord], [historicalRecord.id, historicalRecord]]);
  const bannerRecords = new Map([["historical-banner", banner]]);
  const populatedV1 = makeIndexedDB(new Map([[DB_NAME, makeDatabase(1, {
    itineraries: itineraryRecords,
    banners: bannerRecords,
  })]]));
  globalThis.indexedDB = populatedV1;
  const beforeUpgrade = populatedV1.database(DB_NAME);
  assert.equal((await savedRoutingReader.listSavedItineraryRoutingProgrammes()).some((item) => item.id === "DBV2-001"), true);
  const afterUpgrade = populatedV1.database(DB_NAME);
  assert.equal(afterUpgrade.version, 2);
  assert.strictEqual(afterUpgrade.stores.get("itineraries"), itineraryRecords, "The populated itinerary object store is not recreated.");
  assert.strictEqual(afterUpgrade.stores.get("banners"), bannerRecords, "The populated banner object store is not recreated.");
  assert.deepEqual((await itineraryStore.listItineraries()).map((item) => item.id).sort(), [existingRecord.id, historicalRecord.id].sort());
  assert.equal(await (await itineraryStore.getItineraryBanner("historical-banner")).text(), "historical-banner-bytes");

  // A partially initialized v1 database also gains only the missing store.
  const partialRecords = new Map([[historicalRecord.id, historicalRecord]]);
  const partialV1 = makeIndexedDB(new Map([[DB_NAME, makeDatabase(1, { itineraries: partialRecords })]]));
  globalThis.indexedDB = partialV1;
  await savedRoutingReader.listSavedItineraryRoutingProgrammes();
  const partialDatabase = partialV1.database(DB_NAME);
  assert.equal(partialDatabase.version, 2);
  assert.strictEqual(partialDatabase.stores.get("itineraries"), partialRecords);
  assert.ok(partialDatabase.stores.has("banners"), "The missing banner store is created without replacing existing itineraries.");
  assert.deepEqual(await itineraryStore.listItineraries(), [historicalRecord]);

  console.log("Itinerary IndexedDB migration tests passed: fresh install, empty v1 upgrade, populated record/banner preservation, partial schema repair, Quotation Builder routing save and Itinerary Master listing.");
} finally {
  await vite.close();
}
