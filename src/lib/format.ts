// Indian numbering & date formatting helpers.
import type { QuoteDraft, TravelDetail } from "@/lib/wizard/types";

export function inr(n: number): string {
  if (!isFinite(n)) return "₹0";
  const rounded = Math.round(n);
  return "₹" + rounded.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function inrDecimal(n: number): string {
  if (!isFinite(n)) return "₹0";
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDateDDMMYYYY(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateShort(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function isISOCalendarDate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Calendar-day difference for date keys; independent of timezone and DST. */
export function calendarDaysBetween(fromISO: string, toISO: string): number | null {
  if (!isISOCalendarDate(fromISO) || !isISOCalendarDate(toISO)) return null;
  const [fromYear, fromMonth, fromDay] = fromISO.split("-").map(Number);
  const [toYear, toMonth, toDay] = toISO.split("-").map(Number);
  return (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86_400_000;
}

export function addDaysISO(iso: string, n: number): string {
  if (!isISOCalendarDate(iso)) return iso;
  const [year, month, day] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(fromISO: string, toISO: string): number {
  if (!fromISO || !toISO) return 0;
  return Math.max(0, calendarDaysBetween(fromISO, toISO) ?? 0);
}

export type TripDateEdit =
  | { source: "start"; value: string }
  | { source: "end"; value: string }
  | { source: "duration"; value: number }
  | { source: "arrival" | "departure"; value: string };

export interface TripDateReconciliation {
  patch: Partial<Pick<QuoteDraft, "start_date" | "nights">>;
  valid: boolean;
  boundaryConflict: boolean;
}

export function isCalendarDate(value: string): boolean {
  return isISOCalendarDate(value);
}

export function calendarDateDifference(start: string, end: string): number | null {
  return calendarDaysBetween(start, end);
}

function travelDate(draft: QuoteDraft, side: "arrival" | "departure"): string {
  const mode = side === "arrival" ? draft.arrival_mode : draft.departure_mode;
  const detail: TravelDetail | undefined =
    side === "arrival"
      ? mode === "flight"
        ? draft.arrival_flight
        : mode === "train"
          ? draft.arrival_train
          : draft.arrival_other
      : mode === "flight"
        ? draft.departure_flight
        : mode === "train"
          ? draft.departure_train
          : draft.departure_other;
  return detail?.date || "";
}

/** Reconcile only explicit edits; Day 0 remains a separate pre-tour boundary. */
export function reconcileTripDateEdit(
  draft: QuoteDraft,
  edit: TripDateEdit,
): TripDateReconciliation {
  if (edit.source === "duration") {
    const nights = Math.trunc(edit.value);
    const valid = Number.isFinite(nights) && nights >= 0;
    return { patch: valid ? { nights } : {}, valid, boundaryConflict: false };
  }
  if (!isCalendarDate(edit.value)) {
    return { patch: {}, valid: false, boundaryConflict: false };
  }
  if (edit.source === "start") {
    return { patch: { start_date: edit.value }, valid: true, boundaryConflict: false };
  }
  if (edit.source === "end") {
    const nights = calendarDateDifference(draft.start_date, edit.value);
    const valid = nights !== null && nights >= 0;
    return { patch: valid ? { nights: nights! } : {}, valid, boundaryConflict: false };
  }
  if (draft.has_dates === false) {
    return { patch: {}, valid: true, boundaryConflict: false };
  }

  const arrival = edit.source === "arrival" ? edit.value : travelDate(draft, "arrival");
  const departure = edit.source === "departure" ? edit.value : travelDate(draft, "departure");
  if (!isCalendarDate(arrival) || !isCalendarDate(departure)) {
    return { patch: {}, valid: true, boundaryConflict: false };
  }
  const nights = calendarDateDifference(arrival, departure);
  if (nights === null || nights < 0) {
    return { patch: {}, valid: false, boundaryConflict: false };
  }
  if (draft.routing.some((day) => day.is_day_zero || day.day === 0)) {
    return { patch: {}, valid: true, boundaryConflict: true };
  }
  return { patch: { start_date: arrival, nights }, valid: true, boundaryConflict: false };
}

export function hasReversedTravelBoundaryDates(draft: QuoteDraft): boolean {
  const difference = calendarDateDifference(
    travelDate(draft, "arrival"),
    travelDate(draft, "departure"),
  );
  return difference !== null && difference < 0;
}

export function hasCompleteTravelBoundaryDates(draft: QuoteDraft): boolean {
  return (
    isCalendarDate(travelDate(draft, "arrival")) &&
    isCalendarDate(travelDate(draft, "departure"))
  );
}

// Parse validity text like "01 Oct 22 - 30 Sep 23" or "01-Oct-2022 to 30-Sep-2023"
export function parseValidityRange(text: string): { start: string; end: string } | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  const sep = cleaned.split(/\s*(?:-|to|–|—|→)\s*/i);
  if (sep.length < 2) return null;
  const a = parseFlexibleDate(sep[0]); const b = parseFlexibleDate(sep[sep.length - 1]);
  if (!a || !b) return null;
  return { start: a, end: b };
}

export function parseFlexibleDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  // Try native
  const native = new Date(t);
  if (!isNaN(+native) && native.getFullYear() > 1980) return native.toISOString().slice(0, 10);
  // "01 Oct 22" or "01-Oct-2022"
  const m = t.match(/(\d{1,2})[\s\-\/](\w{3,})[\s\-\/](\d{2,4})/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    if (mo !== undefined) {
      const dt = new Date(Date.UTC(y, mo, d));
      return dt.toISOString().slice(0, 10);
    }
  }
  // DD/MM/YYYY
  const m2 = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m2) {
    const d = parseInt(m2[1], 10); const mo = parseInt(m2[2], 10) - 1; let y = parseInt(m2[3], 10);
    if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, mo, d));
    return dt.toISOString().slice(0, 10);
  }
  return null;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function serializeValidity(startISO: string, endISO: string): string {
  const f = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).replace(/,/g, "");
  };
  return `${f(startISO)} - ${f(endISO)}`;
}
