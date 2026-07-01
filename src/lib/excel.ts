// Excel import / export for the hotel rate sheet.
import * as XLSX from "xlsx";
import { parseValidityRange, serializeValidity } from "./format";
import { cityService, hotelService, roomService, ratePlanService } from "@/services/api";
import { db, HOTEL_CATEGORIES, type HotelCategory, type MealPlan } from "@/lib/mock-store";

export interface ImportRowError { row: number; reason: string; raw: Record<string, unknown>; }
export interface ImportSummary {
  totalRows: number;
  hotelsAdded: number;
  roomsAdded: number;
  plansCreated: number;
  errors: ImportRowError[];
}

// Column aliases — flexible header matching.
const COL = {
  city: ["city", "column1", "col1", ""],
  category: ["hotel category", "category", "star"],
  hotel: ["hotel name", "hotel", "name"],
  room: ["room category", "room", "room type"],
  validity: ["validity", "validity dates", "dates"],
  meal: ["rates standard meal plan", "meal plan", "plan"],
  double: ["double", "double rate", "dbl"],
  single: ["single", "single rate", "sgl"],
  extraBed: ["extra bed", "eb"],
  cwb: ["cwb", "child with bed"],
  lunch: ["lunch"],
  dinner: ["dinner"],
  extraBkf: ["extra breakfast", "extra bkfst"],
  xmas: ["x'mas sup", "xmas", "xmas sup", "christmas"],
  ny: ["n'year sup", "newyear", "new year"],
  ratesFrom: ["rates from", "contact"],
  email: ["email id", "email"],
  wifi: ["wifi", "wi-fi"],
  pool: ["pool", "swimming pool"],
  remarks: ["remarks", "notes"],
};

function pick(row: Record<string, unknown>, keys: string[]): string {
  const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
  const idx: Record<string, string> = {};
  Object.keys(row).forEach((k) => { idx[norm(k)] = k; });
  for (const k of keys) {
    const hit = idx[norm(k)];
    if (hit != null) {
      const v = row[hit];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}

function parseMealPlan(v: string): MealPlan | null {
  const t = v.toUpperCase().replace(/AI$/, "").trim();
  if (t.startsWith("CP")) return "CP";
  if (t.startsWith("MAP")) return "MAP";
  if (t.startsWith("AP")) return "AP";
  return null;
}

function parseNum(v: string): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/[₹,\s]/g, ""));
  return isFinite(n) ? n : 0;
}
function parseNumOrNull(v: string): number | null {
  if (!v || String(v).trim() === "") return null;
  const n = parseNum(v);
  return n === 0 && !/^0+(\.0+)?$/.test(String(v).trim()) ? null : n;
}

function parseBool(v: string): boolean {
  if (!v) return false;
  return /^y(es)?$/i.test(v.trim());
}

function coerceCategory(v: string): HotelCategory | null {
  const t = v.toLowerCase().trim();
  const found = HOTEL_CATEGORIES.find((c) => c.toLowerCase() === t);
  if (found) return found;
  // fuzzy: "5 Star" contains "5 star"
  const partial = HOTEL_CATEGORIES.find((c) => t.includes(c.toLowerCase()));
  return partial ?? null;
}

function splitContact(v: string): { name: string; phone: string } {
  if (!v) return { name: "", phone: "" };
  const m = v.match(/(.+?)[\s,\-–]+(\+?\d[\d\s\-]{7,})/);
  if (m) return { name: m[1].trim(), phone: m[2].trim() };
  const phone = v.match(/\+?\d[\d\s\-]{7,}/);
  if (phone) return { name: v.replace(phone[0], "").trim().replace(/[,\-–]$/, ""), phone: phone[0].trim() };
  return { name: v.trim(), phone: "" };
}

export interface ImportProgress { done: number; total: number; }

