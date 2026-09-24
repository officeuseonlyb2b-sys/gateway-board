import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });

try {
  const calc = await vite.ssrLoadModule("/src/lib/wizard/calc.ts");
  const costsheet = await vite.ssrLoadModule("/src/lib/wizard/costsheet.ts");
  const scenarioEngine = await vite.ssrLoadModule("/src/lib/wizard/scenario.ts");
  const types = await vite.ssrLoadModule("/src/lib/wizard/types.ts");
  const quoteBuilder = await vite.ssrLoadModule("/src/lib/wizard/build-saved-quote.ts");
  const quoteStore = await vite.ssrLoadModule("/src/lib/quotes-store.ts");
  const validation = await vite.ssrLoadModule("/src/lib/wizard/validation.ts");

  const now = "2026-09-22T00:00:00.000Z";
  const db = {
    cities: [{ id: "city-1", name: "Indore" }],
    hotels: [{
      id: "hotel-1", city_id: "city-1", name: "Audit Hotel",
      hotel_category: "3 Star Deluxe", contact_name: "", contact_phone: "", email: "",
      has_wifi: true, has_pool: false, address: "", created_at: now, updated_at: now,
    }],
    room_categories: [{ id: "room-1", hotel_id: "hotel-1", name: "Deluxe", created_at: now }],
    rate_plans: [{
      id: "rate-1", room_category_id: "room-1", validity_start: "2026-01-01",
      validity_end: "2026-12-31", season_label: "Audit", meal_plan: "CP",
      double_rate: 4000, single_rate: 3000, quad_rate: 7000, extra_bed_rate: 1000,
      lunch_rate: 200, dinner_rate: 300, created_at: now, updated_at: now,
    }, {
      id: "rate-map", room_category_id: "room-1", validity_start: "2026-01-01",
      validity_end: "2026-12-31", season_label: "Audit", meal_plan: "MAP",
      double_rate: 4000, single_rate: 3000, quad_rate: 7000, extra_bed_rate: 1000,
      lunch_rate: 200, dinner_rate: 300, created_at: now, updated_at: now,
    }, {
      id: "rate-ap", room_category_id: "room-1", validity_start: "2026-01-01",
      validity_end: "2026-12-31", season_label: "Audit", meal_plan: "AP",
      double_rate: 4000, single_rate: 3000, quad_rate: 7000, extra_bed_rate: 1000,
      lunch_rate: 200, dinner_rate: 300, created_at: now, updated_at: now,
    }],
    quotes: [],
    miscellaneous_items: [{
      id: "misc-master", name: "Permit", description: "", rate: 500,
      unit: "fixed", pricing_type: "fixed", is_active: true, created_at: now,
    }],
    entrance_cities: [],
    entrance_sites: [{
      id: "site-1", city_id: "city-1", site_name: "Monument", description: "",
      indian_rate: 100, foreigner_rate: 500, student_rate: 50, is_active: true, created_at: now,
    }],
    activity_destinations: [{ id: "ad-1", name: "Indore", created_at: now }],
    activities: [{
      id: "activity-master", destination_id: "ad-1", activity_name: "Audit Activity",
      description: "", pricing_type: "per_person", slab_pricing_type: "per_person",
      price: 1000, unit_label: "per person", is_active: true, created_at: now,
    }],
    guides: [{
      id: "guide-master", name: "Audit Guide", guide_type: "English Guide - Local",
      destination: "Indore", rate_per_day: 1000, description: "", is_active: true,
      created_at: now, rate_1_to_5: 1000, rate_6_to_14: 1500, rate_15_plus: 2000,
      languages: ["English"],
    }],
    guide_cities: [], destination_cities: [], destination_tours: [],
    travel_options: [{
      id: "small", vehicle_type: "Small Car", description: "", capacity_persons: 4,
      min_pax: 1, max_pax: 4, rate_per_day: 0, rate_per_km: 0, is_active: true, created_at: now,
    }, {
      id: "large", vehicle_type: "Large Vehicle", description: "", capacity_persons: 10,
      min_pax: 5, max_pax: 10, rate_per_day: 0, rate_per_km: 0, is_active: true, created_at: now,
    }],
    restaurants: [],
  };

  const baseDraft = () => ({
    ...types.emptyDraft(),
    linked_query_id: "EMP-AUDIT-001",
    query_type: "B2B",
    agent: { agent_id: "agent-1", name: "Agent", agency: "Agency", phone: "", email: "" },
    nights: 1,
    start_date: "2026-09-22",
    program_name: "Audit Programme",
    adults: 2,
    ss: 0,
    children: [],
    tour_start_city: "Indore",
    tour_end_city: "Indore",
    departure_city: "Indore",
    routing: [{
      day: 1, date: "2026-09-22", city_id: "city-1", to_city_id: "city-1",
      to_city_ids: ["city-1"], from_city: "Indore", to_city: "Indore",
      program: "Arrival", program_mode: "text", overnight: true,
    }, {
      day: 2, date: "2026-09-23", city_id: "", from_city: "Indore", to_city: "Indore",
      program: "Departure", program_mode: "text", overnight: false,
    }],
    transport: [{
      id: "transport-small", travel_id: "small", vehicles: 1, days: 2, rate: 0,
      rate_format: "per_route", per_route_rates: [10000, 0], reporting_cost: 0,
    }],
    activities: [{
      id: "activity-line", activity_id: "activity-master", qty: 2, rate: 1000,
      pricing_mode: "per_person", from_routing_days: [1],
    }],
    entrances: [{
      id: "entrance-line", site_id: "site-1", indian_pax: 2, indian_rate: 100,
      foreign_pax: 0, foreign_rate: 500, student_pax: 0, student_rate: 50,
      from_routing_days: [1],
    }],
    guides: [{
      id: "guide-line", guide_id: "guide-master", days: 1, guides: 1, rate: 1000,
      language: "English", from_routing_days: [1],
    }],
    misc: [{
      id: "misc-line", item_id: "misc-master", qty: 1, rate: 500,
      unit: "fixed", from_routing_days: [1],
    }],
    hotel_options: [{
      key: "A", label: "3 Star Deluxe", category: "3 Star Deluxe",
      selections: [{ city_id: "city-1", hotel_id: "hotel-1", room_id: "room-1", meal_plan: "CP" }],
    }],
    included_option_keys: ["A"],
    recommended_option: "A",
    meal_selections_by_option: {
      A: {
        "1:city-1": {
          lunch: { source: "hotel", hotel_id: "hotel-1", label: "Audit Hotel", per_person_rate: 200 },
          dinner: { source: "hotel", hotel_id: "hotel-1", label: "Audit Hotel", per_person_rate: 300 },
        },
      },
    },
    land_markup_percent: 10,
    land_gst_percent: 5,
    hotel_markup_percent: 10,
    hotel_gst_percent: 5,
  });

  const close = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 0.001, `${message}: expected ${expected}, received ${actual}`);

  // Hotel GST boundary is exactly the approved ₹7,500 rule.
  assert.equal(calc.gstRateFor(7500), 0.05);
  assert.equal(calc.gstRateFor(7500.01), 0.18);

  // CP: both meals chargeable; MAP: dinner included; AP: both included.
  const cp = baseDraft();
  close(calc.computeMealDays(cp, db, "A").total, 1000, "CP meal total");
  const map = baseDraft();
  map.hotel_options[0].selections[0].meal_plan = "MAP";
  close(calc.computeMealDays(map, db, "A").total, 400, "MAP lunch-only total");
  const ap = baseDraft();
  ap.hotel_options[0].selections[0].meal_plan = "AP";
  close(calc.computeMealDays(ap, db, "A").total, 0, "AP must clear stale meal charges");

  // Fixed-number reconciliation: 2 pax, one DBL room, land ₹13,700,
  // meals ₹1,000. Supplier room GST then separate 10%/5% commercial layers.
  const exact = baseDraft();
  const scenario = scenarioEngine.computeScenario(exact, {
    id: "audit", label: "Audit", option_key: "A", transport_line_id: "transport-small",
  }, db);
  assert.ok(scenario);
  close(
    scenario.transport_total + scenario.guide_total + scenario.activities_total
      + scenario.entrances_total + scenario.misc_total,
    13700,
    "Land source total",
  );
  close(scenario.grand_total, 21829.5, "Scenario grand total");
  close(scenario.per_person_avg, 10914.75, "Scenario per-person result");
  close(scenario.optionals_total, 0, "No optional selected");

  // Optional supplements are visible but never silently enter package totals.
  const withOptional = baseDraft();
  withOptional.optionals = [{ id: "optional", custom_name: "Airfare", qty: 1, rate: 99999 }];
  const scenarioWithOptional = scenarioEngine.computeScenario(withOptional, {
    id: "audit-optionals", label: "Audit", option_key: "A", transport_line_id: "transport-small",
  }, db);
  close(scenarioWithOptional.grand_total, scenario.grand_total, "Optional isolation");
  close(scenarioWithOptional.optionals_total, 99999, "Optional display total");

  // Rate-sheet result must reconcile with the scenario for the exact DBL case.
  const rateSheet = costsheet.buildRateSheet(exact, db, exact.hotel_options[0], exact.transport);
  assert.equal(rateSheet.length, 1);
  assert.deepEqual(rateSheet[0].rows.map((row) => row.pax), [2]);
  close(rateSheet[0].rows[0].pkg_double, scenario.per_person_avg, "Rate sheet vs scenario");

  // Range rows are bounded by both the requested range and each vehicle's
  // actual capacity; an ineligible vehicle must never fall back to all rows.
  const range = baseDraft();
  range.pax_range = "2-5";
  range.transport = [
    range.transport[0],
    { ...range.transport[0], id: "transport-large", travel_id: "large", per_route_rates: [15000, 0] },
  ];
  const rangeSheet = costsheet.buildRateSheet(range, db, range.hotel_options[0], range.transport);
  assert.deepEqual(rangeSheet.find((group) => group.line_id === "transport-small").rows.map((row) => row.pax), [2, 3, 4]);
  assert.deepEqual(rangeSheet.find((group) => group.line_id === "transport-large").rows.map((row) => row.pax), [5]);

  // Two vehicle options remain independent alternatives, never one sum.
  const exactAlternatives = baseDraft();
  exactAlternatives.transport.push({
    ...exactAlternatives.transport[0], id: "transport-large", travel_id: "large", per_route_rates: [15000, 0],
  });
  const alternatives = costsheet.buildRateSheet(
    exactAlternatives, db, exactAlternatives.hotel_options[0], exactAlternatives.transport,
  );
  assert.equal(alternatives.length, 1, "Large vehicle is correctly excluded for exact 2 pax");
  close(alternatives[0].rows[0].transport, 5775, "Small vehicle independent transport PP");

  // Dynamic accommodation is exact-pax only and must cover every traveller.
  const dynamicValid = baseDraft();
  dynamicValid.dynamic_days = [1];
  dynamicValid.day_room_mix = { 1: { single: 0, double: 1, triple: 0, quad: 0 } };
  dynamicValid.rate_sheet_rows = { "A|transport-small": [2] };
  assert.equal(validation.validateQuoteForFinalization(dynamicValid, db).blockers.length, 0);
  const dynamicMismatch = structuredClone(dynamicValid);
  dynamicMismatch.day_room_mix[1].double = 2;
  assert.ok(validation.validateQuoteForFinalization(dynamicMismatch, db).blockers.some((item) => item.code.startsWith("ROOM_MIX_")));
  const dynamicRange = structuredClone(dynamicValid);
  dynamicRange.pax_range = "2-5";
  assert.ok(validation.validateQuoteForFinalization(dynamicRange, db).blockers.some((item) => item.code.startsWith("DYNAMIC_RANGE_")));
  const overrideWithoutReason = baseDraft();
  overrideWithoutReason.hotel_options[0].rate_overrides = { 1: { dbl: 4500 } };
  overrideWithoutReason.rate_sheet_rows = { "A|transport-small": [2] };
  assert.ok(validation.validateQuoteForFinalization(overrideWithoutReason, db).blockers.some((item) => item.code.startsWith("OVERRIDE_REASON_")));

  // Generated records are locked. A correction creates V2 with a mandatory
  // reason, retains V1, and marks it superseded instead of overwriting it.
  const memory = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
    clear: () => memory.clear(),
    key: (index) => Array.from(memory.keys())[index] ?? null,
    get length() { return memory.size; },
  };
  const v1 = quoteBuilder.buildSavedQuote(baseDraft(), db, "Audit User");
  quoteStore.saveQuote(v1);
  assert.throws(() => quoteStore.saveQuote(v1), /immutable/i);
  assert.throws(() => quoteStore.quoteToRevisionDraft(v1, ""), /reason/i);
  const revision = quoteStore.quoteToRevisionDraft(v1, "Client changed the hotel option");
  assert.equal(revision.intended_version, 2);
  const v2 = quoteBuilder.buildSavedQuote(revision, db, "Audit User");
  quoteStore.saveQuote(v2);
  const family = quoteStore.loadQuotes();
  assert.equal(family.length, 2);
  assert.equal(family.find((quote) => quote.id === v1.id).status, "Superseded");
  assert.equal(quoteStore.latestQuoteForQuery("EMP-AUDIT-001").version, 2);

  console.log("Quotation engine audit passed: commercial, range, meal and immutability assertions.");
} finally {
  await vite.close();
}
