// Costing sheet builders — pure presentation math on top of the numbers the
// wizard already computes. Nothing here re-derives guide / activity / entrance
// / misc / transport / hotel figures; they are only grouped per day, per
// hotel category and per pax so the Costing page can be rendered as a sheet.
import type { DB, GuideLanguage } from "@/lib/mock-store";
import {
  activityRateForPax,
  guideRateForPax,
  miscRateForPax,
  VEHICLE_ALLOCATION,
} from "@/lib/mock-store";

import { addDaysISO } from "@/lib/format";
import { findRatePlan } from "./rate-lookup";
import {
  transportLineTotal, planForDay, gstRateFor, effectivePaxForPricing,
  landMarkup, landGst, hotelsMarkup, hotelsGst, computeMealDays, parsePaxRange,
} from "./calc";
import type {
  QuoteDraft, HotelOption, TransportLine, EntranceCat, DayRoomMix,
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

/** The three guide language checkboxes shown on every guide line. */
export const GUIDE_LANGS = ["Hindi", "English", "Language"] as const;
export type GuideLangOpt = (typeof GUIDE_LANGS)[number];
export const guideOptId = (lineId: string, lang: string) => `${lineId}::${lang}`;

/** Language checkbox state — defaults to the line's own language only. */
function guideLangPicked(
  draft: QuoteDraft, day: number, lineId: string, lang: string, defaultLang: string,
): boolean {
  const list = draft.costing_selection?.guide?.[day];
  if (list) return list.includes(guideOptId(lineId, lang));
  return lang === defaultLang;
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
  const paxForGuide = Math.max(1, effectivePaxForPricing(draft));
  draft.guides.forEach((l) => {
    const target = targetDays(l.from_routing_days, all);
    if (!target.length) return;
    const g = d.guides?.find((x) => x.id === l.guide_id);
    if (l.is_escort) {
      const each = (l.rate * l.guides * l.days) / target.length;
      target.forEach((day) => opts[day].guide.push({
        id: l.id,
        label: "Tour Escorted",
        sub: g?.tour_program || undefined,
        amount: each,
        checked: isPicked(draft, "guide", day, l.id),
      }));
      return;
    }
    // Every guide line exposes the three language checkboxes (Hindi / English /
    // Language). Default: only the language chosen on the Guide step is on.
    const defaultLang = (GUIDE_LANGS as readonly string[]).includes(l.language || "")
      ? (l.language as string)
      : "English";
    target.forEach((day) => {
      GUIDE_LANGS.forEach((lang) => {
        const rate = g ? guideRateForPax(g, paxForGuide, lang as GuideLanguage) : l.rate;
        const amount = ((rate || l.rate) * l.guides * l.days) / target.length;
        opts[day].guide.push({
          id: guideOptId(l.id, lang),
          label: lang,
          sub: g?.tour_program || g?.name || undefined,
          amount,
          checked: guideLangPicked(draft, day, l.id, lang, defaultLang),
        });
      });
    });
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

  // ------- Miscellaneous (consolidated for the whole trip on the first day)
  const miscDay = all[0];
  if (miscDay != null) {
    draft.misc.forEach((l) => {
      const target = targetDays(l.from_routing_days, all);
      if (!target.length) return;
      opts[miscDay].misc.push({
        id: l.id,
        label: l.custom_name || d.miscellaneous_items?.find((m) => m.id === l.item_id)?.name || "Item",
        sub: l.unit || undefined,
        amount: l.rate * l.qty,
        checked: isPicked(draft, "misc", miscDay, l.id),
      });
    });
  }

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
  /** Dynamic mode: this night is priced off an explicit room mix, not flat categories. */
  dynamic?: boolean;
  mix?: DayRoomMix;
  mix_label?: string;
  mix_net?: number;
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
  /** Net room cost of all Dynamic-mode nights (mix priced), excluded from the flat columns. */
  dynamic_net: number;

  lunch_total: number;
  dinner_total: number;
}

export function buildHotelMealSheet(draft: QuoteDraft, d: DB, opt: HotelOption): HotelMealSheet {
  const rows: HotelNightRow[] = [];
  const meals = computeMealDays(draft, d, opt.key).rows;

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

    // Per-person meal totals across every itinerary place on this day.
    const lunchRows = meals.filter((meal) => meal.day === day.day && meal.meal_type === "Lunch");
    const dinnerRows = meals.filter((meal) => meal.day === day.day && meal.meal_type === "Dinner");
    const lunchSource = lunchRows.map((meal) => meal.label).filter(Boolean).join(" + ") || "—";
    const dinnerSource = dinnerRows.map((meal) => meal.label).filter(Boolean).join(" + ") || "—";
    const lunchTotal = lunchRows.reduce((sum, meal) => sum + meal.per_person, 0);
    const dinnerTotal = dinnerRows.reduce((sum, meal) => sum + meal.per_person, 0);

    const sgl = plan?.single_rate || 0;
    const trp = plan ? dbl + eb : 0;
    const quad = plan ? (plan.quad_rate || dbl + eb * 2) : 0;

    // Dynamic mode — this night is priced from the allocated room mix.
    const isDynamic = (draft.dynamic_days ?? []).includes(day.day);
    const mix = isDynamic ? draft.day_room_mix?.[day.day] : undefined;
    const mixNet = mix
      ? mix.single * sgl + mix.double * dbl + mix.triple * trp + mix.quad * quad
      : 0;
    const mixLabel = mix
      ? ([
          [mix.double, "Double"], [mix.triple, "Triple"],
          [mix.quad, "Quad"], [mix.single, "Single"],
        ] as [number, string][])
          .filter(([n]) => n > 0)
          .map(([n, l]) => `${n} ${l}`)
          .join(" + ") || "No rooms"
      : undefined;

    rows.push({
      day: day.day, date, city, hotel, room,
      meal_plan: sel?.meal_plan || "—",
      sgl, dbl, trp, quad,
      dynamic: !!mix,
      mix,
      mix_label: mixLabel,
      mix_net: mixNet,
      lunch_source: lunchSource, lunch_total: lunchTotal,
      dinner_source: dinnerSource, dinner_total: dinnerTotal,
      missing: !plan,
    });
  });

  const sum = (f: (r: HotelNightRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const flat = (f: (r: HotelNightRow) => number) => (r: HotelNightRow) => (r.dynamic ? 0 : f(r));
  return {
    option_key: opt.key,
    category: opt.category || opt.label || `Option ${opt.key}`,
    nights: rows.length,
    rows,
    sgl: sum(flat((r) => r.sgl)),
    dbl: sum(flat((r) => r.dbl)),
    trp: sum(flat((r) => r.trp)),
    quad: sum(flat((r) => r.quad)),
    dynamic_net: sum((r) => (r.dynamic ? r.mix_net || 0 : 0)),
    lunch_total: sum((r) => r.lunch_total),
    dinner_total: sum((r) => r.dinner_total),
  };
}

/** Net / GST / gross for a Dynamic-mode night, GST slabbed per room tariff. */
export function mixTotals(r: HotelNightRow): { net: number; gst: number; total: number } {
  const m = r.mix;
  if (!m) return { net: 0, gst: 0, total: 0 };
  const parts: [number, number][] = [
    [m.single, r.sgl], [m.double, r.dbl], [m.triple, r.trp], [m.quad, r.quad],
  ];
  let net = 0, gst = 0;
  parts.forEach(([count, rate]) => {
    if (!count || !rate) return;
    net += count * rate;
    gst += count * rate * gstRateFor(rate);
  });
  return { net, gst, total: net + gst };
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
  const range = parsePaxRange(draft);
  if (range) {
    const min = Math.max(1, range.min);
    const max = Math.max(min, range.max);
    const out: number[] = [];
    for (let p = min; p <= max; p++) out.push(p);
    return out;
  }
  return [Math.max(1, effectivePaxForPricing(draft))];
}

/** Apply markup then GST to a net amount. */
const gross = (net: number, mk: number, gst: number) => {
  const withMk = net * (1 + mk);
  return withMk * (1 + gst);
};

/**
 * Re-price the selected Land Part services for one row of the pax rate sheet.
 * The editing steps hold the amount for the draft's current/effective pax; a
 * range quotation needs the master slab/per-person rules to be evaluated again
 * for every requested pax row.
 */
function selectedActivityTotalForPax(draft: QuoteDraft, d: DB, pax: number): number {
  const routingDays = draft.routing.map((day) => day.day);
  return draft.activities.reduce((sum, line) => {
    const days = targetDays(line.from_routing_days, routingDays);
    if (!days.length) return sum;
    const selectedDays = days.filter((day) => isPicked(draft, "activities", day, line.id)).length;
    if (!selectedDays) return sum;
    const master = line.activity_id
      ? d.activities.find((activity) => activity.id === line.activity_id)
      : undefined;
    const total = master
      ? activityRateForPax(master, pax)
      : line.pricing_mode === "per_person"
        ? line.rate * pax
        : line.rate * line.qty;
    return sum + total * (selectedDays / days.length);
  }, 0);
}

function selectedMiscTotalForPax(draft: QuoteDraft, d: DB, pax: number): number {
  const routingDays = draft.routing.map((day) => day.day);
  return draft.misc.reduce((sum, line) => {
    const days = targetDays(line.from_routing_days, routingDays);
    if (!days.length) return sum;
    // Miscellaneous is currently consolidated on the first routing day.
    const selectionDay = routingDays[0];
    if (selectionDay == null || !isPicked(draft, "misc", selectionDay, line.id)) return sum;
    const master = line.item_id
      ? d.miscellaneous_items.find((item) => item.id === line.item_id)
      : undefined;
    const total = master
      ? miscRateForPax(master, pax, Math.max(1, draft.nights)).total
      : line.unit === "per_person"
        ? line.rate * pax
        : line.rate * line.qty;
    return sum + total;
  }, 0);
}

function selectedGuideTotalForPax(
  draft: QuoteDraft,
  d: DB,
  pax: number,
): { guide: number; escort: number } {
  const routingDays = draft.routing.map((day) => day.day);
  let guide = 0;
  let escort = 0;
  draft.guides.forEach((line) => {
    const days = targetDays(line.from_routing_days, routingDays);
    if (!days.length) return;
    const master = d.guides?.find((item) => item.id === line.guide_id);
    if (line.is_escort) {
      const selected = days.filter((day) => isPicked(draft, "guide", day, line.id)).length;
      escort += line.rate * line.guides * line.days * (selected / days.length);
      return;
    }
    const defaultLanguage = (GUIDE_LANGS as readonly string[]).includes(line.language || "")
      ? line.language || "English"
      : "English";
    days.forEach((day) => {
      GUIDE_LANGS.forEach((language) => {
        if (!guideLangPicked(draft, day, line.id, language, defaultLanguage)) return;
        const rate = master
          ? guideRateForPax(master, pax, language as GuideLanguage)
          : line.rate;
        guide += (rate * line.guides * line.days) / days.length;
      });
    });
  });
  return { guide, escort };
}

function selectedEntranceTotalForPax(draft: QuoteDraft, pax: number): number {
  const routingDays = draft.routing.map((day) => day.day);
  return draft.entrances.reduce((sum, line) => {
    const days = targetDays(line.from_routing_days, routingDays);
    if (!days.length) return sum;
    const sourcePax = Math.max(1, line.indian_pax + line.foreign_pax + (line.student_pax ?? 0));
    const distribution = {
      indian: line.indian_pax / sourcePax,
      foreign: line.foreign_pax / sourcePax,
      student: (line.student_pax ?? 0) / sourcePax,
    };
    const rates = {
      indian: line.indian_rate,
      foreign: line.foreign_rate,
      student: line.student_rate ?? 0,
    };
    const selectedDays = days.reduce((daySum, day) => {
      if (!isPicked(draft, "entrances", day, line.id)) return daySum;
      const totalForDay = ALL_CATS.reduce(
        (categorySum, category) => categorySum + (
          catPicked(draft, day, category)
            ? distribution[category] * pax * rates[category]
            : 0
        ),
        0,
      );
      return daySum + totalForDay / days.length;
    }, 0);
    return sum + selectedDays;
  }, 0);
}

export function buildRateSheet(
  draft: QuoteDraft,
  d: DB,
  opt: HotelOption,
  lines: TransportLine[],
): RateSheetGroup[] {
  const paxList = paxScale(draft);
  const mode = draft.commercial_mode || "package";
  const includeLand = mode === "package";
  const includeTransport = mode === "package" || mode === "transport_only";
  const includeAccommodation = mode !== "transport_only";

  const hotels = buildHotelMealSheet(draft, d, opt);
  const mk = { land: landMarkup(draft), lg: landGst(draft), h: hotelsMarkup(draft), hg: hotelsGst(draft) };

  // Room shares (per person) including room GST slab, then hotels markup/GST.
  // Dynamic nights are priced from their allocated room mix and split across
  // the actual pax count instead of a flat per-category share.
  const actualPax = Math.max(1, effectivePaxForPricing(draft));
  const roomShare = (pick: (r: HotelNightRow) => number, size: number) => {
    const net = hotels.rows.reduce((s, r) => {
      if (r.dynamic) return s + mixTotals(r).total / actualPax;
      const tariff = pick(r);
      return s + (tariff + tariff * gstRateFor(tariff)) / size;
    }, 0);
    return gross(net, mk.h, mk.hg);
  };

  const single = includeAccommodation ? roomShare((r) => r.sgl, 1) : 0;
  const dbl = includeAccommodation ? roomShare((r) => r.dbl, 2) : 0;
  const trp = includeAccommodation ? roomShare((r) => r.trp, 3) : 0;
  const quad = includeAccommodation ? roomShare((r) => r.quad, 4) : 0;
  const lunch = includeAccommodation ? gross(hotels.lunch_total, mk.h, mk.hg) : 0;
  const dinner = includeAccommodation ? gross(hotels.dinner_total, mk.h, mk.hg) : 0;

  const groups = (mode === "accommodation_only" ? [undefined] : lines.length ? lines : [undefined]) as (TransportLine | undefined)[];

  return groups.map((line) => {
    const land = buildLandPart(draft, d, line);
    const veh = line ? d.travel_options.find((t) => t.id === line.travel_id) : undefined;
    const vehicle = mode === "accommodation_only"
      ? "Accommodation only"
      : line ? veh?.vehicle_type || "Vehicle" : "No transport";
    // Only show pax counts that actually fall inside this vehicle's fit range.
    const alloc = VEHICLE_ALLOCATION.find((v) => v.name === veh?.vehicle_type);
    const minFit = veh?.min_pax ?? alloc?.min_pax ?? 1;
    const maxFit = veh?.max_pax ?? alloc?.max_pax ?? veh?.capacity_persons ?? Infinity;
    const fitting = paxList.filter((p) => p >= minFit && p <= maxFit);
    const rows: RateSheetRow[] = fitting.map((pax) => {
      const pp = (v: number) => gross(v / pax, mk.land, mk.lg);
      // Keep each selected transport line independent in the Rate Sheet / Final
      // Costing. When multiple vehicles exist, each vehicle must retain its own
      // transport amount instead of being added together into one total.
      const transportBase = includeTransport
        ? (line ? transportLineTotal(line) : land.transport_total)
        : 0;
      const transport = pp(transportBase);
      const guideAtPax = includeLand ? selectedGuideTotalForPax(draft, d, pax) : { guide: 0, escort: 0 };
      const guide = includeLand ? pp(guideAtPax.guide) : 0;
      const escort = includeLand ? pp(guideAtPax.escort) : 0;
      const entrances = includeLand ? pp(selectedEntranceTotalForPax(draft, pax)) : 0;
      const activities = includeLand ? pp(selectedActivityTotalForPax(draft, d, pax)) : 0;
      const misc = includeLand ? pp(selectedMiscTotalForPax(draft, d, pax)) : 0;
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
  }).filter((group) => group.rows.length > 0);
}
