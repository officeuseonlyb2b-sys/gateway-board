// Costing sheet builders — pure presentation math on top of the numbers the
// wizard already computes. Nothing here re-derives guide / activity / entrance
// / misc / transport / hotel figures; they are only grouped per day, per
// hotel category and per pax so the Costing page can be rendered as a sheet.
import type { DB } from "@/lib/mock-store";
import { addDaysISO } from "@/lib/format";
import { findRatePlan } from "./rate-lookup";
import {
  transportLineTotal, planForDay, gstRateFor, effectivePaxForPricing,
  landMarkup, landGst, hotelsMarkup, hotelsGst,
} from "./calc";

/** Meal picks as stored by the Meals step (array of per day/city/meal rows). */
interface MealPick {
  option_key?: string;
  day: number;
  city: string;
  mealType: "Lunch" | "Dinner";
  source: "none" | "hotel" | "restaurant";
  hotel_id?: string;
  restaurant_id?: string;
}
function mealPicks(draft: QuoteDraft): MealPick[] {
  const raw = draft.meal_selections as unknown;
  return Array.isArray(raw) ? (raw as MealPick[]) : [];
}
import type {
  QuoteDraft, HotelOption, TransportLine, EntranceCat,
} from "./types";

// ---------------------------------------------------------------- Land part

/** One selectable component shown as a checkbox inside a Land Part column. */
export interface SheetOption {
  id: string;
  label: string;
  sub?: string;
  amount: number;     // amount contributed to THIS day when checked
  checked: boolean;
}

export interface LandDayRow {
  day: number;
  date: string;
  route: string;
  city: string;
  tours: string;
  transport: number;
  guide: number;
  entrances: number;
  activities: number;
  misc: number;
  total: number;
  transport_opts: SheetOption[];
  guide_opts: SheetOption[];
  entrance_opts: SheetOption[];
  activity_opts: SheetOption[];
  misc_opts: SheetOption[];
  entrance_cats: Record<EntranceCat, boolean>;
}

export interface LandPartSheet {
  rows: LandDayRow[];
  transport_total: number;
  guide_total: number;        // guides + escorts (column line total)
  guide_only_total: number;   // non-escort guides
  escort_total: number;
  entrances_total: number;
  activities_total: number;
  misc_total: number;
  grand_total: number;
}

const ALL_CATS: EntranceCat[] = ["indian", "foreign", "student"];

/** Checked state for a component on a given day (default: checked). */
export function isPicked(
  draft: QuoteDraft,
  bucket: "transport" | "guide" | "entrances" | "activities" | "misc",
  day: number,
  id: string,
): boolean {
  const list = draft.costing_selection?.[bucket]?.[day];
  return list ? list.includes(id) : true;
}

export function catPicked(draft: QuoteDraft, day: number, cat: EntranceCat): boolean {
  const list = draft.costing_selection?.entrance_cats?.[day];
  return list ? list.includes(cat) : true;
}

/** Days a line applies to, restricted to the routing days that exist. */
function targetDays(days: number[] | undefined, all: number[]): number[] {
  const t = days && days.length ? days.filter((x) => all.includes(x)) : all;
  return t.length ? t : [];
}

