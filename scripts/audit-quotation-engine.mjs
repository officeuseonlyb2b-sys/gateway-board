import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });

try {
  const calc = await vite.ssrLoadModule("/src/lib/wizard/calc.ts");
  const costsheet = await vite.ssrLoadModule("/src/lib/wizard/costsheet.ts");
  const scenarioEngine = await vite.ssrLoadModule("/src/lib/wizard/scenario.ts");
  const types = await vite.ssrLoadModule("/src/lib/wizard/types.ts");
  const quoteBuilder = await vite.ssrLoadModule("/src/lib/wizard/build-saved-quote.ts");
  const draftStore = await vite.ssrLoadModule("/src/lib/wizard/store.ts");
  const quoteStore = await vite.ssrLoadModule("/src/lib/quotes-store.ts");
  const validation = await vite.ssrLoadModule("/src/lib/wizard/validation.ts");
  const masterPricing = await vite.ssrLoadModule("/src/lib/mock-store.ts");

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
    }, {
      id: "amenities", name: "Basic Amenities Kit", description: "", rate: 100,
      unit: "per_person", pricing_type: "per_person", is_active: true, created_at: now,
    }, {
      id: "wet-tissues", name: "M'Water & Wet Tissues", description: "", rate: 600,
      unit: "per_person", pricing_type: "per_person", is_active: true, created_at: now,
    }, {
      id: "inactive-misc", name: "Inactive", description: "", rate: 999,
      unit: "per_person", pricing_type: "per_person", is_active: false, created_at: now,
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

  // Shared pricing resolver keeps per-person rates intact and divides group slabs only.
  const perPersonActivity = {
    ...db.activities[0], price: 1500, indian_price: 1500,
    slab_pricing_type: "per_person", pricing_slabs: [],
  };
  close(masterPricing.activityPricingForPax(perPersonActivity, 1).per_person, 1500, "1-pax activity per-person rate");
  close(masterPricing.activityPricingForPax(perPersonActivity, 2).per_person, 1500, "2-pax activity per-person rate");
  const slabActivity = {
    ...perPersonActivity, slab_pricing_type: "slab",
    pricing_slabs: [
      { id: "slab-1", from_pax: 1, to_pax: 4, price: 400, type: "indian" },
      { id: "slab-2", from_pax: 5, to_pax: 8, price: 800, type: "indian" },
    ],
  };
  close(masterPricing.activityPricingForPax(slabActivity, 1).per_person, 400, "1-pax slab activity per-person rate");
  close(masterPricing.activityPricingForPax(slabActivity, 2).per_person, 200, "2-pax slab activity per-person rate");
  close(masterPricing.activityPricingForPax(slabActivity, 4).per_person, 100, "4-pax slab activity per-person rate");
  close(masterPricing.activityPricingForPax(slabActivity, 5).per_person, 160, "5-pax next slab activity per-person rate");
  close(masterPricing.miscRateForPax(db.miscellaneous_items[1], 2, 1).per_person, 100, "Amenities per-person rate");
  close(masterPricing.miscRateForPax(db.miscellaneous_items[2], 2, 1).per_person, 600, "Wet tissues per-person rate");
  close(
    masterPricing.miscRateForPax(db.miscellaneous_items[1], 2, 1).per_person
      + masterPricing.miscRateForPax(db.miscellaneous_items[2], 2, 1).per_person,
    700,
    "Combined miscellaneous per-person base",
  );

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

  // Two configured per-person activities and misc lines retain their rates at 2 pax.
  const miscActivityDraft = baseDraft();
  db.activities.push({ ...perPersonActivity, id: "night-sarafa", activity_name: "Night Sarafa Food Market" });
  db.activities.push({ ...slabActivity, id: "e-rikshaw", activity_name: "E Rikshaw at Indore" });
  miscActivityDraft.activities = [{
    id: "sarafa-line", activity_id: "night-sarafa", qty: 2, rate: 1500,
    pricing_mode: "per_person", from_routing_days: [1],
  }];
  miscActivityDraft.misc = [
    { id: "amenities-line", item_id: "amenities", qty: 2, rate: 100, unit: "per_person", from_routing_days: [1] },
    { id: "tissues-line", item_id: "wet-tissues", qty: 2, rate: 600, unit: "per_person", from_routing_days: [1] },
  ];
  close(costsheet.buildLandPart(miscActivityDraft, db).activities_total, 3000, "Per-person activity group total");
  close(costsheet.buildLandPart(miscActivityDraft, db).misc_total, 1400, "Selected misc group total");
  close(calc.computeAddonsTotal(miscActivityDraft, db) - calc.computeAddonsTotal({ ...miscActivityDraft, misc: [] }, db), 1400, "Misc included in Step 8 add-ons");
  const miscRateSheet = costsheet.buildRateSheet(
    miscActivityDraft, db, miscActivityDraft.hotel_options[0], miscActivityDraft.transport,
  );
  close(miscRateSheet[0].rows[0].activities, 1732.5, "Per-person activity rate-sheet value incl. markup/GST");
  close(miscRateSheet[0].rows[0].misc, 808.5, "Misc per-person rate-sheet value incl. markup/GST");
  const deselectedMisc = {
    ...miscActivityDraft,
    costing_selection: { misc: { 1: [] } },
  };
  close(costsheet.buildLandPart(deselectedMisc, db).misc_total, 0, "Unchecked misc contributes zero to costing sheet");
  close(
    calc.computeAddonsTotal(deselectedMisc, db) - calc.computeAddonsTotal({ ...deselectedMisc, misc: [] }, db),
    0,
    "Unchecked misc contributes zero to addon total",
  );
  const inactiveMiscDraft = {
    ...miscActivityDraft,
    misc: [{ id: "inactive-line", item_id: "inactive-misc", qty: 2, rate: 999, unit: "per_person", from_routing_days: [1] }],
  };
  close(costsheet.buildLandPart(inactiveMiscDraft, db).misc_total, 0, "Inactive misc excluded from costing");

  const slabActivityDraft = baseDraft();
  db.activities.push({ ...slabActivity, id: "slab-activity", activity_name: "Slab Activity" });
  slabActivityDraft.activities = [{
    id: "slab-line", activity_id: "slab-activity", qty: 1, rate: 400,
    pricing_mode: "slab", from_routing_days: [1],
  }];
  const slabRateSheet = costsheet.buildRateSheet(
    slabActivityDraft, db, slabActivityDraft.hotel_options[0], slabActivityDraft.transport,
  );
  close(slabRateSheet[0].rows[0].activities, 231, "2-pax slab rate-sheet value incl. markup/GST");
    const combinedActivityDraft = {
      ...miscActivityDraft,
      activities: [
        ...miscActivityDraft.activities,
        { id: "rikshaw-line", activity_id: "e-rikshaw", qty: 1, rate: 400, pricing_mode: "slab", from_routing_days: [1] },
      ],
    };
    close(costsheet.buildLandPart(combinedActivityDraft, db).activities_per_person_total, 1700, "Activity base per person combines flat and group slab pricing");
    const combinedActivityRateSheet = costsheet.buildRateSheet(
      combinedActivityDraft, db, combinedActivityDraft.hotel_options[0], combinedActivityDraft.transport,
    );
    close(combinedActivityRateSheet[0].rows[0].activities, 1963.5, "Combined activity per-person costing incl. existing markup/GST chain");

  // Step 6 resolved per-person values are shared by Step 8, rate sheets, and scenarios,
  // including the next activity slab at 5 pax.
  for (const [pax, expectedActivityBase] of [[1, 1900], [2, 1700], [5, 1660]]) {
    const paxDraft = { ...combinedActivityDraft, adults: pax };
    const land = costsheet.buildLandPart(paxDraft, db);
    close(land.activities_per_person_total, expectedActivityBase, `${pax}-pax Step 8 activity base`);
    close(land.misc_per_person_total, 700, `${pax}-pax Step 8 misc base`);
    const sheet = costsheet.buildRateSheet(paxDraft, db, paxDraft.hotel_options[0], []);
    close(sheet[0].rows[0].activities, expectedActivityBase * 1.1 * 1.05, `${pax}-pax rate-sheet activity final`);
    close(sheet[0].rows[0].misc, 700 * 1.1 * 1.05, `${pax}-pax rate-sheet misc final`);
    const scenarioForPax = scenarioEngine.computeScenario(paxDraft, {
      id: `pricing-${pax}`, label: "Pricing", option_key: "A",
    }, db);
    close(scenarioForPax.persons[0].activities, expectedActivityBase, `${pax}-pax scenario activity base`);
    close(scenarioForPax.persons[0].misc, 700, `${pax}-pax scenario misc base`);
  }

  const slabMisc = {
    ...db.miscellaneous_items[1],
    id: "slab-misc", name: "chocklets", rate: 600,
    unit: "fixed", pricing_type: "slab", slab_is_per_person: true,
    price_ranges: [
      { from_pax: 1, to_pax: 6, price: 600 },
      { from_pax: 7, to_pax: 20, price: 1200 },
    ],
  };
  db.miscellaneous_items.push(slabMisc);
  const miscSlabDraft = {
    ...baseDraft(),
    misc: [{ id: "misc-slab-line", item_id: slabMisc.id, qty: 1, rate: 400, unit: "fixed", from_routing_days: [1] }],
  };
  for (const [pax, expectedGroupCost, expectedMiscBase] of [
    [1, 600, 600],
    [2, 600, 300],
    [6, 600, 100],
    [7, 1200, 1200 / 7],
    [20, 1200, 60],
  ]) {
    const paxDraft = { ...miscSlabDraft, adults: pax };
    const resolved = masterPricing.miscRateForPax(slabMisc, pax, 1);
    close(resolved.total, expectedGroupCost, `${pax}-pax misc slab group total`);
    close(resolved.per_person, expectedMiscBase, `${pax}-pax misc slab per-person rate`);
    close(costsheet.buildLandPart(paxDraft, db).misc_per_person_total, expectedMiscBase, `${pax}-pax Step 8 slab misc base`);
    close(
      calc.computeAddonsTotal(paxDraft, db) - calc.computeAddonsTotal({ ...paxDraft, misc: [] }, db),
      expectedGroupCost,
      `${pax}-pax misc slab add-on total`,
    );
    const sheet = costsheet.buildRateSheet(paxDraft, db, paxDraft.hotel_options[0], []);
    close(sheet[0].rows[0].misc, expectedMiscBase * 1.1 * 1.05, `${pax}-pax rate-sheet slab misc final`);
    const scenarioForPax = scenarioEngine.computeScenario(paxDraft, {
      id: `misc-slab-${pax}`, label: "Misc slab", option_key: "A",
    }, db);
    close(scenarioForPax.persons[0].misc, expectedMiscBase, `${pax}-pax scenario slab misc base`);
  }

  const mixedMiscDraft = {
    ...baseDraft(),
    misc: [
      { id: "amenities-selected", item_id: "amenities", qty: 2, rate: 100, unit: "per_person", from_routing_days: [1] },
      { id: "tissues-selected", item_id: "wet-tissues", qty: 2, rate: 600, unit: "per_person", from_routing_days: [1] },
      { id: "chocklets-selected", item_id: slabMisc.id, qty: 1, rate: 600, unit: "fixed", from_routing_days: [1] },
    ],
  };
  close(costsheet.buildLandPart(mixedMiscDraft, db).misc_per_person_total, 1000, "2-pax combined misc base per person");
  const mixedMiscSheet = costsheet.buildRateSheet(mixedMiscDraft, db, mixedMiscDraft.hotel_options[0], []);
  close(mixedMiscSheet[0].rows[0].misc, 1155, "2-pax combined misc final per person");
  const mixedMiscScenario = scenarioEngine.computeScenario(mixedMiscDraft, {
    id: "mixed-misc", label: "Miscellaneous", option_key: "A",
  }, db);
  close(mixedMiscScenario.persons[0].misc, 1000, "2-pax combined misc scenario base per person");

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
  draftStore.writeDraft(miscActivityDraft);
  assert.deepEqual(draftStore.loadDraft().misc, miscActivityDraft.misc, "Selected misc items persist in the saved draft");
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
