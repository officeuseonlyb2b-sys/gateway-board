import { addDaysISO } from "@/lib/format";
import type { DB, BrochureHotelRate } from "@/lib/mock-store";
import { accommodationNightDate, hotelsGst, hotelsMarkup } from "./calc";
import {
  accommodationNightsForOption,
  hotelSelectionForDay,
  type HotelOption,
  type OptionKey,
  type QuoteDraft,
} from "./types";
import type { BrochureRateResolution } from "@/lib/brochure-hotel-rates";
import { brochureRateResolutionMessage } from "./brochure-rate-resolution";
import {
  brochureAdultRatePerPerson,
  brochurePriceBasisLabel,
  brochureRatePricingBasisIsVerified,
  resolveBrochureHotelRate,
} from "@/lib/brochure-hotel-rates";
import { brochureReferenceRatesForHotel } from "@/lib/wizard/brochure-rate-resolution";

export type BrochureAccommodationPricingStatus = "validated" | "reference_preview" | "incomplete";

export interface BrochureAccommodationNight {
  day: QuoteDraft["routing"][number];
  date: string;
  hotelId?: string;
  hotelName: string;
  noHotel: boolean;
  resolution: BrochureRateResolution;
  referenceRate?: BrochureHotelRate;
  calculationRate?: BrochureHotelRate;
  pricingSource: "validated" | "reference_preview" | "unavailable" | "no_charge";
  message: string;
}

export interface BrochureAccommodationCosting {
  nights: BrochureAccommodationNight[];
  /** Uncovered/ambiguous/unverified validity count; always blocks publishing. */
  missing: number;
  /** Nights with no safe saved rate available even for a provisional preview. */
  previewMissing: number;
  pricingStatus: BrochureAccommodationPricingStatus;
  provisional: boolean;
  single: number;
  double: number;
  triple: number;
  quad: number;
  singleRoomTotal: number;
  doubleRoomTotal: number;
  tripleRoomTotal: number;
  quadRoomTotal: number;
  extraBed: number;
  child: number;
}

export interface BrochureDepartureRateScenario {
  validity_from: string;
  validity_to: string;
  options: Partial<Record<OptionKey, BrochureAccommodationCosting>>;
}

export type BrochureAccommodationOccupancy = "single" | "double" | "triple" | "quad";

export interface BrochureAccommodationCommercialTotals {
  base_total: number;
  markup: number;
  gst: number;
  gst_on_markup: number;
  final_total: number;
  final_per_person: number;
}

export interface BrochureAccommodationSummaryRow
  extends Omit<BrochureAccommodationCommercialTotals, "final_per_person"> {
  key: "single" | "double" | "triple" | "extra_bed" | "child";
  label: string;
  rate_basis_label: string;
  final_per_person?: number;
  final_per_unit?: number;
  incomplete: boolean;
  provisional: boolean;
}

export interface BrochureAccommodationRoomSummaryRow {
  key: "single" | "double" | "triple" | "quad" | "extra_bed" | "child";
  label: string;
  rate_basis_label: string;
  base_total?: number;
  markup?: number;
  gst?: number;
  gst_on_markup?: number;
  final_total?: number;
  final_per_person?: number;
  final_per_unit?: number;
  unit: "per room" | "per person" | "per extra bed" | "per child";
  incomplete: boolean;
  provisional: boolean;
}

export function brochureCommercialTotalsFromBase(
  draft: QuoteDraft,
  baseTotal: number,
  pax: number,
): BrochureAccommodationCommercialTotals {
  const safePax = Math.max(1, Math.trunc(pax));
  const markup = baseTotal * hotelsMarkup(draft);
  const gst = (baseTotal + markup) * hotelsGst(draft);
  const gstOnMarkup = markup * hotelsGst(draft);
  const finalTotal = baseTotal + markup + gst;
  return {
    base_total: baseTotal,
    markup,
    gst,
    gst_on_markup: gstOnMarkup,
    final_total: finalTotal,
    final_per_person: finalTotal / safePax,
  };
}

export function brochureOccupancyCommercialTotals(
  draft: QuoteDraft,
  costing: BrochureAccommodationCosting,
  pax: number,
  occupancy: BrochureAccommodationOccupancy,
): BrochureAccommodationCommercialTotals | undefined {
  if (costing.previewMissing > 0) return undefined;
  const safePax = Math.max(1, Math.trunc(pax));
  const childCount = Math.min(safePax, draft.children.length);
  const adultCount = safePax - childCount;
  const adultRate =
    occupancy === "single"
      ? costing.single
      : occupancy === "double"
        ? costing.double
        : occupancy === "triple"
          ? costing.triple
          : costing.quad;
  const baseTotal = adultCount * adultRate + childCount * costing.child;
  return brochureCommercialTotalsFromBase(draft, baseTotal, safePax);
}

