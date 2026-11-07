import type { BrochureHotelRate, BrochureHotelRatePricingBasis } from "@/lib/mock-store";

export const BROCHURE_RATE_EXCEL_FIELDS = [
  ["validity_from", "Brochure Validity From"],
  ["validity_to", "Brochure Validity To"],
  ["rate_basis", "Brochure Rate Basis (Per Night / Full Programme)"],
  ["single", "Brochure SGL"],
  ["single_unit", "Brochure SGL Unit"],
  ["double", "Brochure DBL"],
  ["double_unit", "Brochure DBL Unit"],
  ["triple", "Brochure TRP"],
  ["triple_unit", "Brochure TRP Unit"],
  ["extra_bed", "Brochure Extra Bed"],
  ["extra_bed_unit", "Brochure Extra Bed Unit"],
  ["child", "Brochure Child"],
  ["child_unit", "Brochure Child Unit"],
] as const;

export type BrochureExcelValueKey = (typeof BROCHURE_RATE_EXCEL_FIELDS)[number][0];
export type BrochureExcelPeriodValues = Partial<Record<BrochureExcelValueKey, string | number>>;
export interface ParsedBrochureExcelPeriod {
  row: number;
  period: number;
  hotelId: string;
  sourceCity: string;
  sourceHotelName: string;
  validityFrom: string;
  validityTo: string;
  values: BrochureExcelPeriodValues;
}
export interface BrochureExcelConflict {
  hotelId: string;
  validityFrom: string;
  validityTo: string;
  rows: number[];
  fields: string[];
}
export interface BrochureExcelParseResult {
  hasBrochureColumns: boolean;
  periods: ParsedBrochureExcelPeriod[];
  conflicts: BrochureExcelConflict[];
  errors: Array<{ row: number; reason: string }>;
}

export type SavedBrochureHotelRate = Omit<BrochureHotelRate, "updated_at">;

const normalizedHeader = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const clean = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const keyFor = (period: number, label: string) => `Brochure Period ${period} - ${label}`;

export function brochureRateExcelColumns(periodCount: number): string[] {
  return Array.from({ length: Math.max(0, periodCount) }, (_, index) => {
    const period = index + 1;
    return BROCHURE_RATE_EXCEL_FIELDS.map(([, label]) => keyFor(period, label));
  }).flat();
}

export function brochureRateValuesForHotel(
  rates: readonly BrochureHotelRate[],
  periodCount = rates.length,
): Record<string, unknown> {
  const sorted = [...rates].sort((a, b) => a.validity_from.localeCompare(b.validity_from) || a.validity_to.localeCompare(b.validity_to));
  const output: Record<string, unknown> = {};
  for (let index = 0; index < periodCount; index += 1) {
    const rate = sorted[index];
    const period = index + 1;
    const values: Record<BrochureExcelValueKey, unknown> = {
      validity_from: rate?.validity_from || "",
      validity_to: rate?.validity_to || "",
      rate_basis: rate?.rate_basis === "per_night" ? "Per Night" : rate?.rate_basis === "full_programme" ? "Full Programme" : "",
      single: rate?.single ?? "",
      single_unit: rate ? unitLabel(rate.pricing_basis.single) : "",
      double: rate?.double ?? "",
      double_unit: rate ? unitLabel(rate.pricing_basis.double) : "",
      triple: rate?.triple ?? "",
      triple_unit: rate ? unitLabel(rate.pricing_basis.triple) : "",
      extra_bed: rate?.extra_bed ?? "",
      extra_bed_unit: rate ? unitLabel(rate.pricing_basis.extra_bed) : "",
      child: rate?.child ?? "",
      child_unit: rate ? unitLabel(rate.pricing_basis.child) : "",
    };
    for (const [field, label] of BROCHURE_RATE_EXCEL_FIELDS) output[keyFor(period, label)] = values[field];
  }
  return output;
}

function unitLabel(value: string): string {
  switch (value) {
    case "per_room": return "Per Room";
    case "per_person": return "Per Person";
    case "per_add_on": return "Per Extra Bed";
    case "per_child": return "Per Child";
    default: return "Unverified";
  }
}

