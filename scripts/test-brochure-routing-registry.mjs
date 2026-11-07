import assert from "node:assert/strict";
import { createServer } from "vite";
import * as XLSX from "xlsx";

const persisted = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (key) => persisted.get(key) ?? null,
  setItem: (key, value) => persisted.set(key, String(value)),
  removeItem: (key) => persisted.delete(key),
  clear: () => persisted.clear(),
};

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const registryModule = await vite.ssrLoadModule("/src/lib/brochure-routing-registry.ts");
  const identity = await vite.ssrLoadModule("/src/lib/programme-routing-identity.ts");
  const largeRecordStore = await vite.ssrLoadModule("/src/lib/large-record-store.ts");
  largeRecordStore.configureLargeRecordStoreForTesting("brochure-library", largeRecordStore.memoryRecordStore());
  const brochureStore = await vite.ssrLoadModule("/src/lib/brochures-store.ts");
  const reconciliation = await vite.ssrLoadModule("/src/lib/programme-reference-reconciliation.ts");
  const programme = {
    id: "PROGRAMME-CANONICAL-1", code: "EXBHP03", name: "Wilderness Getaway from Bhopal",
    nights: 1, days: 2, duration_label: "1 Night / 2 Days", routing_summary: "Bhopal (1N) → Sanchi → Bhopal",
    routing: [
      { day: 1, from_city: "Bhopal", destination_city: "Sanchi", overnight_city: "Sanchi", program_text: "Day 1 sightseeing" },
      { day: 2, from_city: "Sanchi", destination_city: "Bhopal", overnight_city: null, program_text: "Day 2 departure" },
    ],
    cities: ["Bhopal", "Sanchi"], categories: [], departure_city: "Bhopal", source: "Excel Import", status: "Active",
  };
  const cities = [{ id: "city-bhopal", name: "Bhopal" }, { id: "city-sanchi", name: "Sanchi" }];
  const quoteDraft = {
    query_type: "Brochure", program_id: programme.id, program_name: programme.name,
    routing: [
      { day: 1, from_city: "Bhopal", to_city: "Sanchi", city_id: "city-sanchi", overnight: true, program: "Day 1 sightseeing" },
      { day: 2, from_city: "Sanchi", to_city: "Bhopal", city_id: "", overnight: false, program: "Day 2 departure" },
    ],
  };
  const rows = [1, 2].flatMap((pax) => [
    { option_key: "A", option_label: "3 Star", vehicle: "AC Sedan", transport_variation_id: "transport-A", brochure_validity_from: "2027-01-01", brochure_validity_till: "2027-12-31", pax, single: 1400, double: 1000, triple: 900, quad: 800 },
    { option_key: "B", option_label: "4 Star", vehicle: "Innova", transport_variation_id: "transport-B", brochure_validity_from: "2027-01-01", brochure_validity_till: "2027-12-31", pax, single: 2400, double: 2000, triple: 1900, quad: 1800 },
  ]);
  const quote = {
    id: "QUOTE-1", version: 3, quote_number: "QT-1", display_number: "QT-1-V3", status: "Saved", costing_complete: true,
    saved_at: "2026-10-01T00:00:00.000Z", saved_by: "Tester", tour_title: programme.name, cities: ["Bhopal", "Sanchi"], total_nights: 1,
    travel_start: "", travel_end: "", itinerary: [], addons: {}, inclusions: {}, markup_percent: 10, totals: {}, include_sgl: true, include_dbl: true, include_trp: true,
    rate_sheet_rows: rows,
    brochure_source: { programme_id: programme.id, programme_code: programme.code, programme_name: programme.name, validity_from: "2027-01-01", validity_till: "2027-12-31", pax_min: 1, pax_max: 2, rate_coverage_gaps: [] },
    draft_snapshot: quoteDraft,
  };
  const routeFingerprint = identity.programmeRoutingFingerprint(programme);
  assert.equal(identity.quoteRoutingFingerprint(quote, cities), routeFingerprint, "Saved snapshot and master route share the same stable identity.");
  const scenarios = brochureStore.scenariosFromQuote(quote);
  assert.ok(scenarios.some((scenario) => scenario.accommodation_option_id === "A" && scenario.hotel_category === "3 Star"));
  assert.ok(scenarios.some((scenario) => scenario.accommodation_option_id === "B" && scenario.hotel_category === "4 Star"));
  assert.notEqual(scenarios.find((scenario) => scenario.accommodation_option_id === "A" && scenario.pax === 1 && scenario.occupancy === "Twin Sharing").price_per_person,
    scenarios.find((scenario) => scenario.accommodation_option_id === "B" && scenario.pax === 1 && scenario.occupancy === "Twin Sharing").price_per_person,
    "Hotel options A and B remain independent saved-price rows.");

  const version = {
    id: "BROCHURE-V1", brochure_id: "BROCHURE", version: 1, status: "Draft", name: programme.name,
    programme_id: programme.id, programme_code: programme.code, programme_name: programme.name,
    days_nights: "2D / 1N", pax_min: 1, pax_max: 2, validity_from: "2027-01-01", validity_till: "2027-12-31",
    source_quote_id: quote.id, route_fingerprint: routeFingerprint, scenarios,
    validation_errors: [], coverage_warnings: [], created_at: quote.saved_at, created_by: "Tester", updated_at: quote.saved_at,
  };
  const firstLinkedVersion = await brochureStore.createBrochureFromQuote(quote, "Tester", undefined, cities);
  const sameRouteQuote = { ...quote, id: "QUOTE-2", version: 4, quote_number: "QT-2", display_number: "QT-2-V4" };
  const secondLinkedVersion = await brochureStore.createBrochureFromQuote(sameRouteQuote, "Tester", undefined, cities);
  assert.equal(firstLinkedVersion.version, 1);
  assert.equal(secondLinkedVersion.brochure_id, firstLinkedVersion.brochure_id, "Same canonical Programme/routing snapshots share a version lineage.");
  assert.equal(secondLinkedVersion.version, 2);
  const differentRouteQuote = { ...quote, id: "QUOTE-3", draft_snapshot: { ...quoteDraft, routing: quoteDraft.routing.map((day, index) => index ? day : { ...day, to_city: "Different City" }) } };
  const differentRouteVersion = await brochureStore.createBrochureFromQuote(differentRouteQuote, "Tester", undefined, cities);
  assert.notEqual(differentRouteVersion.brochure_id, firstLinkedVersion.brochure_id, "Different route fingerprints never share a pricing lineage.");
  const incompleteCoverageQuote = { ...quote, id: "QUOTE-GAP", brochure_source: { ...quote.brochure_source, rate_coverage_gaps: ["Missing date band"] } };
  const incompleteCoverageVersion = await brochureStore.createBrochureFromQuote(incompleteCoverageQuote, "Tester", undefined, cities);
  await assert.rejects(() => brochureStore.setBrochureStatus(incompleteCoverageVersion.id, "Published"), /saved scenario|valid dates/i, "Coverage warnings prevent publishing incomplete package rates.");
  const entries = registryModule.buildProgrammeRoutingRegistry([programme], [quote], [version], [], cities);
  assert.equal(entries.length, 1, "Every supplied canonical Programme appears exactly once in the registry.");
  assert.equal(entries[0].status, "Costing Completed");
  assert.equal(registryModule.costedProgrammeChoices([programme], [quote], [version], cities).length, 1, "Only completed, coverage-valid saved costings are selectable.");

  const partialQuote = { ...quote, id: "QUOTE-PARTIAL", costing_complete: false, status: "In Progress" };
  const costDraft = { id: "DRAFT-1", draft_name: programme.name, created_at: quote.saved_at, updated_at: quote.saved_at, last_step: 5, wizard_state: quoteDraft };
  assert.equal(registryModule.buildProgrammeRoutingRegistry([programme], [partialQuote], [version], [costDraft], cities)[0].status, "Costing Draft", "A saved partial snapshot plus editable draft is never marked completed.");
  assert.equal(registryModule.costedProgrammeChoices([programme], [partialQuote], [version], cities).length, 0);

  const mismatchedQuote = { ...quote, id: "QUOTE-OTHER-ROUTE", draft_snapshot: { ...quoteDraft, routing: quoteDraft.routing.map((day, index) => index ? day : { ...day, to_city: "Wrong destination" }) } };
  assert.equal(registryModule.costedProgrammeChoices([programme], [mismatchedQuote], [version], cities).length, 0, "A pricing snapshot for a different route cannot be reused.");
  const published = { ...version, status: "Published" };
  const match = brochureStore.lookupPublishedPackagePriceInRecords([published], {
    programme_id: programme.id, route_fingerprint: routeFingerprint, pax: 1, hotel_category: "3 Star",
    transport_variation_id: "transport-A", occupancy: "Twin Sharing", departure_date: "2027-06-01",
  });
  assert.equal(match.available, true);
  assert.equal(match.price_per_person, 1000);
  assert.deepEqual(brochureStore.lookupPublishedPackagePriceInRecords([published], {
    programme_id: programme.id, route_fingerprint: "different-route", pax: 1, hotel_category: "3 Star",
    transport_variation_id: "transport-A", occupancy: "Twin Sharing", departure_date: "2027-06-01",
  }), { available: false, reason: "PRICE_ON_REQUEST" }, "A route mismatch returns unavailable rather than a guessed price.");
  assert.deepEqual(brochureStore.lookupPublishedPackagePriceInRecords([published], {
    programme_id: programme.id, route_fingerprint: routeFingerprint, pax: 9, hotel_category: "3 Star",
    transport_variation_id: "transport-A", occupancy: "Twin Sharing", departure_date: "2027-06-01",
  }), { available: false, reason: "PRICE_ON_REQUEST" }, "No nearest-Pax fallback is used.");

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Se No", "Tour Code - Internal", "Tour Code - Portal", "Duration", "Program Name", "Program Route"],
    [1, "exbhp03", "", "1 Night / 2 Days", "Wilderness Getaway from Bhopal", "Bhopal - Sanchi - Bhopal"],
    [2, "MASTERONLY", "", "2 Nights / 3 Days", "", "Bhopal - Sanchi"],
    [3, "EXBHP03", "", "1 Night / 2 Days", "Wilderness Getaway from Bhopal", "Bhopal - Sanchi - Bhopal"],
  ]), "Sheet2");
  const referenceRows = reconciliation.parseProgrammeReferenceWorkbook(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
  const report = reconciliation.reconcileProgrammeReference([programme, { ...programme, id: "MASTER-ONLY", code: "MASTERONLY", name: "Master-only programme", nights: 2, days: 3 }], referenceRows);
  assert.equal(report.sourceRows, 3);
  assert.equal(report.uniqueSourceCodes, 2);
  assert.equal(report.populatedNames, 2);
  assert.equal(report.populatedDurations, 3);
  assert.equal(report.matched, 3, "Normalized code casing resolves the canonical Programme ID.");
  assert.deepEqual(report.duplicateSourceCodes, ["EXBHP03"]);
  assert.equal(report.missingNames.length, 1);
  assert.equal(report.masterOnly.length, 0, "Codes present in the workbook are not duplicated as separate Programme records.");
  console.log("Brochure routing registry tests passed: canonical listing, workbook reconciliation, safe costed selection, routing isolation, A/B occupancy rows, and exact published lookup.");
} finally {
  await vite.close();
}
