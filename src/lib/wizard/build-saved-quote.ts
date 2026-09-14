// Builds a full SavedQuote object from the current wizard draft.
// Extracted from costing.tsx Step 18 so a quote can be saved from
// anywhere in the wizard (header "Save Quote" action).
import type { useDB } from "@/lib/mock-store";
import { addDaysISO } from "@/lib/format";
import { nextQuoteNumber, type SavedQuote } from "@/lib/quotes-store";
import { findRatePlan } from "@/lib/wizard/rate-lookup";
import {
  computeOption, computeAddonsTotal, totalPax, gstRateFor,
  computePersonTotals, optionUsesCustomAllocation, personRoomTypeLabel,
  isGroupTour, autoDoubleMix, autoTripleMix, mixLabel, computeGroupOption,
} from "@/lib/wizard/calc";
import { computeScenario } from "@/lib/wizard/scenario";
import type { QuoteDraft } from "@/lib/wizard/types";

type DB = ReturnType<typeof useDB>;

const uid = () => Math.random().toString(36).slice(2, 10);

export function buildSavedQuote(draft: QuoteDraft, d: DB, savedBy: string): SavedQuote {
  const totals = draft.hotel_options.map((o) => computeOption(draft, o, d));
  const routingCities = new Set(
    draft.routing
      .map((r) => d.cities.find((c) => c.id === (r.to_city_id || r.city_id))?.name)
      .filter(Boolean) as string[],
  );

  const recIdx = Math.max(0, draft.hotel_options.findIndex((o) => o.key === draft.recommended_option));
  const rec = totals[recIdx] || totals[0];
  const recOpt = draft.hotel_options[recIdx];

  const itinerary = draft.routing.map((day) => {
    const sel = recOpt?.selections.find((s) => s.city_id === day.city_id);
    const hotel = sel ? d.hotels.find((h) => h.id === sel.hotel_id) : null;
    const room = sel ? d.room_categories.find((r) => r.id === sel.room_id) : null;
    const cityName = d.cities.find((c) => c.id === day.city_id)?.name || "—";
    const plan = sel ? findRatePlan(d.rate_plans, sel.room_id, sel.meal_plan, day.date) : null;
    const dbl = plan?.double_rate || 0;
    const sgl = plan?.single_rate || 0;
    const trp = dbl + (plan?.extra_bed_rate || 0);
    const gr = gstRateFor;
    return {
      day_number: day.day, date: day.date, city: cityName,
      hotel_name: hotel?.name || "—", hotel_category: hotel?.hotel_category || "—",
      room_category: room?.name || "—", meal_plan: sel?.meal_plan || "CP",
      season_label: plan?.season_label || "—",
      validity_start: plan?.validity_start || "", validity_end: plan?.validity_end || "",
      rates: {
        sgl_net: sgl, sgl_gst_rate: gr(sgl), sgl_gst_amt: sgl * gr(sgl), sgl_total: sgl * (1 + gr(sgl)),
        dbl_net: dbl, dbl_gst_rate: gr(dbl), dbl_gst_amt: dbl * gr(dbl), dbl_total: dbl * (1 + gr(dbl)),
        trp_net: trp, trp_gst_rate: gr(trp), trp_gst_amt: trp * gr(trp), trp_total: trp * (1 + gr(trp)),
      },
      lunch_rate: plan?.lunch_rate || 0, dinner_rate: plan?.dinner_rate || 0,
    };
  });

  const addonsBlock = {
    travels: draft.transport.map((t) => {
      const to = d.travel_options.find((x) => x.id === t.travel_id);
      return { name: to?.vehicle_type || "—", days: t.days, vehicles: t.vehicles, rate_per_day: t.rate, total: t.rate * t.days * t.vehicles };
    }),
    miscellaneous: draft.misc.map((m) => {
      const mo = m.item_id ? d.miscellaneous_items.find((x) => x.id === m.item_id) : null;
      return { name: mo?.name || m.custom_name || "—", pax: m.qty, rate: m.rate, unit: m.unit, total: m.qty * m.rate };
    }),
    guide: draft.guides.map((g) => {
      const go = d.guides.find((x) => x.id === g.guide_id);
      return { name: go?.name || "—", type: go?.guide_type || "—", days: g.days, count: g.guides, rate_per_day: g.rate, total: g.rate * g.days * g.guides };
    }),
    entrances: draft.entrances.map((e) => {
      const so = e.site_id ? d.entrance_sites.find((x) => x.id === e.site_id) : null;
      const cityName = so ? d.entrance_cities.find((c) => c.id === so.city_id)?.name || "—" : "—";
      return {
        site_name: so?.site_name || e.custom_name || "—", city: cityName,
        indian_pax: e.indian_pax, indian_rate: e.indian_rate,
        foreigner_pax: e.foreign_pax, foreigner_rate: e.foreign_rate,
        total: e.indian_pax * e.indian_rate + e.foreign_pax * e.foreign_rate,
      };
    }),
    activities: [...draft.activities, ...draft.optionals].map((a) => {
      const ao = a.activity_id ? d.activities.find((x) => x.id === a.activity_id) : null;
      const dest = ao ? d.activity_destinations.find((x) => x.id === ao.destination_id)?.name || "—" : "—";
      return { name: ao?.activity_name || a.custom_name || "—", destination: dest, pricing_type: ao?.pricing_type || "custom", qty: a.qty, rate: a.rate, total: a.qty * a.rate };
    }),
    addons_total: computeAddonsTotal(draft),
  };

  const q: SavedQuote = {
    id: uid(),
    query_id: draft.linked_query_id,
    quote_number: nextQuoteNumber(),
    saved_at: new Date().toISOString(),
    saved_by: savedBy,
    tour_title: draft.program_name || `${draft.query_type} Tour`,
    cities: Array.from(routingCities),
    total_nights: draft.nights,
    travel_start: draft.start_date,
    travel_end: addDaysISO(draft.start_date, draft.nights),
    itinerary,
    addons: addonsBlock,
    inclusions: {
      accommodation_nights: draft.nights,
      breakfast_count: draft.nights,
      lunch_count: 0, dinner_count: 0,
      travels_included: draft.transport.length > 0,
      guide_included: draft.guides.length > 0,
    },
    markup_percent: draft.markup_percent,
    totals: {
      room_net_sgl: rec?.room_net_sgl ?? 0, room_net_dbl: rec?.room_net_dbl ?? 0, room_net_trp: rec?.room_net_trp ?? 0,
      gst_rooms_sgl: rec?.gst_rooms_sgl ?? 0, gst_rooms_dbl: rec?.gst_rooms_dbl ?? 0, gst_rooms_trp: rec?.gst_rooms_trp ?? 0,
      addons_total: rec?.addons_total ?? 0,
      markup_sgl: rec?.markup_sgl ?? 0, markup_dbl: rec?.markup_dbl ?? 0, markup_trp: rec?.markup_trp ?? 0,
      gst_markup_sgl: rec?.gst5_sgl ?? 0, gst_markup_dbl: rec?.gst5_dbl ?? 0, gst_markup_trp: rec?.gst5_trp ?? 0,
      grand_sgl: rec?.grand_sgl ?? 0, grand_dbl: rec?.grand_dbl ?? 0, grand_trp: rec?.grand_trp ?? 0,
    },
    include_sgl: true, include_dbl: true, include_trp: true,
    allocations: recOpt && optionUsesCustomAllocation(recOpt)
      ? (() => {
          const rows = computePersonTotals(draft, recOpt, d);
          const nameById = new Map(rows.map((r) => [r.person_id, r.label]));
          return rows.map((r) => ({
            label: r.label,
            room_type_label: personRoomTypeLabel(r.room_type, r.sharing_with)
              + (r.sharing_with.length ? ` (w/ ${r.sharing_with.map((id) => nameById.get(id) || `#${id}`).join(", ")})` : ""),
            room_net: r.room_net,
            room_gst: r.room_gst,
            room_total: r.room_total,
            shared_addons: r.shared_addons,
            markup_plus_gst: r.markup + r.gst5,
            grand_total: r.grand_total,
          }));
        })()
      : undefined,
    scenarios: (() => {
      const defs = (draft.scenarios && draft.scenarios.length)
        ? draft.scenarios
        : (recOpt ? [{ id: "default", label: "Selected Package", option_key: recOpt.key }] : []);
      return defs
        .map((s) => computeScenario(draft, s, d))
        .filter(Boolean)
        .map((r) => {
          const res = r!;
          return {
            label: res.label,
            hotel_category: res.option_label,
            vehicle: res.vehicle_label,
            pax: res.pax,
            per_person_avg: res.per_person_avg,
            grand_total: res.grand_total,
            persons: res.persons.map((p) => ({
              label: p.label,
              room_label: p.room_label,
              hotel: p.hotel_total,
              transport: p.transport,
              guide: p.guide,
              activities: p.activities,
              entrances: p.entrances,
              misc: p.misc,
              meals: p.meals,
              markup: p.markup,
              gst5: p.gst5,
              total: p.total,
            })),
          };
        });
    })(),
    ...(isGroupTour(draft) && recOpt ? (() => {
      const pax = Math.max(1, totalPax(draft));
      const dbl = computeGroupOption(draft, recOpt, d, autoDoubleMix(pax));
      const trp = computeGroupOption(draft, recOpt, d, autoTripleMix(pax));
      const cust = draft.group_room_mix ? computeGroupOption(draft, recOpt, d, draft.group_room_mix) : null;
      const rows = [
        { arrangement: "Double Sharing", rooms_label: mixLabel(dbl.mix), total_package: dbl.grand_total, per_person: dbl.per_person, pax_covered: dbl.pax_covered },
        { arrangement: "Triple Sharing", rooms_label: mixLabel(trp.mix), total_package: trp.grand_total, per_person: trp.per_person, pax_covered: trp.pax_covered },
      ];
      if (cust) rows.push({ arrangement: "Custom Mix", rooms_label: mixLabel(cust.mix), total_package: cust.grand_total, per_person: cust.per_person, pax_covered: cust.pax_covered });
      return { is_group: true, group_total_pax: pax, group_rows: rows };
    })() : {}),
  };

  return q;
}
