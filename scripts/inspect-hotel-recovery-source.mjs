import fs from "node:fs/promises";
import XLSX from "xlsx";

const backupPath = process.argv[2] || "C:/Users/Acer/Downloads/hotel-master-recovery-2026-11-03T07-19-22-050Z.json";
const workbookPath = process.argv[3] || "C:/Users/Acer/Downloads/MP_Hotels_Brochure_Dummy_Rates_All_Hotels.xlsx";
const backup = JSON.parse(await fs.readFile(backupPath, "utf8"));
const master = backup.hotel_master;
const workbook = XLSX.readFile(workbookPath, { raw: false });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false, blankrows: false });
const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const grouped = new Map();
for (const row of rows) {
  const key = `${String(row["Hotel ID"] ?? "")}|${normalize(row.City)}|${normalize(row["Hotel Name"])}`;
  const list = grouped.get(key) || [];
  list.push(row);
  grouped.set(key, list);
}
const report = [...grouped.values()].map((group) => {
  const source = group[0];
  const hotel = master.hotels.find((item) => item.id === source["Hotel ID"]);
  const rooms = master.room_categories.filter((item) => item.hotel_id === source["Hotel ID"]);
  const roomIds = new Set(rooms.map((item) => item.id));
  return {
    sourceHotelId: source["Hotel ID"],
    sourceCity: source.City,
    sourceName: source["Hotel Name"],
    sourceRows: group.length,
    hotelFoundByOriginalId: Boolean(hotel),
    recoveredName: hotel?.name,
    recoveredCity: master.cities.find((city) => city.id === hotel?.city_id)?.name,
    roomCount: rooms.length,
    supplierRatePlanCount: master.rate_plans.filter((item) => roomIds.has(item.room_category_id)).length,
    existingBrochureRateCount: (master.brochure_hotel_rates || []).filter((item) => item.hotel_id === source["Hotel ID"]).length,
  };
});
console.log(JSON.stringify({
  backupPath,
  workbookPath,
  workbookSheet: workbook.SheetNames[0],
  backupFormat: backup.format,
  backupSource: backup.source,
  backupSyncStatus: backup.master_sync_status,
  exportedAt: backup.exported_at,
  sourceRows: rows.length,
  uniqueSourceIdentities: report.length,
  identityMatchesByOriginalId: report.filter((item) => item.hotelFoundByOriginalId).length,
  missingOriginalIds: report.filter((item) => !item.hotelFoundByOriginalId).map((item) => item.sourceHotelId),
  hotels: report,
}, null, 2));
