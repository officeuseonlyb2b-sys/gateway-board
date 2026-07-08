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

function pickPlan(plans: RatePlan[], room_id: string, meal: string, dateISO: string): RatePlan | null {
  const cands = plans.filter(
    (p) =>
      p.room_category_id === room_id &&
      p.meal_plan === meal &&
      p.validity_start <= dateISO &&
      p.validity_end >= dateISO,
  );
  return cands[0] || null;
}

function gstRateFor(net: number) {
  return net > 7500 ? 0.18 : 0.05;
}

export function computeAddonsTotal(draft: QuoteDraft): number {
  const t = draft.transport.reduce((s, l) => s + l.rate * l.vehicles * l.days, 0);
  const a = draft.activities.reduce((s, l) => s + l.rate * l.qty, 0);
  const e = draft.entrances.reduce(
    (s, l) => s + l.indian_pax * l.indian_rate + l.foreign_pax * l.foreign_rate,
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
