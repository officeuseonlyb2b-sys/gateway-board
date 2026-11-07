import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { createServer } from "vite";

globalThis.crypto ??= webcrypto;
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const recovery = await vite.ssrLoadModule("/src/lib/hotel-master-recovery.ts");
  const { db } = await vite.ssrLoadModule("/src/lib/mock-store.ts");
  const backupMaster = {
    cities: [{ id: "original-city-id", name: "Recovery City" }],
    hotels: [{ id: "original-hotel-id", city_id: "original-city-id", name: "Recovery Hotel", hotel_category: "3 Star", hotel_type: "Resort Property", contact_name: "Supplier", contact_phone: "123456", email: "hotel@example.test", has_wifi: true, has_pool: false, address: "Address", blackout_ranges: [{ id: "blackout-1", from: "2027-01-01", to: "2027-01-02" }], created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }],
    room_categories: [{ id: "original-room-id", hotel_id: "original-hotel-id", name: "Deluxe", created_at: "2026-01-01T00:00:00.000Z" }],
    rate_plans: [{ id: "original-rate-id", room_category_id: "original-room-id", hotel_category: "3 Star", validity_start: "2026-01-01", validity_end: "2026-12-31", season_label: "Winter", meal_plan: "CP", single_rate: 2500, double_rate: 3000, extra_bed_rate: 500, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }],
    brochure_hotel_rates: [{ id: "original-brochure-rate-id", hotel_id: "original-hotel-id", rate_basis: "per_night", pricing_basis: { single: "per_room", double: "per_room", triple: "per_room", extra_bed: "per_add_on", child: "per_child" }, validity_from: "2026-01-01", validity_to: "2026-12-31", single: 4000, double: 6000, triple: 7800, extra_bed: 1500, child: 900, updated_at: "2026-01-01T00:00:00.000Z" }],
  };
  const digest = createHash("sha256").update(JSON.stringify(backupMaster)).digest("hex");
  const verified = await recovery.verifyHotelMasterRecoveryBackup({
    format: "mp-tourism-hotel-master-recovery", format_version: 1, exported_at: "2026-01-01T00:00:00.000Z",
    source: "authenticated shared master snapshot", master_sync_status: "ready", current_shared_master_sha256: digest, hotel_master: backupMaster,
  });
  const emptyCurrent = { cities: [], hotels: [], room_categories: [], rate_plans: [], brochure_hotel_rates: [] };
  const plan = recovery.planHotelMasterRecovery(emptyCurrent, verified);
  assert.deepEqual(plan.report.conflicts, []);
  assert.equal(plan.report.hotelsAdded, 1);
  assert.equal(plan.additions.hotels[0].id, "original-hotel-id", "The original canonical Hotel ID is preserved.");
  assert.equal(plan.additions.rate_plans[0].id, "original-rate-id");
  assert.equal(plan.additions.brochure_hotel_rates[0].id, "original-brochure-rate-id");
  await assert.rejects(recovery.verifyHotelMasterRecoveryBackup({ ...verified, hotel_master: { ...backupMaster, hotels: [] } }), /checksum/i);

  const duplicateCurrent = {
    ...emptyCurrent,
    cities: [{ id: "different-city-id", name: "Recovery City" }],
    hotels: [{ ...backupMaster.hotels[0], id: "different-hotel-id", city_id: "different-city-id" }],
  };
  const duplicatePlan = recovery.planHotelMasterRecovery(duplicateCurrent, verified);
  assert.ok(duplicatePlan.report.conflicts.some((conflict) => conflict.includes("duplicate was not created")));
  assert.equal(duplicatePlan.additions.hotels.length, 0, "A same-name current Hotel prevents duplicate recreation.");

  const existing = db.get();
  const priorCounts = { hotels: existing.hotels.length, rooms: existing.room_categories.length, rates: existing.rate_plans.length, brochure: existing.brochure_hotel_rates.length };
  const merge = recovery.planHotelMasterRecovery({ cities: [], hotels: [], room_categories: [], rate_plans: [], brochure_hotel_rates: [] }, verified);
  const committed = db.mergeHotelRecovery(merge.additions);
  assert.deepEqual(committed, { citiesAdded: 1, hotelsAdded: 1, roomsAdded: 1, supplierRatesAdded: 1, brochureRatesAdded: 1 });
  assert.equal(db.get().hotels.find((hotel) => hotel.id === "original-hotel-id").name, "Recovery Hotel");
  assert.deepEqual({ hotels: db.get().hotels.length, rooms: db.get().room_categories.length, rates: db.get().rate_plans.length, brochure: db.get().brochure_hotel_rates.length }, {
    hotels: priorCounts.hotels + 1, rooms: priorCounts.rooms + 1, rates: priorCounts.rates + 1, brochure: priorCounts.brochure + 1,
  });
  console.log("Hotel Master recovery tests passed: verified checksum, original IDs, additive merge, supplier/Brochure readback, and duplicate prevention.");
} finally {
  await vite.close();
}
