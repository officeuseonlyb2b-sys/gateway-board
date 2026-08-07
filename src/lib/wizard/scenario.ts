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
  gstRateFor, transportLineTotal, planForDay, computeMealsTotal,
  effectivePaxForPricing, optionUsesCustomAllocation, defaultDayMix,
  landMarkup, landGst, hotelsMarkup, hotelsGst,
} from "./calc";
import type {
  QuoteDraft, HotelOption, DayRoomMix, PersonRoomType, CostScenario,
} from "./types";

export interface ScenarioPersonRow {
  person_id: number;
  label: string;
  room_types: PersonRoomType[];   // one per costed night
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

const SIZE: Record<PersonRoomType, number> = {
  single: 1, double: 2, triple: 3, quad: 4, extra_bed: 1, cwb: 1,
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
  const isDynamic = (draft.dynamic_days ?? []).includes(dayNumber)
    || draft.allocation_mode === "dynamic";
  const mix = (isDynamic && draft.day_room_mix?.[dayNumber]) || defaultDayMix(pax);
  const slots = expandMixToSlots(mix);
  const out: PersonRoomType[] = [];
  for (let i = 0; i < pax; i++) out.push(slots[i] ?? slots[slots.length - 1] ?? "double");
  return out;
}

function tariffFor(
  type: PersonRoomType,
  plan: { single_rate: number; double_rate: number; extra_bed_rate: number; quad_rate?: number | null; cwb_rate?: number | null },
): number {
  const dbl = plan.double_rate || 0;
  const eb = plan.extra_bed_rate || 0;
  switch (type) {
    case "single": return plan.single_rate || 0;
    case "double": return dbl;
    case "triple": return dbl + eb;
    case "quad": return plan.quad_rate || dbl + eb * 2;
    case "extra_bed": return eb;
    case "cwb": return plan.cwb_rate || 0;
    default: return 0;
  }
}

export function roomTypesLabel(types: PersonRoomType[]): string {
  const uniq = Array.from(new Set(types));
  const name = (t: PersonRoomType) =>
    t === "single" ? "Single (full rate)"
      : t === "double" ? "Double (½ rate)"
      : t === "triple" ? "Triple (⅓ rate)"
      : t === "quad" ? "Quad (¼ rate)"
      : t === "extra_bed" ? "Extra Bed"
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
  const opt = draft.hotel_options.find((o) => o.key === scenario.option_key);
  if (!opt) return null;
  const pax = Math.max(1, effectivePaxForPricing(draft));

  // ---------- Hotel, per person, per actual room type ----------
  const perPersonNet = Array(pax).fill(0) as number[];
  const perPersonGst = Array(pax).fill(0) as number[];
  const perPersonTypes: PersonRoomType[][] = Array.from({ length: pax }, () => []);
  let missing = 0;

  draft.routing.forEach((day, i) => {
    if (!day.overnight) return;
    const sel = opt.selections.find((s) => s.city_id === day.city_id);
    if (!sel) { missing++; return; }
    const date = day.date || addDaysISO(draft.start_date, i);
    const plan = planForDay(opt, day.day, findRatePlan(d.rate_plans, sel.room_id, sel.meal_plan, date));
    if (!plan) { missing++; return; }
    const slots = slotsForDay(draft, opt, day.day, pax);
    for (let p = 0; p < pax; p++) {
      const type = slots[p];
      const tariff = tariffFor(type, plan);
      const share = tariff / (SIZE[type] || 1);
      perPersonNet[p] += share;
      perPersonGst[p] += share * gstRateFor(tariff);
      perPersonTypes[p].push(type);
    }
  });

  // ---------- Add-ons (reuse existing, already-correct formulas) ----------
  const transportLines = scenario.transport_line_id
    ? draft.transport.filter((t) => t.id === scenario.transport_line_id)
    : draft.transport;
  const transport_total = transportLines.reduce((s, l) => s + transportLineTotal(l), 0);
  const guide_total = draft.guides.reduce((s, l) => s + l.rate * l.guides * l.days, 0);
  const activities_total = draft.activities.reduce((s, l) => s + l.rate * l.qty, 0);
  const entrances_total = draft.entrances.reduce(
    (s, l) => s + l.indian_pax * l.indian_rate + l.foreign_pax * l.foreign_rate
      + (l.student_pax ?? 0) * (l.student_rate ?? 0), 0);
  const misc_total = draft.misc.reduce((s, l) => s + l.rate * l.qty, 0);
  const optionals_total = draft.optionals.reduce((s, l) => s + l.rate * l.qty, 0);
  const meals_total = computeMealsTotal(draft, d, opt.key);

  const addons_total = transport_total + guide_total + activities_total
    + entrances_total + misc_total + optionals_total + meals_total;

  // Land Part and Hotels & Meals carry their own markup / GST percentages.
  const landMk = landMarkup(draft);
  const landGs = landGst(draft);
  const hotelMk = hotelsMarkup(draft);
  const hotelGs = hotelsGst(draft);
  const land_total = transport_total + guide_total + activities_total
    + entrances_total + misc_total + optionals_total;
  const allocs = opt.pax_allocations ?? [];

  const persons: ScenarioPersonRow[] = Array.from({ length: pax }, (_, p) => {
    const hotel_net = perPersonNet[p];
    const hotel_gst = perPersonGst[p];
    const hotel_total = hotel_net + hotel_gst;
    const share = (v: number) => v / pax;
    const addons_pp = share(addons_total);
    const land_pp = share(land_total);
    const meals_pp = share(meals_total);
    const subtotal = hotel_total + addons_pp;
    // Land Part markup/GST and Hotels & Meals markup/GST are computed apart.
    const landMarkupAmt = land_pp * landMk;
    const hotelMarkupAmt = (hotel_total + meals_pp) * hotelMk;
    const markup = landMarkupAmt + hotelMarkupAmt;
    const gst5 = (land_pp + landMarkupAmt) * landGs
      + (hotel_total + meals_pp + hotelMarkupAmt) * hotelGs;
    return {
      person_id: p + 1,
      label: allocs[p]?.label || `Person ${p + 1}`,
      room_types: perPersonTypes[p],
      room_label: roomTypesLabel(perPersonTypes[p]),
      hotel_net, hotel_gst, hotel_total,
      transport: share(transport_total),
      guide: share(guide_total),
      activities: share(activities_total),
      entrances: share(entrances_total),
      misc: share(misc_total),
      meals: share(meals_total),
      optionals: share(optionals_total),
      addons_total: addons_pp,
      subtotal, markup, gst5,
      total: subtotal + markup + gst5,
    };
  });

  const sum = (f: (r: ScenarioPersonRow) => number) => persons.reduce((s, r) => s + f(r), 0);
  const grand_total = sum((r) => r.total);
  const vehicle = transportLines.length === 1
    ? d.travel_options.find((t) => t.id === transportLines[0].travel_id)?.vehicle_type || "Vehicle"
    : transportLines.length === 0 ? "No transport" : "All vehicles";

  return {
    id: scenario.id,
    label: scenario.label,
    option_key: opt.key,
    option_label: opt.category || opt.label || `Option ${opt.key}`,
    vehicle_label: vehicle,
    pax,
    persons,
    hotel_total: sum((r) => r.hotel_total),
    transport_total, guide_total, activities_total, entrances_total,
    misc_total, meals_total, optionals_total, addons_total,
    markup_total: sum((r) => r.markup),
    gst5_total: sum((r) => r.gst5),
    grand_total,
    per_person_avg: grand_total / pax,
    rate_missing: missing,
  };
}