export async function importExcel(
  file: File,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportSummary> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const summary: ImportSummary = {
    totalRows: rows.length, hotelsAdded: 0, roomsAdded: 0, plansCreated: 0, errors: [],
  };

  const beforeHotels = db.get().hotels.length;
  const beforeRooms = db.get().room_categories.length;

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rowNum = i + 2; // account for header row
    try {
      const cityName = pick(raw, COL.city);
      const hotelName = pick(raw, COL.hotel);
      const roomName = pick(raw, COL.room);
      const validity = pick(raw, COL.validity);
      const mealRaw = pick(raw, COL.meal);
      if (!cityName || !hotelName || !roomName || !validity || !mealRaw) {
        summary.errors.push({ row: rowNum, reason: "Missing required field (city, hotel, room, validity or meal plan).", raw });
        continue;
      }
      const range = parseValidityRange(validity);
      if (!range) {
        summary.errors.push({ row: rowNum, reason: `Could not parse validity "${validity}".`, raw });
        continue;
      }
      const meal = parseMealPlan(mealRaw);
      if (!meal) {
        summary.errors.push({ row: rowNum, reason: `Unknown meal plan "${mealRaw}".`, raw });
        continue;
      }
      const category = coerceCategory(pick(raw, COL.category)) ?? "3 Star";
      const contact = splitContact(pick(raw, COL.ratesFrom));

      const city = await cityService.findOrCreate(cityName);
      const hotel = await hotelService.findOrCreate({
        city_id: city.id, name: hotelName, hotel_category: category,
        contact_name: contact.name, contact_phone: contact.phone,
        email: pick(raw, COL.email), address: "",
        has_wifi: parseBool(pick(raw, COL.wifi)),
        has_pool: parseBool(pick(raw, COL.pool)),
      });
      const room = await roomService.findOrCreate(hotel.id, roomName);

      await ratePlanService.createMany([{
        room_category_id: room.id,
        validity_start: range.start, validity_end: range.end,
        season_label: pick(raw, ["season", "season label"]) || inferSeason(range.start, range.end),
        meal_plan: meal,
        double_rate: parseNum(pick(raw, COL.double)),
        single_rate: parseNum(pick(raw, COL.single)),
        extra_bed_rate: parseNum(pick(raw, COL.extraBed)),
        cwb_rate: parseNumOrNull(pick(raw, COL.cwb)),
        cwb_rule_text: null,
        lunch_rate: parseNumOrNull(pick(raw, COL.lunch)),
        dinner_rate: parseNumOrNull(pick(raw, COL.dinner)),
        extra_breakfast_rate: parseNumOrNull(pick(raw, COL.extraBkf)),
        xmas_supplement: parseNumOrNull(pick(raw, COL.xmas)),
        xmas_supplement_type: "per_person",
        newyear_supplement: parseNumOrNull(pick(raw, COL.ny)),
        newyear_supplement_type: "per_person",
        remarks: pick(raw, COL.remarks) || null,
      }]);

      summary.plansCreated++;
    } catch (err) {
      summary.errors.push({ row: rowNum, reason: (err as Error).message || "Unknown error", raw });
    }
    onProgress?.({ done: i + 1, total: rows.length });
    if (i % 10 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  summary.hotelsAdded = db.get().hotels.length - beforeHotels;
  summary.roomsAdded = db.get().room_categories.length - beforeRooms;
  return summary;
}

function inferSeason(start: string, _end: string): string {
  const m = new Date(start).getMonth() + 1;
  if (m >= 10 || m <= 3) return "Peak Season";
  if (m >= 4 && m <= 6) return "Off Season";
  return "Shoulder Season";
}

// ---------- Export ----------
export function exportExcel(): void {
  const data = db.get();
  const rows: Record<string, unknown>[] = [];
  data.rate_plans.forEach((p) => {
    const room = data.room_categories.find((r) => r.id === p.room_category_id);
    if (!room) return;
    const hotel = data.hotels.find((h) => h.id === room.hotel_id);
    if (!hotel) return;
    const city = data.cities.find((c) => c.id === hotel.city_id);
    rows.push({
      "City": city?.name ?? "",
      "Hotel Category": hotel.hotel_category,
      "Hotel Name": hotel.name,
      "Room Category": room.name,
      "Validity": serializeValidity(p.validity_start, p.validity_end),
      "Rates Standard Meal Plan": p.meal_plan,
      "Double": p.double_rate,
      "Single": p.single_rate,
      "Extra Bed": p.extra_bed_rate,
      "CWB": p.cwb_rate ?? p.cwb_rule_text ?? "",
      "Lunch": p.lunch_rate ?? "",
      "Dinner": p.dinner_rate ?? "",
      "Extra Breakfast": p.extra_breakfast_rate ?? "",
      "X'mas Sup": p.xmas_supplement ?? "",
      "N'year Sup": p.newyear_supplement ?? "",
      "Rates From": [hotel.contact_name, hotel.contact_phone].filter(Boolean).join(" - "),
      "Email ID": hotel.email,
      "Wifi": hotel.has_wifi ? "Yes" : "No",
      "Pool": hotel.has_pool ? "Yes" : "No",
      "Remarks": p.remarks ?? "",
    });
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hotel Rates");
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `MP_Hotels_Rate_Sheet_${date}.xlsx`);
}

export function downloadErrorLog(summary: ImportSummary): void {
  const rows = summary.errors.map((e) => ({ Row: e.row, Reason: e.reason, ...e.raw }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Errors");
  XLSX.writeFile(wb, `Import_Errors_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
