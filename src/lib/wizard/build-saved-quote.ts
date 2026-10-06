// Builds a full SavedQuote object from the current wizard draft.
// Extracted from costing.tsx Step 18 so a quote can be saved from
// anywhere in the wizard (header "Save Quote" action).
import type { useDB } from "@/lib/mock-store";
import { addDaysISO } from "@/lib/format";
import { nextQuoteNumber, quoteVersionContext, type SavedQuote } from "@/lib/quotes-store";
import { findRatePlan } from "@/lib/wizard/rate-lookup";
import {
  totalPax, gstRateFor, computeMealDays, effectivePaxForPricing, parsePaxRange,
  computePersonTotals, optionUsesCustomAllocation, personRoomTypeLabel,
  isGroupTour, autoDoubleMix, autoTripleMix, mixLabel, computeGroupOption,
} from "@/lib/wizard/calc";
import { computeScenario } from "@/lib/wizard/scenario";
import { buildLandPart, buildRateSheet, type SheetOption } from "@/lib/wizard/costsheet";
import type { CostScenario, QuoteDraft } from "@/lib/wizard/types";

type DB = ReturnType<typeof useDB>;

const uid = () => Math.random().toString(36).slice(2, 10);

export function buildSavedQuote(draft: QuoteDraft, d: DB, savedBy: string): SavedQuote {
  const identity = quoteVersionContext(draft);
  const id = uid();
  const now = new Date().toISOString();
  const version = identity.version || 1;
  const quoteNumber = identity.quote_number || nextQuoteNumber();
  const routingCities = new Set(
    draft.routing
      .map((r) => d.cities.find((c) => c.id === (r.to_city_id || r.city_id))?.name)
      .filter(Boolean) as string[],
  );

  const recIdx = Math.max(0, draft.hotel_options.findIndex((o) => o.key === draft.recommended_option));
  const recOpt = draft.hotel_options[recIdx];
  const includedKeys = new Set(
    draft.included_option_keys?.length
      ? draft.included_option_keys
      : draft.hotel_options.map((option) => option.key),
  );
  const scenarioOptions = draft.commercial_mode === "transport_only"
    ? draft.hotel_options.slice(0, 1)
    : draft.hotel_options.filter((option) => includedKeys.has(option.key));
  const scenarioDefs: CostScenario[] = draft.scenarios?.length
    ? draft.scenarios
    : scenarioOptions.flatMap((option) => {
        const vehicles = draft.transport.length ? draft.transport : [undefined];
        return vehicles.map((vehicle, index) => ({
          id: `saved-${option.key}-${vehicle?.id ?? index}`,
          label: `${option.category || `Option ${option.key}`}${vehicle ? " + vehicle" : ""}`,
          option_key: option.key,
          transport_line_id: vehicle?.id,
        }));
      });
  const scenarioResults = scenarioDefs
    .map((definition) => ({ definition, result: computeScenario(draft, definition, d) }))
    .filter((entry): entry is { definition: CostScenario; result: NonNullable<ReturnType<typeof computeScenario>> } => Boolean(entry.result));
  const primaryEntry = scenarioResults.find((entry) => entry.definition.option_key === draft.recommended_option)
    ?? scenarioResults[0];
  if (!primaryEntry) throw new Error("Quotation has no valid costing variation to save.");
  const primaryScenario = primaryEntry.result;
  const primaryTransport = primaryEntry.definition.transport_line_id
    ? draft.transport.find((line) => line.id === primaryEntry.definition.transport_line_id)
    : undefined;
  const primaryLand = buildLandPart(draft, d, primaryTransport);

  const aggregateSelected = (bucket: "transport_opts" | "guide_opts" | "entrance_opts" | "activity_opts" | "misc_opts") => {
    const grouped = new Map<string, { label: string; amount: number; days: Set<number> }>();
    primaryLand.rows.forEach((row) => {
      row[bucket].filter((option: SheetOption) => option.checked && option.amount > 0).forEach((option: SheetOption) => {
        const key = `${option.id}|${option.label}`;
        const current = grouped.get(key) ?? { label: option.label, amount: 0, days: new Set<number>() };
        current.amount += option.amount;
        current.days.add(row.day);
        grouped.set(key, current);
      });
    });
    return Array.from(grouped.values());
  };
  const selectedTransport = aggregateSelected("transport_opts");
  const selectedGuides = aggregateSelected("guide_opts");
  const selectedEntrances = aggregateSelected("entrance_opts");
  const selectedActivities = aggregateSelected("activity_opts");
  const selectedMisc = aggregateSelected("misc_opts");

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
    travels: selectedTransport.map((item) => ({
      name: item.label, days: item.days.size, vehicles: primaryTransport?.vehicles || 1,
      rate_per_day: item.days.size ? item.amount / item.days.size : item.amount, total: item.amount,
    })),
    miscellaneous: selectedMisc.map((item) => ({
      name: item.label, pax: 1, rate: item.amount, unit: "selected service", total: item.amount,
    })),
    guide: selectedGuides.map((item) => ({
      name: item.label, type: "Selected guide service", days: item.days.size, count: 1,
      rate_per_day: item.days.size ? item.amount / item.days.size : item.amount, total: item.amount,
    })),
    entrances: selectedEntrances.map((item) => ({
      site_name: item.label, city: "As per itinerary", indian_pax: 0, indian_rate: 0,
      foreigner_pax: 0, foreigner_rate: 0, total: item.amount,
    })),
    activities: selectedActivities.map((item) => ({
      name: item.label, destination: "As per itinerary", pricing_type: "selected",
      qty: 1, rate: item.amount, total: item.amount,
    })),
    optional_supplements: draft.optionals.map((item) => {
      const activity = item.activity_id ? d.activities.find((entry) => entry.id === item.activity_id) : null;
      return {
        name: activity?.activity_name || item.custom_name || "Optional service",
        qty: item.qty,
        rate: item.rate,
        total: item.qty * item.rate,
      };
    }),
    addons_total: primaryScenario.addons_total,
  };

  // Build a Query-facing snapshot from every hotel option, independently of
  // which option is recommended for the quotation document. This is what lets
  // a fresh Query start with blank commercial fields and receive its actual
  // range only after Costing/Quotation is saved.
  const rangeResults = scenarioResults.map((entry) => entry.result);
  const hotelCategories = Array.from(new Set([
    ...draft.hotel_options.map((option) => option.category || option.label).filter(Boolean),
    ...itinerary.map((day) => day.hotel_category).filter((value) => value && value !== "—"),
  ] as string[]));
  const quotedPax = Math.max(1, effectivePaxForPricing(draft));
  const requestedRange = parsePaxRange(draft);
  const queryPaxMin = requestedRange?.min ?? (draft.query_type === "Brochure"
    ? Math.max(1, draft.pax_min ?? quotedPax)
    : quotedPax);
  const queryPaxMax = requestedRange?.max ?? (draft.query_type === "Brochure"
    ? Math.max(queryPaxMin, draft.pax_max ?? queryPaxMin)
    : quotedPax);
  const selectedMeals = computeMealDays(draft, d, primaryEntry.definition.option_key).rows;
  const hotelNet = primaryScenario.persons.reduce((sum, person) => sum + person.hotel_net, 0);
  const hotelSupplierGst = primaryScenario.persons.reduce((sum, person) => sum + person.hotel_gst, 0);
  const savedRateSheetRows = scenarioOptions.flatMap((option) =>
    buildRateSheet(draft, d, option, draft.transport).flatMap((group) => {
      const selectionKey = `${option.key}|${group.line_id ?? group.vehicle}`;
      const selectedPax = draft.rate_sheet_rows?.[selectionKey] ?? [];
      return group.rows
        .filter((row) => selectedPax.includes(row.pax))
        .map((row) => ({
          option_key: option.key,
          option_label: option.category || option.label || `Option ${option.key}`,
          vehicle: group.vehicle,
          pax: row.pax,
          single: row.pkg_single,
          double: row.pkg_double,
          triple: row.pkg_triple,
          quad: row.pkg_quad,
        }));
    }),
  );
  const scenarioRangeValues = rangeResults
    .map((result) => result!.grand_total)
    .filter((value) => Number.isFinite(value) && value > 0);
  const selectedRangeValues = savedRateSheetRows.flatMap((row) =>
    [row.single, row.double, row.triple, row.quad]
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => value * row.pax),
  );
  const rangeValues = requestedRange && selectedRangeValues.length
    ? selectedRangeValues
    : scenarioRangeValues;

  const q: SavedQuote = {
    id,
    query_id: draft.linked_query_id,
    family_id: identity.family_id || id,
    version,
    quote_number: quoteNumber,
    display_number: `${quoteNumber}-V${version}`,
    status: "Generated",
    saved_at: now,
    saved_by: savedBy,
    generated_at: now,
    generated_by: savedBy,
    revision_of_quote_id: identity.revision_of_quote_id,
    revision_reason: draft.revision_reason,
    audit_log: [{
      at: now,
      by: savedBy,
      action: "generated",
      detail: version > 1
        ? `Revision V${version} finalised${draft.revision_reason ? `: ${draft.revision_reason}` : ""}`
        : "Quotation finalised and locked",
    }],
    draft_snapshot: JSON.parse(JSON.stringify(draft)) as QuoteDraft,
    tour_title: draft.program_name || `${draft.query_type} Tour`,
    cities: Array.from(routingCities),
    total_nights: draft.nights,
    travel_start: draft.start_date,
    travel_end: addDaysISO(draft.start_date, draft.nights),
    itinerary,
    addons: addonsBlock,
    inclusions: {
      accommodation_nights: draft.commercial_mode === "transport_only" ? 0 : draft.nights,
      breakfast_count: draft.commercial_mode === "transport_only" ? 0 : draft.nights,
      lunch_count: selectedMeals.filter((meal) => meal.meal_type === "Lunch").length,
      dinner_count: selectedMeals.filter((meal) => meal.meal_type === "Dinner").length,
      travels_included: primaryScenario.transport_total > 0,
      guide_included: primaryScenario.guide_total > 0,
    },
    markup_percent: draft.markup_percent,
    totals: {
      room_net_sgl: hotelNet, room_net_dbl: hotelNet, room_net_trp: hotelNet,
      gst_rooms_sgl: hotelSupplierGst, gst_rooms_dbl: hotelSupplierGst, gst_rooms_trp: hotelSupplierGst,
      addons_total: primaryScenario.addons_total,
      markup_sgl: primaryScenario.markup_total, markup_dbl: primaryScenario.markup_total, markup_trp: primaryScenario.markup_total,
      gst_markup_sgl: primaryScenario.gst5_total, gst_markup_dbl: primaryScenario.gst5_total, gst_markup_trp: primaryScenario.gst5_total,
      grand_sgl: primaryScenario.grand_total, grand_dbl: primaryScenario.grand_total, grand_trp: primaryScenario.grand_total,
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
      return scenarioResults
        .map(({ result: res }) => {
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
    rate_sheet_rows: savedRateSheetRows,
    query_snapshot: {
      program_id: draft.program_id,
      program_name: draft.program_name || undefined,
      routing: Array.from(routingCities).join(" → ") || undefined,
      pax_min: queryPaxMin,
      pax_max: queryPaxMax,
      hotel_categories: hotelCategories,
      bottom_line: rangeValues.length ? Math.min(...rangeValues) : 0,
      top_line: rangeValues.length ? Math.max(...rangeValues) : 0,
    },
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
