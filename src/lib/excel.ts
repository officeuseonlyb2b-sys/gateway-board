// Excel import / export for the hotel rate sheet.

import * as XLSX from "xlsx";
import { serializeValidity } from "./format";

import { cityService, hotelService, roomService, ratePlanService } from "@/services/api";

import {
  db,
  HOTEL_CATEGORIES,
  type HotelCategory,
  type MealPlan,
  type HotelType,
  type BlackoutRange,
  type SupplementType,
} from "@/lib/mock-store";

export interface ImportRowError {
  row: number;
  reason: string;
  raw: Record<string, unknown>;
}

export interface ImportSummary {
  totalRows: number;
  hotelsAdded: number;
  hotelsUpdated: number;
  roomsAdded: number;
  plansUpdated: number;
  plansCreated: number;
  identicalDuplicates: number;
  conflictingRows: number;
  rateCellsImported: number;
  skippedRows: number;
  errors: ImportRowError[];
}

export type ImportDisposition =
  | "New Hotel"
  | "Existing Hotel"
  | "New Room Category"
  | "New Meal Plan / Rate Period"
  | "Identical Duplicate"
  | "Conflicting Duplicate"
  | "Invalid / Needs Review";

export interface ImportPreviewRow {
  row: number;
  hotel: string;
  city: string;
  category: string;
  room: string;
  plan: string;
  validity: string;
  disposition: ImportDisposition;
  reason: string;
}

export interface ImportPreview {
  sheetName: string;
  totalRows: number;
  hotelsMatched: number;
  newHotels: number;
  newRooms: number;
  newRateCombinations: number;
  identicalDuplicates: number;
  conflictingRows: number;
  rejectedRows: number;
  diagnostics: ImportPreviewRow[];
}

export interface ImportProgress {
  done: number;
  total: number;
}

/* -------------------------------------------------------------------------- */
/*                              COLUMN MAPPING                                */
/* -------------------------------------------------------------------------- */

const COL = {
  city: ["city", "city name", "destination", "destination city", "column1", "col1"],

  category: [
    "hotel category",
    "hotel category name",
    "category",
    "star",
    "star category",
    "hotel star",
  ],

  hotel: ["hotel name", "hotel", "property name", "property", "name"],

  room: ["room category", "room category name", "room", "room type", "room name"],

  validity: [
    "validity",
    "validity dates",
    "validity date",
    "validity period",
    "date validity",
    "dates",
    "validity 2026 2027",
    "validity 2026-2027",
    "validity 2026–2027",
    "validity 2026–27",
  ],

  validityFrom: ["validity from", "valid from", "season from", "start date", "from date"],

  validityTo: ["validity to", "valid to", "season to", "end date", "to date"],

  meal: [
    "rates standard meal plan",
    "standard meal plan",
    "meal plan",
    "meal",
    "plan",
    "rate plan",
  ],

  double: ["double", "double rate", "dbl", "dbl rate", "double room"],

  single: ["single", "single rate", "sgl", "sgl rate", "single room"],

  extraBed: ["extra bed", "extra bed rate", "extra bed rates", "eb", "eb rate"],

  cwb: ["cwb", "cwb rate", "child with bed", "child with bed rate", "child bed"],

  lunch: ["lunch", "lunch rate"],

  dinner: ["dinner", "dinner rate"],

  extraBkf: ["extra breakfast", "extra breakfast rate", "extra bkf", "extra bkfst", "breakfast"],

  xmas: ["x'mas sup", "xmas sup", "xmas supplement", "christmas supplement", "christmas", "xmas"],

  ny: [
    "n'year sup",
    "nyear sup",
    "newyear sup",
    "new year sup",
    "new year supplement",
    "newyear",
    "new year",
  ],

  ratesFrom: ["rates from", "rate from", "contact", "contact person", "rates contact"],

  email: ["email id", "email", "email address", "mail"],

  wifi: ["wifi", "wi-fi", "wi fi", "internet"],

  pool: ["pool", "swimming pool", "swimming"],

  remarks: ["remarks", "remark", "notes", "note", "comments"],

  hotelType: ["hotel type", "property type", "type"],

  address: ["address", "hotel address", "property address"],

  season: ["season", "season label", "season name"],

  quad: ["quad", "quad rate", "quad room", "quadruple"],

  cwbRule: ["cwb rule", "cwb rule text", "child rule"],

  xmasType: ["x'mas sup type", "xmas sup type", "xmas type", "christmas type"],

  xmasFrom: ["x'mas from", "xmas from", "christmas from"],

  xmasTo: ["x'mas to", "xmas to", "christmas to"],

  nyType: [
    "n'year sup type",
    "nyear sup type",
    "newyear sup type",
    "new year sup type",
    "new year type",
  ],

  nyFrom: ["n'year from", "nyear from", "newyear from", "new year from"],

  nyTo: ["n'year to", "nyear to", "newyear to", "new year to"],

  blackout: ["blackout dates", "blackout", "blackout date"],

  include: ["include in quote", "include in quotation", "include", "quotation"],
};

const HOTEL_TYPES: string[] = [
  "Box Building",
  "Resort Property",
  "Home Stay",
  "Wildlife - Jungle Resort",
];

/* -------------------------------------------------------------------------- */
/*                              NORMALIZATION                                 */
/* -------------------------------------------------------------------------- */

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, "and")
    .replace(/[–—−]/g, "-")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: unknown): string {
  if (value == null) return "";

  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .trim();
}

/**
 * Finds a cell using normalized header aliases.
 */
function pick(row: Record<string, unknown>, keys: string[]): string {
  return normalizeText(pickValue(row, keys));
}

