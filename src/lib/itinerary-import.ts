import * as XLSX from "xlsx";
import type { ItineraryDay, ItineraryRecord } from "@/lib/itineraries-store";

export interface ItineraryImportPreview {
  fileName: string;
  data: Partial<ItineraryRecord>;
  warnings: string[];
  sheets: Array<{ source: string; mapping: string; status: "mapped" | "missing" }>;
  sourcePricing: unknown[];
  sourceHotelSupplements: unknown[];
}

const expectedSheets = [
  ["Main Info", "Basic package information"],
  ["Included", "Inclusions"],
  ["Excluded", "Exclusions"],
  ["Highlights", "Package highlights"],
  ["Itineraries", "Day-wise itinerary"],
  ["Pricing", "Retained as separate source information; not brochure pricing"],
  ["Hotel Supplements", "Retained as separate source information; not brochure pricing"],
  ["Facts", "Travel facts"],
  ["Please Note", "Important notes"],
] as const;

const normalize = (value: unknown) => String(value ?? "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clean = (value: unknown) => String(value ?? "").trim();
const pick = (row: Record<string, unknown>, names: string[]) => {
  const keys = Object.keys(row);
  const wanted = names.map(normalize);
  const key = keys.find((candidate) => wanted.includes(normalize(candidate)));
  return key ? clean(row[key]) : "";
};

function sheetRows(workbook: XLSX.WorkBook, requested: string): Record<string, unknown>[] {
  const name = workbook.SheetNames.find((candidate) => normalize(candidate) === normalize(requested));
  if (!name) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], { defval: "", raw: false, blankrows: false });
}

function mainInfo(workbook: XLSX.WorkBook): Record<string, string> {
  const name = workbook.SheetNames.find((candidate) => normalize(candidate) === "main info");
  if (!name) return {};
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: "", raw: false, blankrows: false });
  const result: Record<string, string> = {};
  if (!rows.length) return result;
  const knownFields = new Set(["title", "itinerary title", "package name", "programme name", "program name", "name", "code", "tour code internal", "tour code portal", "itinerary code", "programme code", "program code", "package code", "duration", "duration nights days", "nights days", "max days", "nights", "start city", "starting city", "departure city", "end city", "ending city", "return city", "route", "program route", "route circuit", "routing", "circuit", "overview", "introduction", "package overview", "is popular", "popular", "only group", "is luxury"]);
  const headers = rows[0].map(normalize);
  const keyValueHeader = ["field", "item", "label", "attribute", "name"].includes(headers[0]) && ["value", "details", "information"].includes(headers[1]);
  if (keyValueHeader) {
    for (const row of rows.slice(1)) if (clean(row[0]) && clean(row[1])) result[normalize(row[0])] = clean(row[1]);
  } else if (headers.filter((header) => knownFields.has(header)).length >= 2) {
    const values = rows[1] || [];
    headers.forEach((header, index) => { if (clean(values[index])) result[header] = clean(values[index]); });
  } else {
    for (const row of rows) if (clean(row[0]) && clean(row[1])) result[normalize(row[0])] = clean(row[1]);
  }
  return result;
}

function infoValue(info: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = info[normalize(alias)];
    if (value) return value;
  }
  return "";
}

function itemRows(workbook: XLSX.WorkBook, sheet: string): string[] {
  const rows = sheetRows(workbook, sheet);
  const entries = rows.length
    ? rows.map((row) => Object.values(row).map(clean).filter(Boolean).join(" — "))
    : (() => {
        const name = workbook.SheetNames.find((candidate) => normalize(candidate) === normalize(sheet));
        if (!name) return [];
        return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: "", raw: false, blankrows: false }).map((row) => row.map(clean).filter(Boolean).join(" — "));
      })();
  return entries.filter((entry) => entry && !/^(?:item|included|excluded|highlight|fact|note|description)$/i.test(entry));
}

function parseDays(workbook: XLSX.WorkBook): ItineraryDay[] {
  const rows = sheetRows(workbook, "Itineraries");
  return rows.flatMap((row, index) => {
    const rawDay = pick(row, ["day", "day no", "day number", "itinerary day"]);
    const parsedDay = Number(rawDay.match(/\d+/)?.[0] || index + 1);
    const title = pick(row, ["title", "day title", "title / plan", "plan", "day plan"]);
    const route = pick(row, ["route", "route / city", "city", "cities", "routing"]);
    const description = pick(row, ["description", "details", "itinerary", "itinerary details", "program", "programme", "day description", "body"]);
    const meals = pick(row, ["meals", "meal", "meal plan"]);
    const overnightCity = pick(row, ["overnight city", "overnight", "stay", "hotel city"]);
    const sightseeing = pick(row, ["sightseeing", "visits", "visiting places"]);
    const activities = pick(row, ["activities", "activity"]);
    const hotelNotes = pick(row, ["hotel notes", "stay notes", "accommodation"]);
    if (!title && !route && !description && !meals && !overnightCity) return [];
    return [{
      day: Number.isFinite(parsedDay) && parsedDay > 0 ? parsedDay : index + 1,
      title,
      route,
      cities: route.split(/\s*(?:→|->|,|;|\|)\s*/).filter(Boolean),
      overnightCity,
      meals,
      description,
      sightseeing,
      activities,
      hotelNotes,
    }];
  }).sort((left, right) => left.day - right.day);
}

