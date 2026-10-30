import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });

try {
  const calc = await vite.ssrLoadModule("/src/lib/wizard/calc.ts");
  const costsheet = await vite.ssrLoadModule("/src/lib/wizard/costsheet.ts");
  const scenarioEngine = await vite.ssrLoadModule("/src/lib/wizard/scenario.ts");
  const types = await vite.ssrLoadModule("/src/lib/wizard/types.ts");
  const dateFormat = await vite.ssrLoadModule("/src/lib/format.ts");
  const dateReconciliation = dateFormat;
  const quoteBuilder = await vite.ssrLoadModule("/src/lib/wizard/build-saved-quote.ts");
  const draftStore = await vite.ssrLoadModule("/src/lib/wizard/store.ts");
  const namedDraftStore = await vite.ssrLoadModule("/src/lib/drafts-store.ts");
  const quoteStore = await vite.ssrLoadModule("/src/lib/quotes-store.ts");
  const validation = await vite.ssrLoadModule("/src/lib/wizard/validation.ts");
  const queryFor = await vite.ssrLoadModule("/src/lib/query-for.ts");
  const masterPricing = await vite.ssrLoadModule("/src/lib/mock-store.ts");
  const landEligibility = await vite.ssrLoadModule("/src/lib/wizard/land-eligibility.ts");
  const guidePricing = await vite.ssrLoadModule("/src/lib/wizard/guide-pricing.ts");
  const guideCosting = await vite.ssrLoadModule("/src/lib/wizard/guide-costing.ts");
  const dynamicReview = await vite.ssrLoadModule(
    "/src/components/quotation/AccommodationDynamicCostingReview.tsx",
  );
  const landDaywiseReview = await vite.ssrLoadModule(
    "/src/components/quotation/LandDaywiseReview.tsx",
  );
  const packageStandardReview = await vite.ssrLoadModule(
    "/src/components/quotation/PackageStandardCostingReview.tsx",
  );
  const landReview = await vite.ssrLoadModule("/src/lib/wizard/land-review.ts");
  const landPricing = await vite.ssrLoadModule("/src/lib/wizard/land-pricing.ts");
  const mealsStep = await vite.ssrLoadModule("/src/components/quotation/steps/StepMeals.tsx");
  const guideStep = await vite.ssrLoadModule("/src/components/quotation/steps/StepGuide.tsx");
  const hotelsStep = await vite.ssrLoadModule("/src/components/quotation/steps/StepHotels.tsx");
  const hotelAvailability = await vite.ssrLoadModule("/src/lib/wizard/hotel-availability.ts");
  const hotelRateLookup = await vite.ssrLoadModule("/src/lib/wizard/rate-lookup.ts");
  const queryFilters = await vite.ssrLoadModule("/src/components/crm/query-filters.tsx");

  const historicalQuery = {
    id: "excel_EMP26-27EMP0044",
    query_id: "EMP26-27EMP0044",
    lead_id: "LD-IMPORT-0044",
    created_at: "2026-04-09T03:30:00.000Z",
    customer: "Joshi Tours & Travels",
    contact_person: "Khusboo Soni",
    destination: "Madhya Pradesh",
    owner: "Bhumika Prajapati",
    program_name: "",
    mobile: "6394127091",
    email: "info@joshitours.org",
    stage: "Lost",
    travel_start: "2026-05-01",
    costing_basis: "FIT",
    travel_type: "FIT",
    priority: "Normal",
    followup_due: "",
  };
  const todayFilters = {
    search: "EMP26-27EMP0044",
    owner: "all",
    stage: "all",
    financialYear: "all",
    receivedMonths: [],
    dateFrom: "2026-10-28",
    dateTo: "2026-10-28",
    travelMonth: "all",
    customer: "all",
    costingBasis: "all",
    priority: "all",
    dueWindow: "all",
  };
  assert.deepEqual(
    queryFilters.filterCrmQueries(
      [historicalQuery],
      todayFilters,
      new Date("2026-10-28T06:00:00Z"),
    ),
    [historicalQuery],
    "exact CRM Query ID search bypasses only the received-date scope",
  );
  assert.deepEqual(
    queryFilters.filterCrmQueries(
      [historicalQuery],
      { ...todayFilters, search: "Joshi Tours" },
      new Date("2026-10-28T06:00:00Z"),
    ),
    [],
    "ordinary searches still honor the Today received-date filter",
  );
  assert.deepEqual(
    queryFilters.filterCrmQueries(
      [historicalQuery],
      { ...todayFilters, stage: "Won" },
      new Date("2026-10-28T06:00:00Z"),
    ),
    [],
    "exact ID lookup does not bypass non-date filters or access scope",
  );

  const categoryReset = hotelsStep.categoryChangePatch("3 Star", ["Breakfast"]);
  assert.deepEqual(
    categoryReset,
    {
      category: "3 Star",
      label: "3 Star",
      inclusions: ["Breakfast"],
      selections: [],
      rate_overrides: {},
      dynamic_allocations: {},
    },
    "changing a hotel option category clears only its dependent hotel and rate state",
  );
  const inclusionSummaryDraft = {
    routing: [
      { day: 1, city_id: "city-1", overnight: true },
      { day: 2, city_id: "city-2", overnight: true },
      { day: 3, city_id: "city-2", overnight: false },
    ],
  };
  const inclusionOptionA = {
    key: "A",
    label: "3 Star",
    category: "3 Star",
    inclusions: ["Accommodation on twin sharing", "All applicable taxes"],
    selections: [
      {
        routing_day: 1,
        city_id: "city-1",
        hotel_id: "hotel-1",
        room_id: "room-1",
        meal_plan: "CP",
      },
      {
        routing_day: 2,
        city_id: "city-2",
        hotel_id: "hotel-2",
        room_id: "room-2",
        meal_plan: "AP",
      },
    ],
  };
  assert.deepEqual(
    hotelsStep.optionInclusionSummary(inclusionSummaryDraft, inclusionOptionA),
    { nights: 2, breakfasts: 2, lunches: 1, dinners: 1, taxes: "Applicable" },
    "Option inclusion summary reflects its resolved nightly stays and meal plans",
  );
  assert.deepEqual(
    hotelsStep.optionInclusionSummary(inclusionSummaryDraft, {
      ...inclusionOptionA,
      key: "B",
      inclusions: [],
      selections: [],
    }),
    { nights: 0, breakfasts: 0, lunches: 0, dinners: 0, taxes: "—" },
    "Option inclusion summaries remain independent",
  );
  const accommodationSchedule = hotelsStep.accommodationScheduleRows([
    { day: 0, is_day_zero: true, date: "2026-09-21", city_id: "city-1", overnight: false },
    { day: 1, date: "2026-09-22", city_id: "city-1", overnight: true },
    { day: 2, date: "2026-09-23", city_id: "city-2", overnight: true },
    { day: 3, date: "2026-09-24", city_id: "", overnight: false },
  ]);
  assert.equal(accommodationSchedule[0].is_day_zero, true, "Accommodation shows Day 0");
  assert.equal(
    accommodationSchedule.at(-1).is_departure,
    true,
    "Accommodation shows the last departure day",
  );
  assert.equal(
    accommodationSchedule.filter((row) => row.is_booked_night).length,
    2,
    "Informational Day 0 and departure rows do not create extra hotel nights",
  );
  const overnightDayZeroSchedule = hotelsStep.accommodationScheduleRows([
    { day: 0, is_day_zero: true, date: "2026-09-21", city_id: "city-1", overnight: true },
    { day: 1, date: "2026-09-22", city_id: "city-1", overnight: true },
    { day: 2, date: "2026-09-23", city_id: "", overnight: false },
  ]);
  assert.equal(
    overnightDayZeroSchedule.filter((row) => row.is_booked_night).length,
    2,
    "Day 0 counts only after Routing explicitly marks it as an overnight stay",
  );

  const hotelCities = [{ id: "hotel-city-ujjain", name: " Ujjain " }];
  const destinationCities = [{ id: "destination-city-ujjain", name: "UJJAIN" }];
  assert.deepEqual(
    hotelAvailability.resolveAccommodationCity(
      { city_id: "", to_city: "  ujjain  " },
      hotelCities,
      destinationCities,
    ),
    hotelCities[0],
    "text-only Ujjain routing resolves to the canonical Hotels city",
  );
  assert.deepEqual(
    hotelAvailability.resolveAccommodationCity(
      { city_id: "destination-city-ujjain" },
      hotelCities,
      destinationCities,
    ),
    hotelCities[0],
    "destination IDs resolve to the matching Hotels city without changing hotel IDs",
  );
  assert.deepEqual(
    hotelAvailability.resolveAccommodationCity(
      { city_id: "omkareshwar", to_city: "Ujjain" },
      [...hotelCities, { id: "omkareshwar", name: "Omkareshwar" }],
      destinationCities,
    ),
    { id: "omkareshwar", name: "Omkareshwar" },
    "accommodation follows the overnight city ID rather than a different sightseeing destination",
  );
  assert.equal(
    hotelAvailability.resolveAccommodationCity(
      { city_id: "hotel-city-ujjain", to_city: "Omkareshwar" },
      [...hotelCities, { id: "omkareshwar", name: "Omkareshwar" }],
      destinationCities,
    )?.id,
    "hotel-city-ujjain",
    "the canonical overnight city ID takes precedence over sightseeing destination text",
  );
  assert.equal(
    hotelAvailability.normalizeHotelLookupValue("  3   STAR "),
    hotelAvailability.normalizeHotelLookupValue("3 Star"),
    "hotel categories compare case-insensitively with repeated whitespace normalized",
  );
  const savedUjjainHotels = [
    { id: "perfectstayz", city_id: "hotel-city-ujjain", hotel_category: " 3  Star " },
    { id: "playotel", city_id: "hotel-city-ujjain", hotel_category: "3 Star" },
    { id: "radisson", city_id: "hotel-city-ujjain", hotel_category: "5 Star" },
    { id: "om-hotel", city_id: "omkareshwar", hotel_category: "3 Star" },
    { id: "other-city", city_id: "indore", hotel_category: "3 Star" },
  ];
  const availability = hotelAvailability.hotelsForAccommodation(
    savedUjjainHotels,
    " ujjain ",
    "3 Star",
    [...hotelCities, { id: "omkareshwar", name: "Omkareshwar" }, { id: "indore", name: "Indore" }],
    destinationCities,
  );
  assert.deepEqual(
    availability.inCategory.map((hotel) => hotel.id),
    ["perfectstayz", "playotel"],
    "a saved Ujjain 3 Star hotel is available to costing without hardcoded hotel names",
  );
  const savedRooms = [
    { id: "deluxe-room", hotel_id: "perfectstayz", name: "Deluxe Room" },
    { id: "play-room", hotel_id: "playotel", name: "Premium Room" },
    { id: "radisson-room", hotel_id: "radisson", name: "Superior Room" },
    { id: "om-room", hotel_id: "om-hotel", name: "Deluxe Room" },
  ];
  const savedRates = [
    {
      id: "ujjain-cp-rate",
      room_category_id: "deluxe-room",
      meal_plan: "CP",
      validity_start: "2026-10-01",
      validity_end: "2026-11-30",
      single_rate: 3200,
      double_rate: 4000,
      extra_bed_rate: 1000,
    },
    ...[
      ["play-rate", "play-room", 4200],
      ["radisson-rate", "radisson-room", 8500],
      ["om-rate", "om-room", 3600],
    ].map(([id, room_category_id, double_rate]) => ({
      id,
      room_category_id,
      meal_plan: "CP",
      validity_start: "2026-10-01",
      validity_end: "2026-11-30",
      single_rate: Number(double_rate) - 500,
      double_rate: Number(double_rate),
      extra_bed_rate: 1000,
    })),
  ];
  const availableRooms = savedRooms.filter(
    (room) => room.hotel_id === availability.inCategory[0].id,
  );
  assert.deepEqual(
    availableRooms.map((room) => room.id),
    ["deluxe-room"],
    "the selected stable hotel ID loads its saved room categories",
  );
  assert.deepEqual(
    hotelRateLookup.availableMealPlans(savedRates, "deluxe-room", "2026-10-26"),
    ["CP"],
    "the selected room loads its date-valid meal plans",
  );
  assert.equal(
    hotelRateLookup.findRatePlan(savedRates, "deluxe-room", "CP", "2026-10-26")?.double_rate,
    4000,
    "the selected room and meal plan load the correct persisted rate",
  );
  assert.equal(
    hotelRateLookup.findRatePlan(
      [{ ...savedRates[0], validity_start: "2026-11-01", validity_end: "2027-03-31" }],
      "deluxe-room",
      "CP",
      "2026-10-19",
    ),
    null,
    "October travel is not incorrectly covered by a November-starting season",
  );
  const winterLabelButOctoberRate = {
    ...savedRates[0],
    season_label: "Winter",
    validity_start: "01-10-2026",
    validity_end: "31-03-2027",
  };
  assert.equal(
    hotelRateLookup.findRatePlan([winterLabelButOctoberRate], "deluxe-room", "CP", "19-10-2026")
      ?.double_rate,
    4000,
    "a Winter-labelled rate is available when its saved October validity date applies",
  );
  for (const date of ["2026-10-01", "2026-10-20", "2027-03-31"]) {
    assert.ok(hotelRateLookup.ratePlanMatchesDate(winterLabelButOctoberRate, date));
  }
  assert.ok(!hotelRateLookup.ratePlanMatchesDate(winterLabelButOctoberRate, "2027-04-01"));
  const historicalStartRate = {
    ...savedRates[0],
    validity_start: "01-01-2025",
    validity_end: "25-11-2026",
  };
  const currentRangeRate = {
    ...savedRates[0],
    validity_start: "25-10-2026",
    validity_end: "25-11-2026",
  };
  assert.ok(hotelRateLookup.ratePlanMatchesDate(currentRangeRate, "2026-10-27"));
  assert.ok(hotelRateLookup.ratePlanMatchesDate(currentRangeRate, "2026-11-15"));
  assert.ok(!hotelRateLookup.ratePlanMatchesDate(currentRangeRate, "2026-10-19"));
  assert.ok(hotelRateLookup.ratePlanMatchesDate(historicalStartRate, "2026-10-19"));
  assert.ok(!hotelRateLookup.ratePlanMatchesDate(currentRangeRate, "2026-11-26"));
  const manualOnlyPlan = calc.applyRateOverride(null, {
    sgl: 4200,
    dbl: 5200,
    trp: 6500,
    reason: "Supplier rate confirmed for this quotation",
    changed_by: "Audit User",
    changed_at: "2026-10-01T00:00:00.000Z",
  });
  assert.equal(manualOnlyPlan?.single_rate, 4200);
  assert.equal(manualOnlyPlan?.double_rate, 5200);
  assert.equal(manualOnlyPlan?.double_rate + manualOnlyPlan?.extra_bed_rate, 6500);
  assert.equal(
    calc.applyRateOverride(null, undefined),
    null,
    "A missing master rate remains missing unless an authorized manual rate is entered",
  );
  const overlappingSeasons = [
    {
      ...savedRates[0],
      season_label: "Winter",
      validity_start: "2026-10-01",
      validity_end: "2026-11-30",
    },
    {
      ...savedRates[0],
      season_label: "Special Event",
      validity_start: "2026-10-20",
      validity_end: "2026-10-30",
      updated_at: "2099-01-01",
    },
  ];
  assert.equal(
    hotelRateLookup.findRatePlan(overlappingSeasons, "deluxe-room", "CP", "2026-10-26"),
    null,
    "overlapping distinct seasons remain unavailable rather than picking the newest record",
  );
  assert.equal(
    hotelRateLookup.findRatePlan(
      [{ ...savedRates[0], single_rate: 0, double_rate: 0 }],
      "deluxe-room",
      "CP",
      "2026-10-26",
    ),
    null,
    "a date-matching row with no valid occupancy price is unavailable, not a zero tariff",
  );
  const legacyHotelSelection = {
    city_id: "destination-city-ujjain",
    routing_day: 1,
    hotel_id: "perfectstayz",
    room_id: "deluxe-room",
    meal_plan: "CP",
  };
  assert.equal(
    types.hotelSelectionForDay(
      { selections: [legacyHotelSelection] },
      { day: 1, city_id: "destination-city-ujjain" },
    ),
    legacyHotelSelection,
    "canonical city repair preserves an existing selection by its stable routing day",
  );
  const staleCitySelection = {
    city_id: "stale-city-id",
    routing_day: 1,
    hotel_id: "perfectstayz",
    room_id: "deluxe-room",
    meal_plan: "CP",
  };
  assert.equal(
    types.hotelSelectionForDay(
      { selections: [staleCitySelection] },
      {
        day: 1,
        city_id: "stale-city-id",
        to_city_id: "hotel-city-ujjain",
        to_city_ids: ["hotel-city-ujjain"],
        to_city: "Ujjain",
      },
    ),
    staleCitySelection,
    "legacy stale city IDs still resolve when the displayed destination resolves to the same canonical city",
  );
  const hotelCityDirectory = [
    ...hotelCities,
    { id: "omkareshwar", name: "Omkareshwar" },
    { id: "indore", name: "Indore" },
  ];
  const ujjainCurrent = hotelAvailability.diagnoseHotelAvailability(
    savedUjjainHotels,
    savedRooms,
    savedRates,
    "Ujjain",
    "3 Star",
    "2026-10-19",
    hotelCityDirectory,
    destinationCities,
  );
  assert.equal(ujjainCurrent.finalDropdownCount, 2, "Ujjain 3 Star lists both saved hotels");
  assert.equal(ujjainCurrent.validForDate, 2, "both Ujjain 3 Star hotels have current rates");
  assert.equal(
    hotelAvailability.diagnoseHotelAvailability(
      savedUjjainHotels,
      savedRooms,
      savedRates,
      "Ujjain",
      "5 Star",
      "2026-10-19",
      hotelCityDirectory,
      destinationCities,
    ).finalDropdownCount,
    1,
    "Ujjain 5 Star includes Radisson when its inventory is applicable",
  );
  assert.equal(
    hotelAvailability.diagnoseHotelAvailability(
      savedUjjainHotels,
      savedRooms,
      savedRates,
      "Omkareshwar",
      "3 Star",
      "2026-10-19",
      hotelCityDirectory,
      destinationCities,
    ).finalDropdownCount,
    1,
    "Omkareshwar 3 Star availability remains intact",
  );
  const blackoutHotel = {
    ...savedUjjainHotels[0],
    blackout_ranges: [{ from: "2026-10-19", to: "2026-10-20" }],
  };
  const blackoutReport = hotelAvailability.diagnoseHotelAvailability(
    [blackoutHotel],
    savedRooms,
    savedRates,
    "Ujjain",
    "3 Star",
    "2026-10-19",
    hotelCityDirectory,
    destinationCities,
  );
  assert.equal(
    blackoutReport.finalDropdownCount,
    1,
    "a blackout does not hide an otherwise matching hotel",
  );
  assert.equal(blackoutReport.validForDate, 0, "a blackout prevents pricing for the selected date");
  assert.equal(
    hotelAvailability.diagnoseHotelAvailability(
      savedUjjainHotels,
      savedRooms,
      savedRates,
      "Ujjain",
      "3 Star",
      "2027-10-19",
      hotelCityDirectory,
      destinationCities,
    ).validForDate,
    0,
    "expired rate plans are not repeated into a later year",
  );
  const invalidDate = hotelAvailability.diagnoseHotelAvailability(
    savedUjjainHotels,
    savedRooms,
    savedRates,
    "Ujjain",
    "3 Star",
    "2026-12-15",
    hotelCityDirectory,
    destinationCities,
  );
  assert.equal(invalidDate.finalDropdownCount, 2, "missing pricing does not hide real hotels");
  assert.equal(invalidDate.validForDate, 0, "invalid travel dates are reported as unpriced");
  assert.match(
    invalidDate.details.find((hotel) => hotel.id === "playotel").rejectionReason,
    /rate/,
  );

  const mealCities = [
    { id: "indore", name: "Indore" },
    { id: "ujjain", name: "Ujjain" },
    { id: "omkareshwar", name: "Omkareshwar" },
  ];
  const mealRoute = (day, from, to, overnight = true) => ({
    day,
    date: `2026-10-${String(day).padStart(2, "0")}`,
    from_city: from,
    to_city_id: to,
    to_city_ids: [to],
    city_id: to,
    to_city: mealCities.find((city) => city.id === to)?.name,
    program: "",
    program_mode: "text",
    overnight,
  });
  assert.deepEqual(mealsStep.mealCitiesForDay(mealRoute(1, "Indore", "ujjain"), mealCities), [
    "indore",
    "ujjain",
  ]);
  assert.deepEqual(mealsStep.mealCitiesForDay(mealRoute(2, "ujjain", "omkareshwar"), mealCities), [
    "ujjain",
    "omkareshwar",
  ]);
  assert.deepEqual(
    mealsStep.mealCitiesForDay(mealRoute(3, "omkareshwar", "indore", false), mealCities),
    ["omkareshwar", "indore"],
  );
  const lunchAtUjjain = mealsStep.updateMealSelection({}, 1, "ujjain", "lunch");
  const independentDinner = mealsStep.updateMealSelection(lunchAtUjjain, 1, "indore", "dinner");
  assert.equal(independentDinner["1:ujjain"].lunch.source, "none");
  assert.equal(independentDinner["1:indore"].dinner.source, "none");

  const packageScope = queryFor.getQuotationScope("Package");
  const landScope = queryFor.getQuotationScope("Land Part");
  const landMealsScope = queryFor.getQuotationScope("Land Part + Meals");
  const accommodationScope = queryFor.getQuotationScope("Accommodation Part");
  assert.deepEqual(packageScope.workflowSteps, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(packageScope.program, true);
  assert.equal(packageScope.routing, true);
  assert.equal(packageScope.landPart, true);
  assert.equal(packageScope.accommodationPart, true);
  assert.deepEqual(landScope.workflowSteps, [1, 2, 3, 4, 5, 6, 7, 9, 10]);
  assert.equal(landScope.routing, true, "Land Part still requires Routing");
  assert.equal(landScope.landPart, true);
  assert.equal(landScope.accommodationPart, false);
  assert.deepEqual(landMealsScope.workflowSteps, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(landMealsScope.landPart, true);
  assert.equal(landMealsScope.mealsPart, true);
  assert.equal(landMealsScope.accommodationPart, false);
  assert.deepEqual(accommodationScope.workflowSteps, [1, 2, 3, 5, 6, 8, 9, 10]);
  assert.equal(accommodationScope.program, false);
  assert.equal(accommodationScope.routing, true, "Accommodation Part requires Routing context");
  assert.equal(accommodationScope.landPart, false);
  assert.equal(accommodationScope.accommodationPart, true);
  assert.equal(queryFor.nextQuotationStep(3, accommodationScope.workflowSteps), 5);
  assert.equal(queryFor.nextQuotationStep(5, accommodationScope.workflowSteps), 6);
  assert.equal(queryFor.nextQuotationStep(6, accommodationScope.workflowSteps), 8);
  assert.equal(queryFor.previousQuotationStep(8, accommodationScope.workflowSteps), 6);
  assert.equal(queryFor.previousQuotationStep(6, accommodationScope.workflowSteps), 5);
  assert.equal(queryFor.nextQuotationStep(6, landScope.workflowSteps), 7);
  assert.equal(queryFor.nextQuotationStep(7, landScope.workflowSteps), 9);
  assert.equal(queryFor.nextQuotationStep(6, packageScope.workflowSteps), 7);
  assert.equal(queryFor.nextQuotationStep(7, packageScope.workflowSteps), 8);
  assert.equal(queryFor.previousQuotationStep(9, packageScope.workflowSteps), 8);
  assert.equal(queryFor.resolveQuotationStep(7, accommodationScope.workflowSteps), 8);

  const now = "2026-09-22T00:00:00.000Z";
  const db = {
    cities: [{ id: "city-1", name: "Indore" }],
    hotels: [
      {
        id: "hotel-1",
        city_id: "city-1",
        name: "Audit Hotel",
        hotel_category: "3 Star Deluxe",
        contact_name: "",
        contact_phone: "",
        email: "",
        has_wifi: true,
        has_pool: false,
        address: "",
        created_at: now,
        updated_at: now,
      },
    ],
    room_categories: [{ id: "room-1", hotel_id: "hotel-1", name: "Deluxe", created_at: now }],
    rate_plans: [
      {
        id: "rate-1",
        room_category_id: "room-1",
        validity_start: "2026-01-01",
        validity_end: "2026-12-31",
        season_label: "Audit",
        meal_plan: "CP",
        double_rate: 4000,
        single_rate: 3000,
        quad_rate: 7000,
        extra_bed_rate: 1000,
        lunch_rate: 200,
        dinner_rate: 300,
        created_at: now,
        updated_at: now,
      },
      {
        id: "rate-map",
        room_category_id: "room-1",
        validity_start: "2026-01-01",
        validity_end: "2026-12-31",
        season_label: "Audit",
        meal_plan: "MAP",
        double_rate: 4000,
        single_rate: 3000,
        quad_rate: 7000,
        extra_bed_rate: 1000,
        lunch_rate: 200,
        dinner_rate: 300,
        created_at: now,
        updated_at: now,
      },
      {
        id: "rate-ap",
        room_category_id: "room-1",
        validity_start: "2026-01-01",
        validity_end: "2026-12-31",
        season_label: "Audit",
        meal_plan: "AP",
        double_rate: 4000,
        single_rate: 3000,
        quad_rate: 7000,
        extra_bed_rate: 1000,
        lunch_rate: 200,
        dinner_rate: 300,
        created_at: now,
        updated_at: now,
      },
    ],
    quotes: [],
    miscellaneous_items: [
      {
        id: "misc-master",
        name: "Permit",
        description: "",
        rate: 500,
        unit: "fixed",
        pricing_type: "fixed",
        is_active: true,
        created_at: now,
      },
      {
        id: "amenities",
        name: "Basic Amenities Kit",
        description: "",
        rate: 100,
        unit: "per_person",
        pricing_type: "per_person",
        is_active: true,
        created_at: now,
      },
      {
        id: "wet-tissues",
        name: "M'Water & Wet Tissues",
        description: "",
        rate: 600,
        unit: "per_person",
        pricing_type: "per_person",
        is_active: true,
        created_at: now,
      },
      {
        id: "inactive-misc",
        name: "Inactive",
        description: "",
        rate: 999,
        unit: "per_person",
        pricing_type: "per_person",
        is_active: false,
        created_at: now,
      },
    ],
    entrance_cities: [],
    entrance_sites: [
      {
        id: "site-1",
        city_id: "city-1",
        site_name: "Monument",
        description: "",
        indian_rate: 100,
        foreigner_rate: 500,
        student_rate: 50,
        is_active: true,
        created_at: now,
      },
    ],
    activity_destinations: [{ id: "ad-1", name: "Indore", created_at: now }],
    activities: [
      {
        id: "activity-master",
        destination_id: "ad-1",
        activity_name: "Audit Activity",
        description: "",
        pricing_type: "per_person",
        slab_pricing_type: "per_person",
        price: 1000,
        unit_label: "per person",
        is_active: true,
        created_at: now,
      },
    ],
    guides: [
      {
        id: "guide-master",
        name: "Audit Guide",
        guide_type: "English Guide - Local",
        destination: "Indore",
        rate_per_day: 1000,
        description: "",
        is_active: true,
        created_at: now,
        rate_1_to_5: 1000,
        rate_6_to_14: 1500,
        rate_15_plus: 2000,
        languages: ["English"],
      },
    ],
    guide_cities: [],
    destination_cities: [],
    destination_tours: [],
    travel_options: [
      {
        id: "small",
        vehicle_type: "Small Car",
        description: "",
        capacity_persons: 4,
        min_pax: 1,
        max_pax: 4,
        rate_per_day: 0,
        rate_per_km: 0,
        is_active: true,
        created_at: now,
      },
      {
        id: "large",
        vehicle_type: "Large Vehicle",
        description: "",
        capacity_persons: 10,
        min_pax: 5,
        max_pax: 10,
        rate_per_day: 0,
        rate_per_km: 0,
        is_active: true,
        created_at: now,
      },
    ],
    restaurants: [],
  };

  // Finalized routing is authoritative even when no Programme is selected.
  // Operational city IDs and Destination master city IDs intentionally differ.
  const landDb = structuredClone(db);
  landDb.destination_cities = [{ id: "destination-city-1", name: "Indore", created_at: now }];
  landDb.destination_tours = [
    {
      id: "tour-1",
      city_id: "destination-city-1",
      title: "Audit - Tour Fort",
      created_at: now,
    },
  ];
  landDb.entrance_sites = [
    {
      ...landDb.entrance_sites[0],
      city_id: "destination-city-1",
      tour_id: "tour-1",
    },
  ];
  landDb.guides = [{ ...landDb.guides[0], city: "Indore", tour_id: "tour-1" }];
  const selectedRoute = {
    day: 1,
    date: now.slice(0, 10),
    city_id: "city-1",
    to_city_id: "city-1",
    to_city_ids: ["city-1"],
    from_city: "Indore",
    to_city: "Indore",
    program: "Custom routing",
    program_mode: "text",
    overnight: true,
    tours_selected_by_city: { "city-1": ["Audit - Tour Fort"] },
    tour_ids_by_city: { "city-1": ["tour-1"] },
  };
  const noProgramDraft = { ...types.emptyDraft(), routing: [selectedRoute] };
  assert.equal(noProgramDraft.program_id, undefined, "Land eligibility fixture has no Programme");
  assert.deepEqual(
    landEligibility.landDayContext(noProgramDraft, selectedRoute, landDb).tourIds,
    ["tour-1"],
    "No Programme + selected routing Tour resolves the Tour master ID",
  );
  assert.deepEqual(
    landEligibility
      .eligibleEntrancesForDay(noProgramDraft, selectedRoute, landDb)
      .map((row) => row.id),
    ["site-1"],
    "Selected Tour ID resolves Entrance eligibility across city ID namespaces",
  );
  assert.deepEqual(
    landEligibility
      .eligibleGuidesForDay(noProgramDraft, selectedRoute, landDb)
      .map((row) => row.id),
    ["guide-master"],
    "Selected Tour ID resolves Guide eligibility",
  );
  assert.deepEqual(
    landEligibility
      .eligibleActivitiesForDay(noProgramDraft, selectedRoute, landDb)
      .map((row) => row.id),
    ["activity-master"],
    "Selected Tour destination resolves Activity eligibility",
  );
  const dayZeroNoTourRoute = {
    ...selectedRoute,
    day: 0,
    is_day_zero: true,
    tours_selected_by_city: undefined,
    tour_ids_by_city: undefined,
    tour_titles_by_city: undefined,
    tour_title: undefined,
  };
  const dayZeroNoTourDraft = { ...types.emptyDraft(), routing: [dayZeroNoTourRoute] };
  assert.deepEqual(
    landEligibility.eligibleEntrancesForDay(dayZeroNoTourDraft, dayZeroNoTourRoute, landDb),
    [],
    "Day 0 without a selected Routing tour does not auto-populate city entrances",
  );
  assert.deepEqual(
    landEligibility.eligibleGuidesForDay(dayZeroNoTourDraft, dayZeroNoTourRoute, landDb),
    [],
    "Day 0 without a selected Routing tour does not auto-populate city guides",
  );
  assert.deepEqual(
    landEligibility.eligibleActivitiesForDay(dayZeroNoTourDraft, dayZeroNoTourRoute, landDb),
    [],
    "Day 0 without a selected Routing tour does not auto-populate city activities",
  );
  const explicitlyAddedDayZeroActivity = {
    ...dayZeroNoTourDraft,
    activities: [
      {
        id: "explicit-day-zero-activity",
        activity_id: "activity-master",
        qty: 2,
        rate: 100,
        independent_day_zero: true,
        from_routing_days: [0],
      },
    ],
  };
  assert.deepEqual(
    landEligibility
      .eligibleActivitiesForDay(explicitlyAddedDayZeroActivity, dayZeroNoTourRoute, landDb)
      .map((activity) => activity.id),
    ["activity-master"],
    "Explicitly added independent Day 0 activities remain eligible",
  );
  assert.equal(
    landEligibility.isSelectedLandServiceValid(
      "activity",
      "activity-master",
      0,
      dayZeroNoTourDraft,
      landDb,
    ),
    false,
    "Legacy unmarked city-wide Day 0 activity is excluded from active costing for reselection",
  );
  const dayZeroSelectedTour = { ...selectedRoute, day: 0, is_day_zero: true };
  const dayZeroSelectedTourDraft = { ...types.emptyDraft(), routing: [dayZeroSelectedTour] };
  assert.deepEqual(
    landEligibility
      .eligibleEntrancesForDay(dayZeroSelectedTourDraft, dayZeroSelectedTour, landDb)
      .map((row) => row.id),
    ["site-1"],
    "Explicitly selected Day 0 tour resolves its mapped Entrance source ID",
  );
  const manduDb = structuredClone(landDb);
  manduDb.cities.push({ id: "city-mandu", name: "Mandu" });
  manduDb.destination_cities.push({ id: "destination-city-mandu", name: "Mandu", created_at: now });
  manduDb.activity_destinations.push({ id: "activity-destination-mandu", name: "Mandu" });
  manduDb.activities.push({
    ...manduDb.activities[0],
    id: "activity-mandu",
    destination_id: "activity-destination-mandu",
    activity_name: "Mandu Activity",
  });
  const manduRoute = {
    ...selectedRoute,
    to_city_ids: ["city-mandu", "city-1"],
  };
  const manduDraft = {
    ...types.emptyDraft(),
    routing: [manduRoute],
    activities: [
      {
        id: "activity-line-mandu",
        activity_id: "activity-mandu",
        qty: 1,
        rate: 500,
        pricing_mode: "slab",
        inclusion_status: "included",
        from_routing_days: [1],
      },
    ],
  };
  assert.equal(
    landEligibility.isSelectedLandServiceValid(
      "activity",
      "activity-mandu",
      1,
      manduDraft,
      manduDb,
    ),
    true,
    "Selected Mandu activity remains eligible when Mandu is an intermediate city",
  );
  assert.equal(
    landEligibility.isSelectedLandServiceValid("guide", "guide-master", 1, noProgramDraft, landDb),
    true,
    "Selected Guide remains valid while its Tour is selected",
  );
  const removedTourDraft = structuredClone(noProgramDraft);
  removedTourDraft.routing[0].tours_selected_by_city["city-1"] = [];
  removedTourDraft.routing[0].tour_ids_by_city["city-1"] = [];
  assert.equal(
    landEligibility.isSelectedLandServiceValid(
      "guide",
      "guide-master",
      1,
      removedTourDraft,
      landDb,
    ),
    false,
    "Selected Guide becomes invalid when its Tour is removed",
  );
  const legacyRoute = {
    ...selectedRoute,
    tours_selected_by_city: { "city-1": ["  AUDIT—TOUR (FORT) "] },
  };
  delete legacyRoute.tour_ids_by_city;
  const legacyDraft = { ...types.emptyDraft(), routing: [legacyRoute] };
  assert.deepEqual(
    landEligibility.landDayContext(legacyDraft, legacyRoute, landDb).tourIds,
    ["tour-1"],
    "Legacy tour titles resolve after safe punctuation and whitespace normalization",
  );

  const escortDraft = {
    ...types.emptyDraft(),
    escort_enabled: true,
    escort_pricing_mode: "pax_range",
    routing: [selectedRoute, { ...selectedRoute, day: 2 }],
    escort_ranges: [
      { id: "escort-1-15", min_pax: 1, max_pax: 15, escort_type: "English", charge: 0 },
      { id: "escort-16-25", min_pax: 16, max_pax: 25, escort_type: "English", charge: 0 },
    ],
    escort_day_rates_by_slab: {
      1: { "escort-1-15": 2000, "escort-16-25": 3000 },
      2: { "escort-1-15": 2500, "escort-16-25": 3500 },
    },
  };
  assert.equal(guidePricing.getEscortBaseForPax(escortDraft, 10), 4500);
  assert.equal(guidePricing.getEscortBaseForPax(escortDraft, 20), 6500);
  assert.equal(guidePricing.getEscortBaseForPax(escortDraft, 30), 0);
  const deselectedEscortDayDraft = structuredClone(escortDraft);
  deselectedEscortDayDraft.guide_day_escort_enabled = { 1: true, 2: false };
  assert.equal(
    guidePricing.getEscortBaseForPax(deselectedEscortDayDraft, 10),
    2000,
    "An explicitly unchecked Escort day preserves its rate but contributes no charge",
  );
  assert.equal(
    guidePricing.isEscortDayRequired(deselectedEscortDayDraft, 2),
    false,
    "Explicit Escort selection remains authoritative over a saved day/slab rate",
  );
  const legacyEscortDraft = structuredClone(escortDraft);
  legacyEscortDraft.escort_day_rates_by_slab = {};
  legacyEscortDraft.escort_ranges[0].charge = 4000;
  assert.equal(
    guidePricing.getEscortBaseForPax(legacyEscortDraft, 10),
    4000,
    "Legacy flat Escort slab charge remains costed until day-wise rates are entered",
  );

  assert.deepEqual(
    ["Package", "Land Part", "Accommodation Part"].map((value) => {
      const scope = queryFor.getQuotationScope(value);
      return [scope.queryFor, scope.landPart, scope.accommodationPart];
    }),
    [
      ["Package", true, true],
      ["Land Part", true, false],
      ["Accommodation Part", false, true],
    ],
    "Query For controls the authoritative service scope",
  );

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
    routing: [
      {
        day: 1,
        date: "2026-09-22",
        city_id: "city-1",
        to_city_id: "city-1",
        to_city_ids: ["city-1"],
        from_city: "Indore",
        to_city: "Indore",
        program: "Arrival",
        program_mode: "text",
        overnight: true,
      },
      {
        day: 2,
        date: "2026-09-23",
        city_id: "",
        from_city: "Indore",
        to_city: "Indore",
        program: "Departure",
        program_mode: "text",
        overnight: false,
      },
    ],
    transport: [
      {
        id: "transport-small",
        travel_id: "small",
        vehicles: 1,
        days: 2,
        rate: 0,
        rate_format: "per_route",
        per_route_rates: [10000, 0],
        reporting_cost: 0,
      },
    ],
    activities: [
      {
        id: "activity-line",
        activity_id: "activity-master",
        qty: 2,
        rate: 1000,
        pricing_mode: "per_person",
        from_routing_days: [1],
      },
    ],
    entrances: [
      {
        id: "entrance-line",
        site_id: "site-1",
        indian_pax: 2,
        indian_rate: 100,
        foreign_pax: 0,
        foreign_rate: 500,
        student_pax: 0,
        student_rate: 50,
        from_routing_days: [1],
      },
    ],
    guides: [
      {
        id: "guide-line",
        guide_id: "guide-master",
        days: 1,
        guides: 1,
        rate: 1000,
        language: "English",
        from_routing_days: [1],
      },
    ],
    misc: [
      {
        id: "misc-line",
        item_id: "misc-master",
        qty: 1,
        rate: 500,
        unit: "fixed",
        from_routing_days: [1],
      },
    ],
    hotel_options: [
      {
        key: "A",
        label: "3 Star Deluxe",
        category: "3 Star Deluxe",
        selections: [
          { city_id: "city-1", hotel_id: "hotel-1", room_id: "room-1", meal_plan: "CP" },
        ],
      },
    ],
    included_option_keys: ["A"],
    recommended_option: "A",
    meal_selections_by_option: {
      A: {
        "1:city-1": {
          lunch: {
            source: "hotel",
            hotel_id: "hotel-1",
            label: "Audit Hotel",
            per_person_rate: 200,
          },
          dinner: {
            source: "hotel",
            hotel_id: "hotel-1",
            label: "Audit Hotel",
            per_person_rate: 300,
          },
        },
      },
    },
    land_markup_percent: 10,
    land_gst_percent: 5,
    hotel_markup_percent: 10,
    hotel_gst_percent: 5,
  });

  const arrivalFirst = {
    ...types.emptyDraft(),
    arrival_mode: "flight",
    departure_mode: "train",
    arrival_flight: { date: "2026-12-10" },
    departure_train: { date: "2026-12-15" },
  };
  const arrivalBoundary = dateReconciliation.reconcileTripDateEdit(arrivalFirst, {
    source: "departure",
    value: "2026-12-15",
  });
  assert.deepEqual(
    arrivalBoundary.patch,
    { start_date: "2026-12-10", nights: 5 },
    "Different arrival/departure modes synchronize tour boundaries when both dates are entered",
  );
  assert.deepEqual(
    dateReconciliation.reconcileTripDateEdit(
      { ...arrivalFirst, departure_train: { date: "2026-12-09" } },
      { source: "arrival", value: "2026-12-10" },
    ).patch,
    {},
    "Arrival-first edits reject an already-entered earlier departure",
  );
  assert.equal(
    dateReconciliation.hasReversedTravelBoundaryDates({
      ...arrivalFirst,
      departure_train: { date: "2026-12-09" },
    }),
    true,
    "Reversed Arrival/Departure dates can be surfaced as a targeted review warning",
  );
  assert.equal(dateFormat.addDaysISO("2026-12-10", 5), "2026-12-15");
  assert.equal(dateFormat.nightsBetween("2026-12-10", "2026-12-15"), 5);

  const durationFirst = { ...types.emptyDraft(), start_date: "2026-12-10", nights: 3 };
  assert.deepEqual(
    dateReconciliation.reconcileTripDateEdit(durationFirst, {
      source: "start",
      value: "2026-12-10",
    }).patch,
    { start_date: "2026-12-10" },
    "Tour Starting Date first retains the established duration",
  );
  assert.equal(
    dateFormat.addDaysISO(
      durationFirst.start_date,
      dateReconciliation.reconcileTripDateEdit(durationFirst, {
        source: "duration",
        value: 3,
      }).patch.nights,
    ),
    "2026-12-13",
    "Duration-first planning derives the ending date from a known start",
  );
  assert.deepEqual(
    dateReconciliation.reconcileTripDateEdit(durationFirst, {
      source: "end",
      value: "2026-12-15",
    }).patch,
    { nights: 5 },
    "Direct Tour Ending Date calculates nights without a separate duration entry",
  );
  assert.equal(
    dateReconciliation.reconcileTripDateEdit(durationFirst, {
      source: "end",
      value: "2026-12-10",
    }).patch.nights,
    0,
    "A supported same-day itinerary has zero nights and one calendar day",
  );
  assert.equal(
    dateReconciliation.reconcileTripDateEdit(durationFirst, {
      source: "end",
      value: "2026-12-09",
    }).valid,
    false,
    "Tour dates earlier than the start are rejected",
  );
  assert.equal(dateReconciliation.isCalendarDate("2026-02-30"), false);

  const dayZeroDateDraft = {
    ...arrivalFirst,
    routing: [
      { day: 0, is_day_zero: true, date: "2026-12-09", city_id: "city-1", overnight: false },
    ],
  };
  const dayZeroBoundary = dateReconciliation.reconcileTripDateEdit(dayZeroDateDraft, {
    source: "departure",
    value: "2026-12-15",
  });
  assert.equal(dayZeroBoundary.boundaryConflict, true);
  assert.deepEqual(dayZeroBoundary.patch, {}, "Day 0 prevents silent boundary shifts");
  const withoutDates = { ...arrivalFirst, has_dates: false };
  assert.deepEqual(
    dateReconciliation.reconcileTripDateEdit(withoutDates, {
      source: "departure",
      value: "2026-12-15",
    }).patch,
    {},
    "Without Dates retains day-number planning instead of deriving calendar dates",
  );
  const reloadedDateDraft = draftStore.normalizeDraft(
    JSON.parse(JSON.stringify({ ...arrivalFirst, ...arrivalBoundary.patch })),
  );
  assert.equal(reloadedDateDraft.start_date, "2026-12-10");
  assert.equal(reloadedDateDraft.nights, 5);
  assert.equal(reloadedDateDraft.arrival_flight?.date, "2026-12-10");

  const reachedDraftRecord = {
    id: "draft-progress",
    draft_name: "Progress audit",
    created_at: now,
    updated_at: now,
    last_step: 11,
    wizard_state: {
      ...baseDraft(),
      query_for: "Package",
      commercial_mode: "package",
      step: 5,
    },
  };
  assert.equal(
    namedDraftStore.completedStepForScope(reachedDraftRecord, {
      ...reachedDraftRecord.wizard_state,
      step: 4,
    }),
    10,
    "Moving backward in the same scope preserves the reached-step high-water mark",
  );
  assert.equal(
    namedDraftStore.completedStepForScope(reachedDraftRecord, {
      ...reachedDraftRecord.wizard_state,
      query_for: "Accommodation Part",
      commercial_mode: "accommodation_only",
      step: 9,
    }),
    3,
    "Switching Query For does not unlock steps after the scopes first diverge",
  );
  assert.equal(
    namedDraftStore.completedStepForScope(
      {
        ...reachedDraftRecord,
        wizard_state: {
          ...reachedDraftRecord.wizard_state,
          query_for: "Land Part",
          commercial_mode: "transport_only",
        },
      },
      { ...reachedDraftRecord.wizard_state, query_for: "Package", commercial_mode: "package" },
    ),
    7,
    "Scope history carries forward only steps completed in the common flow prefix",
  );

  assert.equal(validation.isRoutingReady(baseDraft()), true, "Every overnight city is present");
  const packageWithoutProgramme = { ...baseDraft(), program_name: "", program_mode: "existing" };
  const packageProgrammeIssue = validation
    .validateQuoteForFinalization(packageWithoutProgramme, db)
    .blockers.find((item) => item.code === "PROGRAM_REQUIRED");
  assert.equal(
    packageProgrammeIssue?.message,
    "Please select a Programme before saving Costing V1.",
    "Package quotations explain the exact Programme save blocker",
  );
  const accommodationWithoutProgramme = {
    ...packageWithoutProgramme,
    query_for: "Accommodation Part",
    commercial_mode: "accommodation_only",
  };
  assert.equal(
    validation
      .validateQuoteForFinalization(accommodationWithoutProgramme, db)
      .blockers.some((item) => item.code === "PROGRAM_REQUIRED"),
    false,
    "Accommodation-only custom quotations do not require a Programme",
  );
  const incompleteRoutingDraft = baseDraft();
  incompleteRoutingDraft.routing[0].city_id = "";
  assert.equal(validation.isRoutingReady(incompleteRoutingDraft), false);

  const dayZeroDraft = structuredClone(baseDraft());
  dayZeroDraft.routing.unshift({
    day: 0,
    is_day_zero: true,
    date: "2026-09-21",
    city_id: "city-1",
    from_city: "Indore",
    to_city: "Indore",
    program: "Arrival only",
    program_mode: "text",
    overnight: false,
  });
  assert.equal(
    validation.isRoutingReady(dayZeroDraft),
    true,
    "Optional Day 0 does not invalidate a complete Day 1 onward routing",
  );
  const explicitDayZeroHotelNight = structuredClone(dayZeroDraft);
  explicitDayZeroHotelNight.routing[0].overnight = true;
  explicitDayZeroHotelNight.allocation_mode = "dynamic";
  explicitDayZeroHotelNight.dynamic_days = [0, 1];
  explicitDayZeroHotelNight.hotel_options[0].selections.push({
    routing_day: 0,
    city_id: "city-1",
    hotel_id: "hotel-1",
    room_id: "room-1",
    meal_plan: "CP",
  });
  assert.ok(
    validation
      .validateQuoteForFinalization(explicitDayZeroHotelNight, db)
      .blockers.some((item) => item.code === "DYNAMIC_CAPACITY_A_0"),
    "An explicitly booked Dynamic Day 0 hotel night requires its own room allocation",
  );
  const ordinaryLand = costsheet.buildLandPart(baseDraft(), db);
  const dayZeroLand = costsheet.buildLandPart(dayZeroDraft, db);
  assert.equal(
    dayZeroLand.transport_total,
    ordinaryLand.transport_total,
    "Optional Day 0 does not add an automatic transport charge",
  );
  assert.equal(dayZeroLand.rows.find((row) => row.day === 0)?.total, 0);
  const selectedDayZeroCostDraft = {
    ...baseDraft(),
    routing: [dayZeroSelectedTour],
    activities: [
      {
        ...baseDraft().activities[0],
        from_routing_days: [0],
      },
    ],
    entrances: [{ ...baseDraft().entrances[0], from_routing_days: [0] }],
    guides: [{ ...baseDraft().guides[0], from_routing_days: [0] }],
  };
  const selectedDayZeroLand = costsheet.buildLandPart(selectedDayZeroCostDraft, landDb);
  const selectedDayZeroRow = selectedDayZeroLand.rows.find((row) => row.day === 0);
  assert.ok(selectedDayZeroRow?.entrances > 0, "Selected Day 0 tour can cost its mapped Entrance");
  assert.ok(selectedDayZeroRow?.guide > 0, "Selected Day 0 tour can cost its mapped Guide");
  assert.ok(selectedDayZeroRow?.activities > 0, "Selected Day 0 tour can cost mapped Activities");
  const independentDayZeroCostDraft = {
    ...selectedDayZeroCostDraft,
    routing: [dayZeroNoTourRoute],
    activities: [
      {
        ...selectedDayZeroCostDraft.activities[0],
        independent_day_zero: true,
      },
    ],
    entrances: [],
    guides: [],
  };
  assert.ok(
    costsheet.buildLandPart(independentDayZeroCostDraft, landDb).rows.find((row) => row.day === 0)
      ?.activities > 0,
    "An intentionally added independent Day 0 activity is costed without city-wide auto-selection",
  );
  const legacyDayZeroCostDraft = {
    ...independentDayZeroCostDraft,
    activities: [{ ...independentDayZeroCostDraft.activities[0], independent_day_zero: undefined }],
  };
  assert.equal(
    costsheet.buildLandPart(legacyDayZeroCostDraft, landDb).rows.find((row) => row.day === 0)
      ?.activities,
    0,
    "Unmarked legacy Day 0 activity remains excluded from active costing",
  );
  const dayZeroRatedDraft = structuredClone(dayZeroDraft);
  dayZeroRatedDraft.transport[0].per_route_day_rates = { 0: 2000 };
  const dayZeroRatedLand = costsheet.buildLandPart(dayZeroRatedDraft, db);
  assert.equal(
    dayZeroRatedLand.transport_total,
    ordinaryLand.transport_total + 2000,
    "An intentionally configured Day 0 rate is included exactly once in Day-wise transport",
  );
  assert.equal(dayZeroRatedLand.rows.find((row) => row.day === 0)?.transport, 2000);
  const savedDayZeroTransport = draftStore.normalizeDraft(
    JSON.parse(JSON.stringify(dayZeroRatedDraft)),
  );
  assert.equal(
    savedDayZeroTransport.transport[0].per_route_day_rates[0],
    2000,
    "Day 0 transport rate survives save/reload draft normalization",
  );
  const dayZeroTotalModeDraft = {
    ...dayZeroRatedDraft,
    transport: [
      {
        ...dayZeroRatedDraft.transport[0],
        rate_mode: "total",
        total_rate: 10000,
      },
    ],
  };
  assert.equal(
    calc.transportLineTotal(dayZeroTotalModeDraft.transport[0]),
    10000,
    "Total mode remains authoritative and ignores the separate Day 0 rate",
  );
  assert.equal(
    costsheet.buildLandPart(dayZeroTotalModeDraft, db).rows.find((row) => row.day === 0)?.transport,
    0,
    "Total mode does not produce a second Day 0 charge",
  );
  assert.equal(
    calc.quotationPaxLabel({ ...baseDraft(), pax_mode: "range", pax_min: 4, pax_max: 14 }),
    "4–14 Pax",
  );
  assert.equal(
    calc.quotationPaxLabel({ ...baseDraft(), pax_mode: "range", pax_min: 2, pax_max: 9 }),
    "2–9 Pax",
  );
  assert.equal(calc.quotationPaxLabel({ ...baseDraft(), pax_mode: "exact", adults: 4 }), "4 Pax");

  const overnightSourceDraft = baseDraft();
  overnightSourceDraft.routing[0].to_city = "Bhopal";
  const overnightSourceSheet = costsheet.buildHotelMealSheet(
    overnightSourceDraft,
    db,
    overnightSourceDraft.hotel_options[0],
  );
  assert.deepEqual(
    overnightSourceSheet.rows.map((row) => row.day),
    [1],
    "Departure-only Day 2 does not produce a hotel night",
  );
  assert.equal(overnightSourceSheet.rows[0].city, "Indore");
  assert.equal(overnightSourceSheet.rows[0].hotel, "Audit Hotel");

  const sameCitySelectionOption = {
    key: "A",
    label: "Independent nights",
    selections: [
      {
        city_id: "city-1",
        routing_day: 1,
        hotel_id: "hotel-1",
        room_id: "room-1",
        meal_plan: "CP",
      },
      {
        city_id: "city-1",
        routing_day: 2,
        hotel_id: "hotel-2",
        room_id: "room-2",
        meal_plan: "CP",
      },
    ],
  };
  const sameCityNightOne = { ...baseDraft().routing[0], day: 1, city_id: "city-1" };
  const sameCityNightTwo = { ...sameCityNightOne, day: 2 };
  assert.equal(
    types.hotelSelectionForDay(sameCitySelectionOption, sameCityNightOne)?.hotel_id,
    "hotel-1",
  );
  assert.equal(
    types.hotelSelectionForDay(sameCitySelectionOption, sameCityNightTwo)?.hotel_id,
    "hotel-2",
  );

  db.cities.push({ id: "city-2", name: "Gwalior" });
  const changedOvernightCity = { ...sameCityNightOne, city_id: "city-2" };
  const staleHotelOption = {
    key: "A",
    label: "Stale city selection",
    selections: [
      {
        city_id: "city-1",
        routing_day: 1,
        hotel_id: "hotel-1",
        room_id: "room-1",
        meal_plan: "CP",
      },
    ],
  };
  assert.equal(
    types.hotelSelectionForDay(staleHotelOption, changedOvernightCity),
    undefined,
    "A hotel saved for the old overnight city is not a valid selection after routing changes",
  );
  const staleHotelSheet = costsheet.buildHotelMealSheet(
    { ...baseDraft(), routing: [changedOvernightCity, baseDraft().routing[1]] },
    db,
    staleHotelOption,
  );
  assert.equal(staleHotelSheet.rows[0].city, "Gwalior");
  assert.equal(staleHotelSheet.rows[0].hotel, "—");
  assert.equal(
    staleHotelSheet.rows[0].dbl,
    0,
    "Stale hotel does not contribute to overnight-city costing",
  );

  // Step 9 review projections are read-only and retain the authoritative
  // master slabs. Exact Pax selects an existing slab; it never interpolates.
  const reviewGuide = db.guides[0];
  const reviewGuideBefore = structuredClone(reviewGuide);
  assert.deepEqual(landReview.guideReviewRates(reviewGuide, "English", "ranges", 6), [
    { label: "1–5", rate: 1000, minPax: 1, maxPax: 5 },
    { label: "6–14", rate: 1500, minPax: 6, maxPax: 14 },
    { label: "15+", rate: 2000, minPax: 15 },
  ]);
  assert.deepEqual(landReview.guideReviewRates(reviewGuide, "English", "exact", 6), [
    { label: "6 Pax", rate: 1500, minPax: 6, maxPax: 6 },
  ]);
  assert.deepEqual(
    landReview.guideReviewRates(reviewGuide, "English", "ranges", 9, 2, 9).map((row) => row.label),
    ["1–5", "6–14"],
    "Guide review shows only slabs overlapping quotation range 2–9",
  );
  assert.deepEqual(
    landReview
      .guideReviewRates(reviewGuide, "English", "ranges", 14, 4, 14)
      .map((row) => row.label),
    ["1–5", "6–14"],
    "Guide review shows only slabs overlapping quotation range 4–14",
  );
  assert.deepEqual(
    landReview.guideReviewRates(reviewGuide, "English", "exact", 4).map((row) => row.label),
    ["4 Pax"],
    "Exact 4 Pax review resolves only its containing Guide slab",
  );
  const missingGuideRate = { ...reviewGuide, rate_1_to_5: 0, rate_6_to_14: 0, rate_15_plus: 0 };
  assert.deepEqual(
    landReview.guideReviewRates(missingGuideRate, "English", "ranges", 6),
    [],
    "Missing review rates remain unavailable instead of becoming a displayed zero",
  );
  const guideWithoutAnyRate = {
    ...missingGuideRate,
    rate_per_day: 0,
  };
  assert.equal(
    guidePricing.guideRawRateForPax({ rate: 0 }, guideWithoutAnyRate, "English", 6, 6),
    undefined,
    "Missing slab and legacy daily fallback remain unavailable",
  );
  const displayGuideServices = [
    { id: "guide-hindi-included", language: "Hindi", rate: 1000, inclusion: "included" },
    { id: "guide-hindi-optional", language: "Hindi", rate: 1010, inclusion: "optional" },
    { id: "guide-english-included", language: "English", rate: 1110, inclusion: "included" },
    { id: "guide-english-optional", language: "English", rate: 1120, inclusion: "optional" },
    { id: "guide-other-included", language: "Language", rate: 1220, inclusion: "included" },
    { id: "guide-other-optional", language: "Language", rate: 1230, inclusion: "optional" },
  ];
  const renderedReviewDb = {
    ...db,
    destination_cities: [{ id: "destination-city-1", name: "Indore", created_at: now }],
    destination_tours: [
      { id: "tour-1", city_id: "destination-city-1", title: "AM HDCT", created_at: now },
    ],
    guides: displayGuideServices.map(({ id, language, rate }) => ({
      ...reviewGuide,
      id,
      city: "Indore",
      tour_program: "AM HDCT",
      tour_id: "tour-1",
      languages: [language],
      language_rates: {
        [language]: {
          rate_1_to_5: rate,
          rate_6_to_14: rate + 500,
          rate_15_plus: rate + 1000,
        },
      },
    })),
    entrance_sites: [
      {
        id: "entry-included",
        city_id: "destination-city-1",
        tour_id: "tour-1",
        site_name: "Included Entrance",
        indian_rate: 100,
        foreigner_rate: 500,
        student_rate: 50,
        is_active: true,
        created_at: now,
      },
      {
        id: "entry-optional",
        city_id: "destination-city-1",
        tour_id: "tour-1",
        site_name: "Optional Entrance",
        indian_rate: 550,
        foreigner_rate: 650,
        student_rate: 60,
        is_active: true,
        created_at: now,
      },
      {
        id: "entry-tour-off",
        city_id: "destination-city-1",
        tour_id: "tour-1",
        site_name: "Tour Off Entrance",
        indian_rate: 999,
        foreigner_rate: 999,
        student_rate: 999,
        is_active: true,
        created_at: now,
      },
    ],
    activities: [
      {
        ...db.activities[0],
        id: "activity-included",
        activity_name: "Included Activity",
        price: 1234,
      },
      {
        ...db.activities[0],
        id: "activity-optional",
        activity_name: "Optional Activity",
        price: 1500,
      },
      {
        ...db.activities[0],
        id: "activity-day-1-six-slabs",
        activity_name: "Day 1 Six Slab Activity",
        slab_pricing_type: "slab",
        pricing_slabs: Array.from({ length: 6 }, (_, index) => ({
          id: `day-1-slab-${index + 1}`,
          from_pax: index * 5 + 1,
          to_pax: (index + 1) * 5,
          price: (index + 1) * 100,
          type: "indian",
        })),
      },
      {
        ...db.activities[0],
        id: "activity-day-1-flat",
        activity_name: "Day 1 Flat Activity",
        pricing_type: "per_person",
        slab_pricing_type: "per_person",
        pricing_slabs: [],
        price: 275,
        indian_price: 275,
      },
      {
        ...db.activities[0],
        id: "activity-day-2-slabs",
        activity_name: "Day 2 Slab Activity",
        slab_pricing_type: "slab",
        pricing_slabs: [
          { id: "day-2-slab-1", from_pax: 1, to_pax: 10, price: 800, type: "indian" },
          { id: "day-2-slab-2", from_pax: 11, to_pax: 20, price: 1200, type: "indian" },
        ],
      },
    ],
  };
  const displayDraft = {
    ...baseDraft(),
    adults: 2,
    routing: [
      {
        ...baseDraft().routing[0],
        tour_ids_by_city: { "city-1": ["tour-1"] },
      },
      baseDraft().routing[1],
    ],
    guides: displayGuideServices.map(({ id, language, rate, inclusion }) => ({
      id: `${id}-line`,
      guide_id: id,
      days: 1,
      guides: 1,
      rate,
      language,
      inclusion_status: inclusion,
      from_routing_days: [1],
    })),
    guide_tour_selected_by_day: { 1: ["Indore||AM HDCT"] },
    entrances: [
      {
        id: "entrance-line-included",
        site_id: "entry-included",
        indian_pax: 2,
        indian_rate: 100,
        foreign_pax: 0,
        foreign_rate: 500,
        student_pax: 0,
        student_rate: 50,
        from_routing_days: [1],
      },
      {
        id: "entrance-line-optional",
        site_id: "entry-optional",
        indian_pax: 2,
        indian_rate: 550,
        foreign_pax: 0,
        foreign_rate: 650,
        student_pax: 0,
        student_rate: 60,
        from_routing_days: [1],
      },
      {
        id: "entrance-line-off",
        site_id: "entry-tour-off",
        indian_pax: 2,
        indian_rate: 999,
        foreign_pax: 0,
        foreign_rate: 999,
        student_pax: 0,
        student_rate: 999,
        from_routing_days: [1],
      },
    ],
    entrance_tour_selected_by_day: { 1: ["entry-included", "entry-optional"] },
    entrance_rate_selection_by_day: { 1: { indian: ["entrance-line-included"] } },
    activities: [
      {
        id: "activity-line-included",
        activity_id: "activity-included",
        qty: 1,
        rate: 1234,
        pricing_mode: "slab",
        inclusion_status: "included",
        from_routing_days: [1],
      },
      {
        id: "activity-line-optional",
        activity_id: "activity-optional",
        qty: 1,
        rate: 1500,
        pricing_mode: "slab",
        inclusion_status: "optional",
        from_routing_days: [1],
      },
    ],
    costing_selection: {
      guide: {
        1: displayGuideServices
          .filter(({ inclusion }) => inclusion === "included")
          .map(({ id, language }) => `${id}-line::${language}`),
      },
      entrances: { 1: ["entrance-line-included"] },
      entrance_cats: { 1: ["indian"] },
      activities: { 1: [] },
    },
  };
  const displayFilters = {
    transport: false,
    hindi: true,
    english: true,
    otherLanguage: true,
    escort: false,
    indian: true,
    foreign: true,
    student: true,
    activities: true,
    misc: true,
    guideIncluded: true,
    guideOptional: true,
    entranceIncluded: true,
    entranceOptional: true,
    activityIncluded: true,
    activityOptional: true,
    miscIncluded: true,
    paxDisplay: "ranges",
    exactPax: 2,
  };
  assert.equal(
    guidePricing.guideRawRateForPax(
      { rate: 0 },
      renderedReviewDb.guides.find((guide) => guide.id === "guide-other-included"),
      "Language",
      2,
      2,
    ),
    1220,
    "Other Language raw rate fixture resolves from the configured master language",
  );
  const displayDraftBeforeRender = structuredClone(displayDraft);
  const originalMasterDb = masterPricing.db.get();
  masterPricing.db.hydrateAll(renderedReviewDb);
  const renderedGuideStep = renderToStaticMarkup(
    createElement(guideStep.Step13, {
      draft: {
        ...displayDraft,
        guide_language: "Hindi",
        pax_mode: "range",
        pax_min: 1,
        pax_max: 15,
      },
      set: () => {},
    }),
  );
  const guideChargesTable =
    renderedGuideStep.match(/data-testid="guide-charges-table"[\s\S]*?<\/table>/)?.[0] ?? "";
  const includedGuideReviewTable =
    renderedGuideStep.match(/data-testid="included-guide-review-table"[\s\S]*?<\/table>/)?.[0] ??
    "";
  const optionalGuideReviewTable =
    renderedGuideStep.match(/data-testid="optional-guide-review-table"[\s\S]*?<\/table>/)?.[0] ??
    "";
  const includedGuidePerPersonTable =
    renderedGuideStep.match(
      /data-testid="included-guide-per-person-table"[\s\S]*?<\/table>/,
    )?.[0] ?? "";
  const optionalGuidePerPersonTable =
    renderedGuideStep.match(
      /data-testid="optional-guide-per-person-table"[\s\S]*?<\/table>/,
    )?.[0] ?? "";
  assert.ok(
    renderedGuideStep.includes("Included Guides — Range-wise Costing") &&
      renderedGuideStep.includes("Optional Guides — Additional Sale"),
    "Guide step renders distinct Included and Optional range-wise tables",
  );
  assert.equal(
    (optionalGuideReviewTable.match(/<th/g) ?? []).length,
    (includedGuideReviewTable.match(/<th/g) ?? []).length,
    "Included and Optional tables expose the same column structure",
  );
  assert.ok(
    optionalGuideReviewTable.includes("Final Selling Total"),
    "Optional guide table keeps selling totals separate from Included totals",
  );
  assert.ok(
    !includedGuideReviewTable.includes("<input") && !optionalGuideReviewTable.includes("<input"),
    "Included and Optional guide reviews are read-only",
  );
  assert.ok(
    renderedGuideStep.indexOf('data-testid="included-guide-review-table"') <
      renderedGuideStep.indexOf('data-testid="included-guide-per-person-table"') &&
      renderedGuideStep.indexOf('data-testid="included-guide-per-person-table"') <
        renderedGuideStep.indexOf('data-testid="optional-guide-review-table"') &&
      renderedGuideStep.indexOf('data-testid="optional-guide-review-table"') <
        renderedGuideStep.indexOf('data-testid="optional-guide-per-person-table"'),
    "Guide summaries and per-person tables render in Included-then-Optional order",
  );
  assert.ok(
    includedGuidePerPersonTable.includes("Included Base Total") &&
      includedGuidePerPersonTable.includes("Included Final Total") &&
      includedGuidePerPersonTable.includes("Included Per Person") &&
      !includedGuidePerPersonTable.includes("Optional Per Person"),
    "Included per-person table contains Included values only",
  );
  assert.ok(
    optionalGuidePerPersonTable.includes("Optional Base Total") &&
      optionalGuidePerPersonTable.includes("Optional Final Total") &&
      optionalGuidePerPersonTable.includes("Optional Per Person") &&
      !optionalGuidePerPersonTable.includes("Included Per Person"),
    "Optional per-person table contains Optional values only",
  );
  assert.ok(
    !renderedGuideStep.includes(">Per Person Guide Cost Breakdown<"),
    "the old combined Guide per-person table is removed",
  );
  assert.equal(
    (guideChargesTable.match(/>1–5 Pax<\/th>/g) ?? []).length,
    1,
    "Guide Charges renders exactly one 1–5 Pax column header for the selected language",
  );
  assert.equal(
    (guideChargesTable.match(/>6–14 Pax<\/th>/g) ?? []).length,
    1,
    "Guide Charges renders exactly one 6–14 Pax column header for the selected language",
  );
  assert.equal(
    (guideChargesTable.match(/>15\+ Pax<\/th>/g) ?? []).length,
    1,
    "Guide Charges renders exactly one 15+ Pax column header for the selected language",
  );
  assert.ok(
    !guideChargesTable.includes("1–5 / 6–14 Pax"),
    "Guide Charges has no legacy combined slab header",
  );
  assert.ok(
    !guideChargesTable.includes(" / ₹"),
    "Guide Charges has no slash-concatenated Guide price cells",
  );
  const renderedReview = renderToStaticMarkup(
    createElement(landDaywiseReview.LandDaywiseReview, {
      draft: displayDraft,
      filters: displayFilters,
    }),
  );
  for (const heading of [">Hindi</th>", ">English</th>", ">Other Language</th>"]) {
    assert.ok(renderedReview.includes(heading), `Rendered review includes ${heading}`);
  }
  assert.ok(
    renderedReview.indexOf(">Hindi</th>") < renderedReview.indexOf("1–5 Pax") &&
      renderedReview.indexOf("1–5 Pax") < renderedReview.indexOf(">Included</th>") &&
      renderedReview.indexOf(">English</th>") < renderedReview.indexOf(">Other Language</th>") &&
      renderedReview.indexOf(">Other Language</th>") < renderedReview.indexOf("6–14 Pax") &&
      renderedReview.indexOf("6–14 Pax") < renderedReview.indexOf("15+ Pax") &&
      renderedReview.indexOf("15+ Pax") < renderedReview.indexOf(">Included</th>") &&
      renderedReview.indexOf(">Included</th>") < renderedReview.indexOf(">Optional</th>"),
    "Rendered Guide headings align language → slab → Included/Optional header rows",
  );
  for (const rate of [
    "₹1,000",
    "₹1,010",
    "₹1,110",
    "₹1,120",
    "₹1,220",
    "₹1,230",
    "₹100",
    "₹550",
    "₹1,234",
    "₹1,500",
    "₹500",
  ]) {
    assert.ok(renderedReview.includes(rate), `Rendered review includes raw price ${rate}`);
  }
  assert.ok(
    !renderedReview.includes("₹999"),
    "Tour OFF Entrance rates are absent from review rows",
  );
  assert.ok(renderedReview.includes("Miscellaneous · Included"));
  const onlyEnglishReview = renderToStaticMarkup(
    createElement(landDaywiseReview.LandDaywiseReview, {
      draft: displayDraft,
      filters: { ...displayFilters, hindi: false, otherLanguage: false },
    }),
  );
  assert.ok(onlyEnglishReview.includes(">English</th>"));
  assert.ok(!onlyEnglishReview.includes(">Hindi</th>"));
  assert.ok(!onlyEnglishReview.includes(">Other Language</th>"));
  const hindiEnglishReview = renderToStaticMarkup(
    createElement(landDaywiseReview.LandDaywiseReview, {
      draft: displayDraft,
      filters: { ...displayFilters, otherLanguage: false },
    }),
  );
  assert.ok(
    hindiEnglishReview.includes(">Hindi</th>") && hindiEnglishReview.includes(">English</th>"),
  );
  assert.ok(!hindiEnglishReview.includes(">Other Language</th>"));
  const otherLanguageOnlyReview = renderToStaticMarkup(
    createElement(landDaywiseReview.LandDaywiseReview, {
      draft: displayDraft,
      filters: { ...displayFilters, hindi: false, english: false },
    }),
  );
  assert.ok(otherLanguageOnlyReview.includes(">Other Language</th>"));
  assert.ok(
    !otherLanguageOnlyReview.includes(">Hindi</th>") &&
      !otherLanguageOnlyReview.includes(">English</th>"),
  );
  const tourOffGuideReview = renderToStaticMarkup(
    createElement(landDaywiseReview.LandDaywiseReview, {
      draft: { ...displayDraft, guide_tour_selected_by_day: { 1: [] } },
      filters: displayFilters,
    }),
  );
  const tourOffGuidePosition = tourOffGuideReview.indexOf("AM HDCT");
  const tourOffGuideRow = tourOffGuideReview.slice(
    tourOffGuideReview.lastIndexOf("<tr", tourOffGuidePosition),
    tourOffGuideReview.indexOf("</tr>", tourOffGuidePosition) + 5,
  );
  const guideCellsWhenTourOff = tourOffGuideRow.split("</td>").slice(5, 23).join("</td>");
  assert.ok(
    !guideCellsWhenTourOff.includes("₹"),
    "Tour OFF has neither Included nor Optional Guide values",
  );

  const includedGuideOnly = renderToStaticMarkup(
    createElement(landDaywiseReview.LandDaywiseReview, {
      draft: displayDraft,
      filters: { ...displayFilters, guideOptional: false },
    }),
  );
  assert.equal((includedGuideOnly.match(/>Included<\/th>/g) ?? []).length, 13);
  assert.equal((includedGuideOnly.match(/>Optional<\/th>/g) ?? []).length, 4);
  const optionalGuideOnly = renderToStaticMarkup(
    createElement(landDaywiseReview.LandDaywiseReview, {
      draft: displayDraft,
      filters: { ...displayFilters, guideIncluded: false },
    }),
  );
  assert.equal((optionalGuideOnly.match(/>Included<\/th>/g) ?? []).length, 4);
  assert.equal((optionalGuideOnly.match(/>Optional<\/th>/g) ?? []).length, 13);
  const noGuidePricing = renderToStaticMarkup(
    createElement(landDaywiseReview.LandDaywiseReview, {
      draft: displayDraft,
      filters: { ...displayFilters, guideIncluded: false, guideOptional: false },
    }),
  );
  assert.ok(!noGuidePricing.includes(">Hindi</th>") && !noGuidePricing.includes(">English</th>"));

  const entranceTableHead = renderedReview.match(/<thead[^>]*>[\s\S]*?<\/thead>/)?.[0] ?? "";
  assert.ok(
    entranceTableHead.includes(">Indian</th>") && entranceTableHead.includes(">Foreigner</th>"),
    `Rendered Entrance headings: ${entranceTableHead}`,
  );
  assert.ok(entranceTableHead.includes(">Student</th>"));
  const indianOnlyReview = renderToStaticMarkup(
    createElement(landDaywiseReview.LandDaywiseReview, {
      draft: displayDraft,
      filters: { ...displayFilters, foreign: false, student: false },
    }),
  );
  const indianOnlyHeader = indianOnlyReview.match(/<thead[^>]*>[\s\S]*?<\/thead>/)?.[0] ?? "";
  assert.ok(indianOnlyHeader.includes(">Indian</th>"));
  assert.ok(
    !indianOnlyHeader.includes(">Foreigner</th>") && !indianOnlyHeader.includes(">Student</th>"),
  );
  const activityHeaderStart = renderedReview.indexOf(">Activities / Experiences</th>");
  const activityHeader = renderedReview.slice(
    activityHeaderStart,
    renderedReview.indexOf("</thead>", activityHeaderStart),
  );
  assert.ok(activityHeader.includes(">Included</th>") && activityHeader.includes(">Optional</th>"));
  const finalReviewMarkup = renderToStaticMarkup(
    createElement(packageStandardReview.PackageStandardCostingReview, {
      draft: {
        ...displayDraft,
        transport_options: [
          {
            id: "audit-transport-variation",
            name: "Audit Vehicle Variation",
            min_pax: 1,
            max_pax: 6,
            vehicles: [{ transport_line_id: "transport-small", quantity: 1 }],
          },
        ],
      },
      set: () => undefined,
      readOnly: true,
    }),
  );
  const reviewSections = [
    "Commercial Package Matrix",
    "A. Day-wise Land Services Pricing Review (View Only)",
    "B. Transport Variations",
    "C. Miscellaneous (Selected Items)",
    "D. Included Activities / Experiences",
    "Accommodation &amp; Meals",
  ].map((label) => finalReviewMarkup.indexOf(label));
  assert.ok(
    reviewSections.every((position) => position >= 0) &&
      reviewSections.every(
        (position, index) => index === 0 || position > reviewSections[index - 1],
      ),
    `Final Review sections render in required order: ${reviewSections.join(", ")}`,
  );
  const daywiseSection = finalReviewMarkup.slice(reviewSections[1], reviewSections[2]);
  assert.ok(!daywiseSection.includes("Activities / Experiences"));
  assert.ok(!daywiseSection.includes("Miscellaneous · Included"));
  const includedActivitiesSection = finalReviewMarkup.slice(reviewSections[4], reviewSections[5]);
  assert.ok(includedActivitiesSection.includes("Included Activity"));
  const groupedActivityDraft = {
    ...displayDraft,
    activities: [
      {
        id: "day-1-six-slabs-line",
        activity_id: "activity-day-1-six-slabs",
        qty: 1,
        rate: 100,
        pricing_mode: "slab",
        inclusion_status: "included",
        from_routing_days: [1],
      },
      {
        id: "day-1-flat-line",
        activity_id: "activity-day-1-flat",
        qty: 1,
        rate: 275,
        pricing_mode: "per_person",
        inclusion_status: "included",
        from_routing_days: [1],
      },
      {
        id: "day-2-slabs-line",
        activity_id: "activity-day-2-slabs",
        qty: 1,
        rate: 800,
        pricing_mode: "slab",
        inclusion_status: "included",
        from_routing_days: [2],
      },
    ],
  };
  const activityDayGroups = packageStandardReview.includedActivityDayGroups(
    groupedActivityDraft,
    renderedReviewDb.activities,
    2,
  );
  assert.deepEqual(
    activityDayGroups.map((group) => ({
      day: group.route.day,
      rowSpan: group.rowSpan,
      activities: group.activities.map((activity) => ({
        name: activity.master.activity_name,
        rowSpan: activity.rows.length,
      })),
    })),
    [
      {
        day: 1,
        rowSpan: 2,
        activities: [
          { name: "Day 1 Six Slab Activity", rowSpan: 1 },
          { name: "Day 1 Flat Activity", rowSpan: 1 },
        ],
      },
      {
        day: 2,
        rowSpan: 1,
        activities: [{ name: "Day 2 Slab Activity", rowSpan: 1 }],
      },
    ],
    "Exact-pax review renders only each activity's matching slab",
  );
  const rangeActivityDayGroups = packageStandardReview.includedActivityDayGroups(
    { ...groupedActivityDraft, pax_mode: "range", pax_min: 1, pax_max: 20 },
    renderedReviewDb.activities,
    2,
  );
  assert.deepEqual(
    rangeActivityDayGroups.map((group) => ({
      day: group.route.day,
      rowSpan: group.rowSpan,
      activities: group.activities.map((activity) => activity.rows.length),
    })),
    [
      { day: 1, rowSpan: 7, activities: [6, 1] },
      { day: 2, rowSpan: 2, activities: [2] },
    ],
    "Range review preserves independently configured activity slabs",
  );
  const duplicateRikshawSlabs = {
    ...renderedReviewDb.activities[0],
    id: "e-rikshaw-indore",
    activity_name: "E Rikshaw at Indore",
    slab_pricing_type: "slab",
    pricing_slabs: [
      { id: "selected-1-4", from_pax: 1, to_pax: 4, price: 300, type: "indian" },
      { id: "alternative-1-4", from_pax: 1, to_pax: 4, price: 375, type: "indian" },
      { id: "selected-5-8", from_pax: 5, to_pax: 8, price: 450, type: "indian" },
      { id: "alternative-5-8", from_pax: 5, to_pax: 8, price: 550, type: "indian" },
      { id: "selected-9-12", from_pax: 9, to_pax: 12, price: 600, type: "indian" },
      { id: "alternative-9-12", from_pax: 9, to_pax: 12, price: 750, type: "indian" },
    ],
  };
  const rikshawRows = packageStandardReview.includedActivitySellingRows(
    { ...groupedActivityDraft, adults: 12 },
    {
      id: "e-rikshaw-line",
      activity_id: duplicateRikshawSlabs.id,
      qty: 1,
      rate: 600,
      pricing_mode: "slab",
      inclusion_status: "included",
      from_routing_days: [1],
    },
    duplicateRikshawSlabs,
    12,
  );
  assert.deepEqual(
    rikshawRows.map((row) => [row.min_pax, row.max_pax, row.base_rate]),
    [[9, 12, 600]],
    "Exact 12-pax E Rikshaw review shows only its selected configured slab",
  );
  const rangeRikshawRows = packageStandardReview.includedActivitySellingRows(
    { ...groupedActivityDraft, pax_mode: "range", pax_min: 1, pax_max: 12 },
    {
      id: "e-rikshaw-line",
      activity_id: duplicateRikshawSlabs.id,
      qty: 1,
      rate: 600,
      pricing_mode: "slab",
      inclusion_status: "included",
      from_routing_days: [1],
    },
    duplicateRikshawSlabs,
    12,
  );
  assert.deepEqual(
    rangeRikshawRows.map((row) => [row.min_pax, row.max_pax, row.base_rate]),
    [
      [1, 4, 300],
      [5, 8, 450],
      [9, 12, 600],
    ],
    "Range E Rikshaw review retains distinct configured slabs",
  );
  masterPricing.db.hydrateAll(originalMasterDb);
  assert.deepEqual(
    displayDraft,
    displayDraftBeforeRender,
    "Review display filters do not mutate saved draft data",
  );
  assert.deepEqual(reviewGuide, reviewGuideBefore, "Review slab projection does not mutate data");
  assert.equal(
    landReview.savedQuoteRawRate(
      {
        rate: 1500,
        pax_ranges: [
          { from_pax: 1, to_pax: 5, rate: 1000 },
          { from_pax: 6, to_pax: 14, rate: 1500 },
        ],
      },
      6,
    ),
    1500,
    "Review raw rate comes from the saved quotation slab",
  );
  assert.equal(
    landReview.savedQuoteRawRate({ rate: 650 }, 2),
    650,
    "Saved flat quotation rates remain raw before commercials",
  );
  const savedGuideSnapshot = {
    rate: 0,
    pax_ranges: [
      { from_pax: 1, to_pax: 5, rate: 1000 },
      { from_pax: 6, to_pax: 10, rate: 1500 },
      { from_pax: 11, to_pax: 15, rate: 2000 },
    ],
  };
  for (const [pax, expected] of [
    [1, 1000],
    [5, 1000],
    [6, 1500],
    [10, 1500],
    [11, 2000],
    [15, 2000],
    [16, 2000],
  ]) {
    assert.equal(
      guidePricing.guideRawRateForPax(savedGuideSnapshot, reviewGuide, "English", pax, 14),
      expected,
      `Guide saved snapshot resolves the correct raw rate at ${pax} pax`,
    );
  }
  assert.equal(
    guidePricing.guideRawRateForPax({ rate: 1250 }, reviewGuide, "English", 6, 6),
    1250,
    "Saved quotation rate wins at its pricing pax",
  );
  assert.equal(
    guidePricing.guideRawRateForPax({ rate: 0 }, reviewGuide, "English", 11, 6),
    1500,
    "Authoritative Guide resolver is the fallback when no saved slab covers pax",
  );
  for (const [pax, expected] of [
    [1, 1000],
    [5, 1000],
    [6, 1500],
    [10, 1500],
    [11, 1500],
    [14, 1500],
    [15, 2000],
  ]) {
    assert.equal(
      guidePricing.guideRawRateForPax({ rate: 1000 }, reviewGuide, "English", pax, 14),
      pax === 14 ? 1000 : expected,
      `Range mode resolves the Guide's applicable master slab at ${pax} pax`,
    );
  }
  assert.equal(
    guidePricing.guideRawRateForPax({ rate: 0 }, undefined, "English", 6, 1),
    undefined,
    "Guide rates missing from both saved quote and master remain unavailable",
  );
  const exactGuideDraft = { ...baseDraft(), pax_mode: "exact", adults: 16 };
  assert.deepEqual(calc.getCostingPaxValues(exactGuideDraft), [16]);
  const exactGuideRaw = guidePricing.guideRawRateForPax(
    { rate: 3500 },
    reviewGuide,
    "English",
    16,
    16,
  );
  assert.equal(exactGuideRaw, 3500, "Exact mode resolves only the applicable 16-pax raw rate");
  assert.equal(exactGuideRaw / 16, 218.75, "Exact Guide per-person base divides by actual pax");
  const exactGuideMatrixDraft = {
    ...exactGuideDraft,
    guides: [{ ...baseDraft().guides[0], rate: 3500 }],
  };
  const exactGuideMatrixRows = costsheet
    .buildRateSheet(exactGuideMatrixDraft, db, exactGuideMatrixDraft.hotel_options[0], [])
    .flatMap((group) => group.rows);
  assert.deepEqual(
    exactGuideMatrixRows.map((row) => row.pax),
    [16],
    "Exact Guide costing generates only the exact traveller row",
  );
  assert.ok(
    Math.abs(
      exactGuideMatrixRows[0].guide -
        landPricing.applyLandCommercials(exactGuideMatrixDraft, 3500 / 16, 0.05).final,
    ) < 0.01,
    "Exact Guide package PP divides the finalized group slab by exact pax once",
  );
  db.guides[0].languages = ["Hindi", "English"];
  db.guides[0].language_rates = {
    English: { rate_1_to_5: 1000, rate_6_to_14: 1500, rate_15_plus: 2000 },
    Hindi: { rate_1_to_5: 800, rate_6_to_14: 1300, rate_15_plus: 1800 },
  };
  const slabGuideDraft = {
    ...baseDraft(),
    guides: [{ ...baseDraft().guides[0], rate: 0, inclusion_status: "included" }],
    guide_reporting_cost_english: 100,
    guide_reporting_cost_hindi: 50,
    guide_tour_selected_by_day: { 1: ["Indore||Audit Guide"] },
    guide_slab_selection_by_day: {
      1: {
        [guidePricing.guideSlabSelectionKey(
          "Indore||Audit Guide",
          "guide-master",
          "English",
          "1-5",
        )]: "included",
        [guidePricing.guideSlabSelectionKey(
          "Indore||Audit Guide",
          "guide-master",
          "English",
          "6-14",
        )]: "optional",
        [guidePricing.guideSlabSelectionKey(
          "Indore||Audit Guide",
          "guide-master",
          "English",
          "15+",
        )]: "removed",
        [guidePricing.guideSlabSelectionKey("Indore||Audit Guide", "guide-master", "Hindi", "1-5")]:
          "included",
      },
    },
  };
  const english5 = guideCosting.guideLanguageCostingForPax(slabGuideDraft, db, 5, "English");
  assert.equal(
    english5.baseTotal,
    1100,
    "English 1–5 included uses the master 1–5 rate plus reporting",
  );
  assert.equal(english5.includedRows[0].rate, 1000);
  const oneSlabOnlyDraft = {
    ...slabGuideDraft,
    costing_selection: { guide: { 1: ["guide-line::English"] } },
    guide_slab_selection_by_day: {
      1: {
        [guidePricing.guideSlabSelectionKey(
          "Indore||Audit Guide",
          "guide-master",
          "English",
          "1-5",
        )]: "included",
      },
    },
  };
  assert.equal(
    guideCosting.guideLanguageCostingForPax(oneSlabOnlyDraft, db, 14, "English").baseTotal,
    1600,
    "the single 1-5 price checkbox includes the guide for every pricing slab",
  );
  assert.equal(
    landPricing.applyLandCommercials(slabGuideDraft, english5.baseTotal).final / 5,
    254.1,
    "Guide per-person price applies configured markup/GST once then divides by pax",
  );
  const english14 = guideCosting.guideLanguageCostingForPax(slabGuideDraft, db, 14, "English");
  assert.equal(english14.baseTotal, 1600, "the checked price control includes the 6-14 rate");
  assert.equal(
    english14.optionalBaseTotal,
    0,
    "a price-checked guide cannot also appear in Optional totals",
  );
  const legacyOptionalGuideDraft = {
    ...slabGuideDraft,
    guides: [
      { ...slabGuideDraft.guides[0], id: "optional-english", inclusion_status: "optional" },
      {
        ...slabGuideDraft.guides[0],
        id: "optional-hindi",
        language: "Hindi",
        inclusion_status: "optional",
      },
    ],
    costing_selection: { guide: { 1: [] } },
    guide_slab_selection_by_day: undefined,
  };
  assert.deepEqual(
    [5, 14, 15].map(
      (pax) =>
        guideCosting.guideLanguageCostingForPax(legacyOptionalGuideDraft, db, pax, "English")
          .optionalBaseTotal,
    ),
    [1000, 1500, 2000],
    "a saved Optional guide retains three independent slab totals",
  );
  assert.equal(
    ["English", "Hindi"].reduce(
      (sum, language) =>
        sum +
        guideCosting.guideLanguageCostingForPax(legacyOptionalGuideDraft, db, 14, language)
          .optionalBaseTotal,
      0,
    ),
    2800,
    "multiple Optional guide services are summed within the applicable slab only",
  );
  const optionalCommercialAudit = landPricing.applyLandCommercials(legacyOptionalGuideDraft, 1000);
  assert.equal(optionalCommercialAudit.base, 1000);
  assert.equal(
    optionalCommercialAudit.markup,
    100,
    "Optional Guides use the configured 10% markup",
  );
  assert.equal(
    optionalCommercialAudit.final,
    optionalCommercialAudit.base + optionalCommercialAudit.markup + optionalCommercialAudit.gst,
    "Optional Guide final selling total uses the shared GST and rounding formula",
  );
  const removedOptionalGuideDraft = {
    ...legacyOptionalGuideDraft,
    guide_slab_selection_by_day: {
      1: Object.fromEntries(
        ["1-5", "6-14", "15+"].map((slab) => [
          guidePricing.guideSlabSelectionKey(
            "Indore||Audit Guide",
            "guide-master",
            "English",
            slab,
          ),
          "removed",
        ]),
      ),
    },
  };
  assert.equal(
    guideCosting.guideLanguageCostingForPax(removedOptionalGuideDraft, db, 14, "English")
      .optionalBaseTotal,
    1500,
    "Tour checked plus price unchecked is Optional regardless of an old removed status",
  );
  assert.equal(
    guideCosting.guideLanguageCostingForPax(
      { ...removedOptionalGuideDraft, guide_tour_selected_by_day: { 1: [] } },
      db,
      14,
      "English",
    ).optionalBaseTotal,
    0,
    "Tour unchecked excludes the guide from both Included and Optional totals",
  );
  assert.equal(
    guideCosting.guideLanguageCostingForPax(
      { ...legacyOptionalGuideDraft, guides: [], guide_tour_selected_by_day: { 1: [] } },
      db,
      14,
      "English",
    ).optionalBaseTotal,
    0,
    "no Optional guides produces a zero Optional total",
  );
  assert.equal(
    JSON.parse(JSON.stringify(legacyOptionalGuideDraft)).guides[0].inclusion_status,
    "optional",
    "saved Optional selection survives draft serialization and reload",
  );
  assert.equal(
    guideCosting.guideLanguageCostingForPax(slabGuideDraft, db, 15, "English").baseTotal,
    2100,
    "the checked price control includes the 15+ rate",
  );
  assert.equal(
    guideCosting.guideLanguageCostingForPax(slabGuideDraft, db, 5, "Hindi").baseTotal,
    850,
    "Hindi selection remains independent while English selections are stored",
  );
  const stepNineExcludedGuide = {
    ...slabGuideDraft,
    costing_selection: { guide: { 1: [] } },
  };
  assert.equal(
    guideCosting.guideLanguageCostingForPax(stepNineExcludedGuide, db, 5, "English", true)
      .baseTotal,
    0,
    "Step 9 daywise exclusion removes an Included slab choice from final totals",
  );
  assert.equal(
    stepNineExcludedGuide.guide_slab_selection_by_day[1][
      guidePricing.guideSlabSelectionKey("Indore||Audit Guide", "guide-master", "English", "1-5")
    ],
    "included",
    "Step 9 exclusion does not rewrite the persisted Step 7 slab selection",
  );
  const slabGuideReviewRow = costsheet
    .buildLandPart(slabGuideDraft, db)
    .rows.find((row) => row.day === 1);
  assert.equal(
    slabGuideReviewRow.guide,
    1100,
    "Step 9 checked Guide amount matches included selected language rate plus reporting",
  );
  const combinedGuideCommercial = landPricing.applyLandCommercials(
    { ...baseDraft(), land_markup_percent: 10, land_gst_percent: 5 },
    3500 + 3000,
  );
  assert.deepEqual(
    combinedGuideCommercial,
    { base: 6500, markup: 650, gst: 357.5, final: 7507.5 },
    "Combined included Guides receive markup and GST once on their aggregate base",
  );
  assert.deepEqual(
    landPricing.applyLandCommercials(
      { ...baseDraft(), land_markup_percent: 10, land_gst_percent: 5 },
      650,
    ),
    { base: 650, markup: 65, gst: 35.75, final: 750.75 },
    "Review summary applies Land markup and GST exactly once",
  );

  const reviewTransportDraft = baseDraft();
  const reviewTransportOption = {
    id: "review-option",
    name: "Audit transport",
    min_pax: 1,
    max_pax: 10,
    vehicles: [{ transport_line_id: "transport-small", quantity: 1 }],
  };
  const transportCommercial = landPricing.applyLandCommercials(
    reviewTransportDraft,
    calc.transportLineTotal(reviewTransportDraft.transport[0]),
  );
  assert.equal(
    landPricing.transportOptionTotal(reviewTransportDraft, reviewTransportOption),
    transportCommercial.final,
    "Step 9 transport final equals the authoritative transport final",
  );
  const matrixBeforeReviewFilter = costsheet.buildRateSheet(
    reviewTransportDraft,
    db,
    reviewTransportDraft.hotel_options[0],
    reviewTransportDraft.transport,
  );
  landReview.guideReviewRates(reviewGuide, "English", "exact", 10);
  const matrixAfterReviewFilter = costsheet.buildRateSheet(
    reviewTransportDraft,
    db,
    reviewTransportDraft.hotel_options[0],
    reviewTransportDraft.transport,
  );
  assert.deepEqual(
    matrixAfterReviewFilter,
    matrixBeforeReviewFilter,
    "Review filters do not change Commercial Matrix outputs",
  );
  const guideRangeDraft = {
    ...baseDraft(),
    pax_mode: "range",
    pax_min: 1,
    pax_max: 14,
    guides: [{ ...baseDraft().guides[0], rate: 1000 }],
  };
  const guideRangeRows = costsheet
    .buildRateSheet(guideRangeDraft, db, guideRangeDraft.hotel_options[0], [])
    .flatMap((group) => group.rows);
  assert.deepEqual(
    guideRangeRows.map((row) => row.pax),
    Array.from({ length: 14 }, (_, index) => index + 1),
    "Range Guide costing emits one independent Commercial Matrix row per pax",
  );
  for (const [pax, rawRate] of [
    [5, 1000],
    [6, 1500],
    [14, 1000],
  ]) {
    const row = guideRangeRows.find((item) => item.pax === pax);
    assert.ok(row);
    assert.ok(
      Math.abs(
        row.guide - landPricing.applyLandCommercials(guideRangeDraft, rawRate / pax, 0.05).final,
      ) < 0.01,
      `Commercial Matrix Guide PP at ${pax} pax uses raw slab ${rawRate} and existing commercials once`,
    );
  }
  const optionalGuideDraft = {
    ...reviewTransportDraft,
    guides: reviewTransportDraft.guides.map((line) => ({
      ...line,
      inclusion_status: "optional",
    })),
  };
  const optionalGuideRow = costsheet
    .buildRateSheet(
      optionalGuideDraft,
      db,
      optionalGuideDraft.hotel_options[0],
      optionalGuideDraft.transport,
    )
    .flatMap((group) => group.rows)
    .find((row) => row.pax === 2);
  assert.equal(optionalGuideRow?.guide, 0, "Optional Guide remains outside package costing");
  const optionalActivityDraft = {
    ...reviewTransportDraft,
    activities: reviewTransportDraft.activities.map((line) => ({
      ...line,
      inclusion_status: "optional",
    })),
  };
  const optionalActivityMatrixRow = costsheet
    .buildRateSheet(
      optionalActivityDraft,
      db,
      optionalActivityDraft.hotel_options[0],
      optionalActivityDraft.transport,
    )
    .flatMap((group) => group.rows)
    .find((row) => row.pax === 2);
  assert.equal(
    optionalActivityMatrixRow?.activities,
    0,
    "Optional Activity remains outside package costing",
  );
  const optionalEntranceDraft = {
    ...reviewTransportDraft,
    entrance_rate_selection_by_day: { 1: { indian: [] } },
    costing_selection: {
      ...(reviewTransportDraft.costing_selection ?? {}),
      entrance_cats: { 1: ["indian"] },
    },
  };
  const optionalEntranceMatrixRow = costsheet
    .buildRateSheet(
      optionalEntranceDraft,
      db,
      optionalEntranceDraft.hotel_options[0],
      optionalEntranceDraft.transport,
    )
    .flatMap((group) => group.rows)
    .find((row) => row.pax === 2);
  assert.equal(
    optionalEntranceMatrixRow?.entrances,
    0,
    "Unselected Entrance rate remains outside package costing",
  );
  const standardHotelSheet = costsheet.buildHotelMealSheet(
    reviewTransportDraft,
    db,
    reviewTransportDraft.hotel_options[0],
  );
  const standardMatrixRow = matrixBeforeReviewFilter[0].rows.find((row) => row.pax === 2);
  const standardDoubleSupplierShare = standardHotelSheet.rows.reduce(
    (sum, row) => sum + (row.dbl + row.dbl * calc.gstRateFor(row.dbl)) / 2,
    0,
  );
  assert.ok(
    Math.abs(standardMatrixRow.double - standardDoubleSupplierShare * 1.1 * 1.05) < 0.01,
    "Standard accommodation PP uses the same hotel calculation source",
  );

  const accommodationOnlyDraft = baseDraft();
  accommodationOnlyDraft.query_for = "Accommodation Part";
  accommodationOnlyDraft.commercial_mode = "accommodation_only";
  const preservedLandData = {
    routing: structuredClone(accommodationOnlyDraft.routing),
    transport: structuredClone(accommodationOnlyDraft.transport),
    activities: structuredClone(accommodationOnlyDraft.activities),
    entrances: structuredClone(accommodationOnlyDraft.entrances),
    guides: structuredClone(accommodationOnlyDraft.guides),
    misc: structuredClone(accommodationOnlyDraft.misc),
  };
  const accommodationScenario = scenarioEngine.computeScenario(
    accommodationOnlyDraft,
    { id: "accommodation-only", label: "Accommodation only", option_key: "A" },
    db,
  );
  assert.ok(accommodationScenario);
  assert.equal(accommodationScenario.transport_total, 0);
  assert.equal(accommodationScenario.guide_total, 0);
  assert.equal(accommodationScenario.activities_total, 0);
  assert.equal(accommodationScenario.entrances_total, 0);
  assert.equal(accommodationScenario.misc_total, 0);
  assert.ok(accommodationScenario.hotel_total > 0, "Accommodation-only keeps hotel costing");
  assert.ok(accommodationScenario.meals_total > 0, "Accommodation-only keeps applicable meals");
  const noHotelDraft = {
    ...accommodationOnlyDraft,
    nights: 2,
    routing: [
      { ...accommodationOnlyDraft.routing[0], day: 1, overnight: true },
      {
        ...accommodationOnlyDraft.routing[0],
        day: 2,
        date: "2026-09-23",
        overnight: true,
      },
      {
        ...accommodationOnlyDraft.routing[1],
        day: 3,
        date: "2026-09-24",
        overnight: false,
      },
    ],
    hotel_options: [
      {
        ...accommodationOnlyDraft.hotel_options[0],
        selections: [
          {
            city_id: "city-1",
            routing_day: 1,
            hotel_id: "hotel-1",
            room_id: "room-1",
            meal_plan: "CP",
          },
          {
            city_id: "city-1",
            routing_day: 2,
            hotel_id: "",
            room_id: "",
            meal_plan: "CP",
            no_hotel: true,
          },
        ],
      },
    ],
  };
  const noHotelDataBefore = structuredClone({
    routing: noHotelDraft.routing,
    selections: noHotelDraft.hotel_options[0].selections,
  });
  const noHotelSheet = costsheet.buildHotelMealSheet(
    noHotelDraft,
    db,
    noHotelDraft.hotel_options[0],
  );
  const noHotelScenario = scenarioEngine.computeScenario(
    noHotelDraft,
    { id: "no-hotel-night", label: "No Hotel Night", option_key: "A" },
    db,
  );
  assert.ok(noHotelScenario);
  assert.equal(noHotelSheet.rows.length, 1, "No Hotel night is not costed as an accommodation row");
  assert.equal(noHotelSheet.rows[0].day, 1, "The selected hotel on Night 1 remains present");
  assert.equal(noHotelScenario.hotel_total, accommodationScenario.hotel_total);
  assert.deepEqual(
    { routing: noHotelDraft.routing, selections: noHotelDraft.hotel_options[0].selections },
    noHotelDataBefore,
    "No Hotel does not delete routing or other nightly selections",
  );
  assert.deepEqual(accommodationOnlyDraft.routing, preservedLandData.routing);
  assert.deepEqual(accommodationOnlyDraft.transport, preservedLandData.transport);
  assert.deepEqual(accommodationOnlyDraft.activities, preservedLandData.activities);
  assert.deepEqual(accommodationOnlyDraft.entrances, preservedLandData.entrances);
  assert.deepEqual(accommodationOnlyDraft.guides, preservedLandData.guides);
  assert.deepEqual(accommodationOnlyDraft.misc, preservedLandData.misc);

  const accommodationWithoutRouting = {
    ...accommodationOnlyDraft,
    routing: [],
    program_name: "",
    program_mode: "new",
    new_program_name: "",
    save_program_as_new: false,
  };
  const accommodationReview = validation.validateQuoteForFinalization(
    accommodationWithoutRouting,
    db,
  );
  assert.equal(
    accommodationReview.blockers.some((item) => item.section === "Routing"),
    true,
    "Missing Routing blocks Accommodation-only readiness/finalization",
  );
  assert.equal(
    accommodationReview.blockers.some((item) => item.section === "Program"),
    false,
    "Standalone Accommodation does not require a master Program",
  );

  const switchedBackToPackage = {
    ...accommodationOnlyDraft,
    query_for: "Package",
    commercial_mode: "package",
  };
  assert.equal(queryFor.getQuotationScope(switchedBackToPackage.query_for).routing, true);
  assert.equal(queryFor.getQuotationScope(switchedBackToPackage.query_for).landPart, true);
  assert.deepEqual(switchedBackToPackage.routing, preservedLandData.routing);
  assert.deepEqual(switchedBackToPackage.transport, preservedLandData.transport);

  const close = (actual, expected, message) =>
    assert.ok(
      Math.abs(actual - expected) < 0.001,
      `${message}: expected ${expected}, received ${actual}`,
    );

  // Shared pricing resolver keeps per-person rates intact and divides group slabs only.
  const perPersonActivity = {
    ...db.activities[0],
    price: 1500,
    indian_price: 1500,
    slab_pricing_type: "per_person",
    pricing_slabs: [],
  };
  close(
    masterPricing.activityPricingForPax(perPersonActivity, 1).per_person,
    1500,
    "1-pax activity per-person rate",
  );
  close(
    masterPricing.activityPricingForPax(perPersonActivity, 2).per_person,
    1500,
    "2-pax activity per-person rate",
  );
  const slabActivity = {
    ...perPersonActivity,
    slab_pricing_type: "slab",
    pricing_slabs: [
      { id: "slab-1", from_pax: 1, to_pax: 4, price: 400, type: "indian" },
      { id: "slab-2", from_pax: 5, to_pax: 8, price: 800, type: "indian" },
    ],
  };
  close(
    masterPricing.activityPricingForPax(slabActivity, 1).per_person,
    400,
    "1-pax slab activity per-person rate",
  );
  close(
    masterPricing.activityPricingForPax(slabActivity, 2).per_person,
    200,
    "2-pax slab activity per-person rate",
  );
  close(
    masterPricing.activityPricingForPax(slabActivity, 4).per_person,
    100,
    "4-pax slab activity per-person rate",
  );
  close(
    masterPricing.activityPricingForPax(slabActivity, 5).per_person,
    160,
    "5-pax next slab activity per-person rate",
  );
  close(
    masterPricing.miscRateForPax(db.miscellaneous_items[1], 2, 1).per_person,
    100,
    "Amenities per-person rate",
  );
  close(
    masterPricing.miscRateForPax(db.miscellaneous_items[2], 2, 1).per_person,
    600,
    "Wet tissues per-person rate",
  );
  close(
    masterPricing.miscRateForPax(db.miscellaneous_items[1], 2, 1).per_person +
      masterPricing.miscRateForPax(db.miscellaneous_items[2], 2, 1).per_person,
    700,
    "Combined miscellaneous per-person base",
  );

  // Hotel GST boundary is exactly the approved ₹7,500 rule.
  assert.equal(calc.gstRateFor(7500), 0.05);
  assert.equal(calc.gstRateFor(7500.01), 0.18);

  // CP: both meals chargeable; MAP: dinner included; AP: both included.
  const cp = baseDraft();
  close(calc.computeMealDays(cp, db, "A").total, 1000, "CP meal total");
  const cpRows = calc.calculateMealCostingRows(cp, db, "A");
  assert.equal(cpRows.filter((row) => row.status === "included").length, 2);
  assert.deepEqual(mealsStep.mealDashboardCounts(cpRows), {
    includedLunch: 1,
    includedDinner: 1,
    includedTotal: 2,
    optionalLunch: 0,
    optionalDinner: 0,
    optionalTotal: 0,
  });
  close(
    calc.mealCostingTotal(cp, cpRows, "Lunch", "included").base_total,
    400,
    "Included Lunch group base includes applicable pax",
  );
  close(
    calc.mealCostingTotal(cp, cpRows, "Dinner", "included").base_total,
    600,
    "Included Dinner group base is independent",
  );
  const optionalDinnerState = structuredClone(cp);
  optionalDinnerState.meal_selections_by_option.A["1:city-1"].dinner.inclusion_status = "optional";
  const optionalDinnerRows = calc.calculateMealCostingRows(optionalDinnerState, db, "A");
  assert.deepEqual(mealsStep.mealDashboardCounts(optionalDinnerRows), {
    includedLunch: 1,
    includedDinner: 0,
    includedTotal: 1,
    optionalLunch: 0,
    optionalDinner: 1,
    optionalTotal: 1,
  });
  close(
    calc.computeMealDays(optionalDinnerState, db, "A").total,
    400,
    "moving Dinner to Optional removes it immediately from Included costing",
  );
  close(
    calc.mealCostingTotal(optionalDinnerState, optionalDinnerRows, "Dinner", "optional").base_total,
    600,
    "Optional Dinner remains independently priced",
  );
  const removedDinnerState = structuredClone(optionalDinnerState);
  removedDinnerState.meal_selections_by_option.A["1:city-1"].dinner.inclusion_status = "removed";
  const removedDinnerRows = calc.calculateMealCostingRows(removedDinnerState, db, "A");
  assert.equal(mealsStep.mealDashboardCounts(removedDinnerRows).optionalTotal, 0);
  close(
    calc.computeMealDays(removedDinnerState, db, "A").total,
    400,
    "Removed Dinner contributes nothing",
  );
  assert.equal(
    removedDinnerRows.some((row) => row.meal_type === "Dinner" && row.status !== "hotel_plan"),
    false,
  );
  const reopenedRemovedDinner = JSON.parse(JSON.stringify(removedDinnerState));
  assert.equal(
    reopenedRemovedDinner.meal_selections_by_option.A["1:city-1"].dinner.inclusion_status,
    "removed",
    "Removed state survives draft JSON save/reopen",
  );
  close(
    calc.mealCostingTotal(cp, cpRows, "Lunch", "included").per_person,
    231,
    "Included Lunch per-person final matches existing 10%/5% commercials",
  );
  const map = baseDraft();
  map.hotel_options[0].selections[0].meal_plan = "MAP";
  close(calc.computeMealDays(map, db, "A").total, 400, "MAP lunch-only total");
  const mapRows = calc.calculateMealCostingRows(map, db, "A");
  assert.equal(
    mealsStep.mealDashboardCounts(mapRows).includedDinner,
    1,
    "zero-additional-charge Hotel Plan dinner still counts as one included meal entry",
  );
  assert.equal(
    mapRows.some((row) => row.meal_type === "Dinner" && row.status === "hotel_plan"),
    true,
    "MAP Dinner is visible as Included in Hotel Plan and not charged separately",
  );
  close(
    calc.mealCostingTotal(map, mapRows, "Dinner", "included").base_total,
    0,
    "Hotel-plan Dinner is excluded from separately chargeable totals",
  );
  const ap = baseDraft();
  ap.hotel_options[0].selections[0].meal_plan = "AP";
  close(calc.computeMealDays(ap, db, "A").total, 0, "AP must clear stale meal charges");
  assert.equal(
    calc.calculateMealCostingRows(ap, db, "A").filter((row) => row.status === "hotel_plan").length,
    2,
    "AP covers both separately selected meals without double-counting",
  );

  const daySpecificHotels = baseDraft();
  daySpecificHotels.nights = 2;
  daySpecificHotels.routing = [
    { ...daySpecificHotels.routing[0], day: 1 },
    { ...daySpecificHotels.routing[0], day: 2, date: "2026-09-23" },
    { ...daySpecificHotels.routing[1], day: 3, date: "2026-09-24" },
  ];
  daySpecificHotels.hotel_options[0].selections = [
    { city_id: "city-1", routing_day: 1, hotel_id: "hotel-1", room_id: "room-1", meal_plan: "CP" },
    { city_id: "city-1", routing_day: 2, hotel_id: "hotel-2", room_id: "room-2", meal_plan: "CP" },
  ];
  assert.equal(
    types.hotelSelectionForDay(daySpecificHotels.hotel_options[0], daySpecificHotels.routing[1])
      ?.hotel_id,
    "hotel-2",
    "Same-city stays resolve by routing night",
  );
  const noHotel = baseDraft();
  noHotel.hotel_options[0].selections[0] = {
    ...noHotel.hotel_options[0].selections[0],
    no_hotel: true,
    hotel_id: "",
    room_id: "",
  };
  assert.equal(
    calc.computeOption(noHotel, noHotel.hotel_options[0], db).rate_missing,
    0,
    "No Hotel contributes no required accommodation rate",
  );
  const optionalMeal = baseDraft();
  optionalMeal.meal_selections_by_option.A["1:city-1"].dinner.inclusion_status = "optional";
  close(
    calc.computeMealDays(optionalMeal, db, "A").total,
    400,
    "Optional meals stay out of base meal costing",
  );
  const noMeals = baseDraft();
  noMeals.meal_selections_by_option.A = {};
  noMeals.meal_selections = {};
  assert.equal(
    mealsStep.mealDashboardCounts(calc.calculateMealCostingRows(noMeals, db, "A")).includedTotal,
    0,
    "No Meal selections do not appear in dashboard counts",
  );
  const independentOptions = structuredClone(cp);
  independentOptions.hotel_options.push({
    ...structuredClone(independentOptions.hotel_options[0]),
    key: "B",
    label: "Excellent Budget",
  });
  independentOptions.meal_selections_by_option.B = {
    "1:city-1": {
      lunch: {
        source: "hotel",
        hotel_id: "hotel-1",
        label: "Audit Hotel",
        per_person_rate: 200,
        inclusion_status: "optional",
      },
    },
  };
  const optionACounts = mealsStep.mealDashboardCounts(
    calc.calculateMealCostingRows(independentOptions, db, "A"),
  );
  const optionBCounts = mealsStep.mealDashboardCounts(
    calc.calculateMealCostingRows(independentOptions, db, "B"),
  );
  assert.equal(optionACounts.includedTotal, 2);
  assert.equal(optionBCounts.includedTotal, 0);
  assert.equal(optionBCounts.optionalLunch, 1, "meal dashboard counts remain option-specific");

  const landMeals = baseDraft();
  landMeals.query_for = "Land Part + Meals";
  landMeals.hotel_options[0].selections[0].meal_plan = "AP";
  close(
    calc.computeMealDays(landMeals, db, "A").total,
    1000,
    "Land + Meals ignores hotel meal-plan coverage",
  );
  const landMealsRow = costsheet
    .buildRateSheet(
      landMeals,
      db,
      { key: "A", label: "Land + Meals", selections: [] },
      landMeals.transport,
    )
    .flatMap((group) => group.rows)[0];
  close(landMealsRow.single, 0, "Land + Meals excludes accommodation PP");
  close(landMealsRow.lunch, 231, "Land + Meals keeps finalized Lunch PP");
  close(landMealsRow.dinner, 346.5, "Land + Meals keeps finalized Dinner PP");
  close(
    landMealsRow.pkg_single,
    landMealsRow.transport +
      landMealsRow.entrances +
      landMealsRow.guide +
      landMealsRow.escort +
      landMealsRow.activities +
      landMealsRow.misc +
      landMealsRow.lunch +
      landMealsRow.dinner,
    "Final Land + Meals PP is land plus selected meals only",
  );

  // Fixed-number reconciliation: 2 pax, one DBL room, land ₹13,700,
  // meals ₹1,000. Supplier room GST then separate 10%/5% commercial layers.
  // The shared costing-pax resolver is the source of truth for every Land
  // costing surface: Exact has one actual traveller-total row; Range expands
  // only its requested bounds.
  const exactPax20 = {
    ...baseDraft(),
    pax_mode: "exact",
    adults: 16,
    ss: 1,
    children: [{}, {}, {}],
  };
  assert.deepEqual(calc.getCostingPaxValues(exactPax20), [20], "Exact 20 has one costing pax");
  assert.deepEqual(
    calc.getCostingPaxValues({ ...baseDraft(), pax_mode: "range", pax_min: 1, pax_max: 20 }),
    Array.from({ length: 20 }, (_, index) => index + 1),
    "Range 1-20 expands every requested pax",
  );
  assert.deepEqual(
    calc.getCostingPaxValues({ ...baseDraft(), pax_mode: "range", pax_min: 6, pax_max: 10 }),
    [6, 7, 8, 9, 10],
    "Range 6-10 preserves its lower bound",
  );

  const exact = baseDraft();
  const scenario = scenarioEngine.computeScenario(
    exact,
    {
      id: "audit",
      label: "Audit",
      option_key: "A",
      transport_line_id: "transport-small",
    },
    db,
  );
  assert.ok(scenario);
  close(
    scenario.transport_total +
      scenario.guide_total +
      scenario.activities_total +
      scenario.entrances_total +
      scenario.misc_total,
    13700,
    "Land source total",
  );
  close(scenario.grand_total, 21829.5, "Scenario grand total");
  close(scenario.per_person_avg, 10914.75, "Scenario per-person result");
  close(scenario.optionals_total, 0, "No optional selected");

  const accommodationRateSheet = costsheet.buildRateSheet(
    accommodationOnlyDraft,
    db,
    accommodationOnlyDraft.hotel_options[0],
    accommodationOnlyDraft.transport,
  );
  assert.equal(accommodationRateSheet.length, 1);
  close(
    accommodationRateSheet[0].rows[0].transport,
    0,
    "Accommodation-only rate sheet excludes transport",
  );
  close(
    accommodationRateSheet[0].rows[0].guide,
    0,
    "Accommodation-only rate sheet excludes guides/escort",
  );
  close(
    accommodationRateSheet[0].rows[0].entrances,
    0,
    "Accommodation-only rate sheet excludes entrances",
  );
  close(
    accommodationRateSheet[0].rows[0].activities,
    0,
    "Accommodation-only rate sheet excludes activities",
  );
  close(accommodationRateSheet[0].rows[0].misc, 0, "Accommodation-only rate sheet excludes misc");
  assert.ok(
    accommodationRateSheet[0].rows[0].double > 0,
    "Accommodation-only rate sheet retains rooms",
  );
  assert.ok(
    accommodationRateSheet[0].rows[0].lunch > 0,
    "Accommodation-only rate sheet retains meals",
  );

  const restoredPackageScenario = scenarioEngine.computeScenario(
    switchedBackToPackage,
    {
      id: "restored-package",
      label: "Restored Package",
      option_key: "A",
      transport_line_id: "transport-small",
    },
    db,
  );
  assert.ok(restoredPackageScenario);
  close(
    restoredPackageScenario.transport_total,
    scenario.transport_total,
    "Package transport restores",
  );
  close(restoredPackageScenario.guide_total, scenario.guide_total, "Package guides restore");
  close(
    restoredPackageScenario.activities_total,
    scenario.activities_total,
    "Package activities restore",
  );

  // Two configured per-person activities and misc lines retain their rates at 2 pax.
  const miscActivityDraft = baseDraft();
  db.activities.push({
    ...perPersonActivity,
    id: "night-sarafa",
    activity_name: "Night Sarafa Food Market",
  });
  db.activities.push({ ...slabActivity, id: "e-rikshaw", activity_name: "E Rikshaw at Indore" });
  miscActivityDraft.activities = [
    {
      id: "sarafa-line",
      activity_id: "night-sarafa",
      qty: 2,
      rate: 1500,
      pricing_mode: "per_person",
      from_routing_days: [1],
    },
  ];
  miscActivityDraft.misc = [
    {
      id: "amenities-line",
      item_id: "amenities",
      qty: 2,
      rate: 100,
      unit: "per_person",
      from_routing_days: [1],
    },
    {
      id: "tissues-line",
      item_id: "wet-tissues",
      qty: 2,
      rate: 600,
      unit: "per_person",
      from_routing_days: [1],
    },
  ];
  close(
    costsheet.buildLandPart(miscActivityDraft, db).activities_total,
    3000,
    "Per-person activity group total",
  );
  close(
    costsheet.buildLandPart(miscActivityDraft, db).misc_total,
    1400,
    "Selected misc group total",
  );
  close(
    calc.computeAddonsTotal(miscActivityDraft, db) -
      calc.computeAddonsTotal({ ...miscActivityDraft, misc: [] }, db),
    1400,
    "Misc included in Step 8 add-ons",
  );
  const miscRateSheet = costsheet.buildRateSheet(
    miscActivityDraft,
    db,
    miscActivityDraft.hotel_options[0],
    miscActivityDraft.transport,
  );
  close(
    miscRateSheet[0].rows[0].activities,
    1732.5,
    "Per-person activity rate-sheet value incl. markup/GST",
  );
  close(miscRateSheet[0].rows[0].misc, 808.5, "Misc per-person rate-sheet value incl. markup/GST");
  const deselectedMisc = {
    ...miscActivityDraft,
    costing_selection: { misc: { 1: [] } },
  };
  close(
    costsheet.buildLandPart(deselectedMisc, db).misc_total,
    0,
    "Unchecked misc contributes zero to costing sheet",
  );
  close(
    calc.computeAddonsTotal(deselectedMisc, db) -
      calc.computeAddonsTotal({ ...deselectedMisc, misc: [] }, db),
    0,
    "Unchecked misc contributes zero to addon total",
  );
  const inactiveMiscDraft = {
    ...miscActivityDraft,
    misc: [
      {
        id: "inactive-line",
        item_id: "inactive-misc",
        qty: 2,
        rate: 999,
        unit: "per_person",
        from_routing_days: [1],
      },
    ],
  };
  close(
    costsheet.buildLandPart(inactiveMiscDraft, db).misc_total,
    0,
    "Inactive misc excluded from costing",
  );

  const slabActivityDraft = baseDraft();
  db.activities.push({ ...slabActivity, id: "slab-activity", activity_name: "Slab Activity" });
  slabActivityDraft.activities = [
    {
      id: "slab-line",
      activity_id: "slab-activity",
      qty: 1,
      rate: 400,
      pricing_mode: "slab",
      from_routing_days: [1],
    },
  ];
  const slabRateSheet = costsheet.buildRateSheet(
    slabActivityDraft,
    db,
    slabActivityDraft.hotel_options[0],
    slabActivityDraft.transport,
  );
  close(slabRateSheet[0].rows[0].activities, 231, "2-pax slab rate-sheet value incl. markup/GST");
  const combinedActivityDraft = {
    ...miscActivityDraft,
    activities: [
      ...miscActivityDraft.activities,
      {
        id: "rikshaw-line",
        activity_id: "e-rikshaw",
        qty: 1,
        rate: 400,
        pricing_mode: "slab",
        from_routing_days: [1],
      },
    ],
  };
  close(
    costsheet.buildLandPart(combinedActivityDraft, db).activities_per_person_total,
    1700,
    "Activity base per person combines flat and group slab pricing",
  );
  const combinedActivityRateSheet = costsheet.buildRateSheet(
    combinedActivityDraft,
    db,
    combinedActivityDraft.hotel_options[0],
    combinedActivityDraft.transport,
  );
  close(
    combinedActivityRateSheet[0].rows[0].activities,
    1963.5,
    "Combined activity per-person costing incl. existing markup/GST chain",
  );

  // Step 6 resolved per-person values are shared by Step 8, rate sheets, and scenarios,
  // including the next activity slab at 5 pax.
  for (const [pax, expectedActivityBase] of [
    [1, 1900],
    [2, 1700],
    [5, 1660],
  ]) {
    const paxDraft = { ...combinedActivityDraft, adults: pax };
    const land = costsheet.buildLandPart(paxDraft, db);
    close(
      land.activities_per_person_total,
      expectedActivityBase,
      `${pax}-pax Step 8 activity base`,
    );
    close(land.misc_per_person_total, 700, `${pax}-pax Step 8 misc base`);
    const sheet = costsheet.buildRateSheet(paxDraft, db, paxDraft.hotel_options[0], []);
    close(
      sheet[0].rows[0].activities,
      expectedActivityBase * 1.1 * 1.05,
      `${pax}-pax rate-sheet activity final`,
    );
    close(sheet[0].rows[0].misc, 700 * 1.1 * 1.05, `${pax}-pax rate-sheet misc final`);
    const scenarioForPax = scenarioEngine.computeScenario(
      paxDraft,
      {
        id: `pricing-${pax}`,
        label: "Pricing",
        option_key: "A",
      },
      db,
    );
    close(
      scenarioForPax.persons[0].activities,
      expectedActivityBase,
      `${pax}-pax scenario activity base`,
    );
    close(scenarioForPax.persons[0].misc, 700, `${pax}-pax scenario misc base`);
  }

  const slabMisc = {
    ...db.miscellaneous_items[1],
    id: "slab-misc",
    name: "chocklets",
    rate: 600,
    unit: "fixed",
    pricing_type: "slab",
    slab_is_per_person: true,
    price_ranges: [
      { from_pax: 1, to_pax: 6, price: 600 },
      { from_pax: 7, to_pax: 20, price: 1200 },
    ],
  };
  db.miscellaneous_items.push(slabMisc);
  const miscSlabDraft = {
    ...baseDraft(),
    misc: [
      {
        id: "misc-slab-line",
        item_id: slabMisc.id,
        qty: 1,
        rate: 400,
        unit: "fixed",
        from_routing_days: [1],
      },
    ],
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
    close(
      costsheet.buildLandPart(paxDraft, db).misc_per_person_total,
      expectedMiscBase,
      `${pax}-pax Step 8 slab misc base`,
    );
    close(
      calc.computeAddonsTotal(paxDraft, db) -
        calc.computeAddonsTotal({ ...paxDraft, misc: [] }, db),
      expectedGroupCost,
      `${pax}-pax misc slab add-on total`,
    );
    const sheet = costsheet.buildRateSheet(paxDraft, db, paxDraft.hotel_options[0], []);
    close(
      sheet[0].rows[0].misc,
      expectedMiscBase * 1.1 * 1.05,
      `${pax}-pax rate-sheet slab misc final`,
    );
    const scenarioForPax = scenarioEngine.computeScenario(
      paxDraft,
      {
        id: `misc-slab-${pax}`,
        label: "Misc slab",
        option_key: "A",
      },
      db,
    );
    close(scenarioForPax.persons[0].misc, expectedMiscBase, `${pax}-pax scenario slab misc base`);
  }

  const mixedMiscDraft = {
    ...baseDraft(),
    misc: [
      {
        id: "amenities-selected",
        item_id: "amenities",
        qty: 2,
        rate: 100,
        unit: "per_person",
        from_routing_days: [1],
      },
      {
        id: "tissues-selected",
        item_id: "wet-tissues",
        qty: 2,
        rate: 600,
        unit: "per_person",
        from_routing_days: [1],
      },
      {
        id: "chocklets-selected",
        item_id: slabMisc.id,
        qty: 1,
        rate: 600,
        unit: "fixed",
        from_routing_days: [1],
      },
    ],
  };
  close(
    costsheet.buildLandPart(mixedMiscDraft, db).misc_per_person_total,
    1000,
    "2-pax combined misc base per person",
  );
  const mixedMiscSheet = costsheet.buildRateSheet(
    mixedMiscDraft,
    db,
    mixedMiscDraft.hotel_options[0],
    [],
  );
  close(mixedMiscSheet[0].rows[0].misc, 1155, "2-pax combined misc final per person");
  const mixedMiscScenario = scenarioEngine.computeScenario(
    mixedMiscDraft,
    {
      id: "mixed-misc",
      label: "Miscellaneous",
      option_key: "A",
    },
    db,
  );
  close(mixedMiscScenario.persons[0].misc, 1000, "2-pax combined misc scenario base per person");

  // Optional supplements are visible but never silently enter package totals.
  const withOptional = baseDraft();
  withOptional.optionals = [{ id: "optional", custom_name: "Airfare", qty: 1, rate: 99999 }];
  const scenarioWithOptional = scenarioEngine.computeScenario(
    withOptional,
    {
      id: "audit-optionals",
      label: "Audit",
      option_key: "A",
      transport_line_id: "transport-small",
    },
    db,
  );
  close(scenarioWithOptional.grand_total, scenario.grand_total, "Optional isolation");
  close(scenarioWithOptional.optionals_total, 99999, "Optional display total");

  // Rate-sheet result must reconcile with the scenario for the exact DBL case.
  const rateSheet = costsheet.buildRateSheet(exact, db, exact.hotel_options[0], exact.transport);
  assert.equal(rateSheet.length, 1);
  assert.deepEqual(
    rateSheet[0].rows.map((row) => row.pax),
    [2],
  );
  close(rateSheet[0].rows[0].pkg_double, scenario.per_person_avg, "Rate sheet vs scenario");

  // Range rows are bounded by both the requested range and each vehicle's
  // actual capacity; an ineligible vehicle must never fall back to all rows.
  const range = baseDraft();
  range.pax_mode = "range";
  range.pax_min = 2;
  range.pax_max = 5;
  range.pax_range = "2-5";
  range.transport = [
    range.transport[0],
    {
      ...range.transport[0],
      id: "transport-large",
      travel_id: "large",
      per_route_rates: [15000, 0],
    },
  ];
  const rangeSheet = costsheet.buildRateSheet(range, db, range.hotel_options[0], range.transport);
  assert.deepEqual(
    rangeSheet.find((group) => group.line_id === "transport-small").rows.map((row) => row.pax),
    [2, 3, 4],
  );
  assert.deepEqual(
    rangeSheet.find((group) => group.line_id === "transport-large").rows.map((row) => row.pax),
    [5],
  );

  // Two vehicle options remain independent alternatives, never one sum.
  const exactAlternatives = baseDraft();
  exactAlternatives.transport.push({
    ...exactAlternatives.transport[0],
    id: "transport-large",
    travel_id: "large",
    per_route_rates: [15000, 0],
  });
  const alternatives = costsheet.buildRateSheet(
    exactAlternatives,
    db,
    exactAlternatives.hotel_options[0],
    exactAlternatives.transport,
  );
  assert.equal(alternatives.length, 1, "Large vehicle is correctly excluded for exact 2 pax");
  close(alternatives[0].rows[0].transport, 5775, "Small vehicle independent transport PP");

  // Dynamic accommodation is exact-pax only and must cover every traveller.
  const dynamicValid = baseDraft();
  dynamicValid.dynamic_days = [1];
  dynamicValid.hotel_options[0].dynamic_allocations = {
    1: [{ id: "dynamic-double", room_id: "room-1", occupancy: "double", rooms: 1 }],
  };
  const dynamicRoomResolution = calc.dynamicAccommodationRoomLines(
    dynamicValid,
    dynamicValid.hotel_options[0],
    db,
  );
  assert.equal(dynamicRoomResolution.lines.length, 1);
  assert.deepEqual(
    {
      room: dynamicRoomResolution.lines[0].room_name,
      occupancy: dynamicRoomResolution.lines[0].occupancy,
      quantity: dynamicRoomResolution.lines[0].rooms,
      capacity: dynamicRoomResolution.lines[0].capacity,
    },
    { room: "Deluxe", occupancy: "double", quantity: 1, capacity: 2 },
  );
  close(dynamicRoomResolution.lines[0].net_rate, 4000, "Dynamic review Net matches StepHotels");
  close(
    dynamicRoomResolution.lines[0].supplier_gst_per_room,
    200,
    "Dynamic review supplier GST matches StepHotels",
  );
  close(
    dynamicRoomResolution.lines[0].rate_inclusive_gst,
    4200,
    "Dynamic review incl-GST rate matches StepHotels",
  );
  close(
    dynamicRoomResolution.lines[0].line_total,
    4200,
    "Dynamic review line total matches StepHotels",
  );
  const dynamicBreakdown = calc.dynamicAccommodationBreakdown(
    dynamicValid,
    dynamicValid.hotel_options[0],
    db,
  );
  close(dynamicBreakdown.net, 4000, "Dynamic shared resolver net total");
  close(dynamicBreakdown.supplier_gst, 200, "Dynamic shared resolver GST total");
  close(dynamicBreakdown.total, 4200, "Dynamic shared resolver StepHotels total");
  assert.equal(dynamicBreakdown.capacity, 2);

  // The routing-night key remains authoritative when Step 8's accommodation
  // city uses a different master-ID namespace from the itinerary city.
  const fourNightDb = structuredClone(db);
  fourNightDb.cities = [1, 2, 3, 4].map((day) => ({
    id: `route-city-${day}`,
    name: ["Ujjain", "Indore", "Indore", "Bhopal"][day - 1],
  }));
  fourNightDb.hotels = [1, 2, 3, 4].map((day) => ({
    ...db.hotels[0],
    id: `hotel-${day}`,
    city_id: `accommodation-city-${day}`,
    name: ["Perfectstayz Premium Shree Narayana", "Kyraid by OTHPL", "Kyraid by OTHPL", "Subh Inn"][
      day - 1
    ],
  }));
  fourNightDb.room_categories = [1, 2, 3, 4].map((day) => ({
    id: `room-${day}`,
    hotel_id: `hotel-${day}`,
    name: "Deluxe",
    created_at: now,
  }));
  fourNightDb.rate_plans = [1, 2, 3, 4].map((day) => ({
    ...db.rate_plans[0],
    id: `four-night-rate-${day}`,
    room_category_id: `room-${day}`,
    single_rate: day === 4 ? 2000 : day === 3 ? 2850 : 3000,
    double_rate: 2850,
    extra_bed_rate: day === 4 ? 2150 : 1000,
  }));
  const fourNightDynamic = {
    ...baseDraft(),
    adults: 4,
    nights: 4,
    allocation_mode: "dynamic",
    dynamic_days: [1, 2, 3, 4],
    routing: [1, 2, 3, 4]
      .map((day) => ({
        ...baseDraft().routing[0],
        day,
        date: `2026-11-0${day + 2}`,
        city_id: `route-city-${day}`,
        overnight: true,
      }))
      .concat({
        ...baseDraft().routing[1],
        day: 5,
        date: "2026-11-07",
      }),
    hotel_options: [
      {
        ...structuredClone(baseDraft().hotel_options[0]),
        selections: [
          ...[1, 2, 3].map((day) => ({
            routing_day: day,
            city_id: `accommodation-city-${day}`,
            hotel_id: `hotel-${day}`,
            room_id: `room-${day}`,
            meal_plan: "CP",
          })),
          {
            routing_day: 4,
            city_id: "route-city-4",
            hotel_id: "",
            room_id: "",
            meal_plan: "CP",
            no_hotel: true,
            accommodation_status: "no_hotel_required",
          },
          {
            routing_day: 4,
            city_id: "accommodation-city-4",
            hotel_id: "hotel-4",
            room_id: "room-4",
            meal_plan: "CP",
            no_hotel: false,
          },
        ],
        dynamic_allocations: {
          1: [{ id: "day-1-double", room_id: "room-1", occupancy: "double", rooms: 2 }],
          2: [{ id: "day-2-double", room_id: "room-2", occupancy: "double", rooms: 2 }],
          3: [{ id: "day-3-single", room_id: "room-3", occupancy: "single", rooms: 4 }],
          4: [
            { id: "day-4-triple", room_id: "room-4", occupancy: "triple", rooms: 1 },
            { id: "day-4-single", room_id: "room-4", occupancy: "single", rooms: 1 },
          ],
        },
      },
    ],
  };
  assert.equal(
    types.accommodationMode(fourNightDynamic),
    "dynamic",
    "Explicit Dynamic mode is authoritative for the active accommodation option",
  );
  const standardWithStaleDynamicData = {
    ...fourNightDynamic,
    allocation_mode: "standard",
    // Simulates a draft switched back to Standard before legacy Dynamic data
    // (days, mixes and room combinations) is retained for a later switch.
    dynamic_days: [1, 2, 3, 4],
  };
  assert.equal(
    types.accommodationMode(standardWithStaleDynamicData),
    "standard",
    "Explicit Standard mode ignores retained Dynamic day state",
  );
  close(
    calc.dynamicAccommodationBreakdown(
      standardWithStaleDynamicData,
      standardWithStaleDynamicData.hotel_options[0],
      fourNightDb,
    ).total,
    0,
    "Inactive Dynamic room combinations do not contribute while Standard is active",
  );
  const legacyDynamicMode = { ...fourNightDynamic, allocation_mode: undefined };
  assert.equal(
    types.accommodationMode(legacyDynamicMode),
    "dynamic",
    "Legacy drafts without allocation_mode retain their saved Dynamic state",
  );
  assert.equal(
    types.accommodationMode(JSON.parse(JSON.stringify(standardWithStaleDynamicData))),
    "standard",
    "Save and reload retain the explicitly selected Standard mode",
  );
  assert.equal(
    draftStore.normalizeDraft(structuredClone(standardWithStaleDynamicData)).allocation_mode,
    "standard",
    "Draft hydration preserves explicitly selected Standard mode with historical Dynamic data",
  );
  assert.equal(
    hotelsStep.isDynamicHotelMode(standardWithStaleDynamicData),
    false,
    "Step 8 does not mask Standard mode with retained Dynamic state",
  );
  assert.equal(
    hotelsStep.isDynamicHotelMode(fourNightDynamic),
    true,
    "Step 8 keeps explicitly selected Dynamic mode active",
  );
  assert.equal(
    hotelsStep.isDynamicHotelMode({
      ...standardWithStaleDynamicData,
      allocation_mode: "dynamic",
    }),
    true,
    "Standard → Dynamic → Standard mode switching remains explicit and reversible",
  );
  assert.equal(
    types.hotelSelectionForDay(fourNightDynamic.hotel_options[0], fourNightDynamic.routing[3], true)
      ?.hotel_id,
    "hotel-4",
    "Day 4 resolves by routing-night identity across city ID namespaces",
  );
  const resumedFourNightDynamic = JSON.parse(JSON.stringify(fourNightDynamic));
  assert.equal(
    types.hotelSelectionForDay(
      resumedFourNightDynamic.hotel_options[0],
      resumedFourNightDynamic.routing[3],
      true,
    )?.hotel_id,
    "hotel-4",
    "Day 4 Subh Inn survives draft serialization and resume",
  );
  const dayFourNoHotelOnly = structuredClone(fourNightDynamic.hotel_options[0]);
  dayFourNoHotelOnly.selections = dayFourNoHotelOnly.selections.filter(
    (selection) => selection.routing_day !== 4 || selection.no_hotel,
  );
  assert.equal(
    types.hotelSelectionForDay(dayFourNoHotelOnly, fourNightDynamic.routing[3], true)
      ?.accommodation_status,
    "no_hotel_required",
    "An explicit No Hotel Required selection is not converted into a failed hotel lookup",
  );
  const latestNoHotel = structuredClone(fourNightDynamic.hotel_options[0]);
  latestNoHotel.selections.push({
    routing_day: 4,
    city_id: "route-city-4",
    hotel_id: "",
    room_id: "",
    meal_plan: "CP",
    no_hotel: true,
    accommodation_status: "no_hotel_required",
  });
  assert.equal(
    types.resolveHotelSelectionForDay(latestNoHotel, fourNightDynamic.routing[3], true).reason,
    "latest_explicit_exemption",
    "The most recent explicit No Hotel Required choice supersedes stale hotel allocations",
  );
  const ambiguousDayFour = structuredClone(fourNightDynamic.hotel_options[0]);
  ambiguousDayFour.selections.splice(ambiguousDayFour.selections.length - 1, 0, {
    routing_day: 4,
    city_id: "another-accommodation-city-4",
    hotel_id: "another-hotel-4",
    room_id: "room-4",
    meal_plan: "CP",
    no_hotel: false,
  });
  ambiguousDayFour.selections.push({
    routing_day: 4,
    city_id: "route-city-4",
    hotel_id: "",
    room_id: "",
    meal_plan: "CP",
    no_hotel: false,
  });
  assert.equal(
    types.resolveHotelSelectionForDay(ambiguousDayFour, fourNightDynamic.routing[3], true).reason,
    "ambiguous",
    "An incomplete latest record exposes a duplicate conflict instead of choosing arbitrarily",
  );
  assert.equal(
    types.hotelSelectionForDay(ambiguousDayFour, fourNightDynamic.routing[3], true),
    undefined,
    "An ambiguous Dynamic night does not silently resolve through the legacy city fallback",
  );
  const contradictoryDayFour = structuredClone(fourNightDynamic);
  const contradictorySelection = contradictoryDayFour.hotel_options[0].selections.at(-1);
  contradictorySelection.no_hotel = true;
  contradictorySelection.accommodation_status = "own_arrangement";
  contradictorySelection.room_id = "";
  assert.equal(
    types.hasHotelExemptionConflict(contradictorySelection),
    true,
    "A saved hotel ID plus Own Arrangement is surfaced as a conflict",
  );
  assert.equal(
    types.resolveHotelSelectionForDay(
      contradictoryDayFour.hotel_options[0],
      contradictoryDayFour.routing[3],
      true,
    ).reason,
    "conflicting_hotel_exemption",
    "The real contradictory record shape is not silently reinterpreted as a booking",
  );
  close(
    calc.dynamicAccommodationBreakdown(
      contradictoryDayFour,
      contradictoryDayFour.hotel_options[0],
      fourNightDb,
    ).total,
    23940,
    "A genuine Own Arrangement exemption remains excluded before confirmation",
  );
  contradictoryDayFour.hotel_options[0].selections[
    contradictoryDayFour.hotel_options[0].selections.length - 1
  ] = {
    ...contradictorySelection,
    ...hotelsStep.hotelBookingConfirmationPatch(),
  };
  assert.equal(
    types.hasHotelExemptionConflict(contradictoryDayFour.hotel_options[0].selections.at(-1)),
    false,
    "Explicit hotel confirmation clears only contradictory exemption state",
  );
  close(
    calc.dynamicAccommodationBreakdown(
      contradictoryDayFour,
      contradictoryDayFour.hotel_options[0],
      fourNightDb,
    ).total,
    31290,
    "Confirmed hotel booking restores the existing Day 4 allocations exactly once",
  );
  assert.deepEqual(
    contradictoryDayFour.hotel_options[0].dynamic_allocations[4].map((allocation) => allocation.id),
    ["day-4-triple", "day-4-single"],
    "Confirmation preserves both saved Day 4 room combinations",
  );
  const unrelatedAllocatedRoom = structuredClone(fourNightDynamic.hotel_options[0]);
  unrelatedAllocatedRoom.dynamic_allocations[4] = [
    { id: "unrelated-room", room_id: "room-not-on-selection", occupancy: "double", rooms: 2 },
  ];
  assert.equal(
    types.hotelSelectionForDay(unrelatedAllocatedRoom, fourNightDynamic.routing[3], true)?.hotel_id,
    "hotel-4",
    "A sole valid hotel row remains authoritative when a stale allocation cannot identify it",
  );
  const fourNightLines = calc.dynamicAccommodationRoomLines(
    fourNightDynamic,
    fourNightDynamic.hotel_options[0],
    fourNightDb,
  );
  assert.deepEqual(
    fourNightLines.lines.map((line) => line.day),
    [1, 2, 3, 4, 4],
    "Final Review receives every night and both Day 4 room combinations",
  );
  assert.equal(
    fourNightLines.lines
      .filter((line) => line.day === 4)
      .reduce((sum, line) => sum + line.capacity, 0),
    4,
    "Day 4 Triple + Single allocation covers all four travellers",
  );
  close(
    fourNightLines.lines
      .filter((line) => line.day === 4)
      .reduce((sum, line) => sum + line.line_total, 0),
    7350,
    "Day 4 Triple + Single supplier-inclusive cost is included exactly once",
  );
  const fourNightBreakdown = calc.dynamicAccommodationBreakdown(
    fourNightDynamic,
    fourNightDynamic.hotel_options[0],
    fourNightDb,
  );
  close(
    fourNightBreakdown.total,
    fourNightLines.lines.reduce((sum, line) => sum + line.line_total, 0),
    "Four-night Final Review total uses every authoritative room line exactly once",
  );
  close(fourNightBreakdown.total, 31290, "Four-night supplier-inclusive total");
  close(
    fourNightBreakdown.total * calc.hotelsMarkup(fourNightDynamic),
    3129,
    "Four-night accommodation markup",
  );
  close(
    fourNightBreakdown.total *
      (1 + calc.hotelsMarkup(fourNightDynamic)) *
      calc.hotelsGst(fourNightDynamic),
    1720.95,
    "Four-night accommodation GST",
  );
  close(
    fourNightBreakdown.total *
      (1 + calc.hotelsMarkup(fourNightDynamic)) *
      (1 + calc.hotelsGst(fourNightDynamic)),
    36139.95,
    "Four-night final accommodation total rounds to 36,140",
  );
  close(
    (fourNightBreakdown.total *
      (1 + calc.hotelsMarkup(fourNightDynamic)) *
      (1 + calc.hotelsGst(fourNightDynamic))) /
      4,
    (fourNightBreakdown.total * 1.1 * 1.05) / 4,
    "Dynamic accommodation PP uses the authoritative four-night total",
  );
  const fourNightMatrixRows = costsheet
    .buildRateSheet(fourNightDynamic, fourNightDb, fourNightDynamic.hotel_options[0], [])
    .flatMap((group) => group.rows);
  const fourPaxMatrixRow = fourNightMatrixRows.find((row) => row.pax === 4);
  assert.ok(fourPaxMatrixRow, "Commercial Package Matrix exposes the four-pax Dynamic row");
  close(
    fourPaxMatrixRow.single,
    36139.95 / 4,
    "Commercial Package Matrix uses the same Dynamic accommodation total",
  );
  const priorMasterDb = masterPricing.db.get();
  masterPricing.db.hydrateAll(fourNightDb);
  const standardWithHistoricalDynamicMarkup = renderToStaticMarkup(
    createElement(packageStandardReview.PackageStandardCostingReview, {
      draft: standardWithStaleDynamicData,
      set: () => undefined,
      readOnly: true,
    }),
  );
  assert.ok(
    standardWithHistoricalDynamicMarkup.includes("Standard Hotel Mode"),
    "Final review follows explicitly selected Standard mode",
  );
  assert.ok(
    !standardWithHistoricalDynamicMarkup.includes("Dynamic Room-wise Rate Verification") &&
      !standardWithHistoricalDynamicMarkup.includes("Allocation or rate validation pending"),
    "Final review and commercial matrix ignore inactive Dynamic allocations",
  );
  const fourNightMarkup = renderToStaticMarkup(
    createElement(dynamicReview.AccommodationDynamicCostingReview, {
      draft: fourNightDynamic,
      options: fourNightDynamic.hotel_options,
      embedded: true,
    }),
  );
  masterPricing.db.hydrateAll(priorMasterDb);
  assert.ok(fourNightMarkup.includes("Subh Inn"), "Rendered Final Review contains Day 4 hotel");
  assert.ok(
    fourNightMarkup.includes("Deluxe Triple") && fourNightMarkup.includes("Deluxe Single"),
    "Rendered Final Review contains both Day 4 room combinations",
  );
  assert.ok(
    !fourNightMarkup.includes("No Hotel Required") && !fourNightMarkup.includes("Own Arrangement"),
    "Completed Day 4 hotel is not rendered as an accommodation exemption",
  );
  const standardBeforeDynamicReview = costsheet.buildRateSheet(
    { ...dynamicValid, allocation_mode: "standard", dynamic_days: [] },
    db,
    dynamicValid.hotel_options[0],
    dynamicValid.transport,
  );
  assert.equal(standardBeforeDynamicReview[0].rows[0].double > 0, true);
  calc.dynamicAccommodationRoomLines(dynamicValid, dynamicValid.hotel_options[0], db);
  assert.deepEqual(
    costsheet.buildRateSheet(
      { ...dynamicValid, allocation_mode: "standard", dynamic_days: [] },
      db,
      dynamicValid.hotel_options[0],
      dynamicValid.transport,
    ),
    standardBeforeDynamicReview,
    "Dynamic review resolution leaves Standard accommodation matrix outputs unchanged",
  );

  const dynamicNoHotel = structuredClone(dynamicValid);
  dynamicNoHotel.hotel_options[0].selections[0].no_hotel = true;
  const noHotelDynamicResolution = calc.dynamicAccommodationRoomLines(
    dynamicNoHotel,
    dynamicNoHotel.hotel_options[0],
    db,
  );
  assert.equal(
    noHotelDynamicResolution.lines.length,
    0,
    "No Hotel renders no fabricated room lines",
  );
  assert.equal(
    calc.dynamicAccommodationBreakdown(dynamicNoHotel, dynamicNoHotel.hotel_options[0], db).total,
    0,
    "No Hotel night contributes zero accommodation cost",
  );
  dynamicValid.rate_sheet_rows = { "A|transport-small": [2] };
  assert.equal(validation.validateQuoteForFinalization(dynamicValid, db).blockers.length, 0);
  const dynamicOverrideWithoutReason = structuredClone(dynamicValid);
  dynamicOverrideWithoutReason.hotel_options[0].dynamic_allocations[1][0].manual_net_rate = 4500;
  dynamicOverrideWithoutReason.hotel_options[0].dynamic_allocations[1][0].original_net_rate = 4000;
  dynamicOverrideWithoutReason.hotel_options[0].dynamic_allocations[1][0].changed_by = "Audit User";
  dynamicOverrideWithoutReason.hotel_options[0].dynamic_allocations[1][0].changed_at = now;
  assert.ok(
    validation
      .validateQuoteForFinalization(dynamicOverrideWithoutReason, db)
      .blockers.some((item) => item.code.startsWith("DYNAMIC_OVERRIDE_REASON_")),
  );
  const dynamicOverrideWithReason = structuredClone(dynamicOverrideWithoutReason);
  dynamicOverrideWithReason.hotel_options[0].dynamic_allocations[1][0].override_reason =
    "Supplier confirmed updated rate";
  assert.equal(
    validation.validateQuoteForFinalization(dynamicOverrideWithReason, db).blockers.length,
    0,
  );
  const dynamicMismatch = structuredClone(dynamicValid);
  dynamicMismatch.hotel_options[0].dynamic_allocations[1] = [];
  assert.ok(
    validation
      .validateQuoteForFinalization(dynamicMismatch, db)
      .blockers.some((item) => item.code.startsWith("DYNAMIC_CAPACITY_")),
  );
  const splitDynamic = baseDraft();
  splitDynamic.adults = 10;
  splitDynamic.dynamic_days = [1];
  splitDynamic.accommodation_planning_mode = "split_group";
  splitDynamic.hotel_options = [
    {
      ...structuredClone(splitDynamic.hotel_options[0]),
      key: "A",
      allocated_pax: 6,
      dynamic_allocations: {
        1: [
          { id: "split-a-double", room_id: "room-1", occupancy: "double", rooms: 2 },
          { id: "split-a-single", room_id: "room-1", occupancy: "single", rooms: 2 },
        ],
      },
    },
    {
      ...structuredClone(splitDynamic.hotel_options[0]),
      key: "B",
      allocated_pax: 4,
      dynamic_allocations: {
        1: [{ id: "split-b-double", room_id: "room-1", occupancy: "double", rooms: 2 }],
      },
    },
  ];
  splitDynamic.meal_selections_by_option.B = structuredClone(
    splitDynamic.meal_selections_by_option.A,
  );
  assert.deepEqual(calc.splitAccommodationAllocation(splitDynamic), {
    total: 10,
    allocated: 10,
    remaining: 0,
    excess: 0,
  });
  assert.equal(calc.effectiveAccommodationPax(splitDynamic, splitDynamic.hotel_options[0]), 6);
  assert.equal(calc.effectiveAccommodationPax(splitDynamic, splitDynamic.hotel_options[1]), 4);
  const optionAReviewLines = calc.dynamicAccommodationRoomLines(
    splitDynamic,
    splitDynamic.hotel_options[0],
    db,
  ).lines;
  const optionBReviewLines = calc.dynamicAccommodationRoomLines(
    splitDynamic,
    splitDynamic.hotel_options[1],
    db,
  ).lines;
  assert.equal(
    optionAReviewLines.reduce((sum, line) => sum + line.capacity, 0),
    6,
  );
  assert.equal(
    optionBReviewLines.reduce((sum, line) => sum + line.capacity, 0),
    4,
  );
  assert.equal(
    calc.dynamicAccommodationBreakdown(splitDynamic, splitDynamic.hotel_options[0], db).capacity,
    6,
  );
  assert.equal(
    calc.dynamicAccommodationBreakdown(splitDynamic, splitDynamic.hotel_options[1], db).capacity,
    4,
  );
  assert.equal(calc.computeMealDays(splitDynamic, db, "A").total, 3000);
  assert.equal(calc.computeMealDays(splitDynamic, db, "B").total, 2000);
  const optionADynamicTotal = calc.dynamicAccommodationBreakdown(
    splitDynamic,
    splitDynamic.hotel_options[0],
    db,
  ).total;
  const optionBDynamicTotal = calc.dynamicAccommodationBreakdown(
    splitDynamic,
    splitDynamic.hotel_options[1],
    db,
  ).total;
  assert.notEqual(
    optionADynamicTotal,
    optionBDynamicTotal,
    "Dynamic accommodation alternatives stay independent",
  );
  const accommodationSellingFactor =
    (1 + calc.hotelsMarkup(splitDynamic)) * (1 + calc.hotelsGst(splitDynamic));
  const optionAFinalPp =
    (optionADynamicTotal * accommodationSellingFactor +
      calc.computeMealDays(splitDynamic, db, "A").total * accommodationSellingFactor) /
    calc.effectiveAccommodationPax(splitDynamic, splitDynamic.hotel_options[0]);
  const optionBFinalPp =
    (optionBDynamicTotal * accommodationSellingFactor +
      calc.computeMealDays(splitDynamic, db, "B").total * accommodationSellingFactor) /
    calc.effectiveAccommodationPax(splitDynamic, splitDynamic.hotel_options[1]);
  close(optionAFinalPp, 3407.25, "Option A dynamic Accommodation + selected Meals PP");
  close(optionBFinalPp, 3003, "Option B dynamic Accommodation + selected Meals PP");
  assert.notEqual(
    optionAFinalPp,
    optionBFinalPp,
    "Each option uses its own Dynamic accommodation pax",
  );
  const reviewDraftBeforeToggle = structuredClone(splitDynamic);
  const visibleAfterFilter = dynamicReview.toggleDynamicReviewOption(["A", "B"], "A", false);
  assert.deepEqual(visibleAfterFilter, ["B"]);
  assert.deepEqual(
    splitDynamic,
    reviewDraftBeforeToggle,
    "Review option display toggle does not mutate saved data",
  );
  const splitRateSheet = costsheet.buildRateSheet(
    splitDynamic,
    db,
    splitDynamic.hotel_options[0],
    [],
  );
  close(splitRateSheet[0].rows[0].double, 2668.05, "Combined split accommodation PP");
  const incompleteSplit = structuredClone(splitDynamic);
  incompleteSplit.hotel_options[1].allocated_pax = 0;
  assert.ok(
    validation
      .validateQuoteForFinalization(incompleteSplit, db)
      .blockers.some((item) => item.code === "ACCOMMODATION_SPLIT_INCOMPLETE"),
  );
  const excessiveSplit = structuredClone(splitDynamic);
  excessiveSplit.hotel_options[1].allocated_pax = 5;
  assert.ok(
    validation
      .validateQuoteForFinalization(excessiveSplit, db)
      .blockers.some((item) => item.code === "ACCOMMODATION_SPLIT_EXCEEDS_PAX"),
  );
  const dynamicRange = structuredClone(dynamicValid);
  dynamicRange.pax_mode = "range";
  dynamicRange.pax_min = 2;
  dynamicRange.pax_max = 5;
  dynamicRange.pax_range = "2-5";
  assert.ok(
    validation
      .validateQuoteForFinalization(dynamicRange, db)
      .blockers.some((item) => item.code.startsWith("DYNAMIC_RANGE_")),
  );
  const overrideWithoutReason = baseDraft();
  overrideWithoutReason.hotel_options[0].rate_overrides = { 1: { dbl: 4500 } };
  overrideWithoutReason.rate_sheet_rows = { "A|transport-small": [2] };
  assert.ok(
    validation
      .validateQuoteForFinalization(overrideWithoutReason, db)
      .blockers.some((item) => item.code.startsWith("OVERRIDE_REASON_")),
  );

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
    get length() {
      return memory.size;
    },
  };
  draftStore.writeDraft(miscActivityDraft);
  assert.deepEqual(
    draftStore.loadDraft().misc,
    miscActivityDraft.misc,
    "Selected misc items persist in the saved draft",
  );
  const v1 = quoteBuilder.buildSavedQuote(baseDraft(), db, "Audit User");
  const incompleteDraft = {
    ...baseDraft(),
    program_id: undefined,
    program_name: "",
    program_mode: "existing",
  };
  const incompleteWarnings = validation
    .validateQuoteForFinalization(incompleteDraft, db)
    .blockers.map((item) => `${item.section}: ${item.message}`);
  const incompleteVersion = quoteBuilder.buildCostingVersionSnapshot(
    incompleteDraft,
    db,
    "Audit User",
    {
      employeeId: "employee-audit",
      authUserId: "auth-audit",
      name: "Audit User",
      role: "Sales Executive",
    },
    incompleteWarnings,
  );
  assert.equal(incompleteVersion.status, "In Progress");
  assert.equal(incompleteVersion.costing_complete, false);
  assert.ok(incompleteVersion.validation_warnings.length > 0);
  assert.deepEqual(
    incompleteVersion.draft_snapshot,
    JSON.parse(JSON.stringify(incompleteDraft)),
    "Incomplete costing versions retain the exact editable draft snapshot",
  );
  const noScenarioVersion = quoteBuilder.buildCostingVersionSnapshot(
    { ...incompleteDraft, hotel_options: [], scenarios: [], transport_options: [] },
    db,
    "Audit User",
    {
      employeeId: "employee-audit",
      authUserId: "auth-audit",
      name: "Audit User",
      role: "Sales Executive",
    },
    [...incompleteWarnings, "Accommodation: No valid costing variation"],
  );
  assert.equal(noScenarioVersion.status, "In Progress");
  assert.deepEqual(noScenarioVersion.draft_snapshot.hotel_options, []);
  const slabSelectionSnapshot = quoteBuilder.buildSavedQuote(slabGuideDraft, db, "Audit User");
  assert.deepEqual(
    slabSelectionSnapshot.draft_snapshot.guide_slab_selection_by_day,
    slabGuideDraft.guide_slab_selection_by_day,
    "Immutable quotation snapshots retain per-day, language, service, and Guide slab choices",
  );
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

  console.log(
    "Quotation engine audit passed: commercial, range, meal and immutability assertions.",
  );
} finally {
  await vite.close();
}
