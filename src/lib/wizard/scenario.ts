// Scenario costing — combines ONE accommodation option (hotel category) with
// ONE transport vehicle option and every other already-computed add-on, and
// produces a line-by-line PER PERSON breakdown.
//
// IMPORTANT: this module never re-derives Guide / Activities / Entrances /
// Misc / Meals / Transport amounts — it reuses the exact same formulas already
// used elsewhere in the wizard and only splits them per person.
import type { DB } from "@/lib/mock-store";
import { addDaysISO } from "@/lib/format";
import { findRatePlan } from "./rate-lookup";
import {
  gstRateFor,
  planForDay,
  computeMealsTotal,
  effectivePaxForPricing,
  optionUsesCustomAllocation,
  defaultDayMix,
  dynamicAccommodationBreakdown,
  landMarkup,
  landGst,
  hotelsMarkup,
  hotelsGst,
  isSplitAccommodation,
} from "./calc";
import { buildLandPart } from "./costsheet";
import { getQuotationScope } from "@/lib/query-for";
import {
  hotelSelectionForDay,
  type QuoteDraft,
  type HotelOption,
  type DayRoomMix,
  type DynamicOccupancy,
  type PersonRoomType,
  type CostScenario,
} from "./types";

export interface ScenarioPersonRow {
  person_id: number;
  label: string;
  room_types: PersonRoomType[]; // one per costed night
  room_label: string;
  hotel_net: number;
  hotel_gst: number;
  hotel_total: number;
  transport: number;
  guide: number;
  activities: number;
  entrances: number;
  misc: number;
  meals: number;
  optionals: number;
  addons_total: number;
  subtotal: number;
  markup: number;
  gst5: number;
  total: number;
}

export interface ScenarioResult {
  id: string;
  label: string;
  option_key: string;
  option_label: string;
  vehicle_label: string;
  pax: number;
  persons: ScenarioPersonRow[];
  /** group totals */
  hotel_total: number;
  transport_total: number;
  guide_total: number;
  activities_total: number;
  entrances_total: number;
  misc_total: number;
  meals_total: number;
  optionals_total: number;
  addons_total: number;
  markup_total: number;
  gst5_total: number;
  grand_total: number;
  per_person_avg: number;
  rate_missing: number;
}

/**
 * Limit a draft to exactly one configured transport alternative.  Keeping this
 * transformation here makes the final review, saved quote and PDF snapshot use
 * the same vehicle quantities and prevents alternatives being summed together.
 */
export function draftForScenarioTransport(draft: QuoteDraft, scenario: CostScenario): QuoteDraft {
  if (!scenario.transport_option_id) return draft;
  const option = draft.transport_options?.find((item) => item.id === scenario.transport_option_id);
  if (!option) return draft;
  return {
    ...draft,
    transport: option.vehicles.flatMap((selection) => {
      const line = draft.transport.find((item) => item.id === selection.transport_line_id);
      return line
        ? [{ ...line, vehicles: Math.max(1, line.vehicles || 1) * Math.max(1, selection.quantity) }]
        : [];
    }),
  };
}

const SIZE: Record<PersonRoomType, number> = {
  single: 1,
  double: 2,
  triple: 3,
  quad: 4,
  extra_bed: 1,
  cwb: 1,
};

/** Expand a room mix into one entry per bed/person slot, in order. */
export function expandMixToSlots(mix: DayRoomMix): PersonRoomType[] {
  const out: PersonRoomType[] = [];
  for (let i = 0; i < (mix.single || 0); i++) out.push("single");
  for (let i = 0; i < (mix.double || 0); i++) out.push("double", "double");
  for (let i = 0; i < (mix.triple || 0); i++) out.push("triple", "triple", "triple");
  for (let i = 0; i < (mix.quad || 0); i++) out.push("quad", "quad", "quad", "quad");
  return out;
}

/** Slots derived from an option's custom per-person allocation. */
function slotsFromAllocations(opt: HotelOption, pax: number): PersonRoomType[] {
  const allocs = opt.pax_allocations ?? [];
  const out: PersonRoomType[] = [];
  for (let i = 0; i < pax; i++) out.push(allocs[i]?.room_type ?? "double");
  return out;
}

/** The room type each person occupies on a given routing day. */
export function slotsForDay(
  draft: QuoteDraft,
  opt: HotelOption,
  dayNumber: number,
  pax: number,
): PersonRoomType[] {
  if (optionUsesCustomAllocation(opt)) return slotsFromAllocations(opt, pax);
  const isDynamic =
    (draft.dynamic_days ?? []).includes(dayNumber) || draft.allocation_mode === "dynamic";
  const mix = (isDynamic && draft.day_room_mix?.[dayNumber]) || defaultDayMix(pax);
  const slots = expandMixToSlots(mix);
  const out: PersonRoomType[] = [];
  for (let i = 0; i < pax; i++) out.push(slots[i] ?? slots[slots.length - 1] ?? "double");
  return out;
}

