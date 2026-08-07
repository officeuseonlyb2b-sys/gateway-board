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
import type { QuoteDraft, HotelOption, TransportLine } from "./types";

// ---------------------------------------------------------------- Land part

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
}

export interface LandPartSheet {
  rows: LandDayRow[];
  transport_total: number;
  guide_total: number;
  entrances_total: number;
  activities_total: number;
  misc_total: number;
  grand_total: number;
}

type DayBucket = Record<number, number>;

/** Spread a line total across the routing days it belongs to (evenly). */
function spread(days: number[] | undefined, amount: number, all: number[], into: DayBucket) {
  const target = days && days.length ? days.filter((x) => all.includes(x)) : all;
  if (!target.length || amount === 0) return;
  const each = amount / target.length;
  target.forEach((d) => { into[d] = (into[d] || 0) + each; });
}

export function buildLandPart(
  draft: QuoteDraft,
  d: DB,
  line?: TransportLine,
): LandPartSheet {
  const all = draft.routing.map((r) => r.day);
  const cityName = (id?: string) => d.cities.find((c) => c.id === id)?.name || "";

  const transportB: DayBucket = {};
  const guideB: DayBucket = {};
  const entranceB: DayBucket = {};
  const activityB: DayBucket = {};
  const miscB: DayBucket = {};

  const lines = line ? [line] : draft.transport;
  lines.forEach((l) => {
    if (l.rate_format === "per_route" && l.per_route_rates?.length) {
      draft.routing.forEach((day, i) => {
        const v = l.per_route_rates?.[i] || 0;
        if (v) transportB[day.day] = (transportB[day.day] || 0) + v * (l.vehicles || 1);
      });
      const rep = (l.reporting_cost || 0) * (l.vehicles || 1);
      if (rep) spread(undefined, rep, all, transportB);
    } else {
      spread(undefined, transportLineTotal(l), all, transportB);
    }
  });

  draft.guides.forEach((l) => spread(l.from_routing_days, l.rate * l.guides * l.days, all, guideB));
  draft.entrances.forEach((l) => spread(
    l.from_routing_days,
    l.indian_pax * l.indian_rate + l.foreign_pax * l.foreign_rate
      + (l.student_pax ?? 0) * (l.student_rate ?? 0),
    all, entranceB,
  ));
  draft.activities.forEach((l) => spread(l.from_routing_days, l.rate * l.qty, all, activityB));
  draft.misc.forEach((l) => spread(l.from_routing_days, l.rate * l.qty, all, miscB));

  const rows: LandDayRow[] = draft.routing.map((day, i) => {
    const tours = Object.values(day.tours_selected_by_city ?? {}).flat();
    const from = day.from_city && !day.from_city.includes("-")
      ? day.from_city
      : cityName(day.from_city) || day.from_city || "";
    const to = cityName(day.to_city_id) || day.to_city || "";
    const transport = transportB[day.day] || 0;
    const guide = guideB[day.day] || 0;
    const entrances = entranceB[day.day] || 0;
    const activities = activityB[day.day] || 0;
    const misc = miscB[day.day] || 0;
    return {
      day: day.day,
      date: day.date || addDaysISO(draft.start_date, i),
      route: [from, to].filter(Boolean).join(" → ") || "—",
      city: cityName(day.city_id) || "—",
      tours: tours.length ? tours.join(", ") : (day.tour_title || "—"),
      transport, guide, entrances, activities, misc,
      total: transport + guide + entrances + activities + misc,
    };
  });

  const sum = (f: (r: LandDayRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const transport_total = sum((r) => r.transport);
  const guide_total = sum((r) => r.guide);
  const entrances_total = sum((r) => r.entrances);
  const activities_total = sum((r) => r.activities);
  const misc_total = sum((r) => r.misc);
  return {
    rows, transport_total, guide_total, entrances_total, activities_total, misc_total,
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
