import { addDaysISO } from "@/lib/format";
import {
  resolveBrochureHotelRate,
  type BrochureHotelRate,
  type BrochureRateResolution,
} from "@/lib/brochure-hotel-rates";
import {
  accommodationNightsForOption,
  type HotelOption,
  type QuoteDraft,
} from "./types";

/** Resolve a full-programme Brochure estimate without fabricating dates. */
export function brochureRateResolutionForOption(
  draft: QuoteDraft,
  option: HotelOption,
  rates?: readonly BrochureHotelRate[],
): BrochureRateResolution {
  const hotelId = option.selections.find((selection) => Boolean(selection.hotel_id))?.hotel_id;
  if (!hotelId) return { status: "missing_context" };

  if (draft.has_dates === false) {
    return resolveBrochureHotelRate(
      hotelId,
      draft.brochure_validity_from ?? "",
      draft.brochure_validity_till ?? "",
      rates,
    );
  }

  if (!draft.start_date) return { status: "missing_context" };
  const stayDates = accommodationNightsForOption(draft.routing, option)
    .map((day) => {
      const index = draft.routing.indexOf(day);
      return day.is_day_zero || day.day === 0
        ? day.date || addDaysISO(draft.start_date, -1)
        : addDaysISO(draft.start_date, index);
    })
    .filter(Boolean)
    .sort();
  const from = stayDates[0] || draft.start_date;
  const to = stayDates[stayDates.length - 1] || draft.start_date;
  return resolveBrochureHotelRate(hotelId, from, to, rates);
}

/** Saved rates can be shown before selling validity is supplied, never costed. */
export function brochureReferenceRatesForHotel(
  hotelId: string,
  sourceRates: readonly BrochureHotelRate[] = [],
): BrochureHotelRate[] {
  return sourceRates
    .filter(
      (rate) =>
        rate.hotel_id === hotelId &&
        Boolean(rate.validity_from) &&
        Boolean(rate.validity_to) &&
        rate.validity_to >= rate.validity_from,
    )
    .map((rate) => ({
      ...rate,
      rate_basis: rate.rate_basis ?? "full_programme",
      pricing_basis: rate.pricing_basis ?? {
        single: "unverified", double: "unverified", triple: "unverified", extra_bed: "unverified", child: "unverified",
      },
    }))
    .sort((left, right) => left.validity_from.localeCompare(right.validity_from));
}

export function brochureRateResolutionMessage(
  resolution: BrochureRateResolution,
): string {
  if (resolution.status === "covered") return "";
  if (resolution.status === "legacy_basis") {
    return "Legacy Full Programme amount is not used for per-night costing. Confirm and change its basis to Per Night in Hotel Master.";
  }
  if (resolution.status === "unverified_pricing_basis") {
    return "The SGL/DBL/TRP/Extra Bed/Child unit basis is unverified. Confirm each field's per-room, per-person, add-on or per-child basis in Hotel Master before costing.";
  }
  if (resolution.status === "missing_context") {
    return "Brochure Rate Not Configured or validity context is missing.";
  }
  if (resolution.status === "ambiguous") {
    return "Overlapping Brochure Rate periods are ambiguous. Correct the hotel validity periods.";
  }
  const uncovered = resolution.uncovered.length
    ? ` Uncovered: ${resolution.uncovered.map((range) => `${range.from}–${range.to}`).join(", ")}.`
    : "";
  if (resolution.status === "multiple_periods") {
    const periods = resolution.periods
      .map(
        ({ rate, from, to }) =>
          `${from}–${to} (SGL ${rate.single}, DBL ${rate.double}, TRP ${rate.triple}, Extra Bed ${rate.extra_bed}, Child ${rate.child})`,
      )
      .join("; ");
    return `The selling period spans distinct Brochure Rate periods: ${periods}.${uncovered} A single package price cannot be published across these different rates.`;
  }
  return `Brochure Rate Not Configured for the full applicable validity period, or the selected hotel's rate is out of validity.${uncovered}`;
}
