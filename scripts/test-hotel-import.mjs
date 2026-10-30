import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });

try {
  const { importExcel, previewExcel } = await vite.ssrLoadModule("/src/lib/excel.ts");
  const { db } = await vite.ssrLoadModule("/src/lib/mock-store.ts");
  const { hydrateRoomsFromDb } = await vite.ssrLoadModule("/src/components/HotelRatesEditor.tsx");
  const { hotelsForAccommodation } = await vite.ssrLoadModule(
    "/src/lib/wizard/hotel-availability.ts",
  );
  const { findRatePlan } = await vite.ssrLoadModule("/src/lib/wizard/rate-lookup.ts");
  const headers = [
    "City",
    "Hotel Category",
    "Hotel Name",
    "Room Category",
    "Season",
    "Validity",
    "Validity From",
    "Validity To",
    "Rates Standard Meal Plan",
    "Single Rate",
    "Double Rate",
    "Quad Rate",
    "Extra Bed Rate",
    "CWB",
    "Lunch",
    "Dinner",
    "Extra Breakfast",
    "Christmas Supplement",
    "New Year Supplement",
    "Blackout Dates",
  ];
  const row = (meal, single, double) => [
    "Ujjain",
    "Excellent Budget",
    "Import Pipeline Regression Property",
    "Regression Deluxe",
    "Winter",
    "01-11-2026 - 31-03-2027",
    "",
    "",
    meal,
    single,
    double,
    4350,
    750,
    500,
    375,
    375,
    350,
    900,
    1200,
    "24-12-2026 - 25-12-2026",
  ];
  const invalidMissingPriceRow = [
    "Ujjain",
    "Excellent Budget",
    "Import Missing Price Regression Property",
    "Regression Room",
    "Winter",
    "01-11-2026 - 31-03-2027",
    "",
    "",
    "CP",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  const makeFile = (rows) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["Hotel Name", "GST", "Clarification"],
        ["Not a rate", 18, "Review"],
      ]),
      "GST Review",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([headers, ...rows]),
      "Hotel Rates",
    );
    return new File(
      [XLSX.write(workbook, { type: "array", bookType: "xlsx" })],
      "hotel-import-regression.xlsx",
    );
  };

  const sourceRows = [
    row("EP", 1800, 2200),
    row("CP", 2000, 2450),
    row("MAP", 2600, 3250),
    row("AP", 3000, 3800),
  ];
  const aliasRow = row("CP", 2100, 2600);
  aliasRow[0] = "Ujjian";
  aliasRow[2] = "Import City Alias Regression Property";
  const conflictingAliasRow = [...aliasRow];
  conflictingAliasRow[10] = 9999;
  const beforePreviewCounts = {
    hotels: db.get().hotels.length,
    rooms: db.get().room_categories.length,
    plans: db.get().rate_plans.length,
  };
  const preview = await previewExcel(makeFile([aliasRow, [...aliasRow], conflictingAliasRow]));
  assert.equal(preview.sheetName, "Hotel Rates", "GST Review is never selected as the rate source");
  assert.equal(preview.newHotels, 1);
  assert.equal(preview.identicalDuplicates, 1);
  assert.equal(preview.conflictingRows, 1);
  assert.match(preview.diagnostics[0].reason, /Ujjian.*Ujjain/);
  assert.deepEqual(
    {
      hotels: db.get().hotels.length,
      rooms: db.get().room_categories.length,
      plans: db.get().rate_plans.length,
    },
    beforePreviewCounts,
    "preview is read-only",
  );
  const categoryRows = ["3 Star", "03 Star Deluxe", "04 Star"].map((category) => {
    const value = row("CP", 4500, 5000);
    value[0] = "Omkareshwar";
    value[1] = category;
    value[2] = "Vanasthali Category Regression Property";
    value[3] = "Deluxe Cottage";
    return value;
  });
  const categoryPreview = await previewExcel(makeFile(categoryRows));
  assert.equal(categoryPreview.conflictingRows, 0);
  assert.equal(categoryPreview.newRateCombinations, 3);
  const typoCategoryRow = [...categoryRows[0]];
  typoCategoryRow[1] = "03 Stra Deluxe";
  const typoPreview = await previewExcel(makeFile([typoCategoryRow]));
  assert.equal(typoPreview.rejectedRows, 1);
  assert.match(typoPreview.diagnostics[0].reason, /suggested correction.*3 Star Deluxe/i);
  await importExcel(makeFile(categoryRows));
  const categoryHotel = db
    .get()
    .hotels.find((hotel) => hotel.name === "Vanasthali Category Regression Property");
  const categoryRoom = db
    .get()
    .room_categories.find((room) => room.hotel_id === categoryHotel.id);
  const categoryPlans = db
    .get()
    .rate_plans.filter((plan) => plan.room_category_id === categoryRoom.id);
  assert.equal(categoryPlans.length, 3, "one physical hotel retains three category offerings");
  assert.deepEqual(
    categoryPlans.map((plan) => plan.hotel_category).sort(),
    ["3 Star", "3 Star Deluxe", "4 Star"],
  );
  const categoryHotelView = [{ ...categoryHotel, hotel_categories: categoryPlans.map((p) => p.hotel_category) }];
  for (const category of ["3 Star", "3 Star Deluxe", "4 Star"]) {
    assert.equal(
      hotelsForAccommodation(
        categoryHotelView,
        "Omkareshwar",
        category,
        db.get().cities,
        [],
        categoryHotel.city_id,
      ).inCategory.length,
      1,
      `${category} exposes the canonical hotel`,
    );
    const plan = findRatePlan(categoryPlans, categoryRoom.id, "CP", "2026-11-01", category);
    assert.equal(plan?.double_rate, 5000);
    assert.equal(plan?.single_rate, 4500);
  }
  const categoryReimport = await importExcel(makeFile(categoryRows));
  assert.equal(categoryReimport.plansCreated, 0);
  assert.equal(categoryReimport.identicalDuplicates, 3);
  const serialDateRow = row("CP", 1900, 2400);
  serialDateRow[2] = "Import Excel Serial Date Property";
  serialDateRow[5] = "";
  serialDateRow[6] = 46327;
  serialDateRow[7] = 46477;
  const partialOccupancyRow = row("CP", "", 2750);
  partialOccupancyRow[2] = "Import Partial Occupancy Regression Property";
  const first = await importExcel(
    makeFile([...sourceRows, aliasRow, serialDateRow, partialOccupancyRow, invalidMissingPriceRow]),
  );
  const aliasHotel = db
    .get()
    .hotels.find((hotel) => hotel.name === "Import City Alias Regression Property");
  assert.equal(
    db.get().cities.find((city) => city.id === aliasHotel.city_id)?.name,
    "Ujjain",
    "Ujjian imports under the existing canonical Ujjain city",
  );
  assert.equal(
    db.get().cities.some((city) => city.name.toLowerCase() === "ujjian"),
    false,
  );
  const importedHotel = db
    .get()
    .hotels.find((hotel) => hotel.name === "Import Pipeline Regression Property");
  assert.ok(importedHotel, "hotel header persists through the Excel import pipeline");
  assert.equal(importedHotel.blackout_ranges?.[0]?.from, "2026-12-24");
  assert.equal(importedHotel.blackout_ranges?.[0]?.to, "2026-12-25");
  const importedRoom = db
    .get()
    .room_categories.find(
      (room) => room.hotel_id === importedHotel.id && room.name === "Regression Deluxe",
    );
  assert.ok(importedRoom, "room category is linked to the stable hotel ID");
  const plans = db.get().rate_plans.filter((plan) => plan.room_category_id === importedRoom.id);
  assert.equal(plans.length, 4, "four independent meal-plan rows persist without duplication");
  assert.deepEqual(
    Object.fromEntries(plans.map((plan) => [plan.meal_plan, plan.double_rate])),
    { EP: 2200, CP: 2450, MAP: 3250, AP: 3800 },
    "occupancy prices remain mapped to their own meal plans",
  );
  assert.equal(plans.find((plan) => plan.meal_plan === "CP")?.quad_rate, 4350);
  assert.equal(plans.find((plan) => plan.meal_plan === "CP")?.extra_bed_rate, 750);
  assert.equal(plans.find((plan) => plan.meal_plan === "CP")?.cwb_rate, 500);
  assert.equal(plans.find((plan) => plan.meal_plan === "CP")?.lunch_rate, 375);
  assert.equal(plans.find((plan) => plan.meal_plan === "CP")?.dinner_rate, 375);
  assert.equal(plans.find((plan) => plan.meal_plan === "CP")?.extra_breakfast_rate, 350);
  assert.equal(plans.find((plan) => plan.meal_plan === "CP")?.xmas_supplement, 900);
  assert.equal(plans.find((plan) => plan.meal_plan === "CP")?.newyear_supplement, 1200);
  assert.equal(plans[0].validity_start, "2026-11-01");
  assert.equal(plans[0].validity_end, "2027-03-31");
  assert.equal(first.skippedRows, 1, "a blank required price row is reported, not imported as ₹0");
  const serialHotel = db
    .get()
    .hotels.find((hotel) => hotel.name === "Import Excel Serial Date Property");
  const serialRoom = db.get().room_categories.find((room) => room.hotel_id === serialHotel.id);
  const serialPlan = db.get().rate_plans.find((plan) => plan.room_category_id === serialRoom.id);
  assert.equal(serialPlan.validity_start, "2026-11-01");
  assert.equal(serialPlan.validity_end, "2027-03-31");
  const partialHotel = db
    .get()
    .hotels.find((hotel) => hotel.name === "Import Partial Occupancy Regression Property");
  const partialRoom = db.get().room_categories.find((room) => room.hotel_id === partialHotel.id);
  const partialPlan = db.get().rate_plans.find((plan) => plan.room_category_id === partialRoom.id);
  assert.equal(partialPlan.double_rate, 2750);
  assert.equal(partialPlan.double_rate_missing, false);
  assert.equal(partialPlan.single_rate, 0);
  assert.equal(partialPlan.single_rate_missing, true);
  assert.equal(
    hydrateRoomsFromDb([partialRoom], [partialPlan])[0].seasons[0].cp_single,
    "",
    "the Hotel Master edit form hydrates an absent SGL cell as blank, not ₹0",
  );
  assert.equal(
    db
      .get()
      .rate_plans.some(
        (plan) =>
          db.get().room_categories.find((room) => room.id === plan.room_category_id)?.hotel_id ===
          db.get().hotels.find((hotel) => hotel.name === "Import Missing Price Regression Property")
            ?.id,
      ),
    false,
    "missing SGL/DBL data does not create a zero-priced plan",
  );

  const stableHotelId = importedHotel.id;
  const stableRoomId = importedRoom.id;
  const stablePlanIds = plans.map((plan) => plan.id).sort();
  const sparseCpRow = row("CP", 2000, 2450);
  sparseCpRow.splice(11, 8, "", "", "", "", "", "", "", "");
  const second = await importExcel(
    makeFile([sourceRows[0], sparseCpRow, sourceRows[2], sourceRows[3]]),
  );
  const reloadedPlans = db
    .get()
    .rate_plans.filter((plan) => plan.room_category_id === stableRoomId);
  assert.equal(
    db.get().hotels.find((hotel) => hotel.name === importedHotel.name)?.id,
    stableHotelId,
  );
  assert.equal(
    db.get().room_categories.find((room) => room.name === importedRoom.name)?.id,
    stableRoomId,
  );
  assert.deepEqual(reloadedPlans.map((plan) => plan.id).sort(), stablePlanIds);
  assert.equal(
    reloadedPlans.length,
    4,
    "re-import updates existing plans instead of creating duplicates",
  );
  const reloadedCp = reloadedPlans.find((plan) => plan.meal_plan === "CP");
  assert.equal(reloadedCp?.quad_rate, 4350);
  assert.equal(reloadedCp?.extra_bed_rate, 750);
  assert.equal(reloadedCp?.cwb_rate, 500);
  assert.equal(reloadedCp?.lunch_rate, 375);
  assert.equal(reloadedCp?.dinner_rate, 375);
  assert.equal(reloadedCp?.extra_breakfast_rate, 350);
  assert.equal(reloadedCp?.xmas_supplement, 900);
  assert.equal(reloadedCp?.newyear_supplement, 1200);
  assert.equal(second.plansCreated, 0);
  assert.equal(second.plansUpdated, 0);
  assert.equal(second.identicalDuplicates, 4);
  console.log(
    "Hotel import integration passed: parser → hotel/room/rate store, meal mapping, missing-price rejection, and idempotent re-import.",
  );
} finally {
  await vite.close();
}