export function brochureAccommodationSummaryRows(
  draft: QuoteDraft,
  costing: BrochureAccommodationCosting,
  pax: number,
): BrochureAccommodationSummaryRow[] {
  const basisLabel = (field: keyof BrochureHotelRate["pricing_basis"]) => {
    const bases = new Set(
      costing.nights.flatMap((night) =>
        night.resolution.status === "covered"
          ? [brochurePriceBasisLabel(night.resolution.rate.pricing_basis[field])]
          : [],
      ),
    );
    return bases.size === 1
      ? [...bases][0]
      : bases.size > 1
        ? "mixed units · see nights"
        : "unit unverified";
  };
  const rows: BrochureAccommodationSummaryRow[] = [];
  const occupancyRows = [
    ["single", "Single (SGL)", "single"],
    ["double", "Double (DBL)", "double"],
    ["triple", "Triple (TRP)", "triple"],
  ] as const;
  occupancyRows.forEach(([key, label, occupancy]) => {
    const totals = brochureOccupancyCommercialTotals(draft, costing, pax, occupancy);
    rows.push({
      key,
      label,
      rate_basis_label: basisLabel(occupancy),
      base_total: totals?.base_total ?? 0,
      markup: totals?.markup ?? 0,
      gst: totals?.gst ?? 0,
      gst_on_markup: totals?.gst_on_markup ?? 0,
      final_total: totals?.final_total ?? 0,
      final_per_person: totals?.final_per_person,
      incomplete: !totals,
      provisional: costing.provisional,
    });
  });
  const childCount = Math.min(Math.max(0, Math.trunc(pax)), draft.children.length);
  const extraBedTotals = brochureCommercialTotalsFromBase(draft, costing.extraBed, 1);
  const childUnitTotals = brochureCommercialTotalsFromBase(draft, costing.child, 1);
  const childTotals = brochureCommercialTotalsFromBase(
    draft,
    costing.child * childCount,
    Math.max(1, childCount),
  );
  rows.push({
    key: "extra_bed",
    label: "Extra Bed add-on (one unit per night)",
    rate_basis_label: basisLabel("extra_bed"),
    ...extraBedTotals,
    final_per_unit: costing.missing ? undefined : extraBedTotals.final_total,
    incomplete: costing.previewMissing > 0,
    provisional: costing.provisional,
  });
  rows.push({
    key: "child",
    label: `Child add-on (${childCount} configured child${childCount === 1 ? "" : "ren"})`,
    rate_basis_label: basisLabel("child"),
    ...childTotals,
    final_per_unit: costing.missing ? undefined : childUnitTotals.final_total,
    incomplete: costing.previewMissing > 0,
    provisional: costing.provisional,
  });
  return rows;
}

/** Room/add-on total presentation; per-person values remain separate for matrices. */
export function brochureAccommodationRoomSummaryRows(
  draft: QuoteDraft,
  costing: BrochureAccommodationCosting,
): BrochureAccommodationRoomSummaryRow[] {
  const basisLabel = (field: keyof BrochureHotelRate["pricing_basis"]) => {
    const bases = new Set(costing.nights.flatMap((night) => {
      const rate = night.calculationRate;
      return rate ? [brochurePriceBasisLabel(rate.pricing_basis[field])] : [];
    }));
    return bases.size === 1 ? [...bases][0] : bases.size > 1 ? "mixed units · see nights" : "unit unverified";
  };
  const rows: BrochureAccommodationRoomSummaryRow[] = [];
  const occupancyRows = [
    ["single", "Single", 1, costing.singleRoomTotal],
    ["double", "Double", 2, costing.doubleRoomTotal],
    ["triple", "Triple", 3, costing.tripleRoomTotal],
    ["quad", "Quad", 4, costing.quadRoomTotal],
  ] as const;
  occupancyRows.forEach(([key, label, occupancy, base]) => {
    if (key === "quad" && base <= 0) return;
    const totals = costing.previewMissing === 0
      ? brochureCommercialTotalsFromBase(draft, base, 1)
      : undefined;
    rows.push({
      key,
      label,
      rate_basis_label: key === "single" ? basisLabel("single") : key === "double" ? basisLabel("double") : key === "triple" ? basisLabel("triple") : `${basisLabel("triple")} + ${basisLabel("extra_bed")}`,
      base_total: totals?.base_total,
      markup: totals?.markup,
      gst: totals?.gst,
      gst_on_markup: totals?.gst_on_markup,
      final_total: totals?.final_total,
      final_per_person: totals ? totals.final_total / occupancy : undefined,
      unit: "per room",
      incomplete: !totals,
      provisional: costing.provisional,
    });
  });
  const addOnRows = [
    ["extra_bed", "Extra Bed", costing.extraBed, "extra_bed", "per extra bed"],
    ["child", "Child", costing.child, "child", "per child"],
  ] as const;
  addOnRows.forEach(([key, label, base, field, unit]) => {
    const totals = costing.previewMissing === 0
      ? brochureCommercialTotalsFromBase(draft, base, 1)
      : undefined;
    rows.push({
      key,
      label,
      rate_basis_label: basisLabel(field),
      base_total: totals?.base_total,
      markup: totals?.markup,
      gst: totals?.gst,
      gst_on_markup: totals?.gst_on_markup,
      final_total: totals?.final_total,
      final_per_unit: totals?.final_total,
      unit,
      incomplete: !totals,
      provisional: costing.provisional,
    });
  });
  return rows;
}

