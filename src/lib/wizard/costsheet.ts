// Costing sheet builders — pure presentation math on top of the numbers the
// wizard already computes. Nothing here re-derives guide / activity / entrance
// / misc / transport / hotel figures; they are only grouped per day, per
// hotel category and per pax so the Costing page can be rendered as a sheet.
import type { DB } from "@/lib/mock-store";
import { activityPricingForPax, miscRateForPax, VEHICLE_ALLOCATION } from "@/lib/mock-store";

import { addDaysISO } from "@/lib/format";
import { findRatePlan } from "./rate-lookup";
import {
  transportLineTotal,
  planForDay,
  gstRateFor,
  effectivePaxForPricing,
  getCostingPaxValues,
  landMarkup,
  landGst,
  hotelsMarkup,
  hotelsGst,
  accommodationNightDate,
  computeMealDays,
  dynamicAccommodationBreakdown,
  isSplitAccommodation,
} from "./calc";
import {
  isAccommodationNightForOption,
  hotelSelectionForDay,
  isDynamicAccommodationMode,
  type QuoteDraft,
  type HotelOption,
  type TransportLine,
  type EntranceCat,
  type DayRoomMix,
} from "./types";
import { miscPerPersonForPax, transportOptionRows } from "./land-pricing";
import { isSelectedLandServiceValid } from "./land-eligibility";
import { getQuotationScope } from "@/lib/query-for";
import {
  escortDayAppliesToPax,
  getEscortBaseForPax,
  getEscortDayCharge,
  getEscortPricingMode,
  getEscortRangeBase,
  isEscortEnabled,
  guideRawRateForPax,
  guideSelectionStatusForPax,
} from "./guide-pricing";

// ---------------------------------------------------------------- Land part

/** One selectable component shown as a checkbox inside a Land Part column. */
export interface SheetOption {
  id: string;
  label: string;
  sub?: string;
  amount: number; // amount contributed to THIS day when checked
  per_person_amount?: number; // display-only per-person amount; totals keep using amount
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
  guide_total: number; // guides + escorts (column line total)
  guide_only_total: number; // non-escort guides
  escort_total: number;
  entrances_total: number;
  entrances_per_person_total: number;
  activities_total: number;
  activities_per_person_total: number;
  misc_total: number;
  misc_per_person_total: number;
  grand_total: number;
}

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

export function entranceTourSelected(
  draft: QuoteDraft,
  day: number,
  siteId: string,
  legacySelected: boolean,
): boolean {
  const selectedTours = draft.entrance_tour_selected_by_day?.[day];
  return selectedTours === undefined ? legacySelected : selectedTours.includes(siteId);
}

export function entranceRateSelected(
  draft: QuoteDraft,
  day: number,
  lineId: string,
  category: EntranceCat,
  legacySelected: boolean,
): boolean {
  const selections = draft.entrance_rate_selection_by_day?.[day];
  return selections === undefined ? legacySelected : (selections[category] ?? []).includes(lineId);
}

/** Supported language keys for persisted GuideLine alternatives. */
export const GUIDE_LANGS = ["Hindi", "English", "Language"] as const;
export type GuideLangOpt = (typeof GUIDE_LANGS)[number];
export const guideOptId = (lineId: string, lang: string) => `${lineId}::${lang}`;

function guideTourSelected(
  draft: QuoteDraft,
  guide: DB["guides"][number] | undefined,
  day: number,
) {
  const selectedTours = draft.guide_tour_selected_by_day?.[day];
  if (selectedTours === undefined || !guide) return true;
  const key = `${guide.city ?? guide.destination ?? ""}||${guide.tour_program ?? guide.name}`;
  return selectedTours.includes(key);
}

/** Language checkbox state — defaults to the line's own language only. */
function guideLangPicked(
  draft: QuoteDraft,
  day: number,
  lineId: string,
  lang: string,
  defaultLang: string,
): boolean {
  const list = draft.costing_selection?.guide?.[day];
  if (list) return list.includes(guideOptId(lineId, lang));
  return lang === defaultLang;
}

function guideReportingRate(draft: QuoteDraft, language: GuideLangOpt): number {
  if (language === "Hindi") return draft.guide_reporting_cost_hindi ?? 0;
  if (language === "English") return draft.guide_reporting_cost_english ?? 0;
  return draft.guide_reporting_cost_language ?? 0;
}

