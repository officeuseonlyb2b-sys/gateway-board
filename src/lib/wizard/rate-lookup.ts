import type { RatePlan } from "@/lib/mock-store";

/** Return a sortable calendar date without applying a timezone conversion. */
export function calendarDateKey(value: string | null | undefined): string | null {
  const input = (value ?? "").trim();
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  const dmy = input.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  const year = Number(iso?.[1] ?? dmy?.[3]);
  const month = Number(iso?.[2] ?? dmy?.[2]);
  const day = Number(iso?.[3] ?? dmy?.[1]);
  if (!year || month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate()) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Hotel eligibility is controlled solely by its inclusive saved validity dates. */
export function ratePlanMatchesDate(
  p: Pick<RatePlan, "validity_start" | "validity_end">,
  stayDate: string,
): boolean {
  const start = calendarDateKey(p.validity_start);
  const end = calendarDateKey(p.validity_end);
  const date = calendarDateKey(stayDate);
  return Boolean(start && end && date && start <= date && date <= end);
}

/** A plan is expired only relative to the supplied calendar date. */
export function isExpiredPlan(p: RatePlan, calendarDate: string): boolean {
  const end = calendarDateKey(p.validity_end);
  const date = calendarDateKey(calendarDate);
  return Boolean(end && date && end < date);
}

/** Exclude only rate plans explicitly disabled for quotation use. */
export function usablePlans(plans: RatePlan[]): RatePlan[] {
  return plans.filter((p) => p.include_in_quote !== false);
}

export function ratePlanHasPrice(plan: {
  single_rate?: number | null;
  double_rate?: number | null;
  quad_rate?: number | null;
  single_rate_missing?: boolean;
  double_rate_missing?: boolean;
}): boolean {
  return (
    (!plan.single_rate_missing && (plan.single_rate ?? 0) > 0) ||
    (!plan.double_rate_missing && (plan.double_rate ?? 0) > 0) ||
    (plan.quad_rate ?? 0) > 0
  );
}

export function findRatePlan(
  plans: RatePlan[],
  room_id: string,
  meal: string,
  stayDate: string,
  hotelCategory?: string,
): RatePlan | null {
  const categoryKey = (hotelCategory ?? "").trim().toLowerCase();
  const roomHasCategorizedOfferings = plans.some(
    (plan) => plan.room_category_id === room_id && Boolean(plan.hotel_category),
  );
  const candidates = usablePlans(plans).filter(
    (plan) =>
      plan.room_category_id === room_id &&
      plan.meal_plan === meal &&
      (!categoryKey ||
        (!roomHasCategorizedOfferings && !plan.hotel_category) ||
        (plan.hotel_category ?? "").trim().toLowerCase() === categoryKey) &&
      ratePlanHasPrice(plan) &&
      ratePlanMatchesDate(plan, stayDate),
  );
  // Keep the existing explicit overlap rule: distinct date ranges need a
  // master-data decision, rather than choosing an arbitrary tariff.
  const validityRanges = new Set(
    candidates.map(
      (plan) => `${calendarDateKey(plan.validity_start)}|${calendarDateKey(plan.validity_end)}`,
    ),
  );
  if (validityRanges.size > 1) return null;
  return candidates.sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))[0] ?? null;
}

export function availableMealPlans(
  plans: RatePlan[],
  room_id: string,
  stayDate?: string,
  hotelCategory?: string,
): string[] {
  const categoryKey = (hotelCategory ?? "").trim().toLowerCase();
  const roomHasCategorizedOfferings = plans.some(
    (plan) => plan.room_category_id === room_id && Boolean(plan.hotel_category),
  );
  const pool = usablePlans(plans).filter(
    (p) =>
      p.room_category_id === room_id &&
      (!categoryKey ||
        (!roomHasCategorizedOfferings && !p.hotel_category) ||
        (p.hotel_category ?? "").trim().toLowerCase() === categoryKey),
  );
  const filtered = (stayDate ? pool.filter((p) => ratePlanMatchesDate(p, stayDate)) : pool).filter(
    ratePlanHasPrice,
  );
  return ["EP", "CP", "MAP", "AP"].filter((meal) =>
    filtered.some(
      (plan) =>
        plan.meal_plan === meal &&
        (!stayDate || findRatePlan(plans, room_id, meal, stayDate, hotelCategory) !== null),
    ),
  );
}
