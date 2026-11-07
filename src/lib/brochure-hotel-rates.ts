import {
  db,
  UNVERIFIED_BROCHURE_RATE_PRICING_BASIS,
  type BrochureHotelRate,
  type BrochureHotelRatePricingBasis,
} from "@/lib/mock-store";

export type { BrochureHotelRate };

export type BrochureHotelRateDraft = Omit<BrochureHotelRate, "updated_at">;
export type BrochureHotelRateInput = Omit<BrochureHotelRateDraft, "hotel_id">;

export type BrochureRateResolution =
  | { status: "covered"; rate: BrochureHotelRate }
  | { status: "legacy_basis"; rate: BrochureHotelRate }
  | { status: "unverified_pricing_basis"; rate: BrochureHotelRate }
  | {
      status: "multiple_periods";
      periods: Array<{ rate: BrochureHotelRate; from: string; to: string }>;
      uncovered: Array<{ from: string; to: string }>;
    }
  | { status: "uncovered"; uncovered: Array<{ from: string; to: string }> }
  | { status: "ambiguous" }
  | { status: "missing_context" };

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function listBrochureHotelRates(hotelId?: string): BrochureHotelRate[] {
  const rates = db.get().brochure_hotel_rates ?? [];
  return rates
    .filter((rate) => !hotelId || rate.hotel_id === hotelId)
    .map((rate) => ({
      ...rate,
      rate_basis: rate.rate_basis ?? "full_programme",
      pricing_basis: rate.pricing_basis ?? UNVERIFIED_BROCHURE_RATE_PRICING_BASIS,
    }))
    .slice()
    .sort((a, b) => a.validity_from.localeCompare(b.validity_from));
}

export function getBrochureHotelRates(hotelId: string): BrochureHotelRate[] {
  return listBrochureHotelRates(hotelId);
}

export function createBrochureHotelRateDraft(hotelId: string): BrochureHotelRateDraft {
  return {
    id: uid(),
    hotel_id: hotelId,
    rate_basis: "per_night",
    pricing_basis: UNVERIFIED_BROCHURE_RATE_PRICING_BASIS,
    validity_from: "",
    validity_to: "",
    single: 0,
    double: 0,
    triple: 0,
    extra_bed: 0,
    child: 0,
  };
}

export function brochureRatePricingBasisIsVerified(
  basis: BrochureHotelRatePricingBasis | undefined,
): basis is BrochureHotelRatePricingBasis {
  return Boolean(
    basis &&
      ["per_room", "per_person"].includes(basis.single) &&
      ["per_room", "per_person"].includes(basis.double) &&
      ["per_room", "per_person"].includes(basis.triple) &&
      ["per_add_on", "per_person"].includes(basis.extra_bed) &&
      ["per_child", "per_person"].includes(basis.child),
  );
}

export function brochurePriceBasisLabel(
  basis: BrochureHotelRatePricingBasis[keyof BrochureHotelRatePricingBasis],
): string {
  switch (basis) {
    case "per_room":
      return "per room";
    case "per_person":
      return "per person";
    case "per_add_on":
      return "per extra bed";
    case "per_child":
      return "per child";
    default:
      return "unit unverified";
  }
}

export function brochureAdultRatePerPerson(
  rate: BrochureHotelRate,
  occupancy: "single" | "double" | "triple" | "quad",
): number {
  if (occupancy === "single") return rate.single;
  if (occupancy === "double")
    return rate.pricing_basis.double === "per_room" ? rate.double / 2 : rate.double;
  if (occupancy === "triple")
    return rate.pricing_basis.triple === "per_room" ? rate.triple / 3 : rate.triple;
  const tripleRoomTotal =
    rate.pricing_basis.triple === "per_room" ? rate.triple : rate.triple * 3;
  // Extra Bed is one charge for the fourth bed; divide the complete room total
  // only after applying the saved Triple basis.
  return (tripleRoomTotal + rate.extra_bed) / 4;
}