function tariffFor(
  type: PersonRoomType,
  plan: {
    single_rate: number;
    double_rate: number;
    extra_bed_rate: number;
    quad_rate?: number | null;
    cwb_rate?: number | null;
  },
): number {
  const dbl = plan.double_rate || 0;
  const eb = plan.extra_bed_rate || 0;
  switch (type) {
    case "single":
      return plan.single_rate || 0;
    case "double":
      return dbl;
    case "triple":
      return dbl + eb;
    case "quad":
      return plan.quad_rate || dbl + eb * 2;
    case "extra_bed":
      return eb;
    case "cwb":
      return plan.cwb_rate || 0;
    default:
      return 0;
  }
}

export function roomTypesLabel(types: PersonRoomType[]): string {
  const uniq = Array.from(new Set(types));
  const name = (t: PersonRoomType) =>
    t === "single"
      ? "Single (full rate)"
      : t === "double"
        ? "Double (½ rate)"
        : t === "triple"
          ? "Triple (⅓ rate)"
          : t === "quad"
            ? "Quad (¼ rate)"
            : t === "extra_bed"
              ? "Extra Bed"
              : "Child With Bed";
  if (uniq.length === 0) return "—";
  if (uniq.length === 1) return name(uniq[0]);
  return uniq.map(name).join(" / ");
}

