import assert from "node:assert/strict";
import { createServer } from "vite";

const local = new Map();
let rejectQuoteArrayWrites = true;
let localSetCalls = 0;
let localRemoveCalls = 0;
let localClearCalls = 0;
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (key) => local.get(key) ?? null,
  setItem: (key, value) => {
    localSetCalls += 1;
    if (rejectQuoteArrayWrites && key === "mp_tourism_quotes") {
      throw new DOMException("Simulated near-quota localStorage write", "QuotaExceededError");
    }
    local.set(key, String(value));
  },
  removeItem: (key) => { localRemoveCalls += 1; local.delete(key); },
  clear: () => { localClearCalls += 1; local.clear(); },
};

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const largeStore = await vite.ssrLoadModule("/src/lib/large-record-store.ts");
  largeStore.configureLargeRecordStoreForTesting("brochure-quotes", largeStore.memoryRecordStore());
  largeStore.configureLargeRecordStoreForTesting("brochure-library", largeStore.memoryRecordStore());
  const quotes = await vite.ssrLoadModule("/src/lib/quotes-store.ts");
  const brochures = await vite.ssrLoadModule("/src/lib/brochures-store.ts");

  const matrix = ["2026-11-02", "2027-07-01"].flatMap((from, bandIndex) =>
    Array.from({ length: 40 }, (_, index) => ({
      option_key: "A",
      option_label: "3 Star",
      vehicle: "Accommodation only",
      brochure_validity_from: from,
      brochure_validity_till: bandIndex ? "2027-11-02" : "2027-06-30",
      pax: index + 1,
      single: 6400 + bandIndex,
      double: 3400 + bandIndex,
      triple: 2966.67 + bandIndex,
      quad: 2600 + bandIndex,
    })),
  );
  const fullSnapshot = {
    id: "large-brochure-snapshot-test",
    version: 1,
    quote_number: "BR-large-test",
    display_number: "BR-large-test-V1",
    status: "Saved",
    costing_complete: true,
    saved_at: "2026-11-03T00:00:00.000Z",
    saved_by: "Storage regression",
    tour_title: "Large date-band Brochure",
    cities: ["Ujjain", "Maheshwar"],
    total_nights: 3,
    travel_start: "",
    travel_end: "",
    itinerary: [],
    addons: {},
    inclusions: {},
    markup_percent: 10,
    totals: {},
    include_sgl: true,
    include_dbl: true,
    include_trp: true,
    scenarios: Array.from({ length: 40 }, (_, index) => ({
      label: `Pax ${index + 1}`,
      hotel_category: "3 Star",
      vehicle: "Accommodation only",
      pax: index + 1,
      per_person_avg: 4000,
      grand_total: (index + 1) * 4000,
      persons: [{ label: "Adult", room_label: "Double", hotel: 4000, transport: 0, guide: 0, activities: 0, entrances: 0, misc: 0, meals: 0, markup: 400, gst5: 220, total: 4620 }],
    })),
    rate_sheet_rows: matrix,
    brochure_source: {
      programme_id: "canonical-programme-test",
      programme_code: "PAX40",
      programme_name: "Large date-band Brochure",
      validity_from: "2026-11-02",
      validity_till: "2027-11-02",
      pax_min: 1,
      pax_max: 40,
    },
    draft_snapshot: {
      query_type: "Brochure",
      program_id: "canonical-programme-test",
      program_name: "Large date-band Brochure",
      has_dates: false,
      start_date: "",
      nights: 3,
      pax_min: 1,
      pax_max: 40,
      routing: Array.from({ length: 4 }, (_, index) => ({ day: index + 1, date: "", city_id: `city-${index + 1}`, to_city: `City ${index + 1}`, overnight: index < 3 })),
      hotel_options: [{ key: "A", label: "3 Star", category: "3 Star", selections: [] }],
    },
  };

  const saved = await quotes.saveBrochureQuote(fullSnapshot);
  assert.equal(saved.snapshot_storage, "browser-indexeddb");
  assert.equal(saved.content_hash, quotes.quoteContentHash(saved));
  assert.equal(localSetCalls, 0, "Brochure snapshots never attempt the near-quota localStorage quotes array.");
  const readback = await quotes.getSavedQuoteSnapshot(saved.id);
  assert.equal(readback.rate_sheet_rows.length, 80, "All 1-40 Pax rows for both date bands survive readback.");
  assert.equal(readback.scenarios.length, 40, "Per-Pax scenarios are not truncated.");
  assert.deepEqual(readback.rate_sheet_rows, matrix);
  assert.ok((await quotes.listSavedQuotes()).some((item) => item.id === saved.id), "The saved snapshot is discoverable from the quote list.");

  const libraryDraft = await brochures.createBrochureFromQuote(readback, "Storage regression");
  assert.equal(libraryDraft.source_quote_id, saved.id);
  assert.equal(libraryDraft.scenarios.length, 320, "The library draft preserves all Pax/date-band/occupancy rows.");
  assert.ok(brochures.listBrochures().some((item) => item.id === libraryDraft.id), "The library draft is readable after its IndexedDB write.");
  assert.equal(localSetCalls, 0, "Snapshot and library writes do not consume localStorage quota.");

  rejectQuoteArrayWrites = false;
  const b2b = { ...fullSnapshot, id: "b2b-local-regression", quote_number: "B2B-1", brochure_source: undefined, draft_snapshot: { query_type: "B2B" }, query_id: "query-b2b" };
  const b2c = { ...fullSnapshot, id: "b2c-local-regression", quote_number: "B2C-1", brochure_source: undefined, draft_snapshot: { query_type: "B2C" }, query_id: "query-b2c" };
  quotes.saveQuote(b2b);
  quotes.saveQuote(b2c);
  assert.ok(quotes.loadQuotes().some((item) => item.id === b2b.id));
  assert.ok(quotes.loadQuotes().some((item) => item.id === b2c.id));
  assert.equal(localRemoveCalls, 0, "No existing local records were removed.");
  assert.equal(localClearCalls, 0, "Storage was never cleared or reset.");
  assert.equal(readback.query_id, undefined, "Brochure snapshots have no CRM Query linkage.");
  console.log("Brochure snapshot storage tests passed: simulated localStorage quota, IndexedDB write/readback, complete 1–40 Pax/date-band payload, library discovery, and B2B/B2C local-save isolation.");
} finally {
  await vite.close();
}