/** Days a line applies to, restricted to the routing days that exist. */
function targetDays(days: number[] | undefined, all: number[]): number[] {
  const t = days && days.length ? days.filter((x) => all.includes(x)) : all;
  return t.length ? t : [];
}

/** Day 0 only participates in explicitly assigned, validated sightseeing lines. */
function targetServiceDays(days: number[] | undefined, regularDays: number[], allRows: number[]) {
  if (!days?.length) return regularDays;
  return days.filter((day) => regularDays.includes(day) || (day === 0 && allRows.includes(0)));
}

export function buildLandPart(draft: QuoteDraft, d: DB, line?: TransportLine): LandPartSheet {
  const allRows = draft.routing.map((r) => r.day);
  const all = draft.routing.filter((r) => !(r.is_day_zero || r.day === 0)).map((r) => r.day);
  const cityName = (id?: string) => d.cities.find((c) => c.id === id)?.name || "";
  const dayIndex = new Map(all.map((day, index) => [day, index]));

  const opts: Record<
    number,
    {
      transport: SheetOption[];
      guide: SheetOption[];
      entrances: SheetOption[];
      activities: SheetOption[];
      misc: SheetOption[];
    }
  > = {};
  allRows.forEach((day) => {
    opts[day] = { transport: [], guide: [], entrances: [], activities: [], misc: [] };
  });
  const configuredEscortIds = new Set<string>();
  const hasConfiguredEscort = isEscortEnabled(draft) && Boolean(getEscortPricingMode(draft));

  // ------- Transport (one checkbox per vehicle option, per day)
  const lines = line ? [line] : draft.transport;
  lines.forEach((l) => {
    const vehicle = d.travel_options.find((t) => t.id === l.travel_id)?.vehicle_type || "Vehicle";
    const rep = (l.reporting_cost || 0) * (l.vehicles || 1);
    const target = targetDays(undefined, l.rate_mode === "total" ? all : allRows);
    if (!target.length) return;
    const perRoute =
      l.rate_mode !== "total" &&
      l.rate_format === "per_route" &&
      Boolean(l.per_route_rates?.length || Object.keys(l.per_route_day_rates ?? {}).length);
    target.forEach((day) => {
      const base = perRoute
        ? ((day === 0
            ? l.per_route_day_rates?.[day]
            : l.per_route_rates?.[dayIndex.get(day) ?? 0]) || 0) * (l.vehicles || 1)
        : transportLineTotal(l) / target.length;
      const amount = base + (perRoute ? rep / target.length : 0);
      opts[day].transport.push({
        id: l.id,
        label: vehicle,
        sub:
          [l.reporting_cost ? `Reporting ${l.reporting_cost}` : null, l.remarks || null]
            .filter(Boolean)
            .join(" · ") || undefined,
        amount,
        checked: isPicked(draft, "transport", day, l.id),
      });
    });
  });

  // ------- Guides & escorts
  const paxForGuide = Math.max(1, effectivePaxForPricing(draft));
  const selectedGuideLanguages = new Set<GuideLangOpt>();
  draft.guides.forEach((l) => {
    if (l.is_escort && l.inclusion_status === "optional") return;
    const target = l.is_escort
      ? targetDays(l.from_routing_days, all)
      : targetServiceDays(l.from_routing_days, all, allRows);
    if (!target.length) return;
    const g = d.guides?.find((x) => x.id === l.guide_id);
    if (l.is_escort) {
      if (hasConfiguredEscort) return;
      const each = (l.rate * l.guides * l.days) / target.length;
      target.forEach((day) =>
        opts[day].guide.push({
          id: l.id,
          label: "Tour Escorted",
          sub: g?.tour_program || undefined,
          amount: each,
          checked: isPicked(draft, "guide", day, l.id),
        }),
      );
      return;
    }
    // A Guide step line represents exactly one included language alternative.
    // Unknown legacy languages are not expanded into a guessed English option.
    if (!(GUIDE_LANGS as readonly string[]).includes(l.language || "")) return;
    const defaultLang = l.language as GuideLangOpt;
    target.forEach((day) => {
      const route = draft.routing.find((row) => row.day === day);
      if (
        (route?.is_day_zero || route?.day === 0) &&
        !isSelectedLandServiceValid("guide", l.guide_id, day, draft, d)
      )
        return;
      if (!guideTourSelected(draft, g, day)) return;
      const serviceKey = `${g?.city ?? g?.destination ?? ""}||${g?.tour_program ?? g?.name ?? ""}`;
      const status = guideSelectionStatusForPax(
        draft,
        day,
        serviceKey,
        l.guide_id,
        defaultLang,
        paxForGuide,
        l.inclusion_status === "optional" ? "optional" : "included",
        l.id,
      );
      if (status === "removed") return;
      const checked =
        status === "included" && guideLangPicked(draft, day, l.id, defaultLang, defaultLang);
      const rate = guideRawRateForPax(l, g, defaultLang, paxForGuide, paxForGuide) ?? 0;
      if (rate <= 0) return;
      if (checked) selectedGuideLanguages.add(defaultLang);
      const amount = (rate * l.guides * l.days) / target.length;
      opts[day].guide.push({
        id: guideOptId(l.id, defaultLang),
        label: defaultLang,
        sub: g?.tour_program || g?.name || undefined,
        amount,
        checked,
      });
    });
  });

  const guideReportingDay = all[0];
  if (guideReportingDay != null) {
    selectedGuideLanguages.forEach((language) => {
      const amount = guideReportingRate(draft, language);
      if (!amount) return;
      opts[guideReportingDay].guide.push({
        id: guideOptId("guide-reporting", language),
        label: `${language} Reporting`,
        amount,
        checked: true,
      });
    });
  }

  if (isEscortEnabled(draft) && all.length) {
    const mode = getEscortPricingMode(draft);
    if (mode === "pax_range") {
      const range = (draft.escort_ranges ?? []).find(
        (item) => paxForGuide >= item.min_pax && paxForGuide <= item.max_pax,
      );
      if (range) {
        const perDay = getEscortRangeBase(draft, range) / all.length;
        all.forEach((day) => {
          const id = `configured-escort-range-${range.id}-${day}`;
          configuredEscortIds.add(id);
          opts[day].guide.push({
            id,
            label: "Tour Escort",
            sub: range.escort_type,
            amount: perDay,
            checked: true,
          });
        });
      }
    } else if (mode === "per_person") {
      const perDay = getEscortBaseForPax(draft, paxForGuide) / all.length;
      all.forEach((day) => {
        const id = `configured-escort-person-${day}`;
        configuredEscortIds.add(id);
        opts[day].guide.push({
          id,
          label: "Tour Escort",
          sub: draft.escort_type || undefined,
          amount: perDay,
          checked: true,
        });
      });
    } else if (mode === "day_wise" && escortDayAppliesToPax(draft, paxForGuide)) {
      const includedDays = all.filter((day) => getEscortDayCharge(draft, day) > 0);
      const reportingShare = includedDays.length
        ? (draft.guide_escort_reporting ?? 0) / includedDays.length
        : 0;
      includedDays.forEach((day) => {
        const id = `configured-escort-day-${day}`;
        configuredEscortIds.add(id);
        opts[day].guide.push({
          id,
          label: "Tour Escort",
          sub: draft.escort_type || undefined,
          amount: getEscortDayCharge(draft, day) + reportingShare,
          checked: true,
        });
      });
    }
  }

  const paxForLand = Math.max(1, effectivePaxForPricing(draft));
  const activeEntranceCategory =
    draft.entrance_traveller_category ?? draft.traveler_type ?? "indian";

  // ------- Entrances (only the quotation's active traveller category)
  draft.entrances.forEach((l) => {
    const target = targetServiceDays(l.from_routing_days, all, allRows);
    if (!target.length) return;
    target.forEach((day) => {
      if (!isSelectedLandServiceValid("entrance", l.site_id, day, draft, d)) return;
      if (!entranceTourSelected(draft, day, l.site_id || l.id, true)) return;
      const rates: Record<EntranceCat, number> = {
        indian: l.indian_rate,
        foreign: l.foreign_rate,
        student: l.student_rate ?? 0,
      };
      const rate = rates[activeEntranceCategory];
      if (rate <= 0) return;
      const legacySelected = isPicked(draft, "entrances", day, l.id);
      const checked =
        entranceTourSelected(draft, day, l.site_id || l.id, true) &&
        entranceRateSelected(draft, day, l.id, activeEntranceCategory, legacySelected) &&
        catPicked(draft, day, activeEntranceCategory);
      opts[day].entrances.push({
        id: l.id,
        label:
          l.custom_name ||
          d.entrance_sites?.find((s) => s.id === l.site_id)?.site_name ||
          "Entrance",
        amount: (rate * paxForLand) / target.length,
        per_person_amount: rate / target.length,
        checked,
      });
    });
  });

  // ------- Activities
  draft.activities.forEach((l) => {
    if (l.inclusion_status === "optional") return;
    const target = targetServiceDays(l.from_routing_days, all, allRows);
    if (!target.length) return;
    const master = l.activity_id
      ? d.activities.find((activity) => activity.id === l.activity_id)
      : undefined;
    const resolved = master
      ? activityPricingForPax(master, paxForLand, draft.traveler_type ?? "indian")
      : undefined;
    const total = resolved?.total ?? l.rate * l.qty;
    const each = total / target.length;
    target.forEach(
      (day) =>
        isSelectedLandServiceValid("activity", l.activity_id, day, draft, d) &&
        opts[day].activities.push({
          id: l.id,
          label: l.custom_name || master?.activity_name || "Activity",
          amount: each,
          per_person_amount: resolved
            ? resolved.per_person / target.length
            : l.pricing_mode === "per_person"
              ? l.rate / target.length
              : (l.rate * l.qty) / paxForLand / target.length,
          checked: isPicked(draft, "activities", day, l.id),
        }),
    );
  });

  // ------- Miscellaneous (consolidated for the whole trip on the first day)
  const miscDay = all[0];
  if (miscDay != null) {
    draft.misc.forEach((l) => {
      const target = targetDays(l.from_routing_days, all);
      if (!target.length) return;
      const master = l.item_id
        ? d.miscellaneous_items.find((item) => item.id === l.item_id)
        : undefined;
      if (l.item_id && (!master || !master.is_active)) return;
      const resolved = master
        ? miscRateForPax(master, paxForLand, Math.max(1, draft.nights))
        : undefined;
      opts[miscDay].misc.push({
        id: l.id,
        label: l.custom_name || master?.name || "Item",
        sub: resolved?.label || l.unit || undefined,
        amount: resolved?.total ?? l.rate * l.qty,
        per_person_amount:
          resolved?.per_person ??
          (l.unit === "per_person" ? l.rate : (l.rate * l.qty) / paxForLand),
        checked: isPicked(draft, "misc", miscDay, l.id),
      });
    });
  }

  const sumOn = (list: SheetOption[]) => list.reduce((s, o) => s + (o.checked ? o.amount : 0), 0);

  const rows: LandDayRow[] = draft.routing.map((day, i) => {
    const tours = Object.values(day.tours_selected_by_city ?? {}).flat();
    const from =
      day.from_city && !day.from_city.includes("-")
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
      tours: tours.length ? tours.join(", ") : day.tour_title || "—",
      transport,
      guide,
      entrances,
      activities,
      misc,
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
  const entrances_per_person_total = rows.reduce(
    (total, row) =>
      total +
      row.entrance_opts.reduce(
        (rowTotal, option) => rowTotal + (option.checked ? (option.per_person_amount ?? 0) : 0),
        0,
      ),
    0,
  );
  const activities_total = sum((r) => r.activities);
  const misc_total = sum((r) => r.misc);
  const activities_per_person_total = rows.reduce(
    (total, row) =>
      total +
      row.activity_opts.reduce(
        (rowTotal, option) => rowTotal + (option.checked ? (option.per_person_amount ?? 0) : 0),
        0,
      ),
    0,
  );
  const misc_per_person_total = rows.reduce(
    (total, row) =>
      total +
      row.misc_opts.reduce(
        (rowTotal, option) => rowTotal + (option.checked ? (option.per_person_amount ?? 0) : 0),
        0,
      ),
    0,
  );

  const escortIds = new Set([
    ...draft.guides.filter((g) => g.is_escort).map((g) => g.id),
    ...configuredEscortIds,
  ]);
  const escort_total = rows.reduce(
    (s, r) =>
      s + r.guide_opts.reduce((a, o) => a + (o.checked && escortIds.has(o.id) ? o.amount : 0), 0),
    0,
  );

  return {
    rows,
    transport_total,
    guide_total,
    guide_only_total: guide_total - escort_total,
    escort_total,
    entrances_total,
    entrances_per_person_total,
    activities_total,
    activities_per_person_total,
    misc_total,
    misc_per_person_total,
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
  sgl: number;
  dbl: number;
  trp: number;
  quad: number;
  /** Net room cost of all Dynamic-mode nights (mix priced), excluded from the flat columns. */
  dynamic_net: number;

  lunch_total: number;
  dinner_total: number;
}

export function buildHotelMealSheet(draft: QuoteDraft, d: DB, opt: HotelOption): HotelMealSheet {
  const rows: HotelNightRow[] = [];
  const meals = computeMealDays(draft, d, opt.key).rows;

  draft.routing.forEach((day, i) => {
    if (!isAccommodationNightForOption(opt, day)) return;
    const sel = hotelSelectionForDay(opt, day, day.is_day_zero || day.day === 0);
    if (sel?.no_hotel) return;
    const date = accommodationNightDate(draft, day, i);
    const city =
      d.cities.find((c) => c.id === day.city_id)?.name ||
      d.cities.find((c) => c.id === sel?.city_id)?.name ||
      "—";
    const hotel = sel ? d.hotels.find((h) => h.id === sel.hotel_id)?.name || "—" : "—";
    const room = sel ? d.room_categories.find((r) => r.id === sel.room_id)?.name || "—" : "—";
    const plan = sel
      ? planForDay(
          opt,
          day.day,
          findRatePlan(d.rate_plans, sel.room_id, sel.meal_plan, date, opt.category),
        )
      : null;
    const dbl = plan?.double_rate || 0;
    const eb = plan?.extra_bed_rate || 0;

    // Per-person meal totals across every itinerary place on this day.
    const lunchRows = meals.filter((meal) => meal.day === day.day && meal.meal_type === "Lunch");
    const dinnerRows = meals.filter((meal) => meal.day === day.day && meal.meal_type === "Dinner");
    const lunchSource =
      lunchRows
        .map((meal) => meal.label)
        .filter(Boolean)
        .join(" + ") || "—";
    const dinnerSource =
      dinnerRows
        .map((meal) => meal.label)
        .filter(Boolean)
        .join(" + ") || "—";
    const lunchTotal = lunchRows.reduce((sum, meal) => sum + meal.per_person, 0);
    const dinnerTotal = dinnerRows.reduce((sum, meal) => sum + meal.per_person, 0);

    const sgl = plan?.single_rate || 0;
    const trp = plan ? dbl + eb : 0;
    const quad = plan ? plan.quad_rate || dbl + eb * 2 : 0;

    // Dynamic mode — this night is priced from the allocated room mix.
    const isDynamic = isDynamicAccommodationMode(draft);
    const mix = isDynamic ? draft.day_room_mix?.[day.day] : undefined;
    const mixNet = mix
      ? mix.single * sgl + mix.double * dbl + mix.triple * trp + mix.quad * quad
      : 0;
    const mixLabel = mix
      ? (
          [
            [mix.double, "Double"],
            [mix.triple, "Triple"],
            [mix.quad, "Quad"],
            [mix.single, "Single"],
          ] as [number, string][]
        )
          .filter(([n]) => n > 0)
          .map(([n, l]) => `${n} ${l}`)
          .join(" + ") || "No rooms"
      : undefined;

    rows.push({
      day: day.day,
      date,
      city,
      hotel,
      room,
      meal_plan: sel?.meal_plan || "—",
      sgl,
      dbl,
      trp,
      quad,
      dynamic: !!mix,
      mix,
      mix_label: mixLabel,
      mix_net: mixNet,
      lunch_source: lunchSource,
      lunch_total: lunchTotal,
      dinner_source: dinnerSource,
      dinner_total: dinnerTotal,
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
    // The shared meal engine includes excursion/non-overnight cities too;
    // hotel-night rows are only a display grouping and must not limit totals.
    lunch_total: meals
      .filter((meal) => meal.meal_type === "Lunch")
      .reduce((total, meal) => total + meal.per_person, 0),
    dinner_total: meals
      .filter((meal) => meal.meal_type === "Dinner")
      .reduce((total, meal) => total + meal.per_person, 0),
  };
}

/** Net / GST / gross for a Dynamic-mode night, GST slabbed per room tariff. */
export function mixTotals(r: HotelNightRow): { net: number; gst: number; total: number } {
  const m = r.mix;
  if (!m) return { net: 0, gst: 0, total: 0 };
  const parts: [number, number][] = [
    [m.single, r.sgl],
    [m.double, r.dbl],
    [m.triple, r.trp],
    [m.quad, r.quad],
  ];
  let net = 0,
    gst = 0;
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
  return getCostingPaxValues(draft);
}

/** Apply markup then GST to a net amount. */
const gross = (net: number, mk: number, gst: number) => {
  const withMk = net * (1 + mk);
  return withMk * (1 + gst);
};

/** Resolve checked Activity & Experience lines to a per-person amount for one Rate Sheet row. */
function selectedActivityPerPersonForPax(draft: QuoteDraft, d: DB, pax: number): number {
  const routingDays = draft.routing
    .filter((day) => !(day.is_day_zero || day.day === 0))
    .map((day) => day.day);
  return draft.activities.reduce((sum, line) => {
    if (line.inclusion_status === "optional") return sum;
    const days = targetDays(line.from_routing_days, routingDays);
    if (!days.length) return sum;
    const selectedDays = days.filter(
      (day) =>
        isSelectedLandServiceValid("activity", line.activity_id, day, draft, d) &&
        isPicked(draft, "activities", day, line.id),
    ).length;
    if (!selectedDays) return sum;
    const master = line.activity_id
      ? d.activities.find((activity) => activity.id === line.activity_id)
      : undefined;
    const perPerson = master
      ? activityPricingForPax(master, pax, draft.traveler_type ?? "indian").per_person
      : line.pricing_mode === "per_person"
        ? line.rate
        : (line.rate * line.qty) / Math.max(1, pax);
    return sum + perPerson * (selectedDays / days.length);
  }, 0);
}

/** Resolve checked Miscellaneous lines to a per-person amount for one Rate Sheet row. */
function selectedMiscPerPersonForPax(draft: QuoteDraft, d: DB, pax: number): number {
  const routingDays = draft.routing
    .filter((day) => !(day.is_day_zero || day.day === 0))
    .map((day) => day.day);
  return draft.misc.reduce((sum, line) => {
    const days = targetDays(line.from_routing_days, routingDays);
    if (!days.length) return sum;
    // Miscellaneous is currently consolidated on the first routing day.
    const selectionDay = routingDays[0];
    if (selectionDay == null || !isPicked(draft, "misc", selectionDay, line.id)) return sum;
    const master = line.item_id
      ? d.miscellaneous_items.find((item) => item.id === line.item_id)
      : undefined;
    // Legacy master-linked rows keep their captured behavior. New rows are
    // quotation-owned and resolve from their persisted basis/ranges.
    const perPerson = master
      ? miscRateForPax(master, pax, Math.max(1, draft.nights)).per_person
      : miscPerPersonForPax(line, pax);
    return sum + perPerson;
  }, 0);
}

function selectedGuideTotalForPax(
  draft: QuoteDraft,
  d: DB,
  pax: number,
): { guide: number; escort: number } {
  const routingDays = draft.routing
    .filter((day) => !(day.is_day_zero || day.day === 0))
    .map((day) => day.day);
  const pricingPax = Math.max(1, effectivePaxForPricing(draft));
  let guide = 0;
  let escort = 0;
  const selectedReportingLanguages = new Set<GuideLangOpt>();
  draft.guides.forEach((line) => {
    if (line.inclusion_status === "optional") return;
    const days = targetDays(line.from_routing_days, routingDays);
    if (!days.length) return;
    const master = d.guides?.find((item) => item.id === line.guide_id);
    const validDays = days.filter(
      (day) =>
        isSelectedLandServiceValid("guide", line.guide_id, day, draft, d) &&
        (line.is_escort || guideTourSelected(draft, master, day)),
    );
    if (!line.is_escort && !validDays.length) return;
    if (line.is_escort) {
      if (isEscortEnabled(draft) && getEscortPricingMode(draft)) return;
      const selected = days.filter((day) => isPicked(draft, "guide", day, line.id)).length;
      escort += line.rate * line.guides * line.days * (selected / days.length);
      return;
    }
    if (!(GUIDE_LANGS as readonly string[]).includes(line.language || "")) return;
    const language = line.language as GuideLangOpt;
    validDays.forEach((day) => {
      if (!guideLangPicked(draft, day, line.id, language, language)) return;
      const rate = guideRawRateForPax(line, master, language, pax, pricingPax);
      if (rate == null || rate <= 0) return;
      selectedReportingLanguages.add(language);
      guide += (rate * line.guides * line.days) / days.length;
    });
  });
  selectedReportingLanguages.forEach((language) => {
    guide += guideReportingRate(draft, language);
  });
  escort += getEscortBaseForPax(draft, pax);
  return { guide, escort };
}

function selectedEntranceTotalForPax(draft: QuoteDraft, d: DB, pax: number): number {
  const routingDays = draft.routing
    .filter((day) => !(day.is_day_zero || day.day === 0))
    .map((day) => day.day);
  const activeCategory = draft.entrance_traveller_category ?? draft.traveler_type ?? "indian";
  return draft.entrances.reduce((sum, line) => {
    const days = targetDays(line.from_routing_days, routingDays);
    if (!days.length) return sum;
    const rates = {
      indian: line.indian_rate,
      foreign: line.foreign_rate,
      student: line.student_rate ?? 0,
    };
    if (rates[activeCategory] <= 0) return sum;
    const selectedDays = days.reduce((daySum, day) => {
      if (!isSelectedLandServiceValid("entrance", line.site_id, day, draft, d)) return daySum;
      if (
        !isPicked(draft, "entrances", day, line.id) ||
        !entranceTourSelected(draft, day, line.site_id || line.id, true) ||
        !entranceRateSelected(
          draft,
          day,
          line.id,
          activeCategory,
          isPicked(draft, "entrances", day, line.id),
        ) ||
        !catPicked(draft, day, activeCategory)
      )
        return daySum;
      return daySum + (pax * rates[activeCategory]) / days.length;
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
  const costingPaxSet = new Set(paxList);
  const transportOptions = transportOptionRows(draft).filter((row) => costingPaxSet.has(row.pax));
  const scope = getQuotationScope(draft.query_for, draft.commercial_mode);
  const includeLand = scope.landPart;
  const includeTransport = scope.landPart;
  const includeAccommodation = scope.accommodationPart;
  const includeMeals = scope.mealsPart;

  const hotels = buildHotelMealSheet(draft, d, opt);
  const mk = {
    land: landMarkup(draft),
    lg: landGst(draft),
    h: hotelsMarkup(draft),
    hg: hotelsGst(draft),
  };

  // Room shares (per person) including room GST slab, then hotels markup/GST.
  // Dynamic nights are priced from their allocated room mix and split across
  // the actual pax count instead of a flat per-category share.
  const actualPax = Math.max(1, effectivePaxForPricing(draft));
  const splitAccommodation = isSplitAccommodation(draft);
  const splitOptions = splitAccommodation
    ? draft.hotel_options.filter((option) => (option.allocated_pax ?? 0) > 0)
    : [];
  const isDynamicDay = () => isDynamicAccommodationMode(draft);
  const roomShare = (pick: (r: HotelNightRow) => number, size: number) => {
    const net = hotels.rows.reduce((s, r) => {
      if (isDynamicDay()) return s;
      if (r.dynamic) return s + mixTotals(r).total / actualPax;
      const tariff = pick(r);
      return s + (tariff + tariff * gstRateFor(tariff)) / size;
    }, 0);
    return gross(net, mk.h, mk.hg);
  };

  const dynamicMode = includeAccommodation && isDynamicAccommodationMode(draft);
  const dynamicBase = dynamicMode
    ? splitAccommodation
      ? splitOptions.reduce(
          (sum, option) => sum + dynamicAccommodationBreakdown(draft, option, d).total,
          0,
        )
      : dynamicAccommodationBreakdown(draft, opt, d).total
    : 0;
  const dynamicPerPerson = dynamicMode ? gross(dynamicBase / actualPax, mk.h, mk.hg) : 0;
  const single = includeAccommodation ? dynamicPerPerson + roomShare((r) => r.sgl, 1) : 0;
  const dbl = includeAccommodation ? dynamicPerPerson + roomShare((r) => r.dbl, 2) : 0;
  const trp = includeAccommodation ? dynamicPerPerson + roomShare((r) => r.trp, 3) : 0;
  const quad = includeAccommodation ? dynamicPerPerson + roomShare((r) => r.quad, 4) : 0;
  const splitMealPerPerson = (mealType: "Lunch" | "Dinner") =>
    splitOptions.reduce(
      (sum, option) =>
        sum +
        computeMealDays(draft, d, option.key)
          .rows.filter((row) => row.meal_type === mealType)
          .reduce((mealSum, row) => mealSum + row.total, 0),
      0,
    ) / actualPax;
  const independentMealPerPerson = (mealType: "Lunch" | "Dinner") =>
    computeMealDays(draft, d, opt.key)
      .rows.filter((row) => row.meal_type === mealType)
      .reduce((sum, row) => sum + row.per_person, 0);
  const lunch = includeMeals
    ? gross(
        !includeAccommodation
          ? independentMealPerPerson("Lunch")
          : splitAccommodation
            ? splitMealPerPerson("Lunch")
            : hotels.lunch_total,
        mk.h,
        mk.hg,
      )
    : 0;
  const dinner = includeMeals
    ? gross(
        !includeAccommodation
          ? independentMealPerPerson("Dinner")
          : splitAccommodation
            ? splitMealPerPerson("Dinner")
            : hotels.dinner_total,
        mk.h,
        mk.hg,
      )
    : 0;

  const groups = (!scope.landPart ? [undefined] : lines.length ? lines : [undefined]) as (
    TransportLine | undefined
  )[];

  if ((draft.transport_options ?? []).length && scope.landPart) {
    if (!transportOptions.length) return [];
    const byOption = new Map<string, typeof transportOptions>();
    transportOptions.forEach((row) =>
      byOption.set(row.option_id, [...(byOption.get(row.option_id) ?? []), row]),
    );
    return Array.from(byOption.entries()).map(([optionId, optionRows]) => {
      const option = draft.transport_options?.find((item) => item.id === optionId);
      const vehicle = option?.name || "Transport option";
      const min = Math.min(...optionRows.map((row) => row.pax));
      const max = Math.max(...optionRows.map((row) => row.pax));
      const base = buildRateSheet(
        {
          ...draft,
          transport: [],
          transport_options: [],
          pax_mode: "range",
          pax_min: min,
          pax_max: max,
          pax_range: `${min}-${max}`,
        },
        d,
        opt,
        [],
      )[0];
      const rows = optionRows
        .map((transportRow) => {
          const template = base?.rows.find((row) => row.pax === transportRow.pax) ?? base?.rows[0];
          const transport = includeTransport ? transportRow.per_person : 0;
          if (!template) return null;
          const oldTransport = template.transport;
          return {
            ...template,
            pax: transportRow.pax,
            vehicle,
            transport,
            pkg_single: template.pkg_single - oldTransport + transport,
            pkg_double: template.pkg_double - oldTransport + transport,
            pkg_triple: template.pkg_triple - oldTransport + transport,
            pkg_quad: template.pkg_quad - oldTransport + transport,
          };
        })
        .filter(Boolean) as RateSheetRow[];
      return { vehicle, line_id: optionId, rows };
    });
  }

  return groups
    .map((line) => {
      const land = buildLandPart(draft, d, line);
      const veh = line ? d.travel_options.find((t) => t.id === line.travel_id) : undefined;
      const vehicle = !scope.landPart
        ? "Accommodation only"
        : line
          ? veh?.vehicle_type || "Vehicle"
          : "No transport";
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
          ? line
            ? transportLineTotal(line)
            : land.transport_total
          : 0;
        const transport = pp(transportBase);
        const guideAtPax = includeLand
          ? selectedGuideTotalForPax(draft, d, pax)
          : { guide: 0, escort: 0 };
        const guide = includeLand ? gross(guideAtPax.guide / pax, mk.land, 0.05) : 0;
        const escortBasePerPerson =
          isEscortEnabled(draft) && getEscortPricingMode(draft) === "per_person"
            ? (draft.escort_per_person_rate ?? 0) + (draft.guide_escort_reporting ?? 0) / pax
            : guideAtPax.escort / pax;
        const escort = includeLand ? gross(escortBasePerPerson, mk.land, 0.05) : 0;
        const entrances = includeLand
          ? gross(selectedEntranceTotalForPax(draft, d, pax) / pax, mk.land, 0.05)
          : 0;
        const activities = includeLand
          ? gross(selectedActivityPerPersonForPax(draft, d, pax), mk.land, mk.lg)
          : 0;
        const misc = includeLand
          ? gross(selectedMiscPerPersonForPax(draft, d, pax), mk.land, mk.lg)
          : 0;
        const landPP = transport + guide + escort + entrances + activities + misc;
        const meals = lunch + dinner;
        return {
          pax,
          vehicle,
          transport,
          guide,
          escort,
          entrances,
          activities,
          misc,
          single,
          double: dbl,
          triple: trp,
          quad,
          lunch,
          dinner,
          pkg_single: landPP + single + meals,
          pkg_double: landPP + dbl + meals,
          pkg_triple: landPP + trp + meals,
          pkg_quad: landPP + quad + meals,
        };
      });
      return { vehicle, line_id: line?.id, rows };
    })
    .filter((group) => group.rows.length > 0);
}