function parseUnit(value: unknown, field: "single" | "double" | "triple" | "extra_bed" | "child"): string | undefined {
  const normalized = clean(value).toLowerCase().replace(/[\s_-]+/g, " ");
  if (!normalized) return undefined;
  if (["unverified", "unknown", "not verified"].includes(normalized)) return "unverified";
  if (["per room", "room", "per room per night"].includes(normalized) && field !== "extra_bed" && field !== "child") return "per_room";
  if (["per person", "person", "per person per night"].includes(normalized)) return "per_person";
  if (["per extra bed", "per add on", "add on", "per bed"].includes(normalized) && field === "extra_bed") return "per_add_on";
  if (["per child", "child"].includes(normalized) && field === "child") return "per_child";
  return "__invalid__";
}

function parseAmount(value: unknown): number | undefined | null {
  const text = clean(value);
  if (!text) return undefined;
  const numeric = text.replace(/[₹,\s]/g, "");
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(numeric)) return null;
  const amount = Number(numeric);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function readHeader(row: Record<string, unknown>, period: number, label: string): unknown {
  const expected = normalizedHeader(keyFor(period, label));
  const header = Object.keys(row).find((candidate) => normalizedHeader(candidate) === expected);
  return header === undefined ? undefined : row[header];
}

function fieldsEqual(left: unknown, right: unknown): boolean {
  return typeof left === "number" && typeof right === "number" ? left === right : clean(left).toLowerCase() === clean(right).toLowerCase();
}

export function parseBrochureRateExcelRows(
  rows: readonly Record<string, unknown>[],
  parseDate: (value: unknown) => string | undefined,
): BrochureExcelParseResult {
  const hasBrochureColumns = rows.some((row) => Object.keys(row).some((key) => normalizedHeader(key).startsWith("brochureperiod")));
  const errors: BrochureExcelParseResult["errors"] = [];
  if (!hasBrochureColumns) return { hasBrochureColumns, periods: [], conflicts: [], errors };
  const parsed: ParsedBrochureExcelPeriod[] = [];
  rows.forEach((row, rowIndex) => {
    const hotelId = clean(row[Object.keys(row).find((key) => normalizedHeader(key) === "hotelid") || ""]);
    for (const header of Object.keys(row)) {
      const match = normalizedHeader(header).match(/^brochureperiod(\d+)brochurevalidityfrom$/);
      if (!match) continue;
      const period = Number(match[1]);
      const hasRateInput = BROCHURE_RATE_EXCEL_FIELDS
        .filter(([field]) => field !== "validity_from" && field !== "validity_to")
        .some(([, label]) => clean(readHeader(row, period, label)) !== "");
      if (!hasRateInput) continue;
      const fromRaw = readHeader(row, period, "Brochure Validity From");
      const toRaw = readHeader(row, period, "Brochure Validity To");
      const validityFrom = parseDate(fromRaw) || "";
      const validityTo = parseDate(toRaw) || "";
      if (!validityFrom || !validityTo || validityTo < validityFrom) {
        errors.push({ row: rowIndex + 2, reason: `Brochure Period ${period} needs valid From/To dates.` });
        continue;
      }
      const values: BrochureExcelPeriodValues = {};
      const labels = new Map<string, BrochureExcelValueKey>(BROCHURE_RATE_EXCEL_FIELDS.map(([key, label]) => [label, key]));
      let invalid = false;
      const basis = clean(readHeader(row, period, "Brochure Rate Basis (Per Night / Full Programme)"));
      if (basis) {
        const normalizedBasis = basis.toLowerCase().replace(/[\s_-]+/g, " ");
        if (["per night", "nightly"].includes(normalizedBasis)) values.rate_basis = "per_night";
        else if (["full programme", "full program", "programme", "program"].includes(normalizedBasis)) values.rate_basis = "full_programme";
        else {
          errors.push({ row: rowIndex + 2, reason: `Brochure Period ${period} has unsupported Rate Basis “${basis}”.` });
          invalid = true;
        }
      }
      const amountFields = [
        ["single", "Brochure SGL"], ["double", "Brochure DBL"], ["triple", "Brochure TRP"],
        ["extra_bed", "Brochure Extra Bed"], ["child", "Brochure Child"],
      ] as const;
      for (const [field, label] of amountFields) {
        const rawAmount = readHeader(row, period, label);
        const amount = parseAmount(rawAmount);
        if (amount === null) {
          errors.push({ row: rowIndex + 2, reason: `Brochure Period ${period} has an invalid ${label} value.` });
          invalid = true;
          continue;
        }
        if (amount !== undefined) values[field] = amount;
        const unit = parseUnit(readHeader(row, period, `Brochure ${field === "single" ? "SGL" : field === "double" ? "DBL" : field === "triple" ? "TRP" : field === "extra_bed" ? "Extra Bed" : "Child"} Unit`), field);
        if (unit === "__invalid__") {
          errors.push({ row: rowIndex + 2, reason: `Brochure Period ${period} has an unsupported unit for ${label}.` });
          invalid = true;
        } else if (unit) {
          const unitKey = `${field}_unit` as BrochureExcelValueKey;
          values[unitKey] = unit;
        }
      }
      if (invalid) continue;
      for (const [label, key] of labels) {
        if (["Brochure Validity From", "Brochure Validity To", "Brochure Rate Basis (Per Night / Full Programme)"].includes(label)) continue;
        if (key in values) continue;
        const rawValue = readHeader(row, period, label);
        if (rawValue !== undefined && clean(rawValue) !== "") values[key] = clean(rawValue);
      }
      const sourceCityKey = Object.keys(row).find((candidate) => normalizedHeader(candidate) === "city");
      const sourceHotelNameKey = Object.keys(row).find((candidate) => normalizedHeader(candidate) === "hotelname");
      parsed.push({
        row: rowIndex + 2,
        period,
        hotelId,
        sourceCity: sourceCityKey ? clean(row[sourceCityKey]) : "",
        sourceHotelName: sourceHotelNameKey ? clean(row[sourceHotelNameKey]) : "",
        validityFrom,
        validityTo,
        values,
      });
    }
  });

  const groups = new Map<string, ParsedBrochureExcelPeriod[]>();
  for (const period of parsed) {
    const key = `${period.hotelId}|${period.validityFrom}|${period.validityTo}`;
    const group = groups.get(key) || [];
    group.push(period);
    groups.set(key, group);
  }
  const periods: ParsedBrochureExcelPeriod[] = [];
  const conflicts: BrochureExcelConflict[] = [];
  for (const group of groups.values()) {
    const merged: ParsedBrochureExcelPeriod = { ...group[0], values: { ...group[0].values } };
    const conflictingFields = new Set<string>();
    for (const repeated of group.slice(1)) {
      for (const [field, value] of Object.entries(repeated.values)) {
        const previous = merged.values[field as BrochureExcelValueKey];
        if (previous !== undefined && !fieldsEqual(previous, value)) conflictingFields.add(field);
        else if (previous === undefined) merged.values[field as BrochureExcelValueKey] = value as string | number;
      }
    }
    if (conflictingFields.size) {
      conflicts.push({ hotelId: group[0].hotelId, validityFrom: group[0].validityFrom, validityTo: group[0].validityTo, rows: group.map((item) => item.row), fields: [...conflictingFields] });
    } else periods.push(merged);
  }
  return { hasBrochureColumns, periods, conflicts, errors };
}

