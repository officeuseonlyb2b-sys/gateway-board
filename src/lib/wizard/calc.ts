// Costing calculator — rolls up totals for a single hotel option.
import type { DB, RatePlan } from "@/lib/mock-store";
import type { QuoteDraft, HotelOption } from "./types";
import { addDaysISO } from "@/lib/format";

export interface OptionTotals {
  key: string;
  label: string;
  room_net_sgl: number; room_net_dbl: number; room_net_trp: number;
  gst_rooms_sgl: number; gst_rooms_dbl: number; gst_rooms_trp: number;
  addons_total: number;
  markup_sgl: number; markup_dbl: number; markup_trp: number;
  gst5_sgl: number; gst5_dbl: number; gst5_trp: number;
  grand_sgl: number; grand_dbl: number; grand_trp: number;
  per_pax_sgl: number; per_pax_dbl: number; per_pax_trp: number;
  rate_matches: number;
  rate_missing: number;
}

import { findRatePlan } from "./rate-lookup";

function pickPlan(plans: RatePlan[], room_id: string, meal: string, dateISO: string): RatePlan | null {
  return findRatePlan(plans, room_id, meal, dateISO);
}

// GST slab per business rule: effective per-room tariff (meal-inclusive,
// including extra-bed / mandatory hotel supplements) > ₹7,500 → 18%,
// otherwise 5%. Applied uniformly for SGL / DBL / TRP and every meal plan,
// so changing meal plan, room, hotel or season auto-reevaluates the slab
// because the stored rate is already meal-inclusive.
export function gstRateFor(net: number): number {
  return net > 7500 ? 0.18 : 0.05;
}

export function transportLineTotal(l: QuoteDraft["transport"][number]): number {
  // Per-vehicle "Total" mode overrides per-route day-wise entry with one lump-sum rate.
  if (l.rate_mode === "total") {
    return (l.total_rate ?? 0) * (l.vehicles || 1) + (l.reporting_cost ?? 0);
  }
  if (l.rate_format === "total") return l.total_override ?? 0;
  if (l.rate_format === "per_route") {
    const sum = (l.per_route_rates ?? []).reduce((s, r) => s + (Number(r) || 0), 0);
    return sum * (l.vehicles || 1) + (l.reporting_cost ?? 0);
  }
  // "per_day" or "prefilled" or undefined
  return l.rate * l.vehicles * l.days + (l.reporting_cost ?? 0);
}

export function computeAddonsTotal(draft: QuoteDraft): number {
  const t = draft.transport.reduce((s, l) => s + transportLineTotal(l), 0);
  const a = draft.activities.reduce((s, l) => s + l.rate * l.qty, 0);
  const e = draft.entrances.reduce(
    (s, l) => s + l.indian_pax * l.indian_rate + l.foreign_pax * l.foreign_rate
      + (l.student_pax ?? 0) * (l.student_rate ?? 0),
    0,
  );
  const g = draft.guides.reduce((s, l) => s + l.rate * l.guides * l.days, 0);
  const m = draft.misc.reduce((s, l) => s + l.rate * l.qty, 0);
  const opt = draft.optionals.reduce((s, l) => s + l.rate * l.qty, 0);
  return t + a + e + g + m + opt;
}

export function totalPax(draft: QuoteDraft): number {
  return draft.adults + draft.ss + draft.children.length;
}

