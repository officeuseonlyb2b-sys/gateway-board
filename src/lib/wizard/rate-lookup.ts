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

export function findRatePlan(
  plans: RatePlan[],
  room_id: string,
  meal: string,
  dateISO: string,
): RatePlan | null {
  const pool = plans.filter((p) => p.room_category_id === room_id && p.meal_plan === meal);
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
  const pool = plans.filter((p) => p.room_category_id === room_id);
  const filtered = dateISO ? pool.filter((p) => rangeMatches(p, dateISO)) : pool;
  const set = new Set(filtered.map((p) => p.meal_plan));
  // Preserve canonical order
  return ["CP", "MAP", "AP"].filter((m) => set.has(m as never));
}
