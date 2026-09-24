// Shared season/rate matching. Handles both:
//  (a) exact ISO-date range match (validity_start <= date <= validity_end), and
//  (b) year-agnostic recurring seasons — matches by month/day so that a
//      season imported as e.g. "2022-10-01 → 2023-09-30" still matches a
//      travel date in a later year. Also handles year-wrap seasons
//      (start_md > end_md, e.g. "Oct 1 → Sep 30").
import type { RatePlan } from "@/lib/mock-store";

function md(iso: string): number {
  // Encode month*100 + day for cheap comparison; ignore the year.
  const [, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  if (!m || !d) return -1;
  return m * 100 + d;
}

function rangeMatches(p: RatePlan, dateISO: string): boolean {
  // (a) exact ISO range
  if (p.validity_start <= dateISO && p.validity_end >= dateISO) return true;
  // (b) recurring month/day range
  const t = md(dateISO);
  const s = md(p.validity_start);
  const e = md(p.validity_end);
  if (t < 0 || s < 0 || e < 0) return false;
  return s <= e ? t >= s && t <= e : t >= s || t <= e;
}

/** A season is expired when its Validity To date is strictly before today. */
export function isExpiredPlan(p: RatePlan, todayISO = new Date().toISOString().slice(0, 10)): boolean {
  return !!p.validity_end && p.validity_end < todayISO;
}

/**
 * Rows usable in quotation costing: explicitly de-selected components are
 * dropped, and expired seasons are dropped whenever a non-expired season
 * exists for the same room + meal plan (legacy-only data still resolves).
 */
export function usablePlans(plans: RatePlan[]): RatePlan[] {
  const selected = plans.filter((p) => p.include_in_quote !== false);
  const live = selected.filter((p) => !isExpiredPlan(p));
  const keys = new Set(live.map((p) => `${p.room_category_id}|${p.meal_plan}`));
  return selected.filter((p) => !isExpiredPlan(p) || !keys.has(`${p.room_category_id}|${p.meal_plan}`));
}

export function findRatePlan(
  plans: RatePlan[],
  room_id: string,
  meal: string,
  dateISO: string,
): RatePlan | null {
  const pool = usablePlans(plans).filter((p) => p.room_category_id === room_id && p.meal_plan === meal);
  // Prefer exact-year range, then recurring month/day, then latest-updated as tiebreak.
  const exact = pool.filter((p) => p.validity_start <= dateISO && p.validity_end >= dateISO);
  const cands = exact.length ? exact : pool.filter((p) => rangeMatches(p, dateISO));
  return cands.sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))[0] ?? null;
}

export function availableMealPlans(
  plans: RatePlan[],
  room_id: string,
  dateISO?: string,
): string[] {
  const pool = usablePlans(plans).filter((p) => p.room_category_id === room_id);
  const filtered = dateISO ? pool.filter((p) => rangeMatches(p, dateISO)) : pool;
  const set = new Set(filtered.map((p) => p.meal_plan));
  // Preserve canonical order
  return ["CP", "MAP", "AP"].filter((m) => set.has(m as never));
}