export function computeOption(
  draft: QuoteDraft,
  opt: HotelOption,
  d: DB,
): OptionTotals {
  let sglNet = 0, dblNet = 0, trpNet = 0;
  let sglGst = 0, dblGst = 0, trpGst = 0;
  let matches = 0, missing = 0;

  draft.routing.forEach((day, i) => {
    if (!day.overnight) return;
    const sel = opt.selections.find((s) => s.city_id === day.city_id);
    if (!sel) { missing++; return; }
    const date = addDaysISO(draft.start_date, i);
    const plan = pickPlan(d.rate_plans, sel.room_id, sel.meal_plan, date);
    if (!plan) { missing++; return; }
    matches++;
    const dbl = plan.double_rate;
    const sgl = plan.single_rate;
    const trp = dbl + plan.extra_bed_rate;
    sglNet += sgl; dblNet += dbl; trpNet += trp;
    sglGst += sgl * gstRateFor(sgl);
    dblGst += dbl * gstRateFor(dbl);
    trpGst += trp * gstRateFor(trp);
  });

  const addons = computeAddonsTotal(draft);
  const mk = draft.markup_percent / 100;

  const subSgl = sglNet + sglGst + addons;
  const subDbl = dblNet + dblGst + addons;
  const subTrp = trpNet + trpGst + addons;

  const mkSgl = subSgl * mk;
  const mkDbl = subDbl * mk;
  const mkTrp = subTrp * mk;

  const gst5Sgl = (subSgl + mkSgl) * 0.05;
  const gst5Dbl = (subDbl + mkDbl) * 0.05;
  const gst5Trp = (subTrp + mkTrp) * 0.05;

  const grandSgl = subSgl + mkSgl + gst5Sgl;
  const grandDbl = subDbl + mkDbl + gst5Dbl;
  const grandTrp = subTrp + mkTrp + gst5Trp;

  const pax = Math.max(1, totalPax(draft));
  // Per-pax: SGL assumes 1/room, DBL assumes 2/room, TRP assumes 3/room.
  return {
    key: opt.key,
    label: opt.label || opt.key,
    room_net_sgl: sglNet, room_net_dbl: dblNet, room_net_trp: trpNet,
    gst_rooms_sgl: sglGst, gst_rooms_dbl: dblGst, gst_rooms_trp: trpGst,
    addons_total: addons,
    markup_sgl: mkSgl, markup_dbl: mkDbl, markup_trp: mkTrp,
    gst5_sgl: gst5Sgl, gst5_dbl: gst5Dbl, gst5_trp: gst5Trp,
    grand_sgl: grandSgl, grand_dbl: grandDbl, grand_trp: grandTrp,
    per_pax_sgl: grandSgl,
    per_pax_dbl: grandDbl / 2,
    per_pax_trp: grandTrp / 3,
    rate_matches: matches,
    rate_missing: missing,
  };
}

// ============================================================
// Per-Person Room Allocation (Step 15 optional mode)
// ============================================================
import type { PersonAllocation, PersonRoomType } from "./types";


export interface PersonDayCost {
  net: number;      // person share of the room tariff for this night
  gst: number;      // GST amount at slab based on effective room tariff
}

// Compute a single person's share for a single day given the resolved plan.
export function computePersonDayCost(
  room_type: PersonRoomType,
  plan: { single_rate: number; double_rate: number; extra_bed_rate: number; cwb_rate?: number | null },
): PersonDayCost {

  const sgl = plan.single_rate || 0;
  const dbl = plan.double_rate || 0;
  const eb = plan.extra_bed_rate || 0;
  const cwb = (plan as { cwb_rate?: number }).cwb_rate || 0;
  const trpTariff = dbl + eb;
  switch (room_type) {
    case "single":    return { net: sgl,        gst: sgl        * gstRateFor(sgl) };
    case "double":    return { net: dbl / 2,    gst: (dbl / 2)  * gstRateFor(dbl) };
    case "triple":    return { net: trpTariff / 3, gst: (trpTariff / 3) * gstRateFor(trpTariff) };
    case "extra_bed": return { net: eb,         gst: eb         * gstRateFor(eb) };
    case "cwb":       return { net: cwb,        gst: cwb        * gstRateFor(cwb) };
    default:          return { net: 0, gst: 0 };
  }
}

export interface PersonOptionTotal {
  person_id: number;
  label: string;
  room_type: PersonRoomType;
  sharing_with: number[];
  room_net: number;      // sum across nights
  room_gst: number;
  room_total: number;    // room_net + room_gst
  shared_addons: number; // add-ons split equally
  markup: number;        // markup% on (room_total + shared_addons)
  gst5: number;          // 5% on markup
  grand_total: number;
}

export function optionUsesCustomAllocation(opt: HotelOption): boolean {
  return !!(opt.use_custom_allocation && opt.pax_allocations && opt.pax_allocations.length);
}

