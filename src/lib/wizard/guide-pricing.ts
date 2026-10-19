import {
  guideConfiguredLanguages,
  guideRateForPax,
  type Guide,
  type GuideLanguage,
} from "@/lib/mock-store";
import type { GuideLine, QuoteDraft } from "./types";

export type EscortPricingMode = "per_person" | "pax_range" | "day_wise";

/** Resolve a raw Guide rate without replacing a saved quote snapshot with mutable master data. */
export function guideRawRateForPax(
  line: Pick<GuideLine, "rate" | "pax_ranges">,
  guide: Guide | undefined,
  language: GuideLanguage,
  pax: number,
  pricingPax: number,
): number | undefined {
  if (pax === pricingPax && line.rate > 0) return line.rate;

  const savedSlab = line.pax_ranges?.find(
    (range) => pax >= range.from_pax && pax <= range.to_pax,
  )?.rate;
  if (savedSlab != null && savedSlab > 0) return savedSlab;
  if (!guide) return undefined;

  const configuredLanguages = guideConfiguredLanguages(guide);
  const typedLanguage = guide.guide_type.startsWith("Hindi")
    ? "Hindi"
    : guide.guide_type.startsWith("English")
      ? "English"
      : undefined;
  if (configuredLanguages.length && !configuredLanguages.includes(language)) return undefined;
  if (!configuredLanguages.length && typedLanguage && language !== typedLanguage) return undefined;
  if (!configuredLanguages.length && !typedLanguage) return undefined;

  const resolved = guideRateForPax(guide, pax, language);
  return resolved > 0 ? resolved : undefined;
}

export function getEscortPricingMode(draft: QuoteDraft): EscortPricingMode | undefined {
  if (draft.escort_pricing_mode) return draft.escort_pricing_mode;
  if (draft.escort_ranges?.length) return "pax_range";
  if (Object.values(draft.guide_day_escort ?? {}).some((charge) => charge > 0)) return "day_wise";
  return undefined;
}

export function isEscortEnabled(draft: QuoteDraft): boolean {
  return draft.escort_enabled ?? Boolean(getEscortPricingMode(draft));
}

export function escortDayAppliesToPax(draft: QuoteDraft, pax: number): boolean {
  const min = draft.escort_day_min_pax;
  const max = draft.escort_day_max_pax;
  if (Number.isInteger(min) && pax < (min ?? 1)) return false;
  if (Number.isInteger(max) && pax > (max ?? Number.MAX_SAFE_INTEGER)) return false;
  return true;
}

export function getEscortDayCharge(draft: QuoteDraft, day: number): number {
  if (!isEscortEnabled(draft) || getEscortPricingMode(draft) !== "day_wise") return 0;
  const amount = draft.guide_day_escort?.[day] ?? 0;
  const enabled = draft.guide_day_escort_enabled?.[day];
  // Older drafts had an amount field but no explicit include toggle.
  return enabled === undefined ? (amount > 0 ? amount : 0) : enabled ? amount : 0;
}

export function getEscortRangeBase(
  draft: QuoteDraft,
  range: NonNullable<QuoteDraft["escort_ranges"]>[number],
): number {
  if (!isEscortEnabled(draft) || getEscortPricingMode(draft) !== "pax_range") return 0;
  const dayRates = draft.routing.map(
    (day) => draft.escort_day_rates_by_slab?.[day.day]?.[range.id] ?? 0,
  );
  const hasDayRates = dayRates.some((rate) => rate > 0);
  // Old quotations stored one flat charge on the slab. Preserve that value
  // until the user enters the new day/slab matrix; never invent a distribution.
  const base = hasDayRates ? dayRates.reduce((sum, rate) => sum + rate, 0) : (range.charge ?? 0);
  return base + (draft.guide_escort_reporting ?? 0);
}

export function getEscortRangeDayCharge(draft: QuoteDraft, day: number, rangeId: string) {
  return draft.escort_day_rates_by_slab?.[day]?.[rangeId] ?? 0;
}

export function getEscortPerPersonRate(draft: QuoteDraft): number {
  return draft.escort_per_person_rate ?? 0;
}

/** Base Escort amount before Land Part markup/GST for one costing pax. */
export function getEscortBaseForPax(draft: QuoteDraft, pax: number): number {
  if (!isEscortEnabled(draft)) return 0;
  const mode = getEscortPricingMode(draft);
  if (mode === "per_person") {
    return getEscortPerPersonRate(draft) * pax + (draft.guide_escort_reporting ?? 0);
  }
  if (mode === "pax_range") {
    const range = (draft.escort_ranges ?? []).find(
      (item) => pax >= item.min_pax && pax <= item.max_pax,
    );
    return range ? getEscortRangeBase(draft, range) : 0;
  }
  if (mode !== "day_wise" || !escortDayAppliesToPax(draft, pax)) return 0;

  const charges = draft.routing
    .map((day) => getEscortDayCharge(draft, day.day))
    .filter((charge) => charge > 0);
  if (!charges.length) return 0;
  return charges.reduce((sum, charge) => sum + charge, 0) + (draft.guide_escort_reporting ?? 0);
}
