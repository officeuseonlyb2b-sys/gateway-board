import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { db } = await vite.ssrLoadModule("/src/lib/mock-store.ts");
  const { buildHotelRatesWorksheet, importExcel, previewExcel } = await vite.ssrLoadModule("/src/lib/excel.ts");
  const { hydrateRoomsFromDb } = await vite.ssrLoadModule("/src/components/HotelRatesEditor.tsx");
  const { brochureRateFormFromHotel } = await vite.ssrLoadModule("/src/components/HotelFormDialog.tsx");
  const { getBrochureHotelRates } = await vite.ssrLoadModule("/src/lib/brochure-hotel-rates.ts");
  const { brochureRateResolutionForOption } = await vite.ssrLoadModule("/src/lib/wizard/brochure-rate-resolution.ts");
  const { brochureHotelIdentityKey, reconcileBrochureHotelIdentities, SKIP_BROCHURE_HOTEL_MAPPING } = await vite.ssrLoadModule("/src/lib/hotel-identity-reconciliation.ts");

  const city = db.addCity("Brochure Excel Roundtrip City");
  const hotel = db.addHotel({
    city_id: city.id, name: "Brochure Excel Roundtrip Hotel", hotel_category: "3 Star",
    contact_name: "Supplier Contact", contact_phone: "1234567890", email: "hotel@example.test",
    has_wifi: true, has_pool: false, address: "Roundtrip Road",
  });
  const firstRoom = db.addRoom(hotel.id, "Standard Room");
  const secondRoom = db.addRoom(hotel.id, "Deluxe Room");
  const supplierPlan = (room, season) => ({
    room_category_id: room.id, hotel_category: "3 Star", validity_start: "2026-01-01", validity_end: "2026-12-31",
    season_label: season, meal_plan: "CP", single_rate: 2500, double_rate: 3000, extra_bed_rate: 500,
    include_in_quote: true,
  });
  db.addRatePlans([supplierPlan(firstRoom, "Winter A"), supplierPlan(secondRoom, "Winter B")]);
  const hydratedRoom = hydrateRoomsFromDb(
    [firstRoom],
    db.get().rate_plans.filter((plan) => plan.room_category_id === firstRoom.id),
  )[0];
  assert.equal(hydratedRoom.name, "Standard Room", "The editor hydrates saved room categories by canonical Hotel ID.");
  assert.equal(hydratedRoom.seasons[0].cp_double, "3000", "Supplier plans hydrate into their saved meal-plan fields.");

  const originalRates = Array.from({ length: 7 }, (_, index) => {
    const year = 2026 + index;
    return {
      id: `roundtrip-period-${index + 1}`,
      rate_basis: "per_night",
      pricing_basis: { single: "per_room", double: "per_room", triple: "per_room", extra_bed: "per_add_on", child: "per_child" },
      validity_from: `${year}-01-01`, validity_to: `${year}-12-31`,
      single: 4000 + index * 100, double: 6000 + index * 100, triple: 7800 + index * 100,
      extra_bed: 1500 + index * 100, child: 900 + index * 100,
    };
  });
  db.saveBrochureHotelRatesForHotel(hotel.id, originalRates);
  db.saveBrochureHotelRatesForHotel(hotel.id, originalRates.map((rate) => rate.validity_from === "2027-01-01"
    ? { ...rate, pricing_basis: { child: "per_child", double: "per_room", single: "per_room", triple: "per_room", extra_bed: "per_add_on" } }
    : rate));

  const sheet = buildHotelRatesWorksheet(db.get());
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: false });
  const headers = matrix[0].map(String);
  const expectedSupplierHeaders = [
    "City", "Hotel Category", "Hotel Type", "Hotel Name", "Address", "Room Category", "Validity", "Season",
    "Rates Standard Meal Plan", "Double", "Single", "Quad", "Extra Bed", "CWB", "CWB Rule", "Lunch", "Dinner",
    "Extra Breakfast", "X'mas Sup", "X'mas Sup Type", "X'mas From", "X'mas To", "N'year Sup", "N'year Sup Type",
    "N'year From", "N'year To", "Rates From", "Email ID", "Wifi", "Pool", "Blackout Dates", "Include In Quote", "Remarks",
  ];
  assert.deepEqual(headers.slice(0, expectedSupplierHeaders.length), expectedSupplierHeaders, "All original supplier columns remain first and in the same order.");
  assert.equal(headers[expectedSupplierHeaders.length], "Hotel ID", "Stable Hotel ID is appended after the existing supplier columns.");
  assert.equal(headers[expectedSupplierHeaders.length + 1], "Room Category ID");
  assert.equal(headers.filter((header) => header.includes("Brochure Period")).length, 7 * 13, "Period column groups grow to the configured count without a fixed limit.");
  const hotelIdColumn = headers.indexOf("Hotel ID");
  const firstRateColumn = headers.indexOf("Brochure Period 1 - Brochure SGL");
  const exportedSupplierRows = matrix.slice(1).filter((row) => row[hotelIdColumn] === hotel.id);
  assert.equal(exportedSupplierRows.length, 2, "Hotel Brochure data is repeated consistently across its supplier room rows.");
  assert.ok(exportedSupplierRows.every((row) => row[firstRateColumn] === 4000));

  const editedMatrix = matrix.map((row) => [...row]);
  const doubleColumn = headers.indexOf("Brochure Period 1 - Brochure DBL");
  for (const row of editedMatrix.slice(1)) {
    if (row[hotelIdColumn] === hotel.id) {
      row[hotelIdColumn] = "stale-hotel-id-from-prior-master";
      row[firstRateColumn] = 4125;
      row[doubleColumn] = "";
    }
  }
  const makeFile = (grid, name = "roundtrip-hotel-rates.xlsx") => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(grid), "Hotel Rates");
    return new File([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], name);
  };
  const editedFile = makeFile(editedMatrix);
  const preview = await previewExcel(editedFile);
  assert.equal(preview.brochureColumnsFound, true);
  assert.equal(preview.brochureHotelsMatched, 1);
  assert.equal(preview.brochureIdentityMatches[0].status, "unique_city_name", "A stale Hotel ID is reconciled by a unique normalized City + Hotel Name match.");
  assert.equal(preview.brochureIdentityMatches[0].matchedHotelId, hotel.id, "The current canonical Hotel ID is used for the write.");
  assert.equal(preview.brochurePeriodsToImport, 1, "Repeated rows preview once, and property order does not turn an identical period into a false update.");
  assert.equal(preview.brochureRateConflicts, 0);
  const imported = await importExcel(editedFile, undefined, { importSupplierRates: false });
  assert.equal(imported.brochureRatesUpdated, 1);
  assert.equal(imported.brochureRatesAdded, 0);
  const saved = getBrochureHotelRates(hotel.id).find((rate) => rate.validity_from === "2026-01-01");
  assert.equal(saved.single, 4125, "The edited value is persisted once for the canonical Hotel ID and validity period.");
  assert.equal(saved.double, 6000, "Blank workbook cells do not clear saved fields.");
  assert.equal(saved.child, 900);

  const hotelFormRates = brochureRateFormFromHotel(hotel.id);
  const formPeriod = hotelFormRates.find((rate) => rate.validity_from === "2026-01-01");
  assert.equal(formPeriod.single, "4125", "Hotel Edit form hydrates the imported Brochure amount.");
  assert.equal(formPeriod.double, "6000");
  assert.equal(formPeriod.pricing_basis.double, "per_room");

  const costing = brochureRateResolutionForOption(
    { has_dates: false, brochure_validity_from: "2026-04-01", brochure_validity_till: "2026-04-03", routing: [], start_date: "", nights: 2 },
    { key: "A", label: "3 Star", category: "3 Star", selections: [{ city_id: city.id, hotel_id: hotel.id, room_id: firstRoom.id }] },
    getBrochureHotelRates(hotel.id),
  );
  assert.equal(costing.status, "covered", "Brochure-only Step 8 rate resolution reads the imported Hotel Master period.");
  assert.equal(costing.rate.single, 4125, "Brochure costing receives the saved value without supplier-rate mutation.");
  assert.equal(db.get().rate_plans.find((plan) => plan.room_category_id === firstRoom.id).single_rate, 2500, "Supplier SGL remains unchanged.");

  const conflictingMatrix = editedMatrix.map((row) => [...row]);
  for (const row of conflictingMatrix.slice(1)) if (row[hotelIdColumn] === "stale-hotel-id-from-prior-master") row[doubleColumn] = 6000;
  const duplicateRow = conflictingMatrix.findIndex((row, index) => index > 0 && row[hotelIdColumn] === "stale-hotel-id-from-prior-master");
  conflictingMatrix[duplicateRow][doubleColumn] = 99999;
  const conflictFile = makeFile(conflictingMatrix, "conflicting-brochure-period.xlsx");
  const conflictPreview = await previewExcel(conflictFile);
  assert.equal(conflictPreview.brochureRateConflicts, 1, "Repeated values that disagree are reported as a conflict.");
  const beforeConflictValue = getBrochureHotelRates(hotel.id).find((rate) => rate.validity_from === "2026-01-01").double;
  const conflictSummary = await importExcel(conflictFile, undefined, { importSupplierRates: false });
  assert.equal(conflictSummary.brochureRateConflicts, 1);
  assert.equal(getBrochureHotelRates(hotel.id).find((rate) => rate.validity_from === "2026-01-01").double, beforeConflictValue, "Conflicting rows never select or overwrite an arbitrary value.");

  const oldWorkbook = makeFile([matrix[0].slice(0, expectedSupplierHeaders.length), ...matrix.slice(1).map((row) => row.slice(0, expectedSupplierHeaders.length))], "legacy-hotel-rates.xlsx");
  const beforeLegacyImport = getBrochureHotelRates(hotel.id).map((rate) => ({ ...rate }));
  const oldPreview = await previewExcel(oldWorkbook);
  assert.equal(oldPreview.brochureColumnsFound, false);
  await importExcel(oldWorkbook);
  assert.deepEqual(getBrochureHotelRates(hotel.id), beforeLegacyImport, "An old Hotel Rates sheet with no Brochure columns leaves stored Brochure rates unchanged.");

  const ambiguousPeriod = { row: 7, period: 1, hotelId: "stale-ambiguous-id", sourceCity: city.name, sourceHotelName: hotel.name, validityFrom: "2027-01-01", validityTo: "2027-12-31", values: { single: 1, double: 2, triple: 3, extra_bed: 4, child: 5 } };
  const duplicateHotel = { ...hotel, id: "second-canonical-id" };
  const ambiguousMatches = reconcileBrochureHotelIdentities([ambiguousPeriod], [hotel, duplicateHotel], [city]);
  assert.equal(ambiguousMatches[0].status, "ambiguous", "Duplicate exact City+Name matches require manual confirmation.");
  assert.equal(ambiguousMatches[0].unresolved, true);
  const identityKey = brochureHotelIdentityKey(ambiguousPeriod);
  const manuallyMapped = reconcileBrochureHotelIdentities([ambiguousPeriod], [hotel, duplicateHotel], [city], { [identityKey]: duplicateHotel.id });
  assert.equal(manuallyMapped[0].status, "manual");
  assert.equal(manuallyMapped[0].matchedHotelId, duplicateHotel.id);
  const explicitlySkipped = reconcileBrochureHotelIdentities([ambiguousPeriod], [hotel, duplicateHotel], [city], { [identityKey]: SKIP_BROCHURE_HOTEL_MAPPING });
  assert.equal(explicitlySkipped[0].status, "skip", "The UI can explicitly skip unresolved identities without creating a Hotel.");
  const hotelCountBeforeDuplicate = db.get().hotels.length;
  const duplicateCurrentHotel = db.addHotel({
    city_id: city.id, name: hotel.name, hotel_category: hotel.hotel_category,
    contact_name: "Different Supplier Contact", contact_phone: "9999999999", email: "duplicate@example.test",
    has_wifi: false, has_pool: false, address: "Another address",
  });
  const manualMatrix = editedMatrix.map((row) => [...row]);
  for (const row of manualMatrix.slice(1)) {
    if (row[hotelIdColumn] !== "stale-hotel-id-from-prior-master") continue;
    row[doubleColumn] = 6000;
  }
  const manualFile = makeFile(manualMatrix, "manual-hotel-id-confirmation.xlsx");
  const unresolvedPreview = await previewExcel(manualFile);
  assert.equal(unresolvedPreview.brochureUnresolvedHotelMatches, 1, "Ambiguous live City+Name identities block commit pending confirmation.");
  const manualKey = brochureHotelIdentityKey({ hotelId: "stale-hotel-id-from-prior-master", sourceCity: city.name, sourceHotelName: hotel.name });
  const resolvedPreview = await previewExcel(manualFile, { brochureHotelMappings: { [manualKey]: duplicateCurrentHotel.id } });
  assert.equal(resolvedPreview.brochureUnresolvedHotelMatches, 0);
  await importExcel(manualFile, undefined, { brochureHotelMappings: { [manualKey]: duplicateCurrentHotel.id }, importSupplierRates: false });
  assert.equal(getBrochureHotelRates(duplicateCurrentHotel.id).length, 7, "Confirmed mapping writes all configured periods to the operator-selected existing Hotel ID.");
  assert.equal(db.get().hotels.length, hotelCountBeforeDuplicate + 1, "Brochure-only import never creates another Hotel record.");
  console.log("Hotel Rates Brochure round-trip passed: appended columns, stable IDs, dynamic periods, repeated-row de-duplication, conflict protection, legacy no-op, form readback, and Brochure costing readback.");
} finally {
  await vite.close();
}