// Roll up per-person totals for an option (custom-allocation mode).
export function computePersonTotals(
  draft: import("./types").QuoteDraft,
  opt: HotelOption,
  d: import("@/lib/mock-store").DB,
): PersonOptionTotal[] {
  const allocs = opt.pax_allocations ?? [];
  if (!allocs.length) return [];
  const totPax = Math.max(1, totalPax(draft));
  const addons = computeAddonsTotal(draft);
  const sharedPer = addons / totPax;
  const mk = (draft.markup_percent || 0) / 100;

  // Pre-resolve day plans for this option
  const dayPlans = draft.routing.map((day, i) => {
    if (!day.overnight) return null;
    const sel = opt.selections.find((s) => s.city_id === day.city_id);
    if (!sel) return null;
    const date = addDaysISO(draft.start_date, i);
    return findRatePlan(d.rate_plans, sel.room_id, sel.meal_plan, date);
  });

  return allocs.map((p) => {
    let net = 0, gst = 0;
    dayPlans.forEach((plan) => {
      if (!plan) return;
      const c = computePersonDayCost(p.room_type, plan);
      net += c.net;
      gst += c.gst;
    });
    const room_total = net + gst;
    const markup = (room_total + sharedPer) * mk;
    const gst5 = markup * 0.05;
    const grand_total = room_total + sharedPer + markup + gst5;
    return {
      person_id: p.person_id,
      label: p.label,
      room_type: p.room_type,
      sharing_with: p.sharing_with ?? [],
      room_net: net,
      room_gst: gst,
      room_total,
      shared_addons: sharedPer,
      markup,
      gst5,
      grand_total,
    };
  });
}

export function personRoomTypeLabel(t: PersonRoomType, sharing_with: number[] = []): string {
  switch (t) {
    case "single":    return "Single Room";
    case "double":    return sharing_with.length ? `Double (shared)` : "Double";
    case "triple":    return "Triple Sharing";
    case "extra_bed": return "Extra Bed";
    case "cwb":       return "Child With Bed";
  }
}

// Build default allocations for N pax (all double sharing pairs).
export function defaultAllocations(count: number): PersonAllocation[] {
  const list: PersonAllocation[] = [];
  for (let i = 1; i <= count; i++) {
    list.push({ person_id: i, label: `Person ${i}`, room_type: "double", sharing_with: [] });
  }
  // pair up consecutive persons
  for (let i = 0; i + 1 < list.length; i += 2) {
    list[i].sharing_with = [list[i + 1].person_id];
    list[i + 1].sharing_with = [list[i].person_id];
  }
  // if odd, last person becomes single
  if (list.length % 2 === 1) {
    const last = list[list.length - 1];
    last.room_type = "single";
    last.sharing_with = [];
  }
  return list;
}

export function presetAllSingle(count: number): PersonAllocation[] {
  return Array.from({ length: count }, (_, i) => ({
    person_id: i + 1, label: `Person ${i + 1}`, room_type: "single" as PersonRoomType, sharing_with: [],
  }));
}

export function presetAllDouble(count: number): PersonAllocation[] {
  return defaultAllocations(count);
}

export function presetOneSingleRestDouble(count: number): PersonAllocation[] {
  if (count <= 0) return [];
  const list: PersonAllocation[] = [
    { person_id: 1, label: "Person 1", room_type: "single", sharing_with: [] },
  ];
  for (let i = 2; i <= count; i++) {
    list.push({ person_id: i, label: `Person ${i}`, room_type: "double", sharing_with: [] });
  }
  for (let i = 1; i + 1 < list.length; i += 2) {
    list[i].sharing_with = [list[i + 1].person_id];
    list[i + 1].sharing_with = [list[i].person_id];
  }
  if ((count - 1) % 2 === 1) {
    const last = list[list.length - 1];
    last.room_type = "single";
    last.sharing_with = [];
  }
  return list;
}

// Reconcile stored allocations with the current pax count.
export function normalizeAllocations(
  allocs: PersonAllocation[] | undefined,
  count: number,
): PersonAllocation[] {
  const src = allocs ?? [];
  if (src.length === count) return src;
  if (src.length < count) {
    const out = [...src];
    for (let i = src.length + 1; i <= count; i++) {
      out.push({ person_id: i, label: `Person ${i}`, room_type: "double", sharing_with: [] });
    }
    return out;
  }
  // Trim extras and remove stale sharing references
  const kept = src.slice(0, count);
  const validIds = new Set(kept.map((p) => p.person_id));
  return kept.map((p) => ({ ...p, sharing_with: p.sharing_with.filter((id) => validIds.has(id)) }));
}

// Look-up per-night room rates for the option (used by preview).