export function validateBrochureHotelRatePeriods(
  rates: readonly Pick<BrochureHotelRate, "validity_from" | "validity_to">[],
): string | undefined {
  for (let index = 0; index < rates.length; index += 1) {
    const current = rates[index];
    if (!current.validity_from || !current.validity_to) {
      return `Validity From and Validity To are required for period ${index + 1}.`;
    }
    if (current.validity_to < current.validity_from) {
      return `Validity To cannot be earlier than Validity From in period ${index + 1}.`;
    }
    if (
      rates.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          current.validity_from <= other.validity_to &&
          other.validity_from <= current.validity_to,
      )
    ) {
      return `Brochure validity periods for the same hotel cannot overlap (period ${index + 1}).`;
    }
  }
  return undefined;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function uncoveredRanges(
  from: string,
  to: string,
  rates: BrochureHotelRate[],
): Array<{ from: string; to: string }> {
  const relevant = rates
    .filter((rate) => rate.validity_to >= from && rate.validity_from <= to)
    .sort((a, b) => a.validity_from.localeCompare(b.validity_from));
  const uncovered: Array<{ from: string; to: string }> = [];
  let cursor = from;
  for (const rate of relevant) {
    if (rate.validity_from > cursor) {
      uncovered.push({ from: cursor, to: addDays(rate.validity_from, -1) });
    }
    if (rate.validity_to >= cursor) cursor = addDays(rate.validity_to, 1);
    if (cursor > to) break;
  }
  if (cursor <= to) uncovered.push({ from: cursor, to });
  return uncovered;
}

/** Resolve a rate only when one record covers the entire inclusive date range. */
export function resolveBrochureHotelRate(
  hotelId: string,
  from: string,
  to: string,
  sourceRates: readonly BrochureHotelRate[] = listBrochureHotelRates(),
): BrochureRateResolution {
  if (!hotelId || !from || !to || to < from) return { status: "missing_context" };
  const rates = sourceRates
    .filter((rate) => rate.hotel_id === hotelId)
    .map((rate) => ({
      ...rate,
      rate_basis: rate.rate_basis ?? "full_programme",
      pricing_basis: rate.pricing_basis ?? UNVERIFIED_BROCHURE_RATE_PRICING_BASIS,
    }))
    .filter((rate) => rate.validity_from && rate.validity_to && rate.validity_to >= rate.validity_from);
  const applicableRates = rates.filter(
    (rate) => rate.validity_to >= from && rate.validity_from <= to,
  );
  if (
    applicableRates.some((rate, index) =>
      applicableRates.some(
        (other, otherIndex) =>
          otherIndex > index &&
          rate.validity_from <= other.validity_to &&
          other.validity_from <= rate.validity_to,
      ),
    )
  ) {
    return { status: "ambiguous" };
  }
  const matches = rates.filter(
    (rate) => rate.validity_from <= from && to <= rate.validity_to,
  );
  if (matches.length === 1) {
    if (matches[0].rate_basis !== "per_night")
      return { status: "legacy_basis", rate: matches[0] };
    if (!brochureRatePricingBasisIsVerified(matches[0].pricing_basis))
      return { status: "unverified_pricing_basis", rate: matches[0] };
    return { status: "covered", rate: matches[0] };
  }
  if (matches.length > 1) return { status: "ambiguous" };

  const applicable = applicableRates
    .map((rate) => ({
      rate,
      from: rate.validity_from < from ? from : rate.validity_from,
      to: rate.validity_to > to ? to : rate.validity_to,
    }));
  const uncovered = uncoveredRanges(from, to, rates);
  return applicable.length > 1
    ? { status: "multiple_periods", periods: applicable, uncovered }
    : { status: "uncovered", uncovered };
}

export function saveBrochureHotelRates(
  hotelId: string,
  rates: BrochureHotelRateInput[],
): void {
  db.saveBrochureHotelRatesForHotel(hotelId, rates);
}