export function mergeBrochureExcelPeriod(
  existing: SavedBrochureHotelRate | BrochureHotelRate | undefined,
  period: ParsedBrochureExcelPeriod,
  newId: string,
): Omit<BrochureHotelRate, "updated_at"> {
  const values = period.values;
  const defaultBasis: BrochureHotelRatePricingBasis = existing?.pricing_basis || {
    single: "unverified", double: "unverified", triple: "unverified", extra_bed: "unverified", child: "unverified",
  };
  const unit = <K extends keyof BrochureHotelRatePricingBasis>(key: K): BrochureHotelRatePricingBasis[K] => {
    const value = values[`${key}_unit` as BrochureExcelValueKey];
    return typeof value === "string" ? value as BrochureHotelRatePricingBasis[K] : defaultBasis[key];
  };
  const amount = (key: "single" | "double" | "triple" | "extra_bed" | "child") => {
    const value = values[key];
    return typeof value === "number" ? value : existing?.[key] ?? 0;
  };
  return {
    id: existing?.id || newId,
    hotel_id: period.hotelId,
    validity_from: period.validityFrom,
    validity_to: period.validityTo,
    rate_basis: values.rate_basis === "per_night" || values.rate_basis === "full_programme" ? values.rate_basis : existing?.rate_basis ?? "per_night",
    single: amount("single"), double: amount("double"), triple: amount("triple"), extra_bed: amount("extra_bed"), child: amount("child"),
    pricing_basis: { single: unit("single"), double: unit("double"), triple: unit("triple"), extra_bed: unit("extra_bed"), child: unit("child") },
  };
}
