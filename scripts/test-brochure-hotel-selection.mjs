import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const availability = await vite.ssrLoadModule("/src/lib/wizard/hotel-availability.ts");
  const brochureRates = await vite.ssrLoadModule("/src/lib/brochure-hotel-rates.ts");
  const resolutionMessages = await vite.ssrLoadModule("/src/lib/wizard/brochure-rate-resolution.ts");
  const brochureAccommodation = await vite.ssrLoadModule("/src/lib/wizard/brochure-accommodation.ts");
  const { db } = await vite.ssrLoadModule("/src/lib/mock-store.ts");
  const { Step15 } = await vite.ssrLoadModule("/src/components/quotation/steps/StepHotels.tsx");
  const { emptyDraft } = await vite.ssrLoadModule("/src/lib/wizard/types.ts");

  const cities = [
    { id: "city-ujjain", name: "Ujjain" },
    { id: "city-gwalior", name: "Gwalior" },
    { id: "city-indore", name: "Indore" },
  ];
  const ujjainHotel = { id: "fixture-ujjain-3", name: "Ujjain Three Star", city_id: "city-ujjain", hotel_category: "3 Star" };
  const gwaliorFourStar = { id: "fixture-gwalior-4", name: "Gwalior Four Star", city_id: "city-gwalior", hotel_category: "4 Star" };
  const indoreThreeStar = { id: "fixture-indore-3", name: "Indore Three Star", city_id: "city-indore", hotel_category: "3 Star" };
  const gwaliorHotelA = { id: "fixture-gwalior-3-a", name: "Gwalior Three Star A", city_id: "city-gwalior", hotel_category: "3 Star" };
  const gwaliorHotelB = { id: "fixture-gwalior-3-b", name: "Gwalior Three Star B", city_id: "city-gwalior", hotel_category: "3 Star" };
  const citiesWithoutGwalior3Star = [ujjainHotel, gwaliorFourStar, indoreThreeStar];

  assert.deepEqual(
    availability.hotelsForAccommodation(citiesWithoutGwalior3Star, "Ujjain", "3 Star", cities).inCategory.map((hotel) => hotel.id),
    [ujjainHotel.id],
    "An existing city/category match remains available.",
  );
  assert.deepEqual(
    availability.hotelsForAccommodation(citiesWithoutGwalior3Star, "Gwalior", "3 Star", cities, [], "city-gwalior").inCategory,
    [],
    "A Gwalior 3 Star lookup never substitutes a hotel from another city or category.",
  );
  assert.equal(
    availability.hotelCategoryCoverageMessage("Gwalior", "3 Star"),
    "No 3 Star hotels configured for Gwalior in Hotel Master.",
  );
  assert.deepEqual(
    availability.hotelsForAccommodation(
      [...citiesWithoutGwalior3Star, gwaliorHotelA],
      "  gwALIOR  ",
      "3 star",
      cities,
      [],
      "city-gwalior",
    ).inCategory.map((hotel) => hotel.id),
    [gwaliorHotelA.id],
    "A real same-city matching Hotel ID is selectable with case/space-normalized city and category labels.",
  );

  const basis = { single: "per_room", double: "per_room", triple: "per_room", extra_bed: "per_add_on", child: "per_child" };
  const makeRate = (hotel, amount, from = "2026-11-01", to = "2026-11-30") => ({
    id: `fixture-rate-${hotel.id}`,
    hotel_id: hotel.id,
    rate_basis: "per_night",
    pricing_basis: basis,
    validity_from: from,
    validity_to: to,
    single: amount,
    double: amount * 2,
    triple: amount * 3,
    extra_bed: amount / 2,
    child: amount / 5,
    updated_at: "2026-11-03T00:00:00.000Z",
  });
  const rateA = makeRate(gwaliorHotelA, 1000);
  const rateB = makeRate(gwaliorHotelB, 1500);
  const selectedSellingFrom = "2026-11-02";
  const selectedSellingTo = "2026-11-20";
  const absentRate = brochureRates.resolveBrochureHotelRate(
    gwaliorHotelA.id,
    selectedSellingFrom,
    selectedSellingTo,
    [],
  );
  assert.equal(absentRate.status, "uncovered", "A selected Hotel with no Brochure period is unavailable, not supplier-priced.");
  assert.match(resolutionMessages.brochureRateResolutionMessage(absentRate), /Brochure Rate Not Configured/);

  const validRate = brochureRates.resolveBrochureHotelRate(
    gwaliorHotelA.id,
    selectedSellingFrom,
    selectedSellingTo,
    [rateA],
  );
  assert.equal(validRate.status, "covered");
  assert.deepEqual(validRate.rate.pricing_basis, basis, "Saved units remain attached to the canonical Hotel ID rate.");
  const savedReference = resolutionMessages.brochureReferenceRatesForHotel(gwaliorHotelA.id, [rateA]);
  assert.equal(savedReference.length, 1, "A saved Brochure rate is discoverable by selected Hotel ID without a selling-validity context.");
  assert.deepEqual(
    [savedReference[0].single, savedReference[0].double, savedReference[0].triple, savedReference[0].extra_bed, savedReference[0].child],
    [1000, 2000, 3000, 500, 200],
    "Reference display keeps all five saved Brochure units without supplier-rate fallback.",
  );
  assert.equal(
    brochureRates.resolveBrochureHotelRate(
      gwaliorHotelA.id,
      selectedSellingFrom,
      selectedSellingTo,
      [makeRate(gwaliorHotelA, 1000, "2026-11-01", "2026-11-10")],
    ).status,
    "uncovered",
    "A validity-band gap is unavailable; no nearest-date fallback is used.",
  );

  const routing = [1, 2, 3].map((day) => ({
    day,
    date: "",
    city_id: "city-gwalior",
    to_city_id: "city-gwalior",
    to_city: "Gwalior",
    program: "",
    program_mode: "text",
    overnight: true,
  }));
  routing.push({
    day: 4,
    date: "",
    city_id: "city-gwalior",
    to_city_id: "city-gwalior",
    to_city: "Departure",
    program: "",
    program_mode: "text",
    overnight: false,
  });
  const selection = (hotel, routing_day) => ({
    city_id: "city-gwalior",
    routing_day,
    hotel_id: hotel.id,
    room_id: "",
    meal_plan: "CP",
    no_hotel: false,
    pre_tour_night: false,
  });
  const optionA = { key: "A", label: "3 Star Option A", category: "3 Star", selections: [1, 2, 3].map((day) => selection(gwaliorHotelA, day)) };
  const optionB = { key: "B", label: "3 Star Option B", category: "3 Star", selections: [selection(gwaliorHotelB, 1), selection(gwaliorHotelA, 2), selection(gwaliorHotelB, 3)] };
  const draft = {
    ...emptyDraft(),
    query_type: "Brochure",
    query_for: "Accommodation Part",
    commercial_mode: "accommodation_only",
    has_dates: false,
    brochure_validity_from: selectedSellingFrom,
    brochure_validity_till: selectedSellingTo,
    routing,
    hotel_options: [optionA, optionB],
  };
  const testDb = {
    cities,
    destination_cities: [],
    hotels: [ujjainHotel, gwaliorFourStar, indoreThreeStar, gwaliorHotelA, gwaliorHotelB],
    room_categories: [],
    rate_plans: [],
    brochure_hotel_rates: [rateA, rateB],
  };
  const baseDb = db.get();
  const renderStep8 = (hotelRecords, brochurePeriods, option, draftOverride = draft) => {
    db.hydrateAll({ ...baseDb, ...testDb, hotels: hotelRecords, brochure_hotel_rates: brochurePeriods });
    return renderToStaticMarkup(React.createElement(Step15, { draft: { ...draftOverride, hotel_options: [option] }, set: () => undefined }));
  };
  const noHotelMarkup = renderStep8(citiesWithoutGwalior3Star, [], { ...optionA, selections: [] });
  assert.ok(noHotelMarkup.includes("No 3 Star hotels configured for Gwalior in Hotel Master."));
  assert.ok(noHotelMarkup.includes('href="/hotels"') && noHotelMarkup.includes('target="_blank"'));
  assert.ok(!noHotelMarkup.includes("Ujjain Three Star") && !noHotelMarkup.includes("Indore Three Star"));

  const selectedWithoutRateMarkup = renderStep8([...citiesWithoutGwalior3Star, gwaliorHotelA], [], optionA);
  assert.ok(selectedWithoutRateMarkup.includes("Brochure Rate Not Configured"));
  const selectedWithRateMarkup = renderStep8([...citiesWithoutGwalior3Star, gwaliorHotelA], [rateA], optionA);
  assert.ok(selectedWithRateMarkup.includes("Hotel-level estimate · Brochure Rate · Per Night"));
  assert.ok(selectedWithRateMarkup.includes("per room") && selectedWithRateMarkup.includes("per child"));
  const blankSellingValidityMarkup = renderStep8(
    [...citiesWithoutGwalior3Star, gwaliorHotelA],
    [rateA],
    optionA,
    { ...draft, brochure_validity_from: "", brochure_validity_till: "" },
  );
  assert.ok(blankSellingValidityMarkup.includes("Saved Brochure Rate"));
  assert.ok(blankSellingValidityMarkup.includes("Set Brochure selling validity to confirm pricing coverage."));
  assert.ok(blankSellingValidityMarkup.includes("₹1,000") && blankSellingValidityMarkup.includes("₹2,000") && blankSellingValidityMarkup.includes("₹3,000"));
  assert.ok(!blankSellingValidityMarkup.includes("Hotel-level estimate · Brochure Rate · Per Night"), "Reference display does not imply pricing coverage.");

  db.hydrateAll(baseDb);
  const costingA = brochureAccommodation.brochureAccommodationForOption(draft, optionA, testDb);
  const costingB = brochureAccommodation.brochureAccommodationForOption(draft, optionB, testDb);
  assert.equal(costingA.nights.length, 3, "Three Gwalior overnight days are priced independently; departure day is not charged.");
  assert.equal(costingA.missing, 0);
  assert.equal(costingA.single, 3000);
  assert.equal(costingA.double, 3000);
  assert.equal(costingA.extraBed, 1500);
  assert.equal(costingA.child, 600);
  assert.equal(costingB.single, 4000, "Option B can use a different Hotel on individual nights without changing Option A.");
  assert.equal(costingB.double, 4000);
  assert.equal(costingB.nights.length, 3);

  const dateFreeBands = brochureAccommodation.brochureDepartureRateScenarios(draft, testDb);
  assert.deepEqual(
    dateFreeBands.map((band) => [band.validity_from, band.validity_to]),
    [[selectedSellingFrom, selectedSellingTo]],
    "Date-free costing uses a validity band and does not invent an exact departure date.",
  );
  const uncoveredDb = { ...testDb, brochure_hotel_rates: [makeRate(gwaliorHotelA, 1000, "2026-11-01", "2026-11-10"), rateB] };
  const uncoveredBands = brochureAccommodation.brochureDepartureRateScenarios(draft, uncoveredDb);
  assert.ok(uncoveredBands.some((band) => band.options.A?.missing > 0), "Date-free bands outside validity remain unavailable.");

  console.log("Brochure Hotel selection tests passed: existing city match, Gwalior match/no-match, canonical city/category filtering, no cross-city fallback, missing/valid/out-of-band rates, three independent nights, options A/B, departure zero charge, and date-free bands.");
} finally {
  await vite.close();
}