export function brochureRateForNight(
  draft: QuoteDraft,
  hotelId: string,
  day: QuoteDraft["routing"][number],
  routingIndex: number,
  rates: readonly BrochureHotelRate[],
): BrochureRateResolution {
  if (!hotelId) return { status: "missing_context" };
  if (draft.has_dates === false) {
    return resolveBrochureHotelRate(
      hotelId,
      draft.brochure_validity_from ?? "",
      draft.brochure_validity_till ?? "",
      rates,
    );
  }
  const date = accommodationNightDate(draft, day, routingIndex);
  return date
    ? resolveBrochureHotelRate(hotelId, date, date, rates)
    : { status: "missing_context" };
}

export function brochureAccommodationForOption(
  draft: QuoteDraft,
  option: HotelOption,
  db: DB,
): BrochureAccommodationCosting {
  const rates = db.brochure_hotel_rates ?? [];
  const validityConfirmed = Boolean(
    draft.brochure_validity_from &&
      draft.brochure_validity_till &&
      draft.brochure_validity_till >= draft.brochure_validity_from,
  );
  const nights: BrochureAccommodationNight[] = accommodationNightsForOption(
    draft.routing,
    option,
  ).map((day) => {
    const selection = hotelSelectionForDay(option, day, true);
    const noHotel = Boolean(selection?.no_hotel);
    const date =
      draft.has_dates === false
        ? ""
        : accommodationNightDate(draft, day, draft.routing.indexOf(day));
    const hotel = selection?.hotel_id
      ? db.hotels.find((item) => item.id === selection.hotel_id)
      : undefined;
    const referenceRates = !validityConfirmed && draft.has_dates === false && selection?.hotel_id
      ? brochureReferenceRatesForHotel(selection.hotel_id, rates)
      : [];
    const referenceRate = referenceRates.length === 1 &&
        referenceRates[0].rate_basis === "per_night" &&
        brochureRatePricingBasisIsVerified(referenceRates[0].pricing_basis)
      ? referenceRates[0]
      : undefined;
    const resolution = noHotel
      ? { status: "missing_context" as const }
      : selection?.hotel_id
        ? brochureRateForNight(
            draft,
            selection.hotel_id,
            day,
            draft.routing.indexOf(day),
            rates,
          )
        : { status: "missing_context" as const };
    const calculationRate = resolution.status === "covered" ? resolution.rate : referenceRate;
    const pricingSource = noHotel
      ? "no_charge" as const
      : resolution.status === "covered"
        ? validityConfirmed ? "validated" as const : "reference_preview" as const
        : referenceRate
          ? "reference_preview" as const
          : "unavailable" as const;
    return {
      day,
      date,
      hotelId: selection?.hotel_id || undefined,
      hotelName: hotel?.name || "",
      noHotel,
      resolution,
      referenceRate,
      calculationRate,
      pricingSource,
      message: pricingSource === "reference_preview"
        ? "Reference Preview — Selling Validity Not Confirmed"
        : noHotel
        ? selection?.accommodation_status === "own_arrangement"
          ? "Own Arrangement — no Brochure hotel charge"
          : "No Hotel Required — no Brochure hotel charge"
        : brochureRateResolutionMessage(resolution),
    };
  });

  const charged = nights.filter((night) => !night.noHotel && night.calculationRate);
  const missing = nights.filter(
    (night) => !night.noHotel && night.resolution.status !== "covered",
  ).length;
  const previewMissing = nights.filter((night) => !night.noHotel && !night.calculationRate).length;
  const amountFor = (pick: (rate: BrochureHotelRate) => number) =>
    charged.reduce((sum, night) => sum + pick(night.calculationRate!), 0);
  const roomTotal = (
    rate: BrochureHotelRate,
    field: "single" | "double" | "triple",
    occupancy: 1 | 2 | 3,
  ) => rate.pricing_basis[field] === "per_room" ? rate[field] : rate[field] * occupancy;
  const provisional = !validityConfirmed;
  return {
    nights,
    missing,
    previewMissing,
    pricingStatus: previewMissing > 0 ? "incomplete" : provisional ? "reference_preview" : missing > 0 ? "incomplete" : "validated",
    provisional,
    single: amountFor((rate) => brochureAdultRatePerPerson(rate, "single")),
    double: amountFor((rate) => brochureAdultRatePerPerson(rate, "double")),
    triple: amountFor((rate) => brochureAdultRatePerPerson(rate, "triple")),
    quad: amountFor((rate) => brochureAdultRatePerPerson(rate, "quad")),
    singleRoomTotal: amountFor((rate) => roomTotal(rate, "single", 1)),
    doubleRoomTotal: amountFor((rate) => roomTotal(rate, "double", 2)),
    tripleRoomTotal: amountFor((rate) => roomTotal(rate, "triple", 3)),
    quadRoomTotal: amountFor((rate) => brochureAdultRatePerPerson(rate, "quad") * 4),
    extraBed: amountFor((rate) => rate.extra_bed),
    child: amountFor((rate) => rate.child),
  };
}