export function parseItineraryWorkbook(buffer: ArrayBuffer, fileName: string): ItineraryImportPreview {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false, raw: false });
  const available = new Set(workbook.SheetNames.map(normalize));
  const warnings: string[] = [];
  const sheets = expectedSheets.map(([source, mapping]) => {
    const found = available.has(normalize(source));
    if (!found) warnings.push(`Missing worksheet: ${source}.`);
    return { source, mapping, status: found ? "mapped" as const : "missing" as const };
  });
  const info = mainInfo(workbook);
  const title = infoValue(info, ["title", "itinerary title", "package name", "programme name", "program name", "name"]);
  const code = infoValue(info, ["code", "tour code internal", "itinerary code", "programme code", "program code", "package code"]);
  const duration = infoValue(info, ["duration", "duration nights days", "nights days", "duration (nights / days)"]);
  const durationNumbers = duration.match(/(\d+)\s*(?:night|nights|n)\D+(\d+)\s*(?:day|days|d)/i);
  const days = parseDays(workbook);
  const route = infoValue(info, ["route", "program route", "route circuit", "routing", "circuit"]);
  const startCity = infoValue(info, ["start city", "starting city", "departure city"]);
  const endCity = infoValue(info, ["end city", "ending city", "return city"]);
  const maxDays = Number(infoValue(info, ["max days"]).match(/\d+/)?.[0] || 0);
  const toBoolean = (value: string) => ["true", "yes", "1", "y"].includes(value.trim().toLocaleLowerCase());
  if (!title) warnings.push("Main Info did not provide an itinerary title.");
  if (!code) warnings.push("Main Info did not provide an itinerary code; a code must be entered before saving.");
  if (!days.length) warnings.push("No day rows could be mapped from Itineraries.");
  const mappedInfoFields = new Set(["title", "itinerary title", "package name", "programme name", "program name", "name", "code", "tour code internal", "tour code portal", "itinerary code", "programme code", "program code", "package code", "duration", "duration nights days", "nights days", "max days", "nights", "start city", "starting city", "departure city", "end city", "ending city", "return city", "route", "program route", "route circuit", "routing", "circuit", "overview", "introduction", "package overview", "is popular", "popular", "only group", "is luxury"]);
  const unmappedInfoFields = Object.keys(info).filter((key) => info[key] && !mappedInfoFields.has(key));
  if (unmappedInfoFields.length) warnings.push(`Unmapped Main Info fields retained for review: ${unmappedInfoFields.join(", ")}.`);
  const sourceAmount = info["amount"];
  if (sourceAmount) warnings.push("Main Info amount is retained as source-only pricing and never applied to Brochure Costing.");
  if (days.length && durationNumbers && Number(durationNumbers[2]) !== days.length) warnings.push(`Duration indicates ${durationNumbers[2]} days but ${days.length} itinerary day rows were found; review before saving.`);

  const pricingRows = sheetRows(workbook, "Pricing");
  const supplementRows = sheetRows(workbook, "Hotel Supplements");
  const data: Partial<ItineraryRecord> = {
    title,
    code,
    nights: durationNumbers ? Number(durationNumbers[1]) : null,
    daysCount: durationNumbers ? Number(durationNumbers[2]) : (maxDays || days.length || null),
    startCity,
    endCity,
    route: route || days.map((day) => day.route).filter(Boolean).join(" → "),
    overview: infoValue(info, ["overview", "introduction", "package overview"]),
    popular: toBoolean(infoValue(info, ["is popular", "popular"])),
    groupOnly: toBoolean(infoValue(info, ["only group"])),
    days,
    highlights: itemRows(workbook, "Highlights"),
    inclusions: itemRows(workbook, "Included"),
    exclusions: itemRows(workbook, "Excluded"),
    facts: itemRows(workbook, "Facts"),
    notes: itemRows(workbook, "Please Note"),
    importIdentity: code ? `workbook:${code.trim().toLocaleLowerCase()}` : undefined,
    importWarnings: warnings,
    fieldSources: {
      ...(title ? { title: "Excel" as const } : {}),
      ...(code ? { code: "Excel" as const } : {}),
      ...(durationNumbers ? { nights: "Excel" as const, daysCount: "Excel" as const } : maxDays ? { daysCount: "Excel" as const } : {}),
      ...(startCity ? { startCity: "Excel" as const } : {}),
      ...(endCity ? { endCity: "Excel" as const } : {}),
      ...(route ? { route: "Excel" as const } : {}),
      ...(days.length ? { days: "Excel" as const } : {}),
      ...(infoValue(info, ["overview", "introduction", "package overview"]) ? { overview: "Excel" as const } : {}),
      highlights: "Excel",
      inclusions: "Excel",
      exclusions: "Excel",
      facts: "Excel",
      notes: "Excel",
    },
  };
  return {
    fileName,
    data,
    warnings,
    sheets,
    sourcePricing: [...pricingRows, ...(sourceAmount ? [{ sourceSheet: "Main Info", field: "amount", value: sourceAmount }] : [])],
    sourceHotelSupplements: supplementRows,
  };
}