function pickValue(row: Record<string, unknown>, keys: string[]): unknown {
  const normalizedRowKeys = new Map<string, string>();

  Object.keys(row).forEach((key) => {
    normalizedRowKeys.set(normalizeHeader(key), key);
  });

  // Exact match first.
  for (const key of keys) {
    const normalizedKey = normalizeHeader(key);
    const actualKey = normalizedRowKeys.get(normalizedKey);

    if (actualKey != null) {
      const value = row[actualKey];

      if (value !== null && value !== undefined && normalizeText(value) !== "") return value;
    }
  }

  // Fuzzy matching.
  const aliases = keys.map(normalizeHeader).filter(Boolean);

  for (const [normalizedActual, actualKey] of normalizedRowKeys.entries()) {
    const matched = aliases.some((alias) => {
      if (!alias || !normalizedActual) return false;

      return (
        normalizedActual === alias ||
        normalizedActual.includes(alias) ||
        alias.includes(normalizedActual)
      );
    });

    if (matched) {
      const value = row[actualKey];

      if (value !== null && value !== undefined && normalizeText(value) !== "") return value;
    }
  }

  return "";
}

/* -------------------------------------------------------------------------- */
/*                              HOTEL TYPE                                    */
/* -------------------------------------------------------------------------- */

function coerceHotelType(v: string): HotelType | undefined {
  if (!v) return undefined;

  const t = v.toLowerCase().trim();

  const exact = HOTEL_TYPES.find((h) => h.toLowerCase() === t);

  if (exact) return exact as HotelType;

  const partial = HOTEL_TYPES.find((h) => {
    const lower = h.toLowerCase();

    return lower.includes(t) || t.includes(lower);
  });

  return partial as HotelType | undefined;
}

/* -------------------------------------------------------------------------- */
/*                              CATEGORY                                      */
/* -------------------------------------------------------------------------- */

function coerceCategory(v: string): HotelCategory | null {
  const t = normalizeText(v).toLowerCase();

  if (!t) return null;

  const alias = t.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  const aliases: Record<string, HotelCategory> = {
    "03": "3 Star",
    "03 star": "3 Star",
    "03 star deluxe": "3 Star Deluxe",
    "04": "4 Star",
    "04 star": "4 Star",
    "05": "5 Star",
    "05 star": "5 Star",
  };
  if (aliases[alias]) return aliases[alias];

  // Known source typo: preview a correction, but require administrator review.
  if (alias === "03 stra deluxe") return null;

  const exact = HOTEL_CATEGORIES.find((c) => c.toLowerCase().trim() === t);

  if (exact) return exact;

  const normalized = t.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();

  const partial = HOTEL_CATEGORIES.find((c) => {
    const cc = c.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();

    return normalized.includes(cc) || cc.includes(normalized);
  });

  return partial ?? null;
}

/* -------------------------------------------------------------------------- */
/*                              MEAL PLAN                                     */
/* -------------------------------------------------------------------------- */

function parseMealPlan(v: string): MealPlan | null {
  const t = normalizeText(v).toUpperCase().replace(/\s+/g, "").replace(/_/g, "");

  if (!t) return null;

  if (t.startsWith("MAP")) return "MAP";
  if (t.startsWith("CP")) return "CP";
  if (t.startsWith("EP")) return "EP";
  if (t.startsWith("AP")) return "AP";

  if (t === "BREAKFAST") return "CP";
  if (t === "MODIFIEDAMERICANPLAN") return "MAP";
  if (t === "AMERICANPLAN") return "AP";
  if (t === "CONTINENTALPLAN") return "CP";

  return null;
}

/* -------------------------------------------------------------------------- */
/*                              NUMBERS                                       */
/* -------------------------------------------------------------------------- */

function parseNum(v: unknown): number {
  if (v === null || v === undefined || v === "") {
    return 0;
  }

  if (typeof v === "number") {
    return Number.isFinite(v) ? v : 0;
  }

  const text = String(v)
    .replace(/[₹$€£,\s]/g, "")
    .trim();

  if (!text) return 0;

  const n = Number(text);

  if (Number.isFinite(n)) {
    return n;
  }

  const match = text.match(/-?\d+(?:\.\d+)?/);

  if (match) {
    const parsed = Number(match[0]);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function isNumericValue(v: unknown): boolean {
  if (v === null || v === undefined || String(v).trim() === "") {
    return false;
  }

  if (typeof v === "number") {
    return Number.isFinite(v);
  }

  const cleaned = String(v)
    .replace(/[₹$€£,\s]/g, "")
    .trim();

  return /^-?\d+(?:\.\d+)?$/.test(cleaned);
}

function parseNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") {
    return null;
  }

  if (!isNumericValue(v)) {
    return null;
  }

  return parseNum(v);
}

/* -------------------------------------------------------------------------- */
/*                              BOOLEAN                                       */
/* -------------------------------------------------------------------------- */

function parseBool(v: unknown): boolean {
  const t = normalizeText(v).toLowerCase();

  if (!t) return false;

  return ["yes", "y", "true", "1", "available", "included", "includedyes"].includes(t);
}

/* -------------------------------------------------------------------------- */
/*                              CONTACT                                       */
/* -------------------------------------------------------------------------- */

function splitContact(v: string): {
  name: string;
  phone: string;
} {
  if (!v) {
    return {
      name: "",
      phone: "",
    };
  }

  const text = normalizeText(v);

  const phoneMatch = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/);

  if (phoneMatch) {
    const phone = phoneMatch[0].trim().replace(/\s+/g, " ");

    const name = text
      .replace(phoneMatch[0], "")
      .replace(/[-,–—:]+$/g, "")
      .trim();

    return {
      name,
      phone,
    };
  }

  return {
    name: text,
    phone: "",
  };
}

/* -------------------------------------------------------------------------- */
/*                              DATE PARSING                                   */
/* -------------------------------------------------------------------------- */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Creates a valid ISO date.
 *
 * Important:
 * Some hotel sheets contain obvious spreadsheet mistakes such as:
 *
 * 31 Sep 2026
 *
 * September has only 30 days, so this normalizes it to:
 *
 * 30 Sep 2026
 */
function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  if (year < 100) {
    year += year >= 50 ? 1900 : 2000;
  }

  if (month < 1 || month > 12) {
    return null;
  }

  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // Normalize obvious invalid dates such as 31 Sep.
  const safeDay = Math.min(Math.max(day, 1), maxDay);

  return `${year}-${pad2(month)}-${pad2(safeDay)}`;
}

