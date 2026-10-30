import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { addDaysISO, inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import { getQuotationScope } from "@/lib/query-for";
import {
  calculateMealCostingRows,
  computeMealDays,
  dynamicAccommodationBreakdown,
  effectiveAccommodationPax,
  getCostingPaxValues,
  quotationPaxLabel,
  gstRateFor,
  hotelsGst,
  hotelsMarkup,
} from "@/lib/wizard/calc";
import { buildLandPart, buildRateSheet } from "@/lib/wizard/costsheet";
import { guideLanguageCostingForPax, guideServicesForPax } from "@/lib/wizard/guide-costing";
import { applyLandCommercials } from "@/lib/wizard/land-pricing";
import { findRatePlan } from "@/lib/wizard/rate-lookup";
import {
  hotelSelectionForDay,
  isDynamicAccommodationMode,
  type HotelOption,
  type QuoteDraft,
} from "@/lib/wizard/types";
import { CommercialPackageMatrix } from "./CommercialPackageMatrix";
import { PackageStandardCostingReview } from "./PackageStandardCostingReview";
import { AccommodationDynamicCostingReview } from "./AccommodationDynamicCostingReview";

type SetDraft = (patch: Partial<QuoteDraft>) => void;
const table =
  "w-full text-[11px] border-separate border-spacing-0 border-l border-t border-[#d7e2ed] [&_td]:border-b [&_td]:border-r [&_td]:border-[#d7e2ed] [&_td]:px-2 [&_td]:py-1.5 [&_th]:border-b [&_th]:border-r [&_th]:border-[#d7e2ed] [&_th]:px-2 [&_th]:py-1.5";
const money = (value: number | undefined) =>
  value == null || !Number.isFinite(value) ? "Rate not available" : inr(value);

function Section({
  title,
  number,
  children,
}: {
  title: string;
  number?: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-sm border-[#d7e2ed] shadow-none">
      <div
        className={
          number
            ? "bg-[#103353] px-3 py-2 text-sm font-semibold text-white"
            : "border-b bg-[#f0f4f8] px-3 py-1.5 text-xs font-semibold text-[#103353]"
        }
      >
        {number ? `${number}. ${title}` : title}
      </div>
      {children}
    </Card>
  );
}

function Panel({
  title,
  helper,
  children,
}: {
  title: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-sm border border-[#d7e2ed]">
      <div className="flex items-center justify-between gap-3 bg-[#f5f8fb] px-3 py-1.5">
        <span className="text-xs font-semibold text-[#103353]">{title}</span>
        {helper && <span className="text-[9px] text-[#73849b]">{helper}</span>}
      </div>
      {children}
    </div>
  );
}

function Context({ draft }: { draft: QuoteDraft }) {
  const db = useDB();
  const city = (id?: string) => db.cities.find((item) => item.id === id)?.name;
  const routing = draft.routing
    .map((day) => city(day.city_id) || day.to_city)
    .filter(Boolean)
    .join(" → ");
  const pax = useMemo(() => getCostingPaxValues(draft), [draft]);
  const rows = [
    ["Client / Travel Partner", draft.agent?.agency || draft.agent?.name || "—"],
    ["Query / Quotation", draft.linked_query_id || "Draft quotation"],
    ["Programme", draft.program_name || "—"],
    [
      "Travel dates",
      `${draft.start_date || "—"} — ${draft.start_date ? addDaysISO(draft.start_date, draft.nights || 0) : "—"}`,
    ],
    ["Duration", `${draft.nights || 0} Nights / ${(draft.nights || 0) + 1} Days`],
    ["Travellers", `${quotationPaxLabel(draft)} · ${draft.tour_type || "—"}`],
  ];
  return (
    <Section title="Trip Information" number={1}>
      <div className="overflow-x-auto">
        <table className={`${table} min-w-[850px]`}>
          <tbody>
            <tr>
              {rows.map(([label, value]) => (
                <td key={label} className="w-1/6 align-top">
                  <div className="text-[9px] uppercase tracking-wide text-[#73849b]">{label}</div>
                  <div className="mt-0.5 font-medium text-[#1a3045]">{value}</div>
                </td>
              ))}
            </tr>
            <tr>
              <td colSpan={6} className="bg-[#f5f8fb] text-[#1a3045]">
                <b>Routing:</b> {routing || "—"}
                <span className="mx-2 text-[#73849b]">·</span>Tour type: {draft.tour_type || "—"}
                <span className="mx-2 text-[#73849b]">·</span>Traveller type:{" "}
                {draft.traveler_type || "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function LandReview({ draft }: { draft: QuoteDraft }) {
  const db = useDB();
  const sheet = useMemo(() => buildLandPart(draft, db), [draft, db]);
  const totals = [
    ["Transport", sheet.transport_total],
    ["Guides", sheet.guide_only_total],
    ["Tour Escort", sheet.escort_total],
    ["Entrances", sheet.entrances_total],
    ["Activities / Experiences", sheet.activities_total],
    ["Miscellaneous", sheet.misc_total],
  ].filter(([, value]) => Number(value) > 0);
  return (
    <Section title="Land Services — Pricing & Selection Review">
      <div className="overflow-x-auto">
        <table className={table}>
          <thead className="bg-blue-50 text-[10px] uppercase text-blue-900">
            <tr>
              <th className="text-left">Service</th>
              <th className="text-right">Finalized Cost</th>
            </tr>
          </thead>
          <tbody>
            {totals.length ? (
              totals.map(([name, value]) => (
                <tr key={String(name)}>
                  <td>{name}</td>
                  <td className="text-right tabular-nums">{money(Number(value))}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="text-center text-muted-foreground">
                  No included land services selected.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold">
            <tr>
              <td>Included Land Total</td>
              <td className="text-right tabular-nums">{money(sheet.grand_total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  );
}

function StayPlan({
  draft,
  options,
  dynamic = false,
}: {
  draft: QuoteDraft;
  options: HotelOption[];
  dynamic?: boolean;
}) {
  const db = useDB();
  const city = (id: string) => db.cities.find((item) => item.id === id)?.name || "—";
  return (
    <Section title="Hotel Foreseen / Stay Plan">
      <div className="overflow-x-auto">
        <table className={`${table} min-w-[760px]`}>
          <thead className="bg-indigo-50 text-[10px] uppercase text-indigo-900">
            <tr>
              <th>Check-in</th>
              <th>Check-out</th>
              <th className="text-left">City</th>
              <th>Nights</th>
              {options.map((option) => (
                <th key={option.key} className="text-left">
                  Option {option.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.routing
              .filter((day) => day.overnight)
              .map((day, index) => (
                <tr key={day.day}>
                  <td>{day.date}</td>
                  <td>{draft.routing.find((item) => item.day === day.day + 1)?.date || "—"}</td>
                  <td>{city(day.city_id)}</td>
                  <td>1</td>
                  {options.map((option) => {
                    const selection = hotelSelectionForDay(option, day, dynamic);
                    const hotel = db.hotels.find((item) => item.id === selection?.hotel_id);
                    const room = db.room_categories.find((item) => item.id === selection?.room_id);
                    return (
                      <td key={option.key} className="whitespace-normal">
                        {selection?.no_hotel ? (
                          "No Hotel"
                        ) : selection ? (
                          <>
                            <div className="font-medium">{hotel?.name || "Rate not available"}</div>
                            <div className="text-muted-foreground">
                              {room?.name || "—"} · {selection.meal_plan}
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function StandardAccommodationReview({
  draft,
  options,
}: {
  draft: QuoteDraft;
  options: HotelOption[];
}) {
  const db = useDB();
  const standardDraft = useMemo(
    () => ({ ...draft, allocation_mode: "standard" as const, dynamic_days: [] }),
    [draft],
  );
  const rates = useMemo(
    () =>
      new Map(
        options.map((option) => [
          option.key,
          buildRateSheet(standardDraft, db, option, []).flatMap((group) => group.rows)[0],
        ]),
      ),
    [options, standardDraft, db],
  );
  return (
    <div className="space-y-3">
      <StayPlan draft={draft} options={options} />
      <Section title="Accommodation & Meals — Standard Verification">
        <div className="overflow-x-auto">
          <table className={`${table} min-w-[900px]`}>
            <thead className="bg-indigo-50 text-[10px] uppercase text-indigo-900">
              <tr>
                <th className="text-left">Option</th>
                <th className="text-right">Lunch PP</th>
                <th className="text-right">Dinner PP</th>
                <th className="text-right">SGL PP</th>
                <th className="text-right">DBL PP</th>
                <th className="text-right">TRP PP</th>
              </tr>
            </thead>
            <tbody>
              {options.map((option) => {
                const rate = rates.get(option.key);
                return (
                  <tr key={option.key}>
                    <td>
                      Option {option.key} · {option.category || option.label || "Accommodation"}
                    </td>
                    <td className="text-right tabular-nums">{money(rate?.lunch)}</td>
                    <td className="text-right tabular-nums">{money(rate?.dinner)}</td>
                    <td className="text-right tabular-nums">{money(rate?.single)}</td>
                    <td className="text-right tabular-nums">{money(rate?.double)}</td>
                    <td className="text-right tabular-nums">{money(rate?.triple)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid gap-px border-t bg-slate-200 sm:grid-cols-3">
          {options.flatMap((option) => {
            const rate = rates.get(option.key);
            const meals = (rate?.lunch ?? 0) + (rate?.dinner ?? 0);
            return [
              ["SGL", rate?.single],
              ["DBL", rate?.double],
              ["TRP", rate?.triple],
            ].map(([occupancy, accommodation]) => (
              <div
                key={`${option.key}-${occupancy}`}
                className="bg-emerald-50 p-2 text-xs text-emerald-950"
              >
                Option {option.key} · {occupancy} — Final Accommodation + Meals PP
                <div className="font-semibold tabular-nums">
                  {typeof accommodation === "number"
                    ? money(accommodation + meals)
                    : "Rate not available"}
                </div>
              </div>
            ));
          })}
        </div>
      </Section>
    </div>
  );
}

function DynamicAccommodationReview({
  draft,
  options,
}: {
  draft: QuoteDraft;
  options: HotelOption[];
}) {
  const db = useDB();
  return (
    <div className="space-y-3">
      <StayPlan draft={draft} options={options} dynamic />
      <Section title="Accommodation & Meals — Dynamic Mode Verification">
        <div className="overflow-x-auto">
          <table className={`${table} min-w-[900px]`}>
            <thead className="bg-indigo-50 text-[10px] uppercase text-indigo-900">
              <tr>
                <th className="text-left">Option / Day</th>
                <th className="text-left">Hotel</th>
                <th className="text-left">Room Category</th>
                <th>Occupancy</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Net</th>
                <th className="text-right">Supplier GST</th>
                <th className="text-right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {options.flatMap((option) =>
                Object.entries(option.dynamic_allocations ?? {}).flatMap(
                  ([dayNumber, allocations]) =>
                    allocations.map((allocation) => {
                      const day = draft.routing.find((item) => item.day === Number(dayNumber));
                      const room = db.room_categories.find(
                        (item) => item.id === allocation.room_id,
                      );
                      const selection = day ? hotelSelectionForDay(option, day, true) : undefined;
                      const hotel = selection
                        ? db.hotels.find((item) => item.id === selection.hotel_id)
                        : undefined;
                      const plan =
                        room && selection && day
                          ? findRatePlan(db.rate_plans, room.id, selection.meal_plan, day.date)
                          : null;
                      const rate =
                        allocation.manual_net_rate ??
                        (allocation.occupancy === "single"
                          ? plan?.single_rate
                          : allocation.occupancy === "triple"
                            ? (plan?.double_rate ?? 0) + (plan?.extra_bed_rate ?? 0)
                            : allocation.occupancy === "quad"
                              ? plan?.quad_rate
                              : plan?.double_rate) ??
                        0;
                      const net = rate * allocation.rooms;
                      const supplierGst = net * gstRateFor(rate);
                      return (
                        <tr key={allocation.id}>
                          <td>
                            Option {option.key} · Day {dayNumber}
                          </td>
                          <td>{hotel?.name || "Hotel not selected"}</td>
                          <td>{room?.name || "Rate not available"}</td>
                          <td className="capitalize">{allocation.occupancy}</td>
                          <td className="text-right">{allocation.rooms}</td>
                          <td className="text-right tabular-nums">{money(net)}</td>
                          <td className="text-right tabular-nums">{money(supplierGst)}</td>
                          <td className="text-right tabular-nums">{money(net + supplierGst)}</td>
                        </tr>
                      );
                    }),
                ),
              )}
            </tbody>
          </table>
        </div>
        {options.map((option) => {
          const total = dynamicAccommodationBreakdown(draft, option, db).total;
          const pax = Math.max(1, effectiveAccommodationPax(draft, option));
          const meals = computeMealDays(draft, db, option.key).rows;
          const lunch =
            meals
              .filter((item) => item.meal_type === "Lunch")
              .reduce((sum, item) => sum + item.total, 0) / pax;
          const dinner =
            meals
              .filter((item) => item.meal_type === "Dinner")
              .reduce((sum, item) => sum + item.total, 0) / pax;
          const accommodation = (total * (1 + hotelsMarkup(draft)) * (1 + hotelsGst(draft))) / pax;
          return (
            <div
              key={option.key}
              className="grid grid-cols-2 gap-px border bg-slate-200 text-xs sm:grid-cols-4"
            >
              <div className="bg-white p-2">
                Option {option.key} Accommodation PP
                <br />
                <b>{money(accommodation)}</b>
              </div>
              <div className="bg-white p-2">
                Included Lunch PP
                <br />
                <b>{money(lunch * (1 + hotelsMarkup(draft)) * (1 + hotelsGst(draft)))}</b>
              </div>
              <div className="bg-white p-2">
                Included Dinner PP
                <br />
                <b>{money(dinner * (1 + hotelsMarkup(draft)) * (1 + hotelsGst(draft)))}</b>
              </div>
              <div className="bg-emerald-50 p-2 text-emerald-950">
                Final Accommodation + Meals PP
                <br />
                <b>
                  {money(
                    accommodation +
                      lunch * (1 + hotelsMarkup(draft)) * (1 + hotelsGst(draft)) +
                      dinner * (1 + hotelsMarkup(draft)) * (1 + hotelsGst(draft)),
                  )}
                </b>
              </div>
            </div>
          );
        })}
      </Section>
    </div>
  );
}

function LandCommercialMatrix({ draft }: { draft: QuoteDraft }) {
  const db = useDB();
  const { rows, meals } = useMemo(() => {
    const fake: HotelOption = { key: "A", label: "Land", selections: [] };
    return {
      rows: buildRateSheet(
        { ...draft, allocation_mode: "standard", dynamic_days: [] },
        db,
        fake,
        draft.transport,
      ).flatMap((group) => group.rows.map((row) => ({ group, row }))),
      meals: computeMealDays(draft, db, "A").rows,
    };
  }, [draft, db]);
  const lunch =
    meals
      .filter((item) => item.meal_type === "Lunch")
      .reduce((sum, item) => sum + item.per_person, 0) *
    (1 + hotelsMarkup(draft)) *
    (1 + hotelsGst(draft));
  const dinner =
    meals
      .filter((item) => item.meal_type === "Dinner")
      .reduce((sum, item) => sum + item.per_person, 0) *
    (1 + hotelsMarkup(draft)) *
    (1 + hotelsGst(draft));
  const hasMeals = lunch > 0 || dinner > 0;
  const vehicleLabel = (lineId: string | undefined, fallback: string) => {
    const option = draft.transport_options?.find((item) => item.id === lineId);
    const parts = option?.vehicles.flatMap((selection) => {
      const line = draft.transport.find((item) => item.id === selection.transport_line_id);
      const vehicle =
        line && db.travel_options.find((item) => item.id === line.travel_id)?.vehicle_type;
      return vehicle ? [`${Math.max(1, selection.quantity || 1)} ${vehicle}`] : [];
    });
    return parts?.length ? parts.join(" + ") : fallback;
  };
  return (
    <Section
      title={hasMeals ? "Land + Meals — Commercial Matrix" : "Land Only — Commercial Matrix"}
    >
      <div className="overflow-x-auto">
        <table className={`${table} min-w-[1050px]`}>
          <thead className="bg-blue-50 text-[10px] uppercase text-blue-900">
            <tr>
              <th className="text-left">Vehicle / Combination</th>
              <th className="text-right">Pax</th>
              {["Transport", "Entrances", "Guide", "Activities", "Misc", "Land Total"].map(
                (label) => (
                  <th key={label} className="text-right">
                    {label} PP
                  </th>
                ),
              )}
              {hasMeals && (
                <>
                  <th className="text-right">Lunch PP</th>
                  <th className="text-right">Dinner PP</th>
                </>
              )}
              <th className="text-right">Final {hasMeals ? "Land + Meals" : "Land"} Price PP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ group, row }) => {
              const land =
                row.transport + row.entrances + row.guide + row.escort + row.activities + row.misc;
              return (
                <tr key={`${group.line_id || group.vehicle}-${row.pax}`}>
                  <td>{vehicleLabel(group.line_id, row.vehicle)}</td>
                  <td className="text-right">{row.pax}</td>
                  {[
                    row.transport,
                    row.entrances,
                    row.guide + row.escort,
                    row.activities,
                    row.misc,
                    land,
                  ].map((value, index) => (
                    <td key={index} className="text-right tabular-nums">
                      {money(value)}
                    </td>
                  ))}
                  {hasMeals && (
                    <>
                      <td className="text-right tabular-nums">{money(lunch)}</td>
                      <td className="text-right tabular-nums">{money(dinner)}</td>
                    </>
                  )}
                  <td className="bg-emerald-50 text-right font-semibold tabular-nums">
                    {money(land + lunch + dinner)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function OptionalServices({ draft }: { draft: QuoteDraft }) {
  const db = useDB();
  const guideSlabs = [
    { label: "1–6 Pax", pax: 6 },
    { label: "7–14 Pax", pax: 14 },
    { label: "15+ Pax", pax: 15 },
  ];
  const guideRows = guideSlabs.flatMap((slab) =>
    ["Hindi", "English", "Language"].flatMap((language) => {
      const costing = guideLanguageCostingForPax(
        draft,
        db,
        slab.pax,
        language as "Hindi" | "English" | "Language",
      );
      return costing.optionalRows.map((row) => ({
        kind: "Guide",
        group: `${language === "Language" ? "Other Language" : language} · ${slab.label}`,
        label: `${language === "Language" ? "Other Language" : language} · ${slab.label} · Day ${row.day} · ${row.tour} · ${row.guideName}`,
        base: row.base,
      }));
    }),
  );
  const optionalActivities = draft.activities.filter(
    (item) => item.inclusion_status === "optional",
  );
  const options = new Set([
    ...Object.keys(draft.meal_selections_by_option ?? {}),
    ...(draft.meal_selections ? ["A"] : []),
  ]);
  const optionalMeals = [...options].flatMap((key) =>
    calculateMealCostingRows(draft, db, key as "A" | "B" | "C" | "D")
      .filter((row) => row.status === "optional")
      .map((row) => ({
        kind: "Meal",
        group: `Option ${key} · Optional ${row.meal_type}`,
        label: `Option ${key} · Day ${row.day} · ${row.date} · ${row.meal_type} · ${row.label}`,
        base: row.total,
      })),
  );
  const rows = [
    ...guideRows,
    ...optionalActivities.map((item) => ({
      kind: "Activity",
      group: "Optional Activities",
      label:
        db.activities.find((activity) => activity.id === item.activity_id)?.activity_name ||
        "Activity",
      base: item.rate * item.qty,
    })),
    ...optionalMeals,
  ];
  const groupTotals = Array.from(
    rows.reduce(
      (groups, row) => groups.set(row.group, (groups.get(row.group) ?? 0) + row.base),
      new Map<string, number>(),
    ),
    ([group, base]) => ({ group, commercial: applyLandCommercials(draft, base, 0.05) }),
  );
  return (
    <Section title="Optional Services — Additional Sale">
      <div className="overflow-x-auto">
        <table className={table}>
          <thead className="bg-amber-50 text-[10px] uppercase text-amber-900">
            <tr>
              <th className="text-left">Type</th>
              <th className="text-left">Service</th>
              <th className="text-right">Base Total</th>
              <th className="text-right">Markup</th>
              <th className="text-right">GST</th>
              <th className="text-right">Final Selling Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => {
                const commercial = applyLandCommercials(draft, row.base, 0.05);
                return (
                  <tr key={`${row.kind}-${row.label}-${index}`}>
                    <td>{row.kind}</td>
                    <td>{row.label}</td>
                    <td className="text-right tabular-nums">{money(row.base)}</td>
                    <td className="text-right tabular-nums">{money(commercial.markup)}</td>
                    <td className="text-right tabular-nums">{money(commercial.gst)}</td>
                    <td className="text-right tabular-nums">{money(commercial.final)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="text-center text-muted-foreground">
                  No optional services selected.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t bg-amber-50 font-semibold">
              {groupTotals.map(({ group, commercial }) => (
                <tr key={group}>
                  <td colSpan={2}>{group} Total</td>
                  <td className="text-right">{money(commercial.base)}</td>
                  <td className="text-right">{money(commercial.markup)}</td>
                  <td className="text-right">{money(commercial.gst)}</td>
                  <td className="text-right">{money(commercial.final)}</td>
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
    </Section>
  );
}

function FinalCostingWorkspaceImpl({
  draft,
  set,
  readOnly = false,
}: {
  draft: QuoteDraft;
  set: SetDraft;
  readOnly?: boolean;
}) {
  const scope = getQuotationScope(draft.query_for, draft.commercial_mode);
  const dynamic = isDynamicAccommodationMode(draft);
  const options = draft.hotel_options.filter((option) => option.selections.length > 0).slice(0, 4);
  if (scope.landPart || (!scope.landPart && scope.accommodationPart)) {
    return <PackageStandardCostingReview draft={draft} set={set} readOnly={readOnly} />;
  }
  if (!scope.landPart && scope.accommodationPart && dynamic) {
    const reference = draft.linked_query_id || draft.linked_query_name || "Draft quotation";
    return (
      <div className="space-y-2 rounded-sm bg-white p-1 text-[#16344f]">
        <div className="flex items-start justify-between border-b-2 border-[#103353] px-2 py-2">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.12em] text-[#204e76]">
              QUOTATION BUILDER · INTERNAL PRICING REVIEW
            </div>
            <h2 className="mt-1 text-xl font-semibold text-[#103353]">
              Final Quotation Review · Accommodation + Meals · Dynamic Mode
            </h2>
            <p className="mt-1 text-[9px] text-[#73849b]">
              Trip Basics · Hotel Foreseen · Dynamic Room-wise Rate Verification · Final
              Accommodation &amp; Selected Meals Price PP
            </p>
          </div>
          <div className="text-right text-[10px] text-[#73849b]">
            <div className="font-semibold text-[#103353]">{reference}</div>
            <div>{draft.linked_query_id ? "Linked query · Draft" : "Draft quotation"}</div>
          </div>
        </div>
        <AccommodationDynamicCostingReview
          draft={draft}
          options={draft.hotel_options.slice(0, 4)}
        />
      </div>
    );
  }
  const title = !scope.landPart
    ? `Final Quotation Review · Accommodation + Meals · ${dynamic ? "Dynamic" : "Standard"} Mode`
    : !scope.accommodationPart
      ? "Final Quotation Review · Land Only"
      : dynamic
        ? "Final Quotation Review · Package · Dynamic Hotel Mode"
        : "Final Quotation Review";
  return (
    <div className="space-y-3 rounded-sm bg-white p-1 text-[#1a3045]">
      <div className="flex items-start justify-between border-b-2 border-[#103353] px-2 py-3">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.12em] text-[#204e76]">
            QUOTATION BUILDER · INTERNAL PRICING REVIEW
          </div>
          <h2 className="mt-1 text-xl font-semibold text-[#103353]">{title}</h2>
          <p className="mt-1 text-[10px] text-[#73849b]">
            Resolved quotation pricing review · view only
          </p>
        </div>
        <div className="text-right text-[10px] text-[#73849b]">
          <div className="font-semibold text-[#103353]">
            {draft.linked_query_id || "Draft quotation"}
          </div>
          <div>Draft</div>
        </div>
      </div>
      <Context draft={draft} />
      {scope.landPart && <LandReview draft={draft} />}
      {scope.accommodationPart &&
        (dynamic ? (
          <DynamicAccommodationReview draft={draft} options={options} />
        ) : (
          <StandardAccommodationReview draft={draft} options={options} />
        ))}
      {scope.landPart && scope.accommodationPart && !dynamic && (
        <CommercialPackageMatrix draft={draft} set={set} readOnly={readOnly} />
      )}
      {scope.landPart && (!scope.accommodationPart || dynamic) && (
        <LandCommercialMatrix draft={draft} />
      )}
      {scope.landPart && <OptionalServices draft={draft} />}
    </div>
  );
}

export const FinalCostingWorkspace = memo(
  FinalCostingWorkspaceImpl,
  (previous, next) => previous.draft === next.draft && previous.readOnly === next.readOnly,
);