export interface OptionRateLookup {
  perNight: {
    sgl: number; dbl: number; extra_bed: number; cwb: number;
    date: string; city_id: string;
  }[];
  missing: number;
  nights: number;
}
export function lookupOptionNightlyRates(
  draft: import("./types").QuoteDraft,
  opt: HotelOption,
  d: import("@/lib/mock-store").DB,
): OptionRateLookup {
  const perNight: OptionRateLookup["perNight"] = [];
  let missing = 0;
  draft.routing.forEach((day, i) => {
    if (!day.overnight) return;
    const sel = opt.selections.find((s) => s.city_id === day.city_id);
    if (!sel) { missing++; return; }
    const date = addDaysISO(draft.start_date, i);
    const plan = findRatePlan(d.rate_plans, sel.room_id, sel.meal_plan, date);
    if (!plan) { missing++; return; }
    perNight.push({
      sgl: plan.single_rate, dbl: plan.double_rate,
      extra_bed: plan.extra_bed_rate, cwb: (plan as { cwb_rate?: number }).cwb_rate || 0,
      date, city_id: day.city_id,
    });
  });
  return { perNight, missing, nights: perNight.length };
}

// ============================================================
// Group (GIT) Costing — 6+ pax
// ============================================================
import type { GroupRoomMix } from "./types";

export function isGroupTour(draft: import("./types").QuoteDraft): boolean {
  return draft.tour_type === "GIT" || totalPax(draft) >= 6;
}

export function autoDoubleMix(pax: number): GroupRoomMix {
  const double = Math.floor(pax / 2);
  const single = pax % 2;
  return { double, triple: 0, single };
}

export function autoTripleMix(pax: number): GroupRoomMix {
  const triple = Math.floor(pax / 3);
  const rem = pax % 3;
  const double = rem === 2 ? 1 : 0;
  const single = rem === 1 ? 1 : 0;
  return { double, triple, single };
}

export function mixCoversPax(mix: GroupRoomMix): number {
  return mix.double * 2 + mix.triple * 3 + mix.single;
}

export interface GroupOptionTotals {
  key: string;
  label: string;
  mix: GroupRoomMix;
  pax_covered: number;
  room_net: number;
  room_gst: number;
  addons_total: number;
  markup: number;
  gst5: number;
  grand_total: number;
  per_person: number;
  rate_missing: number;
}

// Compute group totals for one hotel option given a room mix.
export function computeGroupOption(
  draft: import("./types").QuoteDraft,
  opt: HotelOption,
  d: import("@/lib/mock-store").DB,
  mix: GroupRoomMix,
): GroupOptionTotals {
  let roomNet = 0, roomGst = 0, missing = 0;
  draft.routing.forEach((day, i) => {
    if (!day.overnight) return;
    const sel = opt.selections.find((s) => s.city_id === day.city_id);
    if (!sel) { missing++; return; }
    const date = addDaysISO(draft.start_date, i);
    const plan = findRatePlan(d.rate_plans, sel.room_id, sel.meal_plan, date);
    if (!plan) { missing++; return; }
    const sgl = plan.single_rate;
    const dbl = plan.double_rate;
    const trp = dbl + plan.extra_bed_rate;
    // Each room's tariff drives its own GST slab.
    const nightNet = mix.double * dbl + mix.triple * trp + mix.single * sgl;
    const nightGst = mix.double * dbl * gstRateFor(dbl)
                   + mix.triple * trp * gstRateFor(trp)
                   + mix.single * sgl * gstRateFor(sgl);
    roomNet += nightNet;
    roomGst += nightGst;
  });

  const addons = computeAddonsTotal(draft);
  const mk = (draft.markup_percent || 0) / 100;
  const sub = roomNet + roomGst + addons;
  const markup = sub * mk;
  const gst5 = (sub + markup) * 0.05;
  const grand = sub + markup + gst5;
  const covered = mixCoversPax(mix);
  const perPerson = covered > 0 ? grand / covered : 0;

  return {
    key: opt.key,
    label: opt.label || opt.key,
    mix,
    pax_covered: covered,
    room_net: roomNet,
    room_gst: roomGst,
    addons_total: addons,
    markup,
    gst5,
    grand_total: grand,
    per_person: perPerson,
    rate_missing: missing,
  };
}

export function mixLabel(mix: GroupRoomMix): string {
  const parts: string[] = [];
  if (mix.double) parts.push(`${mix.double} Double`);
  if (mix.triple) parts.push(`${mix.triple} Triple`);
  if (mix.single) parts.push(`${mix.single} Single`);
  return parts.join(" + ") || "No rooms";
}