/**
 * Split a date-free selling-validity window at each hotel-night rate boundary.
 * A returned band is a distinct departure-date pricing scenario; no date is
 * assigned to the saved draft itself.
 */
export function brochureDepartureRateScenarios(
  draft: QuoteDraft,
  db: DB,
): BrochureDepartureRateScenario[] {
  const saleFrom = draft.brochure_validity_from ?? "";
  const saleTo = draft.brochure_validity_till ?? "";
  if (draft.has_dates !== false || !saleFrom || !saleTo || saleTo < saleFrom) return [];

  const boundaries = new Set<string>([saleFrom, addDaysISO(saleTo, 1)]);
  const rates = db.brochure_hotel_rates ?? [];
  draft.hotel_options.slice(0, 4).forEach((option) => {
    accommodationNightsForOption(draft.routing, option).forEach((day) => {
      const selection = hotelSelectionForDay(option, day, true);
      if (!selection?.hotel_id || selection.no_hotel) return;
      const offset = day.is_day_zero || day.day === 0 ? -1 : draft.routing.indexOf(day);
      rates
        .filter(
          (rate) =>
            rate.hotel_id === selection.hotel_id &&
            (rate.rate_basis ?? "full_programme") === "per_night" &&
            rate.validity_from &&
            rate.validity_to &&
            rate.validity_to >= rate.validity_from,
        )
        .forEach((rate) => {
          const periodFrom = addDaysISO(rate.validity_from, -offset);
          const periodEndExclusive = addDaysISO(rate.validity_to, 1 - offset);
          if (periodFrom > saleFrom && periodFrom <= saleTo) boundaries.add(periodFrom);
          if (periodEndExclusive > saleFrom && periodEndExclusive <= saleTo)
            boundaries.add(periodEndExclusive);
        });
    });
  });

  const ordered = [...boundaries].sort();
  return ordered.slice(0, -1).flatMap((from, index) => {
    const to = addDaysISO(ordered[index + 1], -1);
    if (from > saleTo || to < from) return [];
    const datedDraft: QuoteDraft = {
      ...draft,
      has_dates: true,
      start_date: from,
      routing: draft.routing.map((day) => ({ ...day, date: "" })),
    };
    const options: Partial<Record<OptionKey, BrochureAccommodationCosting>> = {};
    draft.hotel_options.slice(0, 4).forEach((option) => {
      options[option.key] = brochureAccommodationForOption(datedDraft, option, db);
    });
    return [{ validity_from: from, validity_to: to, options }];
  });
}
