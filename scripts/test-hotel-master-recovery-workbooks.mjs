import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "vite";

const backupPath = "C:/Users/Acer/Downloads/hotel-master-recovery-2026-11-03T07-19-22-050Z.json";
const workbookPath = "C:/Users/Acer/Downloads/MP_Hotels_Brochure_Dummy_Rates_All_Hotels.xlsx";
let backupBytes;
let workbookBytes;
try {
  backupBytes = await fs.readFile(backupPath);
  workbookBytes = await fs.readFile(workbookPath);
} catch (error) {
  if (error?.code === "ENOENT") {
    console.log("Recovery workbook integration skipped: supplied backup/workbook files are unavailable.");
    process.exit(0);
  }
  throw error;
}

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { db } = await vite.ssrLoadModule("/src/lib/mock-store.ts");
  const { previewExcel, importExcel } = await vite.ssrLoadModule("/src/lib/excel.ts");
  const { verifyHotelMasterRecoveryBackup } = await vite.ssrLoadModule("/src/lib/hotel-master-recovery.ts");
  const backup = await verifyHotelMasterRecoveryBackup(JSON.parse(backupBytes.toString("utf8")));
  const clone = (value) => JSON.parse(JSON.stringify(value));
  db.hydrateAll(clone(backup.hotel_master)); // isolated Vite test store; no browser/cloud persistence hook
  const before = clone(db.get());
  const workbookFile = new File([workbookBytes], "MP_Hotels_Brochure_Dummy_Rates_All_Hotels.xlsx");
  const preview = await previewExcel(workbookFile);
  assert.equal(preview.brochureIdentityMatches.length, 19, "The real source workbook contains 19 hotel identities.");
  assert.equal(preview.brochureIdentityMatches.filter((item) => item.status === "canonical_id").length, 19, "All source IDs match original IDs in the verified recovery snapshot.");
  assert.equal(preview.brochureUnresolvedHotelMatches, 0);

  const expectedHotels = new Set(backup.hotel_master.hotels.map((hotel) => hotel.id));
  for (const id of expectedHotels) assert.ok(db.get().hotels.some((hotel) => hotel.id === id));
  const imported = await importExcel(workbookFile, undefined, { importSupplierRates: false });
  assert.equal(imported.hotelsAdded, 0);
  assert.equal(imported.roomsAdded, 0);
  assert.equal(imported.plansCreated, 0);
  assert.equal(imported.plansUpdated, 0);
  assert.equal(db.get().hotels.length, before.hotels.length, "No Hotel was created or replaced.");
  assert.deepEqual(db.get().hotels, before.hotels, "Hotel IDs and fields are unchanged.");
  assert.deepEqual(db.get().room_categories, before.room_categories, "Room categories are unchanged.");
  assert.deepEqual(db.get().rate_plans, before.rate_plans, "Supplier rate plans are unchanged.");
  assert.ok(imported.brochureRatesAdded + imported.brochureRatesUpdated > 0, "Brochure periods were imported into the isolated recovered store.");

  const varayExpressId = "9f772bc9-6e7b-4d88-b230-fc4f5000ca45";
  const varayRates = db.get().brochure_hotel_rates.filter((rate) => rate.hotel_id === varayExpressId);
  assert.ok(varayRates.length > 0, "Varay Express Brochure rate is available under its original Hotel ID.");
  const varayHotel = db.get().hotels.find((hotel) => hotel.id === varayExpressId);
  const varayRoomIds = new Set(db.get().room_categories.filter((room) => room.hotel_id === varayHotel.id).map((room) => room.id));
  assert.ok(db.get().rate_plans.some((plan) => varayRoomIds.has(plan.room_category_id)), "Varay Express supplier plans were retained.");
  console.log(JSON.stringify({
    verifiedBackupDate: backup.exported_at,
    recoveredOriginalHotelIdsVerified: expectedHotels.size,
    sourceHotelIdentities: preview.brochureIdentityMatches.length,
    exactIdMatches: preview.brochureIdentityMatches.filter((item) => item.status === "canonical_id").length,
    brochureRatesAdded: imported.brochureRatesAdded,
    brochureRatesUpdated: imported.brochureRatesUpdated,
    brochureRateConflicts: imported.brochureRateConflicts,
    brochureRatesSkipped: imported.brochureRatesSkipped,
    supplierRatePlansUnchanged: true,
    hotelsUnchanged: true,
    varayExpressOriginalId: varayExpressId,
    varayExpressBrochurePeriods: varayRates.length,
  }, null, 2));
} finally {
  await vite.close();
}