export function buildLandPart(
  draft: QuoteDraft,
  d: DB,
  line?: TransportLine,
): LandPartSheet {
  const all = draft.routing.map((r) => r.day);
  const cityName = (id?: string) => d.cities.find((c) => c.id === id)?.name || "";
  const dayIndex = new Map(draft.routing.map((r, i) => [r.day, i]));

  const opts: Record<number, {
    transport: SheetOption[]; guide: SheetOption[]; entrances: SheetOption[];
    activities: SheetOption[]; misc: SheetOption[];
  }> = {};
  all.forEach((day) => { opts[day] = { transport: [], guide: [], entrances: [], activities: [], misc: [] }; });

  // ------- Transport (one checkbox per vehicle option, per day)
  const lines = line ? [line] : draft.transport;
  lines.forEach((l) => {
    const vehicle = d.travel_options.find((t) => t.id === l.travel_id)?.vehicle_type || "Vehicle";
    const rep = (l.reporting_cost || 0) * (l.vehicles || 1);
    const target = targetDays(undefined, all);
    if (!target.length) return;
    const perRoute = l.rate_format === "per_route" && l.per_route_rates?.length;
    target.forEach((day) => {
      const base = perRoute
        ? (l.per_route_rates?.[dayIndex.get(day) ?? 0] || 0) * (l.vehicles || 1)
        : transportLineTotal(l) / target.length;
      const amount = base + (perRoute ? rep / target.length : 0);
      opts[day].transport.push({
        id: l.id,
        label: vehicle,
        sub: [
          l.reporting_cost ? `Reporting ${l.reporting_cost}` : null,
          l.remarks || null,
        ].filter(Boolean).join(" · ") || undefined,
        amount,
        checked: isPicked(draft, "transport", day, l.id),
      });
    });
  });

  // ------- Guides & escorts
  draft.guides.forEach((l) => {
    const target = targetDays(l.from_routing_days, all);
    if (!target.length) return;
    const each = (l.rate * l.guides * l.days) / target.length;
    const g = d.guides?.find((x) => x.id === l.guide_id);
    target.forEach((day) => opts[day].guide.push({
      id: l.id,
      label: l.is_escort ? "Tour Escorted" : (l.language || g?.guide_type || "Guide"),
      sub: g?.tour_program || undefined,
      amount: each,
      checked: isPicked(draft, "guide", day, l.id),
    }));
  });

  // ------- Entrances (per line, priced by the pax categories checked that day)
  draft.entrances.forEach((l) => {
    const target = targetDays(l.from_routing_days, all);
    if (!target.length) return;
    target.forEach((day) => {
      const parts: Record<EntranceCat, number> = {
        indian: l.indian_pax * l.indian_rate,
        foreign: l.foreign_pax * l.foreign_rate,
        student: (l.student_pax ?? 0) * (l.student_rate ?? 0),
      };
      const amount = ALL_CATS.reduce(
        (s, c) => s + (catPicked(draft, day, c) ? parts[c] : 0), 0) / target.length;
      opts[day].entrances.push({
        id: l.id,
        label: l.custom_name || d.entrance_sites?.find((s) => s.id === l.site_id)?.site_name || "Entrance",
        amount,
        checked: isPicked(draft, "entrances", day, l.id),
      });
    });
  });

  // ------- Activities
  draft.activities.forEach((l) => {
    const target = targetDays(l.from_routing_days, all);
    if (!target.length) return;
    const each = (l.rate * l.qty) / target.length;
    target.forEach((day) => opts[day].activities.push({
      id: l.id,
      label: l.custom_name || d.activities?.find((a) => a.id === l.activity_id)?.activity_name || "Activity",
      amount: each,
      checked: isPicked(draft, "activities", day, l.id),
    }));
  });

  // ------- Miscellaneous
  draft.misc.forEach((l) => {
    const target = targetDays(l.from_routing_days, all);
    if (!target.length) return;
    const each = (l.rate * l.qty) / target.length;
    target.forEach((day) => opts[day].misc.push({
      id: l.id,
      label: l.custom_name || d.miscellaneous_items?.find((m) => m.id === l.item_id)?.name || "Item",
      sub: l.unit || undefined,
      amount: each,
      checked: isPicked(draft, "misc", day, l.id),
    }));
  });

  const sumOn = (list: SheetOption[]) => list.reduce((s, o) => s + (o.checked ? o.amount : 0), 0);

  const rows: LandDayRow[] = draft.routing.map((day, i) => {
    const tours = Object.values(day.tours_selected_by_city ?? {}).flat();
    const from = day.from_city && !day.from_city.includes("-")
      ? day.from_city
      : cityName(day.from_city) || day.from_city || "";
    const to = cityName(day.to_city_id) || day.to_city || "";
    const o = opts[day.day];
    const transport = sumOn(o.transport);
    const guide = sumOn(o.guide);
    const entrances = sumOn(o.entrances);
    const activities = sumOn(o.activities);
    const misc = sumOn(o.misc);
    return {
      day: day.day,
      date: day.date || addDaysISO(draft.start_date, i),
      route: [from, to].filter(Boolean).join(" → ") || "—",
      city: cityName(day.city_id) || "—",
      tours: tours.length ? tours.join(", ") : (day.tour_title || "—"),
      transport, guide, entrances, activities, misc,
      total: transport + guide + entrances + activities + misc,
      transport_opts: o.transport,
      guide_opts: o.guide,
      entrance_opts: o.entrances,
      activity_opts: o.activities,
      misc_opts: o.misc,
      entrance_cats: {
        indian: catPicked(draft, day.day, "indian"),
        foreign: catPicked(draft, day.day, "foreign"),
        student: catPicked(draft, day.day, "student"),
      },
    };
  });

  const sum = (f: (r: LandDayRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const transport_total = sum((r) => r.transport);
  const guide_total = sum((r) => r.guide);
  const entrances_total = sum((r) => r.entrances);
  const activities_total = sum((r) => r.activities);
  const misc_total = sum((r) => r.misc);

  const escortIds = new Set(draft.guides.filter((g) => g.is_escort).map((g) => g.id));
  const escort_total = rows.reduce(
    (s, r) => s + r.guide_opts.reduce((a, o) => a + (o.checked && escortIds.has(o.id) ? o.amount : 0), 0), 0);

  return {
    rows, transport_total, guide_total,
    guide_only_total: guide_total - escort_total,
    escort_total,
    entrances_total, activities_total, misc_total,
    grand_total: transport_total + guide_total + entrances_total + activities_total + misc_total,
  };
}

// -------------------------------------------------------- Hotels & meals

export interface HotelNightRow {
  day: number;
  date: string;
  city: string;
  hotel: string;
  room: string;
  meal_plan: string;
  sgl: number;
  dbl: number;
  trp: number;
  quad: number;
  lunch_source: string;
  lunch_total: number;
  dinner_source: string;
  dinner_total: number;
  missing?: boolean;
}

export interface HotelMealSheet {
  option_key: string;
  category: string;
  nights: number;
  rows: HotelNightRow[];
  sgl: number; dbl: number; trp: number; quad: number;
  lunch_total: number;
  dinner_total: number;
}

export function buildHotelMealSheet(draft: QuoteDraft, d: DB, opt: HotelOption): HotelMealSheet {
  const rows: HotelNightRow[] = [];
  const picks = mealPicks(draft);

  draft.routing.forEach((day, i) => {
    if (!day.overnight) return;
    const date = day.date || addDaysISO(draft.start_date, i);
    const city = d.cities.find((c) => c.id === day.city_id)?.name || "—";
    const sel = opt.selections.find((s) => s.city_id === day.city_id);
    const hotel = sel ? d.hotels.find((h) => h.id === sel.hotel_id)?.name || "—" : "—";
    const room = sel ? d.room_categories.find((r) => r.id === sel.room_id)?.name || "—" : "—";
    const plan = sel
      ? planForDay(opt, day.day, findRatePlan(d.rate_plans, sel.room_id, sel.meal_plan, date))
      : null;
    const dbl = plan?.double_rate || 0;
    const eb = plan?.extra_bed_rate || 0;

    // Meals for this night, scoped to this accommodation option.
    let lunchSource = "—", dinnerSource = "—", lunchTotal = 0, dinnerTotal = 0;
    const pickFor = (mealType: "Lunch" | "Dinner") => picks.find(
      (p) => p.day === day.day && p.city === city && p.mealType === mealType &&
        (p.option_key ?? opt.key) === opt.key,
    );
    (["Lunch", "Dinner"] as const).forEach((mealType) => {
      const pick = pickFor(mealType);
      if (!pick || pick.source === "none") return;
      let source = "—", amount = 0;
      if (pick.source === "hotel") {
        source = hotel;
        amount = (mealType === "Lunch" ? plan?.lunch_rate : plan?.dinner_rate) || 0;
      } else {
        const r = (d.restaurants ?? []).find((x) => x.id === pick.restaurant_id);
        if (r) { source = r.name; amount = r.price_per_person || 0; }
      }
      if (mealType === "Lunch") { lunchSource = source; lunchTotal = amount; }
      else { dinnerSource = source; dinnerTotal = amount; }
    });

    rows.push({
      day: day.day, date, city, hotel, room,
      meal_plan: sel?.meal_plan || "—",
      sgl: plan?.single_rate || 0,
      dbl,
      trp: plan ? dbl + eb : 0,
      quad: plan ? (plan.quad_rate || dbl + eb * 2) : 0,
      lunch_source: lunchSource, lunch_total: lunchTotal,
      dinner_source: dinnerSource, dinner_total: dinnerTotal,
      missing: !plan,
    });
  });

  const sum = (f: (r: HotelNightRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  return {
    option_key: opt.key,
    category: opt.category || opt.label || `Option ${opt.key}`,
    nights: rows.length,
    rows,
    sgl: sum((r) => r.sgl),
    dbl: sum((r) => r.dbl),
    trp: sum((r) => r.trp),
    quad: sum((r) => r.quad),
    lunch_total: sum((r) => r.lunch_total),
    dinner_total: sum((r) => r.dinner_total),
  };
}

// ------------------------------------------------------------- Rate sheet

export interface RateSheetRow {
  pax: number;
  vehicle: string;
  transport: number;
  guide: number;
  escort: number;
  entrances: number;
  activities: number;
  misc: number;
  single: number;
  double: number;
  triple: number;
  quad: number;
  lunch: number;
  dinner: number;
  pkg_single: number;
  pkg_double: number;
  pkg_triple: number;
  pkg_quad: number;
}

export interface RateSheetGroup {
  vehicle: string;
  line_id?: string;
  rows: RateSheetRow[];
}

/** Pax counts covered by the quotation (pax range, else exact headcount). */
export function paxScale(draft: QuoteDraft): number[] {
  const range = draft.pax_range && draft.pax_range !== "auto" ? draft.pax_range : null;
  if (range) {
    const plus = range.endsWith("+");
    const [a, b] = range.replace("+", "").split("-").map((x) => parseInt(x, 10));
    const min = Math.max(1, a || 1);
    const max = plus ? min + 6 : Math.max(min, b || min);
    const out: number[] = [];
    for (let p = min; p <= Math.min(max, min + 30); p++) out.push(p);
    return out;
  }
  return [Math.max(1, effectivePaxForPricing(draft))];
}

/** Apply markup then GST to a net amount. */
const gross = (net: number, mk: number, gst: number) => {
  const withMk = net * (1 + mk);
  return withMk * (1 + gst);
};

export function buildRateSheet(
  draft: QuoteDraft,
  d: DB,
  opt: HotelOption,
  lines: TransportLine[],
): RateSheetGroup[] {
  const paxList = paxScale(draft);
  const hotels = buildHotelMealSheet(draft, d, opt);
  const mk = { land: landMarkup(draft), lg: landGst(draft), h: hotelsMarkup(draft), hg: hotelsGst(draft) };

  // Room shares (per person) including room GST slab, then hotels markup/GST.
  const roomShare = (pick: (r: HotelNightRow) => number, size: number) => {
    const net = hotels.rows.reduce((s, r) => {
      const tariff = pick(r);
      return s + (tariff + tariff * gstRateFor(tariff)) / size;
    }, 0);
    return gross(net, mk.h, mk.hg);
  };
  const single = roomShare((r) => r.sgl, 1);
  const dbl = roomShare((r) => r.dbl, 2);
  const trp = roomShare((r) => r.trp, 3);
  const quad = roomShare((r) => r.quad, 4);
  const lunch = gross(hotels.lunch_total, mk.h, mk.hg);
  const dinner = gross(hotels.dinner_total, mk.h, mk.hg);

  const escortTotal = draft.guides.filter((g) => g.is_escort)
    .reduce((s, g) => s + g.rate * g.guides * g.days, 0);
  const guideTotal = draft.guides.filter((g) => !g.is_escort)
    .reduce((s, g) => s + g.rate * g.guides * g.days, 0);

  const groups = (lines.length ? lines : [undefined]) as (TransportLine | undefined)[];

  return groups.map((line) => {
    const land = buildLandPart(draft, d, line);
    const vehicle = line
      ? d.travel_options.find((t) => t.id === line.travel_id)?.vehicle_type || "Vehicle"
      : "All vehicles";
    const rows: RateSheetRow[] = paxList.map((pax) => {
      const pp = (v: number) => gross(v / pax, mk.land, mk.lg);
      const transport = pp(land.transport_total);
      const guide = pp(guideTotal);
      const escort = pp(escortTotal);
      const entrances = pp(land.entrances_total);
      const activities = pp(land.activities_total);
      const misc = pp(land.misc_total);
      const landPP = transport + guide + escort + entrances + activities + misc;
      const meals = lunch + dinner;
      return {
        pax, vehicle, transport, guide, escort, entrances, activities, misc,
        single, double: dbl, triple: trp, quad, lunch, dinner,
        pkg_single: landPP + single + meals,
        pkg_double: landPP + dbl + meals,
        pkg_triple: landPP + trp + meals,
        pkg_quad: landPP + quad + meals,
      };
    });
    return { vehicle, line_id: line?.id, rows };
  });
}