/**
 * Converts Excel serial number into YYYY-MM-DD.
 */
function excelSerialToISO(value: number): string | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  const excelEpoch = Date.UTC(1899, 11, 30);

  const date = new Date(excelEpoch + value * 86400000);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function cleanDateText(value: string): string {
  return value.replace(/[’]/g, "'").replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim();
}

function parseSingleDate(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }

  if (typeof value === "number") {
    return excelSerialToISO(value);
  }

  let text = cleanDateText(normalizeText(value));

  if (!text) return null;

  // Remove time.
  text = text.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\b/gi, "").trim();

  // Remove surrounding brackets.
  text = text.replace(/^\(+/, "").replace(/\)+$/, "").trim();

  // Remove apostrophe before year:
  // 01 Oct'26 -> 01 Oct 26
  text = text.replace(/([A-Za-z])'(\d{2,4})\b/g, "$1 $2");

  // ISO: 2026-10-01
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);

  if (match) {
    return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  // DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);

  if (match) {
    return isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
  }

  // DD-MM-YY
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);

  if (match) {
    return isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
  }

  // DD Month YYYY
  // Example: 01 October 2026
  match = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+'?(\d{2,4})$/);

  if (match) {
    const month = MONTH_NAMES[match[2].toLowerCase()];

    if (month) {
      return isoDate(Number(match[3]), month, Number(match[1]));
    }
  }

  // Month DD YYYY
  match = text.match(/^([A-Za-z]+)\s+(\d{1,2})\s+'?(\d{2,4})$/);

  if (match) {
    const month = MONTH_NAMES[match[1].toLowerCase()];

    if (month) {
      return isoDate(Number(match[3]), month, Number(match[2]));
    }
  }

  // Final fallback.
  const parsed = new Date(text);

  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
  }

  return null;
}

/**
 * Extracts date candidates from messy hotel validity strings.
 *
 * Handles:
 *
 * 01 Oct'26
 * 01 October 2026
 * 2026-10-01
 * 01/10/2026
 * 01-31 Oct 2026
 * 01 Oct 26 - 19 Oct 26 (Weekend)
 * (01 October 2026 – 30 March 2027)
 */