/** Compute one full scenario = hotel option + vehicle + all add-ons, per person. */
export function computeScenario(
  draft: QuoteDraft,
  scenario: CostScenario,
  d: DB,
): ScenarioResult | null {
  const scope = getQuotationScope(draft.query_for, draft.commercial_mode);
  const includesAccommodation = scope.accommodationPart;
  const includesMeals = scope.mealsPart;
  const includesLand = scope.landPart;
  const selectedOption = draft.hotel_options.find((o) => o.key === scenario.option_key);
  if (includesAccommodation && !selectedOption) return null;
  const opt: HotelOption = selectedOption ?? {
    key: "A",
    label: "Land Part",
    selections: [],
  };
  const pax = Math.max(1, effectivePaxForPricing(draft));

  // ---------- Hotel, per person, per actual room type ----------
  const perPersonNet = Array(pax).fill(0) as number[];
  const perPersonGst = Array(pax).fill(0) as number[];
  const perPersonTypes: PersonRoomType[][] = Array.from({ length: pax }, () => []);
  let missing = 0;
  const dynamicDaySet = new Set(draft.dynamic_days ?? []);
  const dynamicMode =
    includesAccommodation &&
    (draft.allocation_mode === "dynamic" ||
      draft.routing.some((day) => day.overnight && dynamicDaySet.has(day.day)));
  const splitAccommodation = dynamicMode && isSplitAccommodation(draft);
  const splitOptions = splitAccommodation
    ? draft.hotel_options.filter((option) => (option.allocated_pax ?? 0) > 0)
    : [opt];

  if (dynamicMode) {
    const dynamics = splitOptions.map((option) => dynamicAccommodationBreakdown(draft, option, d));
    const dynamic = dynamics.reduce(
      (sum, item) => ({
        net: sum.net + item.net,
        supplier_gst: sum.supplier_gst + item.supplier_gst,
        total: sum.total + item.total,
        capacity: sum.capacity + item.capacity,
        missing: sum.missing + item.missing,
      }),
      { net: 0, supplier_gst: 0, total: 0, capacity: 0, missing: 0 },
    );
    missing += dynamic.missing;
    for (let person = 0; person < pax; person++) {
      perPersonNet[person] = dynamic.net / pax;
      perPersonGst[person] = dynamic.supplier_gst / pax;
    }
    const capacity: Record<DynamicOccupancy, number> = { single: 1, double: 2, triple: 3, quad: 4 };
    draft.routing
      .filter(
        (day) =>
          day.overnight && (draft.allocation_mode === "dynamic" || dynamicDaySet.has(day.day)),
      )
      .forEach((day) => {
        let person = 0;
        (opt.dynamic_allocations?.[day.day] ?? []).forEach((allocation) => {
          const count = Math.max(0, allocation.rooms) * capacity[allocation.occupancy];
          for (let slot = 0; slot < count && person < pax; slot++, person++) {
            perPersonTypes[person].push(allocation.occupancy);
          }
        });
      });
  }
  if (includesAccommodation)
    draft.routing.forEach((day, i) => {
      if (!day.overnight) return;
      if (dynamicMode && (draft.allocation_mode === "dynamic" || dynamicDaySet.has(day.day)))
        return;
      const sel = hotelSelectionForDay(opt, day);
      if (sel?.no_hotel) return;
      if (!sel) {
        missing++;
        return;
      }
      const date = day.date || addDaysISO(draft.start_date, i);
      const plan = planForDay(
        opt,
        day.day,
        findRatePlan(d.rate_plans, sel.room_id, sel.meal_plan, date),
      );
      if (!plan) {
        missing++;
        return;
      }
      const slots = slotsForDay(draft, opt, day.day, pax);
      let missingRequiredTariff = false;
      for (let p = 0; p < pax; p++) {
        const type = slots[p];
        const tariff = tariffFor(type, plan);
        if (!(tariff > 0)) {
          missingRequiredTariff = true;
          continue;
        }
        const share = tariff / (SIZE[type] || 1);
        perPersonNet[p] += share;
        perPersonGst[p] += share * gstRateFor(tariff);
        perPersonTypes[p].push(type);
      }
      if (missingRequiredTariff) missing++;
    });

  // ---------- Add-ons (reuse existing, already-correct formulas) ----------
  const scenarioDraft = draftForScenarioTransport(draft, scenario);
  const transportLines = scenario.transport_line_id
    ? draft.transport.filter((t) => t.id === scenario.transport_line_id)
    : [];
  const landSheet = buildLandPart(scenarioDraft, d, transportLines[0]);
  const transport_total = includesLand ? landSheet.transport_total : 0;
  const guide_total = includesLand ? landSheet.guide_total : 0;
  const activities_per_person = includesLand ? landSheet.activities_per_person_total : 0;
  const activities_total = activities_per_person * pax;
  const entrances_total = includesLand ? landSheet.entrances_total : 0;
  const misc_per_person = includesLand ? landSheet.misc_per_person_total : 0;
  const misc_total = misc_per_person * pax;
  const optionals_total = draft.optionals.reduce((s, l) => s + l.rate * l.qty, 0);
  const meals_total = includesMeals
    ? splitAccommodation
      ? splitOptions.reduce((sum, option) => sum + computeMealsTotal(draft, d, option.key), 0)
      : computeMealsTotal(draft, d, opt.key)
    : 0;

  // Supplements remain outside the package total.  They are shown for
  // reference in the optional-supplement step but are never silently added.
  const addons_total =
    transport_total + guide_total + activities_total + entrances_total + misc_total + meals_total;

  // Land Part and Hotels & Meals carry their own markup / GST percentages.
  const landMk = includesLand ? landMarkup(draft) : 0;
  const landGs = includesLand ? landGst(draft) : 0;
  const hotelMk = includesMeals ? hotelsMarkup(draft) : 0;
  const hotelGs = includesMeals ? hotelsGst(draft) : 0;
  const allocs = opt.pax_allocations ?? [];

  const persons: ScenarioPersonRow[] = Array.from({ length: pax }, (_, p) => {
    const hotel_net = perPersonNet[p];
    const hotel_gst = perPersonGst[p];
    const hotel_total = hotel_net + hotel_gst;
    const share = (v: number) => v / pax;
    const meals_pp = share(meals_total);
    const land_pp =
      share(transport_total + guide_total + entrances_total) +
      activities_per_person +
      misc_per_person;
    const guide_pp = share(guide_total);
    const other_land_pp = land_pp - guide_pp;
    const addons_pp = land_pp + meals_pp;
    const subtotal = hotel_total + addons_pp;
    // Land Part markup/GST and Hotels & Meals markup/GST are computed apart.
    const landMarkupAmt = land_pp * landMk;
    const hotelMarkupAmt = (hotel_total + meals_pp) * hotelMk;
    const markup = landMarkupAmt + hotelMarkupAmt;
    const gst5 =
      (other_land_pp + other_land_pp * landMk) * landGs +
      (guide_pp + guide_pp * landMk) * 0.05 +
      (hotel_total + meals_pp + hotelMarkupAmt) * hotelGs;
    return {
      person_id: p + 1,
      label: allocs[p]?.label || `Person ${p + 1}`,
      room_types: perPersonTypes[p],
      room_label: roomTypesLabel(perPersonTypes[p]),
      hotel_net,
      hotel_gst,
      hotel_total,
      transport: share(transport_total),
      guide: share(guide_total),
      activities: activities_per_person,
      entrances: share(entrances_total),
      misc: misc_per_person,
      meals: share(meals_total),
      optionals: share(optionals_total),
      addons_total: addons_pp,
      subtotal,
      markup,
      gst5,
      total: subtotal + markup + gst5,
    };
  });

  const sum = (f: (r: ScenarioPersonRow) => number) => persons.reduce((s, r) => s + f(r), 0);
  const grand_total = sum((r) => r.total);
  const optionName = draft.transport_options?.find(
    (item) => item.id === scenario.transport_option_id,
  )?.name;
  const vehicle =
    optionName ||
    (transportLines.length === 1
      ? d.travel_options.find((t) => t.id === transportLines[0].travel_id)?.vehicle_type ||
        "Vehicle"
      : transportLines.length === 0
        ? "No transport"
        : "All vehicles");

  return {
    id: scenario.id,
    label: scenario.label,
    option_key: opt.key,
    option_label: includesAccommodation
      ? opt.category || opt.label || `Option ${opt.key}`
      : "Land Part",
    vehicle_label: vehicle,
    pax,
    persons,
    hotel_total: sum((r) => r.hotel_total),
    transport_total,
    guide_total,
    activities_total,
    entrances_total,
    misc_total,
    meals_total,
    optionals_total,
    addons_total,
    markup_total: sum((r) => r.markup),
    gst5_total: sum((r) => r.gst5),
    grand_total,
    per_person_avg: grand_total / pax,
    rate_missing: missing,
  };
}
