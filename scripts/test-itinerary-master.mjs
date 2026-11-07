import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "vite";
import * as XLSX from "xlsx";

const databases = new Map();
const localValues = new Map();
const sessionValues = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (key) => localValues.get(key) ?? null,
  setItem: (key, value) => localValues.set(key, String(value)),
  removeItem: (key) => localValues.delete(key),
  clear: () => localValues.clear(),
};
globalThis.sessionStorage = {
  getItem: (key) => sessionValues.get(key) ?? null,
  setItem: (key, value) => sessionValues.set(key, String(value)),
  removeItem: (key) => sessionValues.delete(key),
  clear: () => sessionValues.clear(),
};
const requestResult = (result) => {
  const request = {};
  queueMicrotask(() => { request.result = result; request.onsuccess?.(); });
  return request;
};
globalThis.indexedDB = {
  open(name) {
    const request = {};
    queueMicrotask(() => {
      let database = databases.get(name);
      if (!database) {
        database = { stores: new Map() };
        databases.set(name, database);
        request.result = {
          objectStoreNames: { contains: (store) => database.stores.has(store) },
          createObjectStore(store) { database.stores.set(store, new Map()); },
          transaction(storeName) {
            const store = database.stores.get(storeName);
            return { objectStore() { return {
              getAll: () => requestResult([...store.values()]),
              get: (key) => requestResult(store.get(key)),
              put(value, key) { const id = key ?? value.id; store.set(id, value); return requestResult(id); },
              delete(key) { store.delete(key); return requestResult(undefined); },
            }; } };
          },
          close() {},
        };
        request.onupgradeneeded?.();
      } else {
        request.result = {
          objectStoreNames: { contains: (store) => database.stores.has(store) },
          transaction(storeName) {
            const store = database.stores.get(storeName);
            return { objectStore() { return {
              getAll: () => requestResult([...store.values()]),
              get: (key) => requestResult(store.get(key)),
              put(value, key) { const id = key ?? value.id; store.set(id, value); return requestResult(id); },
              delete(key) { store.delete(key); return requestResult(undefined); },
            }; } };
          },
          close() {},
        };
      }
      request.onsuccess?.();
    });
    return request;
  },
};

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const store = await vite.ssrLoadModule("/src/lib/itineraries-store.ts");
  const importer = await vite.ssrLoadModule("/src/lib/itinerary-import.ts");
  const { emptyDraft } = await vite.ssrLoadModule("/src/lib/wizard/types.ts");
  const programsStore = await vite.ssrLoadModule("/src/lib/wizard/agents-store.ts");
  const routingSave = await vite.ssrLoadModule("/src/lib/wizard/customized-routing-save.ts");
  const routingIdentity = await vite.ssrLoadModule("/src/lib/programme-routing-identity.ts");
  const brochureProgram = await vite.ssrLoadModule("/src/lib/wizard/brochure-program.ts");
  const brochureValidation = await vite.ssrLoadModule("/src/lib/wizard/brochure-validation.ts");
  const draftsStore = await vite.ssrLoadModule("/src/lib/drafts-store.ts");
  const programme = {
    id: "CANONICAL-EXBHP03", code: "EXBHP03", name: "Wilderness Getaway from Bhopal",
    nights: 4, days: 5, duration_label: "4 Nights / 5 Days", routing_summary: "Bhopal → Bhimbetka → Bhopal",
    departure_city: "Bhopal", cities: ["Bhopal", "Bhimbetka", "Sanchi", "Madai", "Pachmarhi"], categories: [],
    routing: Array.from({ length: 5 }, (_, index) => ({
      day: index + 1, from_city: index ? "Bhopal" : "Bhopal", destination_city: ["Bhimbetka", "Sanchi", "Madai", "Pachmarhi", "Bhopal"][index],
      overnight_city: index < 4 ? ["Bhopal", "Bhopal", "Madai", "Pachmarhi"][index] : null,
      program_text: `Programme day ${index + 1}`,
    })),
    source: "Excel Import", status: "Active",
    inclusions: ["Road transfers"], exclusions: ["Airfare"],
  };
  const draft = store.newItinerary(undefined, "Test User");
  const hydrated = store.hydrateItineraryFromProgramme(draft, programme);
  assert.equal(hydrated.programmeId, "CANONICAL-EXBHP03", "Canonical Programme ID is stored; no title-derived ID is generated.");
  assert.equal(hydrated.days.length, 5, "A 4-night / 5-day Programme has five day rows.");
  assert.equal(hydrated.startCity, "Bhopal");
  assert.equal(hydrated.nights, 4);
  assert.equal(hydrated.days[2].overnightCity, "Madai");
  assert.deepEqual(hydrated.inclusions, ["Road transfers"], "Available Programme inclusions are prefilled as a default.");
  assert.deepEqual(hydrated.exclusions, ["Airfare"], "Available Programme exclusions are prefilled as a default.");
  const manualContent = { ...hydrated, overview: "Keep this Overview", inclusions: ["Custom manual inclusion"], fieldSources: { ...hydrated.fieldSources, inclusions: "Manual" } };
  const anotherProgramme = { ...programme, id: "CANONICAL-SECOND", code: "SECOND", inclusions: ["New programme inclusion"] };
  const changedProgramme = store.hydrateItineraryFromProgramme(manualContent, anotherProgramme);
  assert.equal(changedProgramme.overview, "Keep this Overview", "Programme replacement preserves the manual Overview.");
  assert.deepEqual(changedProgramme.inclusions, ["Custom manual inclusion"], "Programme replacement preserves user-edited inclusion content.");
  assert.equal(changedProgramme.fieldSources.inclusions, "Manual", "Manually populated inclusion content retains its manual source marker.");
  hydrated.days[0].description = "Long manual itinerary content\n\nSecond paragraph.";
  assert.equal(programme.routing[0].program_text, "Programme day 1", "Editing itinerary copy never mutates Programme Master.");

  const assetKey = `${hydrated.id}:banner:one`;
  hydrated.banner = { assetKey, name: "banner.webp", type: "image/webp", size: 12 };
  hydrated.title = "Wilderness Getaway from Bhopal";
  hydrated.code = "EXBHP03";
  hydrated.overview = "A manual package overview.";
  await store.saveItinerary(hydrated);
  await store.saveItineraryBanner(assetKey, new Blob(["banner-bytes"], { type: "image/webp" }));
  const restored = (await store.listItineraries())[0];
  assert.equal(restored.days[0].description, "Long manual itinerary content\n\nSecond paragraph.", "Draft persistence retains complete multiline descriptions.");
  assert.equal(restored.overview, "A manual package overview.", "Draft persistence retains the separate manual Overview.");
  assert.equal(restored.banner.assetKey, assetKey, "Only the banner asset reference is kept in the itinerary record.");
  assert.equal((await store.getItineraryBanner(assetKey)).type, "image/webp", "Banner binary is stored separately from record content.");
  const valid = store.itineraryValidation(restored, [programme]);
  assert.deepEqual(valid, [], "Publish validation passes only when required fields and canonical Programme are present.");
  assert.equal(store.bannerFileValidation({ type: "image/webp", size: 1024 }), undefined);
  assert.match(store.bannerFileValidation({ type: "image/gif", size: 1024 }), /JPG, PNG or WebP/);
  assert.match(store.bannerFileValidation({ type: "image/png", size: 5 * 1024 * 1024 + 1 }), /5 MB/);
  const portalPayload = store.toPortalPackagePayload(restored);
  assert.equal(portalPayload.itineraryId, restored.id);
  assert.equal(portalPayload.programmeId, programme.id === restored.programmeId ? programme.id : null);
  assert.equal(portalPayload.days[0].description, restored.days[0].description);
  assert.ok(store.itineraryValidation({ ...restored, programmeId: "not-a-real-id" }, [programme]).some((message) => message.includes("canonical Programme")));
  assert.ok(store.itineraryValidation({ ...restored, overview: "", banner: undefined }, [programme]).length >= 2);
  await store.removeItineraryBanner(assetKey);
  assert.equal(await store.getItineraryBanner(assetKey), undefined, "Replacing/removing the primary banner deletes only its own asset key.");

  const workbook = XLSX.utils.book_new();
  const addSheet = (name, rows) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  addSheet("Main Info", [["Title", "Workbook Wilderness"], ["Code", "EXBHP03"], ["Duration", "4 Nights / 5 Days"], ["Start City", "Bhopal"], ["End City", "Bhopal"], ["Overview", "Workbook overview"]]);
  addSheet("Included", [["Item"], ["Accommodation and transfers"]]);
  addSheet("Excluded", [["Item"], ["Airfare"]]);
  addSheet("Highlights", [["Highlight"], ["Bhimbetka rock shelters"]]);
  addSheet("Itineraries", [["Day", "Title", "Route / City", "Meals", "Description"], [1, "Arrival", "Bhopal → Bhimbetka", "Dinner", "First paragraph\n\nSecond paragraph"], [2, "Sanchi", "Bhopal → Sanchi", "Breakfast", "Visit the Stupa"]]);
  addSheet("Pricing", [["Category", "Price"], ["Source only", 12345]]);
  addSheet("Hotel Supplements", [["Hotel", "Supplement"], ["Example Hotel", 500]]);
  addSheet("Facts", [["Fact"], ["Nearest airport: Bhopal"]]);
  addSheet("Please Note", [["Note"], ["Carry valid identification"]]);
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const preview = importer.parseItineraryWorkbook(buffer, "EXBHP03.xlsx");
  assert.equal(preview.sheets.length, 9);
  assert.ok(preview.sheets.every((sheet) => sheet.status === "mapped"));
  assert.equal(preview.data.days.length, 2);
  assert.equal(preview.data.title, "Workbook Wilderness", "Two-column Main Info sheets are read as key/value pairs.");
  assert.equal(preview.data.days[0].description, "First paragraph\n\nSecond paragraph", "Long multiline workbook copy remains intact.");
  assert.deepEqual(preview.data.inclusions, ["Accommodation and transfers"]);
  assert.deepEqual(preview.data.exclusions, ["Airfare"]);
  assert.deepEqual(preview.data.highlights, ["Bhimbetka rock shelters"]);
  assert.equal(preview.sourcePricing.length, 1);
  assert.equal(preview.sourceHotelSupplements.length, 1);
  assert.equal(preview.data.fieldSources.nights, "Excel", "Imported duration is marked for preservation during Programme linking.");
  assert.equal(preview.data.fieldSources.startCity, "Excel", "Imported city fields are marked for preservation during Programme linking.");
  assert.equal(store.findImportDuplicate([hydrated], preview.data.importIdentity, preview.data.code), hydrated, "Reliable import identity/code detects duplicates without overwriting.");
  assert.equal(store.searchProgrammes([programme], "Bhopal" )[0].id, programme.id, "Programme search includes city and route fields.");
  assert.equal(store.explicitlySavedRoutingItineraries([hydrated]).length, 0, "Ordinary itinerary content is not listed as an explicit routing-master record.");
  assert.equal(
    store.explicitlySavedRoutingItineraries([{ ...hydrated, status: "Routing Saved" }]).length,
    0,
    "A legacy status label alone never makes a historical Programme selectable.",
  );

  const unpricedDraft = {
    ...store.newItinerary(undefined, "Test User"),
    ...preview.data,
    title: "Unpriced editable itinerary",
    code: "UNPRICED-1",
    programmeId: programme.id,
    programmeName: programme.name,
    programmeCode: programme.code,
    costingQuoteId: undefined,
    brochureVersionId: undefined,
  };
  await store.saveItinerary(unpricedDraft);
  const savedRecords = await store.listItineraries();
  assert.ok(savedRecords.some((item) => item.id === hydrated.id), "Existing itinerary IDs remain saved.");
  assert.ok(savedRecords.some((item) => item.id === unpricedDraft.id), "An itinerary draft persists without completed pricing.");
  assert.equal(savedRecords.find((item) => item.id === unpricedDraft.id).costingQuoteId, undefined);

  const routeCities = [
    { id: "route-agra", name: "Agra" },
    { id: "route-fatehpur", name: "Fatehpur Sikri" },
    { id: "route-mathura", name: "Mathura" },
  ];
  const routingRow = (day, from, to, overnight, extra = {}) => ({
    day,
    ...(day === 0 ? { is_day_zero: true } : {}),
    date: "",
    city_id: overnight ? routeCities.find((city) => city.name === overnight).id : "",
    to_city_id: routeCities.find((city) => city.name === to).id,
    to_city_ids: [routeCities.find((city) => city.name === to).id],
    from_city: from,
    to_city: to,
    program: `Day ${day} route`,
    program_mode: "text",
    overnight: Boolean(overnight),
    travel_by: "Road",
    ...extra,
  });
  const customDraft = {
    ...emptyDraft(),
    query_type: "B2B",
    program_mode: "new",
    program_id: undefined,
    program_name: "Customized Agra Tour",
    program_code: "AGRA004",
    new_program_name: "Customized Agra Tour",
    new_program_code: "AGRA004",
    save_program_as_new: true,
    nights: 3,
    categories: ["Heritage"],
    tour_start_city: "Agra",
    tour_end_city: "Agra",
    departure_city: "Agra",
    routing: [
      routingRow(0, "Agra", "Agra", undefined, { overnight: false, program: "Pre-tour arrival" }),
      routingRow(1, "Agra", "Fatehpur Sikri", "Agra", {
        to_city_ids: ["route-fatehpur"],
        tours_selected_by_city: { "route-fatehpur": ["Panch Mahal"] },
      }),
      routingRow(2, "Fatehpur Sikri", "Mathura", "Mathura"),
      routingRow(3, "Mathura", "Agra", "Agra"),
      routingRow(4, "Agra", "Agra", undefined, { overnight: false }),
    ],
  };
  const beforePrograms = programsStore.getPrograms();
  const beforeItineraries = await store.listItineraries();
  assert.deepEqual(routingSave.customizedRoutingSaveErrors(customDraft, routeCities, beforePrograms), []);
  assert.equal(programsStore.getPrograms().length, beforePrograms.length, "Validating/continuing with a customized route does not write Programme Master.");
  assert.equal((await store.listItineraries()).length, beforeItineraries.length, "Validating/continuing does not create an Itinerary Master record.");

  const originalSetItem = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = (key, value) => {
    if (key === "mp_tourism_programs") throw new DOMException("quota", "QuotaExceededError");
    return originalSetItem(key, value);
  };
  let savedRouting;
  try {
    savedRouting = await routingSave.saveCustomizedRoutingToItineraryMaster(
      customDraft,
      routeCities,
      "Test User",
      "QUOTE-DRAFT-AGRA-1",
    );
  } finally {
    globalThis.localStorage.setItem = originalSetItem;
  }
  assert.equal(savedRouting.program.id, "AGRA004", "Routing save succeeds even when legacy Programme localStorage is quota-blocked.");
  assert.equal(savedRouting.program.ending_city, "Agra");
  assert.equal(savedRouting.program.nights, 3);
  assert.equal(savedRouting.program.days, 4);
  assert.equal(savedRouting.itinerary.sourceQuotationId, "QUOTE-DRAFT-AGRA-1");
  assert.equal(savedRouting.itinerary.routingSnapshot.programmeId, savedRouting.program.id);
  assert.equal(savedRouting.itinerary.status, "Routing Saved");
  assert.equal(savedRouting.itinerary.days[0].day, 0, "Day 0 is retained without changing the duration count.");
  assert.ok(savedRouting.itinerary.days[1].route.includes("Fatehpur Sikri"), "Intermediate routing destinations are retained.");
  assert.equal(savedRouting.itinerary.days[1].travelMode, "Road");
  assert.ok(savedRouting.itinerary.days[1].tourTitles.includes("Panch Mahal"), "Selected Tour Titles are retained.");
  assert.equal(programsStore.getPrograms().length, beforePrograms.length, "Explicit routing save does not rewrite the legacy localStorage Programme collection.");
  assert.equal((await store.listItineraries()).length, beforeItineraries.length + 1);
  assert.equal(store.explicitlySavedRoutingItineraries([...beforeItineraries, savedRouting.itinerary]).length, 1, "Only the explicit routing save appears in the Master record set.");
  assert.deepEqual(
    (await store.listExplicitlySavedRoutingItineraries()).map((item) => item.programmeId),
    [savedRouting.program.id],
    "The active reusable-routing registry contains only the verified explicit-save Programme ID.",
  );
  await store.saveItinerary({
    ...savedRouting.itinerary,
    programmeId: "UNRELATED-EDIT",
    sourceQuotationId: "UNRELATED-QUOTE",
    routingSnapshot: { ...savedRouting.itinerary.routingSnapshot, programmeId: "UNRELATED-EDIT" },
    route: "Edited content route text",
    overview: "Builder content saved separately.",
  });
  const contentEditReadback = (await store.listItineraries()).find((item) => item.id === savedRouting.itinerary.id);
  assert.equal(contentEditReadback.programmeId, savedRouting.program.id, "Builder saves cannot replace the master Programme link.");
  assert.equal(contentEditReadback.sourceQuotationId, "QUOTE-DRAFT-AGRA-1", "Builder saves cannot replace the source quotation link.");
  assert.equal(contentEditReadback.routingSnapshot.programmeId, savedRouting.program.id, "Builder saves preserve the master routing snapshot.");
  assert.equal(contentEditReadback.overview, "Builder content saved separately.");
  draftsStore.upsertDraft(savedRouting.draft, "QUOTE-DRAFT-AGRA-1", "Customized Agra Tour");
  const resumedSavedDraft = draftsStore.getDraft("QUOTE-DRAFT-AGRA-1").wizard_state;
  assert.equal(resumedSavedDraft.program_id, savedRouting.program.id, "The quotation draft keeps the canonical Programme ID on resume.");
  assert.equal(resumedSavedDraft.customized_routing_itinerary_id, savedRouting.itinerary.id, "The saved Itinerary ID remains linked on resume.");

  const resumedDraft = resumedSavedDraft;
  const repeatedSave = await routingSave.saveCustomizedRoutingToItineraryMaster(
    resumedDraft,
    routeCities,
    "Test User",
    "QUOTE-DRAFT-AGRA-1",
  );
  assert.equal(repeatedSave.program.id, savedRouting.program.id, "Retry/refresh keeps the canonical Programme ID stable.");
  assert.equal(repeatedSave.itinerary.id, savedRouting.itinerary.id, "Retry/refresh reuses the linked Itinerary ID.");
  assert.equal(repeatedSave.programCreated, false);
  assert.equal(repeatedSave.itineraryCreated, false);
  assert.equal(programsStore.getPrograms().length, beforePrograms.length, "Repeated explicit saves do not rewrite the legacy Programme cache.");
  assert.equal((await store.listItineraries()).length, beforeItineraries.length + 1, "Repeated explicit saves do not duplicate Itineraries.");

  const existingSelection = { ...customDraft, program_mode: "existing", save_program_as_new: false };
  await assert.rejects(
    () => routingSave.saveCustomizedRoutingToItineraryMaster(existingSelection, routeCities, "Test User", "QUOTE-EXISTING"),
    /Enable saving|Select New Routing/i,
    "Selecting an existing Programme without explicit save never creates another Programme or Itinerary.",
  );
  assert.equal(programsStore.getPrograms().length, beforePrograms.length);
  assert.equal((await store.listItineraries()).length, beforeItineraries.length + 1);

  const loadedBrochureRoute = brochureProgram.routingFromProgramme(
    savedRouting.program,
    "",
    (name) => routeCities.find((city) => city.name === name)?.id || "",
  );
  assert.equal(loadedBrochureRoute[0].day, 0);
  assert.equal(loadedBrochureRoute[1].to_city_ids.length, 1);
  assert.equal(
    routingIdentity.draftRoutingFingerprint({ ...customDraft, routing: loadedBrochureRoute }, routeCities),
    routingIdentity.programmeRoutingFingerprint(savedRouting.program),
    "A future Brochure route hydrates to the same canonical routing identity for price-snapshot linking.",
  );

  // Regression: a routing saved in Itinerary Master must be the exact record
  // surfaced by Brochure Step 2, without reading the legacy Programme cache.
  const ujjainProgramme = {
    id: "EMP-002",
    code: "EMP-002",
    name: "UjjainSpecial",
    nights: 2,
    days: 3,
    duration_label: "2 Nights / 3 Days",
    routing_summary: "Indore → Ujjain → Omkareshwar → Indore",
    departure_city: "Indore",
    ending_city: "Indore",
    cities: ["Indore", "Ujjain", "Omkareshwar"],
    categories: [],
    routing: [
      { day: 1, from_city: "Indore", destination_city: "Ujjain", overnight_city: "Ujjain", to_cities: ["Ujjain"], travel_mode: "Road", tour_titles: ["Mahakaleshwar"], program_text: "Indore to Ujjain" },
      { day: 2, from_city: "Ujjain", destination_city: "Omkareshwar", overnight_city: "Omkareshwar", to_cities: ["Omkareshwar"], travel_mode: "Road", tour_titles: ["Omkareshwar Temple"], program_text: "Ujjain to Omkareshwar" },
      { day: 3, from_city: "Omkareshwar", destination_city: "Indore", overnight_city: null, to_cities: ["Indore"], travel_mode: "Road", tour_titles: ["Return"], program_text: "Omkareshwar to Indore" },
    ],
    source: "Quotation Builder",
    status: "Active",
    inclusions: [],
    exclusions: [],
  };
  const ujjainItinerary = {
    ...store.newItinerary(undefined, "EMP-002"),
    id: "routing-emp-002",
    title: "UjjainSpecial",
    code: "EMP-002",
    programmeId: "EMP-002",
    programmeName: "UjjainSpecial",
    programmeCode: "EMP-002",
    sourceQuotationId: "QUOTE-EMP-002",
    status: "Routing Saved",
    nights: 2,
    daysCount: 3,
    startCity: "Indore",
    endCity: "Indore",
    route: ujjainProgramme.routing_summary,
    routingSnapshot: {
      programmeId: "EMP-002",
      programmeName: "UjjainSpecial",
      programmeCode: "EMP-002",
      startCity: "Indore",
      endCity: "Indore",
      nights: 2,
      daysCount: 3,
      routingSummary: ujjainProgramme.routing_summary,
      routingFingerprint: "emp-002-indore-ujjain-omkareshwar-indore",
      routing: ujjainProgramme.routing,
      sourceQuotationId: "QUOTE-EMP-002",
      savedAt: new Date().toISOString(),
    },
  };
  await store.saveItinerary(ujjainItinerary);
  const brochureOptions = await store.listExplicitlySavedRoutingProgrammes();
  const ujjainOption = brochureOptions.find((item) => item.id === "EMP-002");
  assert.ok(ujjainOption, "A saved EMP-002 routing is visible to the Brochure Step 2 registry.");
  assert.equal(ujjainOption.code, "EMP-002");
  assert.equal(ujjainOption.name, "UjjainSpecial");
  assert.equal(`${ujjainOption.nights}N/${ujjainOption.days}D`, "2N/3D");
  assert.equal(ujjainOption.routing_summary, "Indore → Ujjain → Omkareshwar → Indore");
  const brochureSelection = brochureProgram.prepareBrochureProgrammeSelection(
    { ...emptyDraft(), query_type: "Brochure", tour_type: "Brochure", has_dates: false, pax_min: 1, pax_max: 40 },
    ujjainOption,
    (name) => ({ Indore: "city-indore", Ujjain: "city-ujjain", Omkareshwar: "city-omkareshwar" })[name] || "",
    true,
  );
  assert.equal(brochureSelection.status, "changed");
  const selectedBrochureDraft = brochureSelection.nextDraft;
  assert.equal(selectedBrochureDraft.program_id, ujjainItinerary.programmeId, "Itinerary Master and Brochure use the same canonical Programme ID.");
  assert.equal(selectedBrochureDraft.program_code, "EMP-002");
  assert.equal(selectedBrochureDraft.program_name, "UjjainSpecial");
  assert.equal(selectedBrochureDraft.nights, 2);
  assert.equal(selectedBrochureDraft.programme_days, 3);
  assert.equal(selectedBrochureDraft.tour_start_city, "Indore");
  assert.equal(selectedBrochureDraft.tour_end_city, "Indore");
  assert.equal(selectedBrochureDraft.routing.length, 3);
  assert.equal(selectedBrochureDraft.routing[0].to_city, "Ujjain");
  assert.equal(selectedBrochureDraft.routing[1].city_id, "city-omkareshwar");
  assert.equal(selectedBrochureDraft.routing[1].tour_title, "Omkareshwar Temple");
  draftsStore.upsertDraft(selectedBrochureDraft, "BROCHURE-EMP-002", "UjjainSpecial");
  const resumedBrochureDraft = draftsStore.getDraft("BROCHURE-EMP-002").wizard_state;
  assert.equal(resumedBrochureDraft.program_id, "EMP-002", "A saved Brochure draft retains its canonical Programme identity.");
  assert.deepEqual(resumedBrochureDraft.routing, selectedBrochureDraft.routing, "A saved Brochure draft retains the hydrated routing and tour selections on resume.");
  assert.equal(selectedBrochureDraft.has_dates, false, "The saved routing does not fabricate a specific departure date.");
  assert.equal(selectedBrochureDraft.brochure_validity_from, "");
  assert.equal(selectedBrochureDraft.brochure_validity_till, "");
  assert.equal(
    brochureValidation.brochureSellingValidityError(selectedBrochureDraft),
    "Brochure selling validity: enter both Valid From and Valid Till before saving the final pricing snapshot.",
    "Blank selling validity blocks final publication but is retained on the editable draft.",
  );
  assert.equal(
    brochureValidation.brochureSellingValidityError({ ...selectedBrochureDraft, query_type: "B2B" }),
    undefined,
    "The Brochure final-publication gate does not change B2B/B2C validation.",
  );

  const manualRoutingDraft = {
    ...customDraft,
    program_name: "Manual Agra Circuit",
    new_program_name: "Manual Agra Circuit",
    program_code: "MANUAL-AGRA-901",
    new_program_code: "MANUAL-AGRA-901",
  };
  const manualSaved = await routingSave.saveManualRoutingToItineraryMaster(manualRoutingDraft, routeCities, "Manual Test User");
  assert.equal(manualSaved.itinerary.sourceQuotationId, "", "Manual routing has no quotation link.");
  assert.equal(manualSaved.itinerary.routingSnapshot.sourceType, "manual", "Manual routing is explicitly identified without pretending to be a quote.");
  assert.equal(store.explicitlySavedRoutingItineraries([manualSaved.itinerary]).length, 1, "Manual routing is visible in the routing master only after explicit save.");
  assert.equal(manualSaved.itinerary.brochureVersionId, undefined, "Manual routing does not fabricate brochure pricing coverage.");
  const manualEdit = await routingSave.saveManualRoutingToItineraryMaster({ ...manualRoutingDraft, routing: manualRoutingDraft.routing.map((row) => row.day === 2 ? { ...row, program: "Edited manual day two" } : row) }, routeCities, "Manual Test User", manualSaved.itinerary.id);
  assert.equal(manualEdit.itinerary.id, manualSaved.itinerary.id, "Editing a manual routing retains its explicit itinerary record.");
  assert.notEqual(manualEdit.itinerary.routingFingerprint, manualSaved.itinerary.routingFingerprint, "Editing routing content regenerates the canonical fingerprint.");
  assert.equal(manualEdit.itinerary.brochureVersionId, undefined, "A changed manual routing does not retain old pricing eligibility.");
  assert.equal(
    store.explicitlySavedRoutingItineraries([{ ...manualSaved.itinerary, routingSnapshot: { ...manualSaved.itinerary.routingSnapshot, routing: manualSaved.itinerary.routingSnapshot.routing.slice(0, -1) } }]).length,
    0,
    "An incomplete saved-looking snapshot is never offered as a selectable Programme.",
  );
  assert.equal(
    store.explicitlySavedRoutingItineraries([{ ...manualSaved.itinerary, routingSnapshot: { ...manualSaved.itinerary.routingSnapshot, routingFingerprint: "" } }]).length,
    0,
    "A routing without a canonical fingerprint is never offered as a selectable Programme.",
  );
  await assert.rejects(
    () => routingSave.saveManualRoutingToItineraryMaster({ ...manualRoutingDraft, new_program_name: "Different programme under same code", program_name: "Different programme under same code" }, routeCities, "Manual Test User"),
    /already linked|already belongs/i,
    "Duplicate Programme Codes never overwrite an existing routing identity.",
  );

  const costingSource = await fs.readFile("src/routes/_authenticated/costing.tsx", "utf8");
  const stepFourSource = costingSource.slice(costingSource.indexOf("function Step4("), costingSource.indexOf("export function CustomizedRoutingEditor"));
  assert.match(stepFourSource, /listSavedItineraryRoutingProgrammes\(\)/, "New Quotation Step 4 reads only saved Itinerary Master routing snapshots.");
  assert.doesNotMatch(stepFourSource, /usePrograms\(|getPrograms\(/, "New Quotation Step 4 never falls back to the legacy Programme Master catalogue.");
  assert.match(stepFourSource, /No saved Itinerary Master routing available\./, "An empty saved-routing collection has an explicit no-fallback message.");
  assert.doesNotMatch(costingSource, /ensureProgramInMaster|addProgram\(/, "Ordinary Continue, draft autosave and Step 10 contain no shared Programme writer.");
  const continueSource = costingSource.slice(costingSource.indexOf("const go ="), costingSource.indexOf("const goNext ="));
  assert.doesNotMatch(continueSource, /saveCustomizedRoutingToItineraryMaster/, "Continue does not invoke explicit route persistence.");
  const stepThreeValidation = costingSource.slice(costingSource.indexOf("case 3:"), costingSource.indexOf("case 4:"));
  assert.match(stepThreeValidation, /if \(d\.query_type === "Brochure"\) return true;/, "A valid no-date Brochure draft can continue from Step 3 without selling validity dates.");
  assert.match(costingSource, /brochureSellingValidityError/, "Final Brochure publication keeps an explicit selling-validity gate.");

  try {
    const exampleBuffer = await fs.readFile("C:/Users/Acer/Downloads/EXBHP03.xlsx");
    const actualExample = importer.parseItineraryWorkbook(exampleBuffer.buffer.slice(exampleBuffer.byteOffset, exampleBuffer.byteOffset + exampleBuffer.byteLength), "EXBHP03.xlsx");
    assert.equal(actualExample.data.code, "EXBHP03");
    assert.equal(actualExample.data.title, "Wilderness Getaway from Bhopal");
    assert.equal(actualExample.data.daysCount, 5, "Actual workbook max_days maps to five itinerary days.");
    assert.equal(actualExample.data.days.length, 5);
    assert.ok(actualExample.data.route.includes("Satpura National Park"), "The full Main Info route expression remains intact.");
    assert.ok(actualExample.data.days.every((day) => day.description.length > 200), "All five long workbook day descriptions are retained.");
    assert.ok(actualExample.sourcePricing.some((row) => row.sourceSheet === "Main Info" && row.field === "amount"), "Main Info legacy amount remains source-only.");
    assert.equal(actualExample.sourceHotelSupplements.length > 0, true);
    console.log("EXBHP03 workbook verified: five narrative itinerary days, route retained, and source prices isolated.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    console.log("EXBHP03 workbook path unavailable; generated nine-sheet fixture used.");
  }

  console.log("Itinerary Master tests passed: explicit customized-route persistence, Continue isolation, idempotent retry, canonical Brochure routing identity, draft/banner persistence, workbook mapping and duplicate detection.");
} finally {
  await vite.close();
}
