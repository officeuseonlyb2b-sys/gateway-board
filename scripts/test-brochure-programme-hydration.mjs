import assert from "node:assert/strict";
import { createServer } from "vite";

const storage = new Map();
const makeStorage = () => ({
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
});
globalThis.window = globalThis;
globalThis.localStorage = makeStorage();
globalThis.sessionStorage = makeStorage();

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const {
    brochureDraftFromProgramme,
    hasBrochureProgrammeDependencies,
    prepareBrochureProgrammeSelection,
  } = await vite.ssrLoadModule("/src/lib/wizard/brochure-program.ts");
  const { normalizeDraft } = await vite.ssrLoadModule("/src/lib/wizard/store.ts");
  const { upsertDraft, getDraft } = await vite.ssrLoadModule("/src/lib/drafts-store.ts");
  const programme = {
    id: "PROGRAMME-CANONICAL-1", code: "MP-101", name: "Heritage Circuit", nights: 2, days: 3,
    duration_label: "2 Nights / 3 Days", routing_summary: "Bhopal → Sanchi → Bhopal",
    routing: [
      { day: 1, from_city: "Bhopal", destination_city: "Bhopal", overnight_city: "Bhopal", program_text: "Arrival" },
      { day: 2, from_city: "Bhopal", destination_city: "Sanchi", overnight_city: "Sanchi", program_text: "Stupa" },
      { day: 3, from_city: "Sanchi", destination_city: "Bhopal", overnight_city: null, program_text: "Departure" },
    ],
    cities: ["Bhopal", "Sanchi"], categories: ["Heritage"], departure_city: "Bhopal",
    travel_modes: ["Road"], inclusions: ["Transfers"], exclusions: ["Flights"], source: "Manual", status: "Active",
  };
  const draft = brochureDraftFromProgramme(programme, (city) => city ? `city-${city}` : "");
  assert.equal(draft.program_id, programme.id);
  assert.equal(draft.program_code, programme.code);
  assert.equal(draft.program_name, programme.name);
  assert.equal(draft.nights, 2);
  assert.equal(draft.programme_days, 3);
  assert.equal(draft.tour_start_city, "Bhopal");
  assert.equal(draft.departure_city, "Bhopal");
  assert.equal(draft.tour_end_city, "Bhopal");
  assert.equal(draft.pax_mode, "range");
  assert.equal(draft.pax_range, "1-40");
  assert.equal(draft.pax_min, 1);
  assert.equal(draft.pax_max, 40);
  assert.equal(draft.brochure_validity_from, "");
  assert.equal(draft.brochure_validity_till, "");
  assert.equal(draft.has_dates, false);
  assert.ok(draft.routing.every((day) => day.date === ""), "No calendar dates are invented for a date-free Brochure.");
  assert.deepEqual(draft.routing.map((day) => [day.day, day.from_city, day.to_city, day.city_id]), [
    [1, "Bhopal", "Bhopal", "city-Bhopal"], [2, "Bhopal", "Sanchi", "city-Sanchi"], [3, "Sanchi", "Bhopal", ""],
  ]);
  assert.deepEqual(draft.routing.map((day) => day.overnight), [true, true, false]);
  assert.deepEqual(draft.routing.map((day) => day.to_city_ids), [
    ["city-Bhopal"], ["city-Sanchi"], ["city-Bhopal"],
  ]);
  assert.deepEqual(draft.categories, programme.categories);
  assert.deepEqual(draft.travel_modes, programme.travel_modes);
  assert.deepEqual(draft.inclusions, programme.inclusions);
  assert.deepEqual(draft.exclusions, programme.exclusions);

  const programmeWithoutRouting = {
    ...programme,
    id: "PROGRAMME-NO-ROUTING",
    nights: 7,
    days: 8,
    routing_summary: "Summary text only; not a day-wise route",
    routing: [],
  };
  const noInventedRouteDraft = brochureDraftFromProgramme(
    programmeWithoutRouting,
    (city) => city ? `city-${city}` : "",
  );
  assert.equal(noInventedRouteDraft.routing.length, 0, "No day-wise routing rows are invented from programme duration or summary text.");
  assert.equal(noInventedRouteDraft.nights, 7);
  assert.equal(noInventedRouteDraft.programme_days, 8);
  assert.equal(noInventedRouteDraft.pax_min, 1);
  assert.equal(noInventedRouteDraft.pax_max, 40);
  assert.equal(noInventedRouteDraft.brochure_validity_from, "");
  assert.equal(noInventedRouteDraft.brochure_validity_till, "");

  const secondProgramme = {
    ...structuredClone(programme),
    id: "PROGRAMME-CANONICAL-2",
    code: "MP-202",
    name: "Lake Circuit",
    nights: 1,
    days: 2,
    departure_city: "Indore",
    routing_summary: "Indore → Omkareshwar → Indore",
    cities: ["Indore", "Omkareshwar"],
    routing: [
      { day: 1, from_city: "Indore", destination_city: "Omkareshwar", overnight_city: "Omkareshwar", program_text: "Arrival" },
      { day: 2, from_city: "Omkareshwar", destination_city: "Indore", overnight_city: null, program_text: "Departure" },
    ],
  };
  const legacyDependentDraft = {
    ...draft,
    program_id: undefined,
    program_code: undefined,
    program_name: "Legacy untied draft",
    pax_mode: "range",
    pax_min: 4,
    pax_max: 20,
    pax_range: "4-20",
    has_dates: true,
    start_date: "2030-06-15",
    markup_percent: 17,
    land_markup_percent: 12,
    land_gst_percent: 8,
    hotel_markup_percent: 14,
    hotel_gst_percent: 5,
    brochure_validity_from: "2027-01-01",
    brochure_validity_till: "2027-12-31",
    routing: structuredClone(draft.routing),
    transport: [{ id: "stale-transport", travel_id: "vehicle-1", vehicles: 1, days: 1, rate: 100 }],
    activities: [{ id: "stale-activity", qty: 1, rate: 200, pricing_mode: "per_person" }],
    entrances: [{ id: "stale-entrance", indian_pax: 1, indian_rate: 300, foreign_pax: 0, foreign_rate: 0 }],
    guides: [{ id: "stale-guide", days: 1, guides: 1, rate: 400 }],
    misc: [{ id: "stale-misc", qty: 1, rate: 500, unit: "fixed" }],
    hotel_options: [{
      key: "A",
      label: "3 Star",
      category: "3 Star",
      selections: [{ routing_day: 1, city_id: "city-Bhopal", hotel_id: "hotel-original", room_id: "room-original", meal_plan: "CP" }],
      rate_overrides: { 1: { dbl: 1234, reason: "kept in original" } },
      dynamic_allocations: { 1: [{ id: "old-allocation", room_id: "old-room", occupancy: "double", rooms: 2 }] },
      inclusions: ["old hotel inclusion"],
      exclusions: ["old hotel exclusion"],
      pax_allocations: [{ person_id: 1, label: "Adult", room_type: "double", sharing_with: [] }],
      allocated_pax: 4,
    }],
    day_room_mix: { 1: { single: 0, double: 2, triple: 0, quad: 0 } },
    included_option_keys: ["A"],
    accommodation_planning_mode: "split_group",
    group_room_mix: { single: 0, double: 2, triple: 0 },
    costing_selection: { transport: { 1: ["stale-transport"] } },
    meal_selections: { "1:city-Bhopal": { lunch: { source: "restaurant", restaurant_id: "restaurant-original" } } },
    rate_sheet_rows: { "A|vehicle-1": [4, 10] },
  };
  const legacyBeforeChangeRequest = structuredClone(legacyDependentDraft);
  assert.equal(hasBrochureProgrammeDependencies(legacyDependentDraft), true);
  const confirmation = prepareBrochureProgrammeSelection(
    legacyDependentDraft,
    secondProgramme,
    (city) => city ? `city-${city}` : "",
  );
  assert.equal(confirmation.status, "confirmation_required", "Legacy dependent work requires confirmation even without a prior Programme ID.");
  const cancelled = prepareBrochureProgrammeSelection(
    legacyDependentDraft,
    secondProgramme,
    (city) => city ? `city-${city}` : "",
    false,
  );
  assert.equal(cancelled.status, "cancelled");
  assert.deepEqual(legacyDependentDraft, legacyBeforeChangeRequest, "Cancelling Programme confirmation does not mutate the existing draft.");
  assert.equal(legacyDependentDraft.program_name, "Legacy untied draft");
  assert.equal(legacyDependentDraft.hotel_options[0].selections[0].hotel_id, "hotel-original");

  const changed = prepareBrochureProgrammeSelection(
    legacyDependentDraft,
    secondProgramme,
    (city) => city ? `city-${city}` : "",
    true,
  );
  assert.equal(changed.status, "changed");
  assert.equal(changed.nextDraft.program_id, secondProgramme.id);
  assert.equal(changed.nextDraft.program_code, secondProgramme.code);
  assert.equal(changed.nextDraft.nights, 1);
  assert.equal(changed.nextDraft.programme_days, 2);
  assert.equal(changed.nextDraft.tour_start_city, "Indore");
  assert.equal(changed.nextDraft.tour_end_city, "Indore");
  assert.equal(changed.nextDraft.pax_min, 4, "Manually configured Brochure Pax minimum survives Programme changes.");
  assert.equal(changed.nextDraft.pax_max, 20, "Manually configured Brochure Pax maximum survives Programme changes.");
  assert.equal(changed.nextDraft.has_dates, true, "The independently selected departure-date mode is preserved.");
  assert.equal(changed.nextDraft.start_date, "2030-06-15", "The specific departure date remains editable and preserved.");
  assert.equal(changed.nextDraft.brochure_validity_from, "2027-01-01");
  assert.equal(changed.nextDraft.brochure_validity_till, "2027-12-31");
  assert.equal(changed.nextDraft.markup_percent, 17);
  assert.equal(changed.nextDraft.land_markup_percent, 12);
  assert.equal(changed.nextDraft.land_gst_percent, 8);
  assert.equal(changed.nextDraft.hotel_markup_percent, 14);
  assert.equal(changed.nextDraft.hotel_gst_percent, 5);
  assert.ok(changed.nextDraft.routing.every((day) => day.date === ""));
  assert.equal(changed.nextDraft.routing[0].overnight, true);
  assert.equal(changed.nextDraft.routing[0].city_id, "city-Omkareshwar");
  assert.equal(changed.nextDraft.transport.length, 0);
  assert.equal(changed.nextDraft.activities.length, 0);
  assert.equal(changed.nextDraft.entrances.length, 0);
  assert.equal(changed.nextDraft.guides.length, 0);
  assert.equal(changed.nextDraft.misc.length, 0);
  assert.equal(changed.nextDraft.hotel_options[0].selections.length, 0);
  assert.equal(changed.nextDraft.hotel_options[0].rate_overrides, undefined);
  assert.equal(changed.nextDraft.hotel_options[0].dynamic_allocations, undefined);
  assert.equal(changed.nextDraft.hotel_options[0].inclusions?.length ?? 0, 0);
  assert.equal(changed.nextDraft.hotel_options[0].exclusions?.length ?? 0, 0);
  assert.equal(changed.nextDraft.hotel_options[0].allocated_pax, undefined);
  assert.equal(changed.nextDraft.day_room_mix, undefined);
  assert.equal(changed.nextDraft.included_option_keys, undefined);
  assert.equal(changed.nextDraft.accommodation_planning_mode, undefined);
  assert.equal(changed.nextDraft.group_room_mix, undefined);
  assert.equal(changed.nextDraft.costing_selection, undefined);
  assert.deepEqual(changed.nextDraft.rate_sheet_rows ?? {}, {});
  assert.equal(programme.name, "Heritage Circuit", "Programme hydration never mutates the canonical master.");
  const unchanged = prepareBrochureProgrammeSelection(
    changed.nextDraft,
    secondProgramme,
    (city) => city ? `city-${city}` : "",
  );
  assert.equal(unchanged.status, "unchanged", "Reselecting the already-linked Programme does not rehydrate or erase costing.");

  const resumed = normalizeDraft(structuredClone(changed.nextDraft));
  assert.equal(resumed.program_id, secondProgramme.id);
  assert.equal(resumed.programme_days, 2);
  assert.equal(resumed.pax_min, 4);
  assert.equal(resumed.pax_max, 20);
  assert.equal(resumed.brochure_validity_from, "2027-01-01");
  assert.deepEqual(resumed.routing, changed.nextDraft.routing, "Draft resume preserves hydrated routing without calendar dates.");
  assert.equal(resumed.hotel_options[0].selections.length, 0, "Draft resume does not revive stale hotels from the previous Programme.");
  const costedDraft = {
    ...changed.nextDraft,
    transport: [{ id: "new-transport", travel_id: "vehicle-new", vehicles: 1, days: 1, rate: 2500 }],
    activities: [{ id: "new-activity", qty: 1, rate: 650, pricing_mode: "per_person", from_routing_days: [1] }],
    hotel_options: [{
      ...changed.nextDraft.hotel_options[0],
      selections: [{ city_id: "city-Omkareshwar", routing_day: 1, hotel_id: "new-hotel-id", room_id: "new-room-id", meal_plan: "CP" }],
    }],
    rate_sheet_rows: { "A|coach-new": [4, 20] },
  };
  const savedId = upsertDraft(costedDraft, undefined, "Hydrated Programme Resume Test");
  const resumedSavedDraft = getDraft(savedId)?.wizard_state;
  assert.ok(resumedSavedDraft);
  assert.equal(resumedSavedDraft.program_id, secondProgramme.id, "Save Draft/resume preserves canonical Programme ID.");
  assert.equal(resumedSavedDraft.programme_days, secondProgramme.days);
  assert.equal(resumedSavedDraft.pax_min, 4);
  assert.equal(resumedSavedDraft.pax_max, 20);
  assert.equal(resumedSavedDraft.brochure_validity_from, "2027-01-01");
  assert.deepEqual(resumedSavedDraft.routing, costedDraft.routing);
  assert.deepEqual(resumedSavedDraft.hotel_options, costedDraft.hotel_options);
  assert.deepEqual(resumedSavedDraft.transport, costedDraft.transport);
  assert.deepEqual(resumedSavedDraft.activities, costedDraft.activities);
  assert.deepEqual(resumedSavedDraft.rate_sheet_rows, costedDraft.rate_sheet_rows);
  const untouchedLegacy = normalizeDraft(structuredClone(legacyDependentDraft));
  assert.equal(untouchedLegacy.program_id, undefined, "Legacy drafts remain accessible without automatic Programme rehydration.");
  assert.equal(untouchedLegacy.routing[1].to_city, "Sanchi", "Legacy routing is preserved as saved.");
  console.log("Brochure Programme hydration test passed: canonical identity, duration, range mode and day-wise routing retained.");
} finally { await vite.close(); }