function extractDateCandidates(value: string): string[] {
  const text = cleanDateText(value);

  const result: string[] = [];

  const add = (date: string | null) => {
    if (date && !result.includes(date)) {
      result.push(date);
    }
  };

  // ISO dates.
  const isoMatches = text.match(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g) ?? [];

  isoMatches.forEach((x) => {
    add(parseSingleDate(x));
  });

  // DD Month YYYY / DD Month YY.
  const dayMonthMatches = text.match(/\b\d{1,2}\s+[A-Za-z]{3,12}\s+'?\d{2,4}\b/g) ?? [];

  dayMonthMatches.forEach((x) => {
    add(parseSingleDate(x));
  });

  // Month DD YYYY.
  const monthDayMatches = text.match(/\b[A-Za-z]{3,12}\s+\d{1,2}\s+'?\d{2,4}\b/g) ?? [];

  monthDayMatches.forEach((x) => {
    add(parseSingleDate(x));
  });

  // Numeric dates.
  const numericMatches = text.match(/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g) ?? [];

  numericMatches.forEach((x) => {
    add(parseSingleDate(x));
  });

  // DD-MM-YYYY.
  const dashNumericMatches = text.match(/\b\d{1,2}-\d{1,2}-\d{2,4}\b/g) ?? [];

  dashNumericMatches.forEach((x) => {
    add(parseSingleDate(x));
  });

  /**
   * Shared month format:
   *
   * 01-31 Oct 2026
   *
   * This gives:
   * 01 Oct 2026
   * 31 Oct 2026
   */
  const sharedMonthMatches = [
    ...text.matchAll(/\b(\d{1,2})-(\d{1,2})\s+([A-Za-z]{3,12})\s+'?(\d{2,4})\b/g),
  ];

  for (const match of sharedMonthMatches) {
    const startDay = Number(match[1]);
    const endDay = Number(match[2]);
    const month = MONTH_NAMES[match[3].toLowerCase()];
    const year = Number(match[4]);

    if (month) {
      add(isoDate(year, month, startDay));

      add(isoDate(year, month, endDay));
    }
  }

  return result;
}

/**
 * Robust validity parser.
 */
function parseValidity(value: unknown): {
  start: string;
  end: string;
} | null {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  if (typeof value === "number" || value instanceof Date) {
    const date = parseSingleDate(value);

    if (!date) return null;

    return {
      start: date,
      end: date,
    };
  }

  const original = normalizeText(value);

  if (!original) return null;

  const text = cleanDateText(original);

  const candidates = extractDateCandidates(text);

  if (candidates.length >= 2) {
    const first = candidates[0];
    const second = candidates[1];

    if (first <= second) {
      return {
        start: first,
        end: second,
      };
    }

    return {
      start: second,
      end: first,
    };
  }

  if (candidates.length === 1) {
    return {
      start: candidates[0],
      end: candidates[0],
    };
  }

  return null;
}

/**
 * Date cell parser for Christmas / New Year dates.
 */
function parseDateCell(value: unknown): string | null {
  return parseSingleDate(value);
}

/* -------------------------------------------------------------------------- */
/*                              BLACKOUTS                                     */
/* -------------------------------------------------------------------------- */

function parseBlackouts(v: unknown): BlackoutRange[] {
  if (v === null || v === undefined || normalizeText(v) === "") return [];

  if (typeof v === "number" || v instanceof Date) {
    const date = parseSingleDate(v);
    return date
      ? [{ id: `bo_${Math.random().toString(36).slice(2, 9)}`, from: date, to: date }]
      : [];
  }

  const chunks = normalizeText(v)
    .split(/[;|]/)
    .map((x) => x.trim())
    .filter(Boolean);

  const result: BlackoutRange[] = [];

  for (const chunk of chunks) {
    const range = parseValidity(chunk);

    if (!range) continue;

    result.push({
      id: `bo_${Math.random().toString(36).slice(2, 9)}`,
      from: range.start,
      to: range.end,
    });
  }

  return result;
}

function serializeBlackouts(list?: BlackoutRange[]): string {
  if (!list?.length) return "";

  return list.map((b) => serializeValidity(b.from, b.to)).join("; ");
}

/* -------------------------------------------------------------------------- */
/*                              SUPPLEMENTS                                   */
/* -------------------------------------------------------------------------- */

function parseSupType(v: string): SupplementType {
  const t = normalizeText(v).toLowerCase().replace(/[\s-]/g, "_");

  if (
    t.includes("fixed") ||
    t.includes("room") ||
    t.includes("per_room") ||
    t.includes("fixed_room")
  ) {
    return "fixed";
  }

  return "per_person";
}

/* -------------------------------------------------------------------------- */
/*                              SEASON                                        */
/* -------------------------------------------------------------------------- */

function inferSeason(start: string, _end: string): string {
  const date = new Date(`${start}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "Season";
  }

  const month = date.getMonth() + 1;

  if (month >= 10 || month <= 3) {
    return "Peak Season";
  }

  if (month >= 4 && month <= 6) {
    return "Off Season";
  }

  return "Shoulder Season";
}

/* -------------------------------------------------------------------------- */
/*                              CWB                                           */
/* -------------------------------------------------------------------------- */

function parseCwb(value: unknown): {
  amount: number | null;
  rule: string | null;
} {
  const text = normalizeText(value);

  if (!text) {
    return {
      amount: null,
      rule: null,
    };
  }

  if (isNumericValue(text)) {
    return {
      amount: parseNum(text),
      rule: null,
    };
  }

  return {
    amount: null,
    rule: text,
  };
}

/* -------------------------------------------------------------------------- */
/*                              WORKSHEET DISCOVERY                            */
/* -------------------------------------------------------------------------- */

function getHeaderScore(sheet: XLSX.WorkSheet): number {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    defval: "",
    header: 1,
    range: 0,
  });

  const header = rows[0] ?? [];

  const normalizedHeaders = header.map(normalizeHeader);

  const requiredGroups = [COL.city, COL.hotel, COL.room, COL.validity, COL.meal];

  let score = 0;

  for (const group of requiredGroups) {
    const aliases = group.map(normalizeHeader);

    if (
      normalizedHeaders.some((h) => aliases.some((a) => h === a || h.includes(a) || a.includes(h)))
    ) {
      score++;
    }
  }

  return score;
}

function findHotelRatesSheet(wb: XLSX.WorkBook): XLSX.WorkSheet | null {
  const preferredNames = [
    "hotel rates",
    "hotel rate",
    "hotels",
    "hotel",
    "rate sheet",
    "hotel rate sheet",
  ];

  for (const name of wb.SheetNames) {
    const normalized = normalizeHeader(name);

    if (preferredNames.some((x) => normalizeHeader(x) === normalized)) {
      return wb.Sheets[name];
    }
  }

  let bestSheet: XLSX.WorkSheet | null = null;

  let bestScore = -1;

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];

    if (!sheet) continue;

    const score = getHeaderScore(sheet);

    if (score > bestScore) {
      bestScore = score;
      bestSheet = sheet;
    }
  }

  return bestSheet;
}

function canonicalCityName(value: string): { name: string; diagnostic?: string } {
  const compact = normalizeText(value).replace(/\s+/g, " ");
  if (/^ujjian$/i.test(compact)) {
    return {
      name: "Ujjain",
      diagnostic: 'City alias "Ujjian" matched to canonical city "Ujjain".',
    };
  }
  return { name: compact };
}

function sameImportedPrices(
  plan: typeof db.get extends () => infer D
    ? D extends { rate_plans: (infer P)[] }
      ? P
      : never
    : never,
  single: number | null,
  double: number | null,
): boolean {
  return (
    (single === null || (!plan.single_rate_missing && plan.single_rate === single)) &&
    (double === null || (!plan.double_rate_missing && plan.double_rate === double))
  );
}

/** Read-only audit. No master-store or Supabase mutation occurs here. */
export async function previewExcel(file: File): Promise<ImportPreview> {
  const empty: ImportPreview = {
    sheetName: "",
    totalRows: 0,
    hotelsMatched: 0,
    newHotels: 0,
    newRooms: 0,
    newRateCombinations: 0,
    identicalDuplicates: 0,
    conflictingRows: 0,
    rejectedRows: 0,
    diagnostics: [],
  };
  const wb = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
    cellNF: true,
    cellText: true,
  });
  const exactName = wb.SheetNames.find((name) => normalizeHeader(name) === "hotel rates");
  const sheet = exactName ? wb.Sheets[exactName] : findHotelRatesSheet(wb);
  if (!sheet) throw new Error('Could not find the "Hotel Rates" worksheet.');
  empty.sheetName = exactName ?? wb.SheetNames.find((name) => wb.Sheets[name] === sheet) ?? "";
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
    blankrows: false,
  });
  empty.totalRows = rows.length;
  const data = db.get();
  const seenHotels = new Set<string>();
  const seenRooms = new Set<string>();
  const seenRates = new Map<string, { single: number | null; double: number | null }>();
  const matchedHotels = new Set<string>();

  rows.forEach((raw, index) => {
    const row = index + 2;
    const rawCity = pick(raw, COL.city);
    const cityResult = canonicalCityName(rawCity);
    const city = cityResult.name;
    const hotel = pick(raw, COL.hotel);
    const room = pick(raw, COL.room) || DEFAULT_ROOM_NAME;
    const plan = parseMealPlan(pick(raw, COL.meal));
    const rawCategory = pick(raw, COL.category);
    const category = coerceCategory(rawCategory);
    const from = parseSingleDate(pickValue(raw, COL.validityFrom));
    const to = parseSingleDate(pickValue(raw, COL.validityTo));
    const validity =
      from && to
        ? { start: from <= to ? from : to, end: from <= to ? to : from }
        : parseValidity(pickValue(raw, COL.validity));
    const base = {
      row,
      hotel,
      city: rawCity,
      category: category ?? rawCategory,
      room,
      plan: plan ?? pick(raw, COL.meal),
      validity: validity ? `${validity.start} - ${validity.end}` : pick(raw, COL.validity),
    };
    if (
      !rawCity &&
      !hotel &&
      !pick(raw, COL.room) &&
      !pick(raw, COL.validity) &&
      !pick(raw, COL.meal)
    )
      return;
    const invalid = !city
      ? "Missing City."
      : !hotel
        ? "Missing Hotel Name."
        : !category
          ? normalizeText(rawCategory).toLowerCase() === "03 stra deluxe"
            ? 'Category "03 Stra Deluxe" needs administrator review; suggested correction: "3 Star Deluxe".'
            : rawCategory
              ? `Unsupported hotel category: ${rawCategory}.`
              : "Missing Hotel Category."
          : !validity
            ? "Missing or unparseable validity dates."
            : !plan
              ? "Missing or unsupported meal plan."
              : "";
    const single = parseNumOrNull(pick(raw, COL.single));
    const double = parseNumOrNull(pick(raw, COL.double));
    const priceInvalid = single === null && double === null;
    if (invalid || priceInvalid) {
      empty.rejectedRows++;
      empty.diagnostics.push({
        ...base,
        disposition: "Invalid / Needs Review",
        reason: invalid || "Missing or invalid SGL and DBL rates.",
      });
      return;
    }
    const cityRecord = data.cities.find(
      (c) => normalizeText(c.name).toLowerCase() === city.toLowerCase(),
    );
    const hotelKey = `${city.toLowerCase()}|${normalizeText(hotel).toLowerCase()}`;
    const existingHotel =
      cityRecord &&
      data.hotels.find(
        (h) =>
          h.city_id === cityRecord.id &&
          normalizeText(h.name).toLowerCase() === normalizeText(hotel).toLowerCase(),
      );
    if (existingHotel) matchedHotels.add(existingHotel.id);
    const roomKey = `${hotelKey}|${normalizeText(room).toLowerCase()}`;
    const existingRoom =
      existingHotel &&
      data.room_categories.find(
        (r) =>
          r.hotel_id === existingHotel.id &&
          normalizeText(r.name).toLowerCase() === normalizeText(room).toLowerCase(),
      );
    const rateKey = `${roomKey}|${category}|${plan}|${validity!.start}|${validity!.end}`;
    const existingPlan =
      existingRoom &&
      data.rate_plans.find(
        (p) =>
          p.room_category_id === existingRoom.id &&
          (p.hotel_category ?? existingHotel.hotel_category) === category &&
          p.meal_plan === plan &&
          p.validity_start === validity!.start &&
          p.validity_end === validity!.end,
      );
    const prior = seenRates.get(rateKey);
    let disposition: ImportDisposition;
    let reason = cityResult.diagnostic ?? "Ready to import.";
    if (
      (existingPlan && sameImportedPrices(existingPlan, single, double)) ||
      (prior && prior.single === single && prior.double === double)
    ) {
      disposition = "Identical Duplicate";
      empty.identicalDuplicates++;
      reason = "Same hotel, category, room, meal plan, validity and supplied prices already exist.";
    } else if (existingPlan || prior) {
      disposition = "Conflicting Duplicate";
      empty.conflictingRows++;
      reason =
        "Same hotel, category, room, meal plan and validity has different supplied prices; review before commit.";
    } else if (!existingHotel && !seenHotels.has(hotelKey)) {
      disposition = "New Hotel";
      empty.newHotels++;
    } else if (!existingRoom && !seenRooms.has(roomKey)) {
      disposition = "New Room Category";
      empty.newRooms++;
    } else {
      disposition = existingHotel ? "New Meal Plan / Rate Period" : "Existing Hotel";
    }
    if (disposition !== "Identical Duplicate" && disposition !== "Conflicting Duplicate")
      empty.newRateCombinations++;
    empty.diagnostics.push({ ...base, disposition, reason });
    seenHotels.add(hotelKey);
    seenRooms.add(roomKey);
    seenRates.set(rateKey, { single, double });
  });
  empty.hotelsMatched = matchedHotels.size;
  return empty;
}

/* -------------------------------------------------------------------------- */
/*                              IMPORT DEFAULTS                               */
/* -------------------------------------------------------------------------- */

/**
 * These defaults are used only when the source Excel cell is empty.
 *
 * This prevents reference-only rows such as:
 *
 * Hotel / As Per Portal
 *
 * from becoming import errors.
 */
const DEFAULT_ROOM_NAME = "As Per Portal";

/* -------------------------------------------------------------------------- */
/*                              IMPORT                                        */
/* -------------------------------------------------------------------------- */

export async function importExcel(
  file: File,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    totalRows: 0,
    hotelsAdded: 0,
    hotelsUpdated: 0,
    roomsAdded: 0,
    plansUpdated: 0,
    plansCreated: 0,
    identicalDuplicates: 0,
    conflictingRows: 0,
    rateCellsImported: 0,
    skippedRows: 0,
    errors: [],
  };

  if (!file) {
    summary.errors.push({
      row: 0,
      reason: "No Excel file was selected.",
      raw: {},
    });

    return summary;
  }

  try {
    const buf = await file.arrayBuffer();

    const wb = XLSX.read(buf, {
      type: "array",
      cellDates: true,
      cellNF: true,
      cellText: true,
    });

    if (!wb.SheetNames.length) {
      summary.errors.push({
        row: 0,
        reason: "The Excel workbook does not contain any worksheets.",
        raw: {},
      });

      return summary;
    }

    const sheet = findHotelRatesSheet(wb);

    if (!sheet) {
      summary.errors.push({
        row: 0,
        reason: "Could not find a valid hotel-rate worksheet.",
        raw: {},
      });

      return summary;
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: true,
      blankrows: false,
    });

    summary.totalRows = rows.length;

    if (rows.length === 0) {
      return summary;
    }

    const beforeHotels = db.get().hotels.length;
    const beforeHotelIds = new Set(db.get().hotels.map((hotel) => hotel.id));

    const beforeRooms = db.get().room_categories.length;

    const cityCache = new Map<string, Awaited<ReturnType<typeof cityService.findOrCreate>>>();

    const hotelCache = new Map<string, Awaited<ReturnType<typeof hotelService.findOrCreate>>>();

    const roomCache = new Map<string, Awaited<ReturnType<typeof roomService.findOrCreate>>>();
    const updatedHotelIds = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];

      const rowNum = i + 2;

      try {
        const rawCityName = pick(raw, COL.city);
        const cityName = canonicalCityName(rawCityName).name;

        const hotelName = pick(raw, COL.hotel);

        let roomName = pick(raw, COL.room);

        const validityRaw = pick(raw, COL.validity);
        const validityFromRaw = pickValue(raw, COL.validityFrom);
        const validityToRaw = pickValue(raw, COL.validityTo);
        const validityCell = pickValue(raw, COL.validity);

        const mealRaw = pick(raw, COL.meal);

        /**
         * Completely blank / section rows.
         *
         * Example:
         *
         * Hotel
         *
         * with no city/hotel/room information.
         *
         * These are not errors.
         */
        if (!cityName && !hotelName && !roomName && !validityRaw && !mealRaw) {
          summary.skippedRows++;
          onProgress?.({
            done: i + 1,
            total: rows.length,
          });

          continue;
        }

        /**
         * Rows containing only a generic "Hotel"
         * marker are also skipped.
         */
        if (
          !cityName &&
          !hotelName &&
          normalizeText(pick(raw, COL.hotelType)).toLowerCase() === "hotel"
        ) {
          summary.skippedRows++;
          onProgress?.({
            done: i + 1,
            total: rows.length,
          });

          continue;
        }

        /**
         * City and hotel are genuinely required.
         */
        const missingCore: string[] = [];

        if (!cityName) {
          missingCore.push("City");
        }

        if (!hotelName) {
          missingCore.push("Hotel Name");
        }

        if (missingCore.length > 0) {
          summary.skippedRows++;
          summary.errors.push({
            row: rowNum,
            reason: `Missing required field(s): ${missingCore.join(", ")}.`,
            raw,
          });

          onProgress?.({
            done: i + 1,
            total: rows.length,
          });

          continue;
        }

        /**
         * Missing room:
         *
         * Use "As Per Portal".
         */
        if (!roomName) {
          roomName = DEFAULT_ROOM_NAME;
        }

        const separateStart = parseSingleDate(validityFromRaw);
        const separateEnd = parseSingleDate(validityToRaw);
        const range =
          separateStart && separateEnd
            ? {
                start: separateStart <= separateEnd ? separateStart : separateEnd,
                end: separateStart <= separateEnd ? separateEnd : separateStart,
              }
            : parseValidity(validityCell);
        if (!range) {
          summary.skippedRows++;
          summary.errors.push({
            row: rowNum,
            reason: `Missing or unparseable validity dates${validityRaw ? `: ${validityRaw}` : ""}. No season was invented.`,
            raw,
          });
          onProgress?.({ done: i + 1, total: rows.length });
          continue;
        }

        const meal = parseMealPlan(mealRaw);
        if (!meal) {
          summary.skippedRows++;
          summary.errors.push({
            row: rowNum,
            reason: `Missing or unsupported meal plan${mealRaw ? `: ${mealRaw}` : ""}. No CP rate was substituted.`,
            raw,
          });
          onProgress?.({ done: i + 1, total: rows.length });
          continue;
        }
        const finalMeal: MealPlan = meal;

        const sourceCategory = coerceCategory(pick(raw, COL.category));

        const contact = splitContact(pick(raw, COL.ratesFrom));

        const sourceHotelType = coerceHotelType(pick(raw, COL.hotelType));

        const cwb = parseCwb(pick(raw, COL.cwb));

        const explicitCwbRule = pick(raw, COL.cwbRule);

        /* ----------------------------- CITY ----------------------------- */

        const cityKey = cityName.toLowerCase().trim().replace(/\s+/g, " ");

        let city = cityCache.get(cityKey);

        if (!city) {
          city = await cityService.findOrCreate(cityName);

          cityCache.set(cityKey, city);
        }

        const existingHotel = db
          .get()
          .hotels.find(
            (candidate) =>
              candidate.city_id === city.id &&
              candidate.name.trim().replace(/\s+/g, " ").toLowerCase() ===
                hotelName.trim().replace(/\s+/g, " ").toLowerCase(),
          );
        if (existingHotel && beforeHotelIds.has(existingHotel.id)) {
          updatedHotelIds.add(existingHotel.id);
        }
        const rawCategory = pick(raw, COL.category);
        if (rawCategory && !sourceCategory) {
          summary.skippedRows++;
          summary.errors.push({
            row: rowNum,
            reason: `Unsupported hotel category: ${rawCategory}.`,
            raw,
          });
          onProgress?.({ done: i + 1, total: rows.length });
          continue;
        }
        const category = sourceCategory ?? existingHotel?.hotel_category;
        if (!category) {
          summary.skippedRows++;
          summary.errors.push({
            row: rowNum,
            reason: "Missing Hotel Category for a new hotel; no default category was assigned.",
            raw,
          });
          onProgress?.({ done: i + 1, total: rows.length });
          continue;
        }
        const hotelType = sourceHotelType ?? existingHotel?.hotel_type;
        const blackoutRaw = pickValue(raw, COL.blackout);
        const wifiRaw = pick(raw, COL.wifi);
        const poolRaw = pick(raw, COL.pool);

        /* ----------------------------- HOTEL ---------------------------- */

        const hotelKey = [city.id, hotelName.toLowerCase().trim().replace(/\s+/g, " ")].join("|");

        let hotel = hotelCache.get(hotelKey);

        if (!hotel) {
          hotel = await hotelService.findOrCreate({
            city_id: city.id,
            name: hotelName,
                // The physical hotel keeps its stable legacy category. Each imported
                // offering stores its own category on the rate plan below.
                hotel_category: existingHotel?.hotel_category ?? category,
            contact_name: contact.name || existingHotel?.contact_name || "",
            contact_phone: contact.phone || existingHotel?.contact_phone || "",
            email: pick(raw, COL.email) || existingHotel?.email || "",
            address: pick(raw, COL.address) || existingHotel?.address || "",
            hotel_type: hotelType,
            blackout_ranges: blackoutRaw
              ? parseBlackouts(blackoutRaw)
              : (existingHotel?.blackout_ranges ?? []),
            has_wifi: wifiRaw ? parseBool(wifiRaw) : (existingHotel?.has_wifi ?? true),
            has_pool: poolRaw ? parseBool(poolRaw) : (existingHotel?.has_pool ?? false),
          });

          hotelCache.set(hotelKey, hotel);
        }

        /* ----------------------------- ROOM ----------------------------- */

        const roomKey = [hotel.id, roomName.toLowerCase().trim()].join("|");

        let room = roomCache.get(roomKey);

        if (!room) {
          room = await roomService.findOrCreate(hotel.id, roomName);

          roomCache.set(roomKey, room);
        }

        /* ----------------------------- RATES ---------------------------- */

        const doubleRate = parseNumOrNull(pick(raw, COL.double));
        const singleRate = parseNumOrNull(pick(raw, COL.single));

        const quadRate = parseNumOrNull(pick(raw, COL.quad));

        const extraBedRate = parseNumOrNull(pick(raw, COL.extraBed));

        const lunchRate = parseNumOrNull(pick(raw, COL.lunch));

        const dinnerRate = parseNumOrNull(pick(raw, COL.dinner));

        const extraBreakfastRate = parseNumOrNull(pick(raw, COL.extraBkf));

        const xmasSupplement = parseNumOrNull(pick(raw, COL.xmas));

        const newYearSupplement = parseNumOrNull(pick(raw, COL.ny));

        const xmasFrom = parseDateCell(pickValue(raw, COL.xmasFrom));

        const xmasTo = parseDateCell(pickValue(raw, COL.xmasTo));

        const newYearFrom = parseDateCell(pickValue(raw, COL.nyFrom));

        const newYearTo = parseDateCell(pickValue(raw, COL.nyTo));

        const includeRaw = pick(raw, COL.include);

        const includeInQuote = includeRaw === "" ? true : parseBool(includeRaw);

        /**
         * If the validity field contains:
         *
         * Season
         * Peak Season
         * Moderate Season
         *
         * preserve it as the season label.
         */
        const sourceSeason = pick(raw, COL.season);

        const validityText = normalizeText(validityRaw);

        let seasonLabel = sourceSeason;

        if (!seasonLabel) {
          if (/moderate\s+season/i.test(validityText)) {
            seasonLabel = "Moderate Season";
          } else if (/high\s+season/i.test(validityText)) {
            seasonLabel = "High Season";
          } else if (/peak\s+season/i.test(validityText)) {
            seasonLabel = "Peak Season";
          } else if (/^season$/i.test(validityText)) {
            seasonLabel = "Season";
          } else {
            seasonLabel = inferSeason(range.start, range.end);
          }
        }

        const remarks = pick(raw, COL.remarks) || null;

        const cwbRule = explicitCwbRule || cwb.rule || null;

        const matchingPlan = db
          .get()
          .rate_plans.filter(
            (plan) =>
              plan.room_category_id === room.id &&
              (plan.hotel_category ?? hotel.hotel_category) === category &&
              plan.validity_start === range.start &&
              plan.validity_end === range.end &&
              plan.meal_plan === finalMeal,
          )
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
        if (matchingPlan && sameImportedPrices(matchingPlan, singleRate, doubleRate)) {
          summary.identicalDuplicates++;
          onProgress?.({ done: i + 1, total: rows.length });
          continue;
        }
        if (matchingPlan) {
          summary.conflictingRows++;
          summary.skippedRows++;
          summary.errors.push({
            row: rowNum,
            reason:
              "Conflicting duplicate: the same hotel, category, room, meal plan and validity already has different supplied prices. Existing data was not overwritten.",
            raw,
          });
          onProgress?.({ done: i + 1, total: rows.length });
          continue;
        }
        const resolvedSingleRate = singleRate ?? matchingPlan?.single_rate ?? null;
        const resolvedDoubleRate = doubleRate ?? matchingPlan?.double_rate ?? null;
        const singleRateMissing =
          singleRate === null
            ? matchingPlan
              ? (matchingPlan.single_rate_missing ?? false)
              : true
            : false;
        const doubleRateMissing =
          doubleRate === null
            ? matchingPlan
              ? (matchingPlan.double_rate_missing ?? false)
              : true
            : false;
        if (resolvedSingleRate === null && resolvedDoubleRate === null) {
          summary.skippedRows++;
          summary.errors.push({
            row: rowNum,
            reason: "Missing or invalid SGL and DBL rates. No zero price was substituted.",
            raw,
          });
          onProgress?.({ done: i + 1, total: rows.length });
          continue;
        }
        if (singleRateMissing || doubleRateMissing) {
          const missingOccupancies = [
            singleRateMissing ? "SGL" : "",
            doubleRateMissing ? "DBL" : "",
          ].filter(Boolean);
          if (missingOccupancies.length) {
            summary.errors.push({
              row: rowNum,
              reason: `Imported supplied occupancy price(s); missing ${missingOccupancies.join(" and ")} remains unavailable, not ₹0.`,
              raw,
            });
          }
        }

        /* -------------------------- RATE PLAN --------------------------- */

        const importedPlan = await ratePlanService.createMany([
          {
            room_category_id: room.id,

            hotel_category: category,

            validity_start: range.start,

            validity_end: range.end,

            season_label: seasonLabel,

            meal_plan: finalMeal,

            double_rate: resolvedDoubleRate ?? 0,

            double_rate_missing: doubleRateMissing,

            single_rate: resolvedSingleRate ?? 0,

            single_rate_missing: singleRateMissing,

            quad_rate: quadRate ?? matchingPlan?.quad_rate ?? null,

            extra_bed_rate: extraBedRate ?? matchingPlan?.extra_bed_rate ?? 0,

            cwb_rate: cwb.amount ?? matchingPlan?.cwb_rate ?? null,

            cwb_rule_text: cwbRule ?? matchingPlan?.cwb_rule_text ?? null,

            lunch_rate: lunchRate ?? matchingPlan?.lunch_rate ?? null,

            dinner_rate: dinnerRate ?? matchingPlan?.dinner_rate ?? null,

            extra_breakfast_rate: extraBreakfastRate ?? matchingPlan?.extra_breakfast_rate ?? null,

            xmas_supplement: xmasSupplement ?? matchingPlan?.xmas_supplement ?? null,

            xmas_supplement_type: pick(raw, COL.xmasType)
              ? parseSupType(pick(raw, COL.xmasType))
              : (matchingPlan?.xmas_supplement_type ?? "per_person"),

            xmas_date_from: xmasFrom ?? matchingPlan?.xmas_date_from ?? null,

            xmas_date_to: xmasTo ?? matchingPlan?.xmas_date_to ?? null,

            newyear_supplement: newYearSupplement ?? matchingPlan?.newyear_supplement ?? null,

            newyear_supplement_type: pick(raw, COL.nyType)
              ? parseSupType(pick(raw, COL.nyType))
              : (matchingPlan?.newyear_supplement_type ?? "per_person"),

            newyear_date_from: newYearFrom ?? matchingPlan?.newyear_date_from ?? null,

            newyear_date_to: newYearTo ?? matchingPlan?.newyear_date_to ?? null,

            include_in_quote:
              includeRaw === "" ? (matchingPlan?.include_in_quote ?? true) : includeInQuote,

            remarks: remarks ?? matchingPlan?.remarks ?? null,
          },
        ]);
        summary.plansCreated += importedPlan.created;
        summary.plansUpdated += importedPlan.updated;
        summary.rateCellsImported += [
          pick(raw, COL.single),
          pick(raw, COL.double),
          pick(raw, COL.quad),
          pick(raw, COL.extraBed),
          pick(raw, COL.cwb),
          pick(raw, COL.lunch),
          pick(raw, COL.dinner),
          pick(raw, COL.extraBkf),
          pick(raw, COL.xmas),
          pick(raw, COL.ny),
        ].filter((value) => value !== "").length;
      } catch (err) {
        summary.skippedRows++;
        let reason = "Unknown error while importing this row.";

        if (err instanceof Error) {
          reason = err.message || reason;
        } else if (typeof err === "string") {
          reason = err;
        } else {
          try {
            reason = JSON.stringify(err);
          } catch {
            reason = "Unknown error while importing this row.";
          }
        }

        summary.errors.push({
          row: rowNum,
          reason,
          raw,
        });
      }

      onProgress?.({
        done: i + 1,
        total: rows.length,
      });

      /**
       * Keep UI responsive.
       */
      if (i % 10 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    summary.hotelsAdded = db.get().hotels.length - beforeHotels;

    summary.roomsAdded = db.get().room_categories.length - beforeRooms;
    summary.hotelsUpdated = updatedHotelIds.size;

    return summary;
  } catch (err) {
    let reason = "Could not read the Excel file.";

    if (err instanceof Error) {
      reason = err.message || reason;
    } else if (typeof err === "string") {
      reason = err;
    }

    summary.errors.push({
      row: 0,
      reason,
      raw: {},
    });

    return summary;
  }
}

/* -------------------------------------------------------------------------- */
/*                              EXPORT                                        */
/* -------------------------------------------------------------------------- */

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
      City: city?.name ?? "",

      "Hotel Category": hotel.hotel_category,

      "Hotel Type": hotel.hotel_type ?? "",

      "Hotel Name": hotel.name,

      Address: hotel.address ?? "",

      "Room Category": room.name,

      Validity: serializeValidity(p.validity_start, p.validity_end),

      Season: p.season_label ?? "",

      "Rates Standard Meal Plan": p.meal_plan,

      Double: p.double_rate,

      Single: p.single_rate,

      Quad: p.quad_rate ?? "",

      "Extra Bed": p.extra_bed_rate,

      CWB: p.cwb_rate ?? "",

      "CWB Rule": p.cwb_rule_text ?? "",

      Lunch: p.lunch_rate ?? "",

      Dinner: p.dinner_rate ?? "",

      "Extra Breakfast": p.extra_breakfast_rate ?? "",

      "X'mas Sup": p.xmas_supplement ?? "",

      "X'mas Sup Type": p.xmas_supplement_type ?? "",

      "X'mas From": p.xmas_date_from ?? "",

      "X'mas To": p.xmas_date_to ?? "",

      "N'year Sup": p.newyear_supplement ?? "",

      "N'year Sup Type": p.newyear_supplement_type ?? "",

      "N'year From": p.newyear_date_from ?? "",

      "N'year To": p.newyear_date_to ?? "",

      "Rates From": [hotel.contact_name, hotel.contact_phone].filter(Boolean).join(" - "),

      "Email ID": hotel.email,

      Wifi: hotel.has_wifi ? "Yes" : "No",

      Pool: hotel.has_pool ? "Yes" : "No",

      "Blackout Dates": serializeBlackouts(hotel.blackout_ranges),

      "Include In Quote": p.include_in_quote === false ? "No" : "Yes",

      Remarks: p.remarks ?? "",
    });
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, "Hotel Rates");

  const date = new Date().toISOString().slice(0, 10);

  XLSX.writeFile(wb, `MP_Hotels_Rate_Sheet_${date}.xlsx`);
}

/* -------------------------------------------------------------------------- */
/*                              ERROR LOG                                     */
/* -------------------------------------------------------------------------- */

export function downloadErrorLog(summary: ImportSummary): void {
  const rows = summary.errors.map((e) => ({
    Row: e.row,
    Reason: e.reason,
    ...e.raw,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, "Errors");

  XLSX.writeFile(wb, `Import_Errors_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
