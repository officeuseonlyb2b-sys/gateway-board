import type { MiscLine, QuoteDraft, TransportOption } from "./types";
import { landGst, landMarkup, transportLineTotal } from "./calc";
import { activityPricingForPax, type Activity, type TravelerType } from "@/lib/mock-store";

export const applyLandCommercials = (draft: QuoteDraft, base: number, gstOverride?: number) => {
  const markup = base * landMarkup(draft);
  const gst = (base + markup) * (gstOverride ?? landGst(draft));
  return { base, markup, gst, final: base + markup + gst };
};

export function miscPerPersonForPax(line: MiscLine, pax: number): number {
  if (line.rate_basis === "per_person" || (!line.rate_basis && line.unit === "per_person"))
    return line.rate;
  const slab = (line.pax_ranges ?? []).find(
    (range) => pax >= range.from_pax && pax <= range.to_pax,
  );
  if (!slab) return 0;
  const divisor =
    line.rate_basis === "foc_range" ? Math.max(1, pax - (slab.foc_pax ?? 0)) : Math.max(1, pax);
  return slab.rate / divisor;
}

export function transportOptionTotal(draft: QuoteDraft, option: TransportOption): number {
  return option.vehicles.reduce((sum, item) => {
    const line = draft.transport.find((candidate) => candidate.id === item.transport_line_id);
    if (!line) return sum;
    return (
      sum + applyLandCommercials(draft, transportLineTotal(line)).final * Math.max(1, item.quantity)
    );
  }, 0);
}

export function transportOptionRows(draft: QuoteDraft) {
  return (draft.transport_options ?? []).flatMap((option) => {
    const total = transportOptionTotal(draft, option);
    return Array.from(
      { length: Math.max(0, Math.min(40, option.max_pax) - Math.max(1, option.min_pax) + 1) },
      (_, index) => {
        const pax = Math.max(1, option.min_pax) + index;
        return {
          option_id: option.id,
          option_name: option.name,
          pax,
          total,
          per_person: total / pax,
        };
      },
    );
  });
}

export interface OptionalActivitySellingRow {
  id: string;
  min_pax?: number;
  max_pax?: number;
  base_rate: number;
  rate_basis: "per_person" | "fixed_group" | "custom_slab";
  markup: number;
  gst: number;
  selling_price: number;
}

/**
 * Optional-sale prices intentionally enumerate every original master slab.
 * Included package costing continues to use activityPricingForPax per matrix row.
 */
export function optionalActivitySellingRows(
  draft: QuoteDraft,
  activity: Activity,
  traveler: TravelerType,
  currentPax: number,
): OptionalActivitySellingRow[] {
  // Optional sale displays the original master slabs, without filtering by
  // quotation pax or traveller type. Traveller fallback is only for flat,
  // legacy records below that have no original slab data.
  const slabs = (activity.pricing_slabs ?? [])
    .slice()
    .sort((left, right) => left.from_pax - right.from_pax);
  const legacySlabs = slabs.length
    ? []
    : [
        {
          id: "legacy-1-6",
          from_pax: 1,
          to_pax: 6,
          price: activity.group_rate_1_to_6,
        },
        {
          id: "legacy-7-14",
          from_pax: 7,
          to_pax: 14,
          price: activity.group_rate_7_to_14,
        },
        {
          id: "legacy-15-20",
          from_pax: 15,
          to_pax: 20,
          price: activity.group_rate_15_to_20,
        },
      ].filter(
        (row): row is { id: string; from_pax: number; to_pax: number; price: number } =>
          row.price != null,
      );
  const sourceSlabs = slabs.length ? slabs : legacySlabs;

  if (sourceSlabs.length) {
    return sourceSlabs.map((slab) => {
      const commercial = applyLandCommercials(draft, slab.price);
      return {
        id: slab.id,
        min_pax: slab.from_pax,
        max_pax: slab.to_pax,
        base_rate: slab.price,
        rate_basis: "custom_slab",
        markup: commercial.markup,
        gst: commercial.gst,
        selling_price: commercial.final,
      };
    });
  }

  const resolved = activityPricingForPax(activity, currentPax, traveler);
  const commercial = applyLandCommercials(draft, resolved.rate);
  return [
    {
      id: "flat",
      base_rate: resolved.rate,
      rate_basis: activity.pricing_type === "per_person" ? "per_person" : "fixed_group",
      markup: commercial.markup,
      gst: commercial.gst,
      selling_price: commercial.final,
    },
  ];
}
