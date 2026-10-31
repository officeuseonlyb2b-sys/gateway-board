import { memo, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { addDaysISO, inr } from "@/lib/format";
import { getQuotationScope } from "@/lib/query-for";
import {
  GUIDE_LANGUAGES,
  activitySlabsFor,
  guideConfiguredLanguages,
  guidePrimaryLanguage,
  miscRateForPax,
  useDB,
  type Activity,
  type GuideLanguage,
} from "@/lib/mock-store";
import {
  calculateMealCostingRows,
  computeMealDays,
  effectivePaxForPricing,
  getCostingPaxValues,
  paxRangeActive,
  parsePaxRange,
  quotationPaxLabel,
  gstRateFor,
  hotelsGst,
  hotelsMarkup,
  landGst,
  landMarkup,
  mealCostingTotal,
  mealPlanCoverage,
  transportLineTotal,
} from "@/lib/wizard/calc";
import {
  buildHotelMealSheet,
  buildLandPart,
  buildRateSheet,
  catPicked,
  guideOptId,
  entranceTourSelected,
  entranceRateSelected,
  isPicked,
} from "@/lib/wizard/costsheet";
import {
  applyLandCommercials,
  optionalActivitySellingRows,
  transportOptionRows,
  transportOptionTotal,
} from "@/lib/wizard/land-pricing";
import { findRatePlan } from "@/lib/wizard/rate-lookup";
import {
  guideReviewRates,
  guideReviewSlabs,
  landReviewRouteLabel,
  landReviewToursForDay,
  type LandReviewTourRow,
} from "@/lib/wizard/land-review";
import {
  hotelSelectionForDay,
  isAccommodationNightForOption,
  isDynamicAccommodationMode,
  type HotelOption,
  type OptionKey,
  type ActivityLine,
  type LandReviewDisplaySelection,
  type QuoteDraft,
  type RoutingDay,
} from "@/lib/wizard/types";
import {
  eligibleEntrancesForDay,
  eligibleGuidesForDay,
  isSelectedLandServiceValid,
  landDayContext,
} from "@/lib/wizard/land-eligibility";
import {
  escortDayAppliesToPax,
  getEscortDayCharge,
  getEscortPricingMode,
  getEscortRangeBase,
  getEscortRangeDayCharge,
} from "@/lib/wizard/guide-pricing";
import { CommercialPackageMatrix } from "./CommercialPackageMatrix";
import { AccommodationDynamicCostingReview } from "./AccommodationDynamicCostingReview";
import { LandDaywiseReview, type LandReviewFilters } from "./LandDaywiseReview";

type SetDraft = (patch: Partial<QuoteDraft>) => void;
const grid =
  "w-full border-separate border-spacing-0 border-l border-t border-[#d7e2ed] text-[10px] text-[#1a3045] [&_td]:border-b [&_td]:border-r [&_td]:border-[#d7e2ed] [&_td]:px-2 [&_td]:py-1.5 [&_th]:border-b [&_th]:border-r [&_th]:border-[#d7e2ed] [&_th]:px-2 [&_th]:py-1.5";
const money = (value?: number) => (value == null || !Number.isFinite(value) ? "—" : inr(value));
const gross = (base: number, markup: number, gst: number) => base * (1 + markup) * (1 + gst);

/** Presentation-only filter: Brochure pricing may be pax-wise in the matrix,
 * while activity reviews retain the source slab schedule that overlaps it. */
function activityRateAppliesToReview(
  draft: QuoteDraft,
  pax: number,
  row: { rate_basis: string; min_pax?: number; max_pax?: number },
) {
  if (row.rate_basis !== "custom_slab" || row.min_pax == null || row.max_pax == null) return true;
  const range = paxRangeActive(draft) ? parsePaxRange(draft) : null;
  return range
    ? row.min_pax <= range.max && row.max_pax >= range.min
    : pax >= row.min_pax && pax <= row.max_pax;
}

/**
 * Step 7 persists the selected activity's active rate on the draft line. The
 * included review may show the activity's slab schedule, but it must not turn
 * overlapping master rows into additional selections. Master slabs have no
 * variant label, so one row per traveller-specific Pax range is the only
 * unambiguous presentation; the active range is anchored to the saved rate.
 */
export function includedActivitySellingRows(
  draft: QuoteDraft,
  line: ActivityLine,
  activity: Activity,
  pax: number,
) {
  const slabs = activitySlabsFor(activity, draft.traveler_type || "indian")
    .filter(
      (slab) =>
        Number.isFinite(slab.from_pax) &&
        Number.isFinite(slab.to_pax) &&
        Number.isFinite(slab.price) &&
        slab.from_pax > 0 &&
        slab.to_pax >= slab.from_pax,
    )
    .sort((left, right) => left.from_pax - right.from_pax);

  if (line.pricing_mode === "slab" || slabs.length) {
    const schedule = slabs.length
      ? slabs.map((slab) => ({
          id: slab.id,
          from_pax: slab.from_pax,
          to_pax: slab.to_pax,
          price: slab.price,
        }))
      : optionalActivitySellingRows(draft, activity, draft.traveler_type || "indian", pax).flatMap(
          (row) =>
            row.rate_basis === "custom_slab" && row.min_pax && row.max_pax
              ? [{ id: row.id, from_pax: row.min_pax, to_pax: row.max_pax, price: row.base_rate }]
              : [],
        );
    const byRange = new Map<string, (typeof schedule)[number]>();
    schedule.forEach((slab) => {
      const key = `${slab.from_pax}-${slab.to_pax}`;
      const savedRateMatch = pax >= slab.from_pax && pax <= slab.to_pax && slab.price === line.rate;
      if (!byRange.has(key) || savedRateMatch) byRange.set(key, slab);
    });

    const displayedSlabs = [...byRange.values()].filter((slab) =>
      activityRateAppliesToReview(draft, pax, {
        rate_basis: "custom_slab",
        min_pax: slab.from_pax,
        max_pax: slab.to_pax,
      }),
    );
    return displayedSlabs.map((slab) => {
      const isActiveRange = pax >= slab.from_pax && pax <= slab.to_pax;
      const base = isActiveRange ? line.rate : slab.price;
      const commercial = applyLandCommercials(draft, base);
      return {
        id: `${slab.from_pax}-${slab.to_pax}`,
        min_pax: slab.from_pax,
        max_pax: slab.to_pax,
        base_rate: base,
        rate_basis: "custom_slab" as const,
        markup: commercial.markup,
        gst: commercial.gst,
        selling_price: commercial.final,
      };
    });
  }

  const commercial = applyLandCommercials(draft, line.rate);
  return [
    {
      id: "selected",
      base_rate: line.rate,
      rate_basis:
        activity.pricing_type === "per_person" ? ("per_person" as const) : ("fixed_group" as const),
      markup: commercial.markup,
      gst: commercial.gst,
      selling_price: commercial.final,
    },
  ];
}

// Kept pure so day/activity row spans are derived from the exact pricing rows
// that the table renders, never from the number of selected activities.
export function includedActivityDayGroups(draft: QuoteDraft, activities: Activity[], pax: number) {
  const included = draft.activities.filter((line) => line.inclusion_status !== "optional");
  return draft.routing.flatMap((route) => {
    const dayActivities = included.flatMap((line) => {
      if (!(line.from_routing_days ?? []).includes(route.day)) return [];
      const master = activities.find((item) => item.id === line.activity_id);
      if (!master) return [];
      const rows = includedActivitySellingRows(draft, line, master, pax);
      return rows.length ? [{ line, master, rows }] : [];
    });
    const rowSpan = dayActivities.reduce((total, activity) => total + activity.rows.length, 0);
    return rowSpan > 0 ? [{ route, activities: dayActivities, rowSpan }] : [];
  });
}

/** Keep the calculation input identity stable when only Step 9 presentation
 * choices (or the autosave timestamp) changed. All pricing fields retain their
 * normal identity-driven invalidation. */
function useStableCostingDraft(draft: QuoteDraft) {
  const previous = useRef(draft);
  const ignored = new Set<keyof QuoteDraft>(["land_review_display_selection", "updated_at"]);
  const keys = new Set<keyof QuoteDraft>([
    ...(Object.keys(previous.current) as (keyof QuoteDraft)[]),
    ...(Object.keys(draft) as (keyof QuoteDraft)[]),
  ]);
  const pricingChanged = [...keys].some(
    (key) => !ignored.has(key) && !Object.is(previous.current[key], draft[key]),
  );
  if (pricingChanged) previous.current = draft;
  return previous.current;
}

function FilterChip({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-1.5 rounded-sm border px-2 py-1 text-[10px] font-medium ${
        checked
          ? "border-[#7fb3df] bg-[#e6f0fb] text-[#103353]"
          : "border-[#d7e2ed] bg-[#fafbfc] text-[#73849b]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3 w-3 accent-[#28699e]"
      />
      {label}
    </label>
  );
}

function LandReviewControls({
  filters,
  onChange,
}: {
  filters: LandReviewFilters;
  onChange: <K extends keyof LandReviewDisplaySelection>(
    key: K,
    value: LandReviewDisplaySelection[K],
  ) => void;
}) {
  const set = onChange;
  const box = "rounded-sm border border-[#d7e2ed] bg-white p-2";
  const title = "mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#103353]";
  return (
    <div
      className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"
      aria-label="Land review display controls"
    >
      <div className={box}>
        <div className={title}>Transport Variations</div>
        <FilterChip
          checked={filters.transport}
          label="Show Transport Options"
          onChange={(value) => set("transport", value)}
        />
      </div>
      <div className={box}>
        <div className={title}>Guide Options &amp; Tour Escort - select any to show</div>
        <div className="flex flex-wrap gap-1">
          <FilterChip
            checked={filters.hindi}
            label="Hindi Guide"
            onChange={(value) => set("hindi", value)}
          />
          <FilterChip
            checked={filters.english}
            label="English Guide"
            onChange={(value) => set("english", value)}
          />
          <FilterChip
            checked={filters.otherLanguage}
            label="Other Language"
            onChange={(value) => set("otherLanguage", value)}
          />
          <FilterChip
            checked={filters.escort}
            label="Tour Escort"
            onChange={(value) => set("escort", value)}
          />
        </div>
      </div>
      <div className={box}>
        <div className={title}>Entrances - select categories to show</div>
        <div className="flex flex-wrap gap-1">
          <FilterChip
            checked={filters.indian}
            label="Indian"
            onChange={(value) => set("indian", value)}
          />
          <FilterChip
            checked={filters.foreign}
            label="Foreigner"
            onChange={(value) => set("foreign", value)}
          />
          <FilterChip
            checked={filters.student}
            label="Student"
            onChange={(value) => set("student", value)}
          />
        </div>
      </div>
      <div className={box}>
        <div className={title}>Activities &amp; Miscellaneous</div>
        <div className="flex flex-wrap gap-1">
          <FilterChip
            checked={filters.activities}
            label="Included Activities / Experiences"
            onChange={(value) => set("activities", value)}
          />
          <FilterChip
            checked={filters.misc}
            label="Miscellaneous"
            onChange={(value) => set("misc", value)}
          />
        </div>
      </div>
    </div>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-sm border border-[#d7e2ed] bg-white">
      <div className="bg-[#103353] px-3 py-2 text-sm font-semibold text-white">
        {number}. {title}
      </div>
      {children}
    </section>
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
      <div className="flex items-center justify-between gap-4 bg-[#f0f4f8] px-3 py-1.5">
        <h4 className="text-[11px] font-semibold text-[#103353]">{title}</h4>
        {helper && <span className="text-[9px] text-[#73849b]">{helper}</span>}
      </div>
      {children}
    </div>
  );
}

function Masthead({ draft }: { draft: QuoteDraft }) {
  const scope = getQuotationScope(draft.query_for, draft.commercial_mode);
  return (
    <div className="flex items-start justify-between border-b-2 border-[#103353] px-2 py-3">
      <div>
        <div className="text-[9px] font-semibold tracking-[.14em] text-[#204e76]">
          QUOTATION BUILDER · INTERNAL PRICING REVIEW
        </div>
        <h2 className="mt-1 text-[22px] font-semibold leading-tight text-[#103353]">
          Final Quotation Review
        </h2>
        <p className="mt-1 text-[10px] text-[#73849b]">
          {scope.queryFor === "Land Part + Meals"
            ? "Land Part + Meals · Land services and separately selected meals"
            : scope.landPart && scope.accommodationPart
              ? "Package · Standard Hotel Mode · Land, accommodation and included meals"
              : scope.landPart
                ? "Land Part · Transport, guides, escort, entrances, activities and miscellaneous"
                : "Accommodation Part · Hotels, rooms and selected meals"}
        </p>
      </div>
      <div className="text-right text-[10px] text-[#73849b]">
        <div className="font-semibold text-[#103353]">
          {draft.linked_query_id || "Draft quotation"}
        </div>
        <div>Draft</div>
      </div>
    </div>
  );
}

function TripInformation({ draft }: { draft: QuoteDraft }) {
  const db = useDB();
  const route = draft.routing
    .map((day) => db.cities.find((city) => city.id === day.city_id)?.name || day.to_city)
    .filter(Boolean)
    .join(" → ");
  const cells = [
    ["Travel Partner / Client", draft.agent?.agency || draft.agent?.name || "—"],
    ["Quotation / Query No.", draft.linked_query_id || "Draft"],
    ["Programme", draft.program_name || "—"],
    [
      "Travel Dates",
      `${draft.start_date || "—"} — ${draft.start_date ? addDaysISO(draft.start_date, draft.nights || 0) : "—"}`,
    ],
    ["Duration", `${draft.nights || 0} Nights / ${(draft.nights || 0) + 1} Days`],
    ["Travellers", `${quotationPaxLabel(draft)} · ${draft.tour_type || "—"}`],
  ];
  return (
    <Section number={1} title="Trip Information">
      <div className="overflow-x-auto">
        <table className={`${grid} min-w-[900px]`}>
          <tbody>
            <tr>
              {cells.map(([label, value]) => (
                <td key={label} className="w-1/6 align-top">
                  <div className="text-[8px] font-semibold uppercase tracking-wide text-[#73849b]">
                    {label}
                  </div>
                  <div className="mt-0.5 font-medium">{value}</div>
                </td>
              ))}
            </tr>
            <tr>
              <td colSpan={6} className="bg-[#f5f8fb]">
                <b>Routing:</b> {route || "—"} <span className="mx-2 text-[#73849b]">·</span> Tour
                type: {draft.tour_type || "—"} <span className="mx-2 text-[#73849b]">·</span>{" "}
                Nationality / entrance basis:{" "}
                {draft.entrance_traveller_category || draft.traveler_type || "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function DaywiseLand({ draft, filters }: { draft: QuoteDraft; filters: LandReviewFilters }) {
  const db = useDB();
  const sheet = useMemo(() => buildLandPart(draft, db), [draft, db]);
  const markup = landMarkup(draft);
  const gstRate = landGst(draft);
  const guideColumns = [
    filters.hindi && { key: "hindi", label: "Hindi Guide" },
    filters.english && { key: "english", label: "English Guide" },
    filters.otherLanguage && { key: "other", label: "Other Language" },
  ].filter(Boolean) as { key: "hindi" | "english" | "other"; label: string }[];
  const entranceColumns = [
    filters.indian && { key: "indian", label: "Indian" },
    filters.foreign && { key: "foreign", label: "Foreigner" },
    filters.student && { key: "student", label: "Student" },
  ].filter(Boolean) as { key: "indian" | "foreign" | "student"; label: string }[];
  const visibleDetailColumns =
    guideColumns.length + Number(filters.escort) + entranceColumns.length;

  const guideCell = (day: number, kind: "hindi" | "english" | "other") => {
    const lines = draft.guides.filter((line) => {
      if (line.inclusion_status === "optional" || line.is_escort) return false;
      if (line.from_routing_days?.length && !line.from_routing_days.includes(day)) return false;
      const language = (line.language || "").toLowerCase();
      return kind === "other" ? language !== "hindi" && language !== "english" : language === kind;
    });
    const values = lines.flatMap((line) => {
      const master = db.guides.find((guide) => guide.id === line.guide_id);
      if (!master) {
        const slabs = line.pax_ranges ?? [];
        if (filters.paxDisplay === "ranges" && slabs.length) {
          return slabs
            .filter((slab) => slab.rate > 0)
            .map((slab) => ({ label: `${slab.from_pax}–${slab.to_pax}`, rate: slab.rate }));
        }
        const slab = slabs.find(
          (item) => filters.exactPax >= item.from_pax && filters.exactPax <= item.to_pax,
        );
        const rate = slab?.rate ?? line.rate;
        return rate > 0 ? [{ label: `${filters.exactPax} Pax`, rate }] : [];
      }
      const language = (line.language || (kind === "other" ? "Language" : kind)) as GuideLanguage;
      return guideReviewRates(
        master,
        language,
        filters.paxDisplay,
        filters.exactPax,
        draft.pax_min ?? filters.exactPax,
        draft.pax_max ?? filters.exactPax,
      );
    });
    return values.length ? (
      <div className="space-y-0.5">
        {values.map((value, index) => (
          <div key={`${value.label}-${index}`} className="whitespace-nowrap">
            <span className="text-[8px] text-[#73849b]">{value.label}</span> {money(value.rate)}
          </div>
        ))}
      </div>
    ) : (
      "—"
    );
  };

  const escortCell = (row: (typeof sheet.rows)[number]) => {
    if (getEscortPricingMode(draft) === "pax_range") {
      const savedRanges = draft.escort_ranges ?? [];
      const ranges =
        filters.paxDisplay === "ranges"
          ? savedRanges
          : savedRanges.filter(
              (range) => filters.exactPax >= range.min_pax && filters.exactPax <= range.max_pax,
            );
      const values = ranges.flatMap((range) => {
        const savedDayRate = getEscortRangeDayCharge(draft, row.day, range.id);
        const hasDayMatrix = draft.routing.some(
          (day) => getEscortRangeDayCharge(draft, day.day, range.id) > 0,
        );
        const rate = hasDayMatrix
          ? savedDayRate
          : (range.charge ?? 0) / Math.max(1, draft.routing.length);
        return rate > 0 ? [{ label: `${range.min_pax}–${range.max_pax}`, rate }] : [];
      });
      return values.length ? (
        <div className="space-y-0.5">
          {values.map((value) => (
            <div key={value.label} className="whitespace-nowrap">
              <span className="text-[8px] text-[#73849b]">{value.label}</span> {money(value.rate)}
            </div>
          ))}
        </div>
      ) : (
        "—"
      );
    }
    const options = row.guide_opts.filter(
      (item) => item.checked && item.label.toLowerCase().includes("escort") && item.amount > 0,
    );
    if (!options.length) return "—";
    return options.map((item) => money(item.amount)).join(" + ");
  };

  const entranceCell = (day: number, category: "indian" | "foreign" | "student") => {
    const rates = draft.entrances.flatMap((line) => {
      if (line.from_routing_days?.length && !line.from_routing_days.includes(day)) return [];
      if (!entranceTourSelected(draft, day, line.site_id || line.id, true)) return [];
      const rate =
        category === "indian"
          ? line.indian_rate
          : category === "foreign"
            ? line.foreign_rate
            : line.student_rate;
      return rate != null && rate > 0 ? [rate] : [];
    });
    return rates.length ? rates.map(money).join(" + ") : "—";
  };
  return (
    <Panel
      title="A. Day-wise Tours, Guide, Escort & Entrance Charges (View Only)"
      helper="Guide/Escort display follows selected Pax slabs or exact Pax"
    >
      <div className="overflow-x-auto">
        <table className={`${grid} min-w-[1050px]`}>
          <thead>
            <tr className="bg-[#e6f0fb] text-[9px] uppercase text-[#103353]">
              <th rowSpan={2}>Day</th>
              <th rowSpan={2}>Date</th>
              <th rowSpan={2} className="text-left">
                Route
              </th>
              <th rowSpan={2} className="text-left">
                City / Tours
              </th>
              {guideColumns.length > 0 && <th colSpan={guideColumns.length}>Guide Charges</th>}
              {filters.escort && <th>Tour Escort</th>}
              {entranceColumns.length > 0 && (
                <th colSpan={entranceColumns.length}>Entrances (PP)</th>
              )}
              <th rowSpan={2} className="bg-[#eaf8ef] text-right">
                Final Module Total
              </th>
            </tr>
            <tr className="bg-[#f0f4f8] text-[8px] uppercase text-[#204e76]">
              {guideColumns.map((column) => (
                <th key={column.key} className="text-right">
                  {column.label}
                </th>
              ))}
              {filters.escort && <th className="text-right">Applicable Slab</th>}
              {entranceColumns.map((column) => (
                <th key={column.key} className="text-right">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row) => {
              const base = row.guide + row.entrances;
              return (
                <tr key={row.day}>
                  <td>{row.day}</td>
                  <td>{row.date}</td>
                  <td>{row.route}</td>
                  <td>
                    <div>{row.city}</div>
                    <div className="text-[8px] text-[#73849b]">{row.tours || "—"}</div>
                  </td>
                  {guideColumns.map((column) => (
                    <td key={column.key} className="text-right align-top tabular-nums">
                      {guideCell(row.day, column.key)}
                    </td>
                  ))}
                  {filters.escort && <td className="text-right tabular-nums">{escortCell(row)}</td>}
                  {entranceColumns.map((column) => (
                    <td key={column.key} className="text-right tabular-nums">
                      {entranceCell(row.day, column.key)}
                    </td>
                  ))}
                  <td className="bg-[#eaf8ef] text-right font-semibold tabular-nums">
                    {money(base)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="font-semibold">
            <tr className="bg-[#f5f8fb]">
              <td colSpan={4 + visibleDetailColumns}>Base / Total</td>
              <td className="text-right">{money(sheet.guide_total + sheet.entrances_total)}</td>
            </tr>
            <tr>
              <td colSpan={4 + visibleDetailColumns}>Markup</td>
              <td className="text-right">
                {money((sheet.guide_total + sheet.entrances_total) * markup)}
              </td>
            </tr>
            <tr>
              <td colSpan={4 + visibleDetailColumns}>GST</td>
              <td className="text-right">
                {money((sheet.guide_total + sheet.entrances_total) * (1 + markup) * gstRate)}
              </td>
            </tr>
            <tr className="bg-[#eaf8ef] text-[#103353]">
              <td colSpan={4 + visibleDetailColumns}>Final Module Total</td>
              <td className="text-right">
                {money(gross(sheet.guide_total + sheet.entrances_total, markup, gstRate))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}

function TransportReview({ draft }: { draft: QuoteDraft }) {
  const db = useDB();
  const rows = transportOptionRows(draft);
  return (
    <Panel
      title="B. Transport Variations"
      helper="Independent variation totals, already inclusive of markup and GST"
    >
      <div className="overflow-x-auto">
        <table className={`${grid} min-w-[850px]`}>
          <thead className="bg-[#f0f4f8] text-[9px] uppercase text-[#103353]">
            <tr>
              <th className="text-left">Variation</th>
              <th className="text-left">Vehicle Combination</th>
              <th className="text-right">Applicable Pax</th>
              <th className="text-right">Base Rate</th>
              <th className="text-right">Markup</th>
              <th className="text-right">GST</th>
              <th className="bg-[#eaf8ef] text-right">Final Total</th>
            </tr>
          </thead>
          <tbody>
            {(draft.transport_options ?? []).map((option) => {
              const total = transportOptionTotal(draft, option);
              const base = option.vehicles.reduce((sum, selection) => {
                const line = draft.transport.find(
                  (item) => item.id === selection.transport_line_id,
                );
                return line
                  ? sum + transportLineTotal(line) * Math.max(1, selection.quantity)
                  : sum;
              }, 0);
              const commercial = applyLandCommercials(draft, base);
              const combination = option.vehicles
                .map((selection) => {
                  const line = draft.transport.find(
                    (item) => item.id === selection.transport_line_id,
                  );
                  const vehicle =
                    db.travel_options.find((item) => item.id === line?.travel_id)?.vehicle_type ||
                    "Vehicle";
                  return `${selection.quantity} ${vehicle}`;
                })
                .join(" + ");
              const applicable = rows.filter((row) => row.option_id === option.id);
              return (
                <tr key={option.id}>
                  <td>{option.name || combination}</td>
                  <td className="font-medium">{combination}</td>
                  <td className="text-right">
                    {applicable[0]?.pax ?? option.min_pax}–
                    {applicable.at(-1)?.pax ?? option.max_pax}
                  </td>
                  <td className="text-right tabular-nums">{money(base)}</td>
                  <td className="text-right tabular-nums">{money(commercial.markup)}</td>
                  <td className="text-right tabular-nums">{money(commercial.gst)}</td>
                  <td className="bg-[#eaf8ef] text-right font-semibold tabular-nums">
                    {money(total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function MiscReview({ draft }: { draft: QuoteDraft }) {
  const db = useDB();
  const pax = effectivePaxForPricing(draft);
  return (
    <Panel title="C. Miscellaneous (Selected Items)">
      <div className="overflow-x-auto">
        <table className={`${grid} min-w-[850px]`}>
          <thead className="bg-[#f0f4f8] text-[9px] uppercase text-[#103353]">
            <tr>
              <th>#</th>
              <th className="text-left">Particulars</th>
              <th>Pax Range</th>
              <th>Rate Basis</th>
              <th className="text-right">Base</th>
              <th className="text-right">Markup</th>
              <th className="text-right">GST</th>
              <th className="bg-[#eaf8ef] text-right">Final Price</th>
            </tr>
          </thead>
          <tbody>
            {draft.misc.flatMap((line, lineIndex) => {
              const master = db.miscellaneous_items.find((item) => item.id === line.item_id);
              const basis =
                line.rate_basis ?? (line.unit === "per_person" ? "per_person" : "fixed_range");
              const slabs =
                basis !== "per_person" && line.pax_ranges?.length
                  ? line.pax_ranges
                  : [
                      {
                        id: "active",
                        from_pax: pax,
                        to_pax: pax,
                        rate:
                          basis === "per_person"
                            ? line.rate
                            : miscRateForPax(
                                master ?? ({ rate: line.rate } as never),
                                pax,
                                line.qty,
                              ).total,
                      },
                    ];
              return slabs.map((slab, slabIndex) => {
                const commercial = applyLandCommercials(draft, slab.rate);
                return (
                  <tr key={`${line.id}-${slabIndex}`}>
                    <td>{slabIndex ? "" : lineIndex + 1}</td>
                    <td>{slabIndex ? "" : line.custom_name || master?.name || "Miscellaneous"}</td>
                    <td>
                      {slab.from_pax}–{slab.to_pax}
                    </td>
                    <td>
                      {basis === "per_person"
                        ? "Per Person"
                        : basis === "foc_range"
                          ? "Fixed Total / FOC Pax Range"
                          : "Fixed Total / Pax Range"}
                    </td>
                    <td className="text-right tabular-nums">{money(commercial.base)}</td>
                    <td className="text-right tabular-nums">{money(commercial.markup)}</td>
                    <td className="text-right tabular-nums">{money(commercial.gst)}</td>
                    <td className="bg-[#eaf8ef] text-right font-semibold tabular-nums">
                      {money(commercial.final)}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ActivitiesReview({ draft, optional = false }: { draft: QuoteDraft; optional?: boolean }) {
  const db = useDB();
  const pax = effectivePaxForPricing(draft);
  const lines = draft.activities.filter(
    (line) => (line.inclusion_status === "optional") === optional,
  );
  const includedDayGroups = optional ? [] : includedActivityDayGroups(draft, db.activities, pax);
  const rateBasisLabel = (basis: string) =>
    basis === "per_person"
      ? "Per Person"
      : basis === "fixed_group"
        ? "Fixed Group"
        : "Custom Pax Slabs";
  return (
    <Panel
      title={
        optional
          ? "Optional Activities — Separate Selling Prices"
          : "D. Included Activities / Experiences"
      }
      helper={
        optional
          ? "View only · Already inclusive of activity markup and applicable GST"
          : "Each activity retains its own rate basis and Pax slab breakup"
      }
    >
      <div className="overflow-x-auto">
        <table className={`${grid} min-w-[900px]`}>
          <thead className="bg-[#f0f4f8] text-[9px] uppercase text-[#103353]">
            <tr>
              {!optional && (
                <>
                  <th>Day</th>
                  <th className="text-left">Route</th>
                </>
              )}
              <th className="text-left">Activity / City</th>
              <th>Rate Basis</th>
              <th>Pax Range</th>
              <th className="text-right">Base Rate</th>
              <th className="text-right">Markup</th>
              <th className="text-right">GST</th>
              <th className="bg-[#eaf8ef] text-right">
                {optional ? "Selling Price" : "Final Price"}
              </th>
            </tr>
          </thead>
          <tbody>
            {!optional && includedDayGroups.length ? (
              includedDayGroups.flatMap((dayGroup) =>
                dayGroup.activities.flatMap((activity, activityIndex) =>
                  activity.rows.map((row, slabIndex) => {
                    const firstDayRow = activityIndex === 0 && slabIndex === 0;
                    const firstActivityRow = slabIndex === 0;
                    const city =
                      db.cities.find((item) => item.id === dayGroup.route.city_id)?.name ||
                      dayGroup.route.to_city ||
                      "—";
                    return (
                      <tr
                        key={`${dayGroup.route.day}-${activity.line.id}-${row.id}`}
                        className={slabIndex ? "bg-[#fbfcfd]" : ""}
                      >
                        {firstDayRow && (
                          <>
                            <td rowSpan={dayGroup.rowSpan} className="align-top font-semibold">
                              {dayGroup.route.day}
                            </td>
                            <td rowSpan={dayGroup.rowSpan} className="align-top">
                              {landReviewRouteLabel(
                                dayGroup.route,
                                db,
                                draft.tour_start_city || draft.departure_city,
                              )}
                            </td>
                          </>
                        )}
                        {firstActivityRow && (
                          <>
                            <td rowSpan={activity.rows.length} className="align-top font-medium">
                              {activity.master.activity_name}
                              <div className="text-[8px] font-normal text-[#73849b]">{city}</div>
                            </td>
                            <td rowSpan={activity.rows.length} className="align-top text-center">
                              {rateBasisLabel(activity.rows[0].rate_basis)}
                            </td>
                          </>
                        )}
                        <td>
                          {"min_pax" in row && row.min_pax && row.max_pax
                            ? `${row.min_pax}–${row.max_pax}`
                            : pax}
                        </td>
                        <td className="text-right tabular-nums">{money(row.base_rate)}</td>
                        <td className="text-right tabular-nums">{money(row.markup)}</td>
                        <td className="text-right tabular-nums">{money(row.gst)}</td>
                        <td className="bg-[#eaf8ef] text-right font-semibold tabular-nums">
                          {money(row.selling_price)}
                        </td>
                      </tr>
                    );
                  }),
                ),
              )
            ) : lines.length ? (
              lines.flatMap((line) => {
                const master = db.activities.find((item) => item.id === line.activity_id);
                if (!master) return [];
                const rows = optionalActivitySellingRows(
                  draft,
                  master,
                  draft.traveler_type || "indian",
                  pax,
                ).filter((row) => activityRateAppliesToReview(draft, pax, row));
                return rows.map((row, index) => {
                  const day = line.from_routing_days?.[0];
                  const route = draft.routing.find((item) => item.day === day);
                  return (
                    <tr key={`${line.id}-${row.id}`} className={index ? "bg-[#fbfcfd]" : ""}>
                      {!optional && (
                        <>
                          <td>{index ? "" : day || "—"}</td>
                          <td>{index ? "" : route?.to_city || route?.from_city || "—"}</td>
                        </>
                      )}
                      <td>{index ? "" : master.activity_name}</td>
                      <td>{row.rate_basis}</td>
                      <td>{row.min_pax && row.max_pax ? `${row.min_pax}–${row.max_pax}` : pax}</td>
                      <td className="text-right tabular-nums">{money(row.base_rate)}</td>
                      <td className="text-right tabular-nums">{money(row.markup)}</td>
                      <td className="text-right tabular-nums">{money(row.gst)}</td>
                      <td className="bg-[#eaf8ef] text-right font-semibold tabular-nums">
                        {money(row.selling_price)}
                      </td>
                    </tr>
                  );
                });
              })
            ) : (
              <tr>
                <td colSpan={optional ? 7 : 9} className="py-3 text-center text-[#73849b]">
                  No {optional ? "optional" : "included"} activities selected.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

const emptyLandReviewSelection: LandReviewDisplaySelection = {
  transport: true,
  hindi: true,
  english: true,
  otherLanguage: false,
  escort: true,
  indian: true,
  foreign: true,
  student: true,
  activities: true,
  misc: true,
  guideIncluded: true,
  guideOptional: true,
  entranceIncluded: true,
  entranceOptional: true,
  activityIncluded: true,
  activityOptional: true,
  miscIncluded: true,
};

function LandReview({
  draft,
  costingDraft,
  set,
  readOnly,
}: {
  draft: QuoteDraft;
  costingDraft: QuoteDraft;
  set: SetDraft;
  readOnly?: boolean;
}) {
  const selection: LandReviewDisplaySelection = {
    ...emptyLandReviewSelection,
    ...(draft.land_review_display_selection ?? {}),
    // Classification remains authoritative in Step 7 and is never controlled here.
    guideIncluded: true,
    guideOptional: true,
    entranceIncluded: true,
    entranceOptional: true,
    activityIncluded: true,
    activityOptional: true,
    miscIncluded: true,
  };
  const filters: LandReviewFilters = {
    ...selection,
    paxDisplay: paxRangeActive(draft) ? "ranges" : "exact",
    exactPax: effectivePaxForPricing(draft),
  };
  const daywiseFilters: LandReviewFilters = {
    ...filters,
    activities: false,
    misc: false,
    activityIncluded: false,
    activityOptional: false,
    miscIncluded: false,
  };
  const changeSelection = <K extends keyof LandReviewDisplaySelection>(
    key: K,
    value: LandReviewDisplaySelection[K],
  ) => set({ land_review_display_selection: { ...selection, [key]: value } });
  return (
    <Section number={2} title="Land Services — Pricing & Selection Review">
      <div className="space-y-2 p-2">
        <div className="inline-flex rounded-sm border border-[#b8cee1] bg-[#eef5fb] px-2 py-1 text-[9px] font-semibold text-[#103353]">
          {paxRangeActive(draft)
            ? `Costing Mode: Pax Range · ${draft.pax_min ?? 1}–${draft.pax_max ?? draft.pax_min ?? 1} Pax`
            : `Costing Mode: Exact Travellers · ${effectivePaxForPricing(draft)} Pax`}
        </div>
        {!readOnly && <LandReviewControls filters={filters} onChange={changeSelection} />}
        <LandDaywiseReview draft={costingDraft} filters={daywiseFilters} />
        {filters.transport && (costingDraft.transport_options?.length ?? 0) > 0 && (
          <TransportReview draft={costingDraft} />
        )}
        {filters.misc && costingDraft.misc.length > 0 && <MiscReview draft={costingDraft} />}
        {filters.activities &&
          costingDraft.activities.some((line) => line.inclusion_status !== "optional") && (
            <ActivitiesReview draft={costingDraft} />
          )}
        {filters.activities &&
          costingDraft.activities.some((line) => line.inclusion_status === "optional") && (
            <ActivitiesReview draft={costingDraft} optional />
          )}
      </div>
    </Section>
  );
}

function AccommodationReview({
  draft,
  sectionNumber = 3,
}: {
  draft: QuoteDraft;
  sectionNumber?: number;
}) {
  const db = useDB();
  const options = useMemo(
    () => draft.hotel_options.filter((option) => option.selections.length > 0).slice(0, 4),
    [draft.hotel_options],
  );
  const nights = useMemo(
    () =>
      draft.routing.filter((day) =>
        options.some((option) => isAccommodationNightForOption(option, day)),
      ),
    [draft.routing, options],
  );
  const standardDraft = useMemo(
    () => ({ ...draft, allocation_mode: "standard" as const, dynamic_days: [] }),
    [draft],
  );
  const optionCosting = useMemo(
    () =>
      new Map(
        options.map((option) => {
          const hotelSheet = buildHotelMealSheet(standardDraft, db, option);
          const rateRow = buildRateSheet(standardDraft, db, option, draft.transport).flatMap(
            (group) => group.rows,
          )[0];
          return [
            option.key,
            {
              hotelSheet,
              hotelNightByDay: new Map(hotelSheet.rows.map((row) => [row.day, row])),
              rateRow,
            },
          ] as const;
        }),
      ),
    [options, standardDraft, db, draft.transport],
  );
  return (
    <div aria-label={`${sectionNumber}. Accommodation & Meals — Hotel Verification`}>
      <Section number={sectionNumber} title="Accommodation & Meals — Hotel Verification">
        <div className="space-y-2 p-2">
          <Panel title="A. Hotel Foreseen / Stay Plan">
            <div className="overflow-x-auto">
              <table className={`${grid} min-w-[900px]`}>
                <thead className="bg-[#f0f4f8] text-[9px] uppercase text-[#103353]">
                  <tr>
                    <th>Check-in</th>
                    <th>Check-out</th>
                    <th className="text-left">City</th>
                    <th>Nights</th>
                    {options.map((option) => (
                      <th key={option.key} className="text-left">
                        Option {option.key} · {option.category || option.label || "Accommodation"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {nights.map((day) => (
                    <tr key={day.day}>
                      <td>{day.date}</td>
                      <td>
                        {draft.routing.find((item) => item.day === day.day + 1)?.date ||
                          addDaysISO(day.date, 1)}
                      </td>
                      <td>
                        {db.cities.find((city) => city.id === day.city_id)?.name ||
                          db.cities.find(
                            (city) =>
                              city.name.trim().toLowerCase() ===
                              day.from_city?.trim().toLowerCase(),
                          )?.name ||
                          "—"}
                      </td>
                      <td>1</td>
                      {options.map((option) => {
                        const selection = hotelSelectionForDay(option, day, true);
                        const hotel = db.hotels.find((item) => item.id === selection?.hotel_id);
                        const room = db.room_categories.find(
                          (item) => item.id === selection?.room_id,
                        );
                        return (
                          <td key={option.key}>
                            {selection?.no_hotel ? (
                              <b>
                                {selection.accommodation_status === "own_arrangement"
                                  ? "Own Arrangement"
                                  : "No Hotel Required"}
                              </b>
                            ) : (
                              <>
                                <div className="font-semibold">{hotel?.name || "Unavailable"}</div>
                                <div className="text-[8px] text-[#73849b]">
                                  Room: {room?.name || "—"} · Meal Plan:{" "}
                                  {selection?.meal_plan || "—"}
                                </div>
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel
            title="B. Accommodation & Meals — Rate Verification"
            helper="Nightly rates → supplier-inclusive total → markup → GST → final"
          >
            <div className="overflow-x-auto">
              <table className={`${grid} min-w-[${Math.max(1200, 260 + options.length * 520)}px]`}>
                <thead>
                  <tr className="bg-[#e6f0fb] text-[9px] uppercase text-[#103353]">
                    <th rowSpan={2} className="text-left">
                      Night / City
                    </th>
                    {options.map((option) => (
                      <th key={option.key} colSpan={5}>
                        Option {option.key} · {option.category || option.label}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-[#f0f4f8] text-[8px] uppercase text-[#204e76]">
                    {options.flatMap((option) =>
                      ["SGL", "DBL", "TRP", "Lunch PP", "Dinner PP"].map((label) => (
                        <th key={`${option.key}-${label}`} className="text-right">
                          {label}
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {nights.map((day, nightIndex) => (
                    <tr key={day.day}>
                      <td>
                        <b>Night {nightIndex + 1}</b>
                        <div>{day.date}</div>
                        <div className="text-[8px] text-[#73849b]">
                          {db.cities.find((city) => city.id === day.city_id)?.name || "—"}
                        </div>
                      </td>
                      {options.flatMap((option) => {
                        const selection = hotelSelectionForDay(option, day, true);
                        const plan =
                          selection && !selection.no_hotel
                            ? findRatePlan(
                                db.rate_plans,
                                selection.room_id,
                                selection.meal_plan,
                                day.date,
                              )
                            : null;
                        const dbl = plan?.double_rate;
                        const rates = [
                          plan?.single_rate,
                          dbl,
                          dbl != null ? dbl + (plan?.extra_bed_rate || 0) : undefined,
                        ];
                        const coverage = mealPlanCoverage(selection?.meal_plan);
                        const night = optionCosting.get(option.key)?.hotelNightByDay.get(day.day);
                        const meal = (included: boolean, value?: number) =>
                          included ? (
                            <span className="rounded-sm bg-[#eaf8ef] px-1 py-0.5 font-semibold text-emerald-800">
                              Included
                            </span>
                          ) : value && value > 0 ? (
                            money(gross(value, hotelsMarkup(draft), hotelsGst(draft)))
                          ) : (
                            "—"
                          );
                        return [
                          ...rates.map((rate, index) => (
                            <td
                              key={`${option.key}-${day.day}-rate-${index}`}
                              className="text-right tabular-nums"
                            >
                              {rate != null ? (
                                <>
                                  <div className="font-semibold">
                                    {money(rate + rate * gstRateFor(rate))}
                                  </div>
                                  <div className="text-[8px] text-[#73849b]">
                                    Net {money(rate)}
                                    <br />
                                    GST {money(rate * gstRateFor(rate))}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div>—</div>
                                  <div className="text-[8px] text-[#73849b]">Unavailable</div>
                                </>
                              )}
                            </td>
                          )),
                          <td key={`${option.key}-${day.day}-lunch`} className="text-right">
                            {meal(coverage.lunch, night?.lunch_total)}
                          </td>,
                          <td key={`${option.key}-${day.day}-dinner`} className="text-right">
                            {meal(coverage.dinner, night?.dinner_total)}
                          </td>,
                        ];
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {[
                    "Total (Supplier incl. GST)",
                    "Markup",
                    "GST on markup",
                    "Final selling total",
                    "FINAL ACCOMMODATION + MEALS PRICE PP",
                  ].map((label, summaryIndex) => (
                    <tr
                      key={label}
                      className={
                        summaryIndex === 4
                          ? "bg-[#eaf8ef] font-bold text-[#103353]"
                          : summaryIndex === 3
                            ? "bg-[#e6f0fb] font-semibold"
                            : "bg-[#f5f8fb]"
                      }
                    >
                      <td>{label}</td>
                      {options.flatMap((option) => {
                        const costing = optionCosting.get(option.key);
                        if (!costing) return [];
                        const { hotelSheet: sheet, rateRow: row } = costing;
                        const supplier = [
                          sheet.sgl,
                          sheet.dbl,
                          sheet.trp,
                          sheet.lunch_total,
                          sheet.dinner_total,
                        ];
                        const final = [
                          row?.single,
                          row?.double,
                          row?.triple,
                          row?.lunch,
                          row?.dinner,
                        ];
                        return supplier.map((value, index) => {
                          const markup = value * hotelsMarkup(draft);
                          const gst = (value + markup) * hotelsGst(draft);
                          const shown =
                            summaryIndex === 0
                              ? value
                              : summaryIndex === 1
                                ? markup
                                : summaryIndex === 2
                                  ? gst
                                  : summaryIndex === 3
                                    ? gross(value, hotelsMarkup(draft), hotelsGst(draft))
                                    : final[index];
                          return (
                            <td
                              key={`${option.key}-${label}-${index}`}
                              className="text-right tabular-nums"
                            >
                              {money(shown)}
                            </td>
                          );
                        });
                      })}
                    </tr>
                  ))}
                </tfoot>
              </table>
            </div>
          </Panel>
        </div>
      </Section>
    </div>
  );
}

function SeparateMealsReview({
  draft,
  optionKey = "A",
  sectionNumber = 5,
}: {
  draft: QuoteDraft;
  optionKey?: OptionKey;
  sectionNumber?: number;
}) {
  const db = useDB();
  const rows = useMemo(
    () => calculateMealCostingRows(draft, db, optionKey),
    [draft, db, optionKey],
  );
  const includedLunch = mealCostingTotal(draft, rows, "Lunch", "included");
  const includedDinner = mealCostingTotal(draft, rows, "Dinner", "included");
  const optionalLunch = mealCostingTotal(draft, rows, "Lunch", "optional");
  const optionalDinner = mealCostingTotal(draft, rows, "Dinner", "optional");
  const includedRows = rows.filter(
    (row) => row.status === "included" || row.status === "hotel_plan",
  );
  const optionalRows = rows.filter((row) => row.status === "optional");

  return (
    <Section
      number={sectionNumber}
      title={`Meals — Option ${optionKey} Included & Optional Review`}
    >
      <div className="space-y-3 p-2">
        <div className="grid gap-2 lg:grid-cols-2">
          {(
            [
              ["Lunch", includedLunch],
              ["Dinner", includedDinner],
            ] as const
          ).map(([meal, total]) => (
            <Panel
              key={meal}
              title={`Included ${meal}`}
              helper="Included meals only; Hotel Plan coverage is not charged again"
            >
              <div className="overflow-x-auto">
                <table className={`${grid} min-w-[760px]`}>
                  <thead className="bg-[#f0f4f8] text-[9px] uppercase text-[#103353]">
                    <tr>
                      <th>Day</th>
                      <th>Date</th>
                      <th>City</th>
                      <th className="text-left">Meal / Venue</th>
                      <th className="text-right">Base Rate</th>
                      <th className="text-right">Pax</th>
                      <th className="text-right">Included Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {includedRows
                      .filter((row) => row.meal_type === meal)
                      .map((row) => (
                        <tr key={`${row.day}-${row.city_id}-${row.meal_type}`}>
                          <td>{row.day}</td>
                          <td>{row.date}</td>
                          <td>{row.city}</td>
                          <td>{row.label}</td>
                          <td className="text-right">
                            {row.status === "hotel_plan" ? "—" : money(row.per_person)}
                          </td>
                          <td className="text-right">{row.pax}</td>
                          <td className="text-right">
                            {row.status === "hotel_plan"
                              ? "Included in Hotel Plan"
                              : money(row.total)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot className="bg-[#eaf8ef] font-semibold text-[#103353]">
                    <tr>
                      <td colSpan={6}>Base {meal} Total</td>
                      <td className="text-right">{money(total.base_total)}</td>
                    </tr>
                    <tr>
                      <td colSpan={6}>Markup</td>
                      <td className="text-right">{money(total.markup)}</td>
                    </tr>
                    <tr>
                      <td colSpan={6}>GST</td>
                      <td className="text-right">{money(total.gst)}</td>
                    </tr>
                    <tr>
                      <td colSpan={6}>Final Included {meal} Total</td>
                      <td className="text-right">{money(total.final_total)}</td>
                    </tr>
                    <tr>
                      <td colSpan={6}>Per Person</td>
                      <td className="text-right">{money(total.per_person)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Panel>
          ))}
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {(
            [
              ["Lunch", optionalLunch],
              ["Dinner", optionalDinner],
            ] as const
          ).map(([meal, total]) => (
            <Panel
              key={meal}
              title={`Optional ${meal} — Additional Sale`}
              helper="Not included in package meal totals"
            >
              {optionalRows.some((row) => row.meal_type === meal) ? (
                <div className="overflow-x-auto">
                  <table className={`${grid} min-w-[760px]`}>
                    <thead className="bg-amber-50 text-[9px] uppercase text-amber-900">
                      <tr>
                        <th>Day</th>
                        <th>Date</th>
                        <th>City</th>
                        <th className="text-left">Meal / Venue</th>
                        <th className="text-right">Base</th>
                        <th className="text-right">Pax</th>
                        <th className="text-right">Markup</th>
                        <th className="text-right">GST</th>
                        <th className="text-right">Final Selling Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {optionalRows
                        .filter((row) => row.meal_type === meal)
                        .map((row) => {
                          const base = row.total;
                          const markedUp = base * (1 + hotelsMarkup(draft));
                          const markup = markedUp - base;
                          const final = markedUp * (1 + hotelsGst(draft));
                          const gst = final - markedUp;
                          return (
                            <tr key={`${row.day}-${row.city_id}-${row.meal_type}`}>
                              <td>{row.day}</td>
                              <td>{row.date}</td>
                              <td>{row.city}</td>
                              <td>{row.label}</td>
                              <td className="text-right">{money(base)}</td>
                              <td className="text-right">{row.pax}</td>
                              <td className="text-right">{money(markup)}</td>
                              <td className="text-right">{money(gst)}</td>
                              <td className="text-right">{money(final)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                    <tfoot className="border-t bg-amber-50 font-semibold">
                      {[
                        ["Base Total", total.base_total],
                        ["Markup", total.markup],
                        ["GST", total.gst],
                        [`Optional ${meal} Final Selling Price`, total.final_total],
                      ].map(([label, value]) => (
                        <tr key={String(label)}>
                          <td colSpan={8}>{label}</td>
                          <td className="text-right">{money(Number(value))}</td>
                        </tr>
                      ))}
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="p-3 text-[10px] text-[#73849b]">
                  No optional {meal.toLowerCase()} selected.
                </div>
              )}
            </Panel>
          ))}
        </div>
      </div>
    </Section>
  );
}

function GroupedMealsReview({
  draft,
  sectionNumber = 5,
}: {
  draft: QuoteDraft;
  sectionNumber?: number;
}) {
  const db = useDB();
  const options = useMemo(() => {
    const configured = draft.hotel_options
      .filter((option) => option.selections.length > 0)
      .slice(0, 4);
    return configured.length
      ? configured
      : ([{ key: "A", label: "Option A", selections: [] }] as HotelOption[]);
  }, [draft.hotel_options]);
  const rowsByOption = useMemo(
    () =>
      new Map(
        options.map((option) => [option.key, calculateMealCostingRows(draft, db, option.key)]),
      ),
    [draft, db, options],
  );
  const dayRows = useMemo(() => {
    const result = new Map<string, { day: number; date: string; city: string; cityId: string }>();
    draft.routing.forEach((route) => {
      const cityId = route.city_id || route.to_city_id || route.from_city || `route-${route.day}`;
      const city =
        db.cities.find((item) => item.id === cityId)?.name ||
        route.to_city ||
        route.from_city ||
        "—";
      result.set(`${route.day}:${cityId}`, { day: route.day, date: route.date, city, cityId });
    });
    rowsByOption.forEach((rows) =>
      rows.forEach((row) =>
        result.set(`${row.day}:${row.city_id}`, {
          day: row.day,
          date: row.date,
          city: row.city,
          cityId: row.city_id,
        }),
      ),
    );
    return [...result.values()].sort((a, b) => a.day - b.day || a.city.localeCompare(b.city));
  }, [draft.routing, db.cities, rowsByOption]);
  const matching = (
    optionKey: OptionKey,
    row: (typeof dayRows)[number],
    meal: "Lunch" | "Dinner",
    status: "included" | "optional",
  ) =>
    (rowsByOption.get(optionKey) ?? []).filter(
      (item) =>
        item.day === row.day &&
        item.city_id === row.cityId &&
        item.meal_type === meal &&
        item.status === status,
    );
  const summary = (
    optionKey: OptionKey,
    meal: "Lunch" | "Dinner",
    status: "included" | "optional",
  ) => mealCostingTotal(draft, rowsByOption.get(optionKey) ?? [], meal, status);
  const price = (items: ReturnType<typeof matching>) => {
    if (!items.length) return "—";
    const base = items.reduce((sum, item) => sum + item.total, 0) / (items[0]?.pax || 1);
    const markup = base * hotelsMarkup(draft);
    const gst = (base + markup) * hotelsGst(draft);
    return (
      <>
        <div className="font-semibold">{money(base + markup + gst)}</div>
        <div className="text-[8px] text-[#73849b]">
          Net {money(base)}
          <br />
          GST {money(gst)}
        </div>
      </>
    );
  };
  const stay = (optionKey: OptionKey, row: (typeof dayRows)[number]) => {
    const rows = (rowsByOption.get(optionKey) ?? []).filter(
      (item) => item.day === row.day && item.city_id === row.cityId,
    );
    const route = draft.routing.find((item) => item.day === row.day);
    const option = options.find((item) => item.key === optionKey);
    const hotelSelection = route ? hotelSelectionForDay(option, route) : undefined;
    const hotelName = db.hotels.find((hotel) => hotel.id === hotelSelection?.hotel_id)?.name;
    const meal = (type: "Lunch" | "Dinner") => {
      const item = rows.find((value) => value.meal_type === type);
      const status = !item
        ? "No Meal"
        : item.status === "hotel_plan"
          ? "Included in Hotel Plan"
          : item.status === "included"
            ? "Included"
            : "Optional";
      return `${type}: ${status}${item?.label && item.status !== "hotel_plan" ? ` — ${item.label}` : ""}`;
    };
    return (
      <>
        <div className="font-semibold">
          {rows.find((item) => item.label)?.label || hotelName || "No meal venue selected"}
        </div>
        <div className="text-[8px] text-[#73849b]">{meal("Lunch")}</div>
        <div className="text-[8px] text-[#73849b]">{meal("Dinner")}</div>
        {hotelSelection?.meal_plan && (
          <div className="text-[8px] text-[#73849b]">
            Hotel Meal Plan: {hotelSelection.meal_plan}
          </div>
        )}
      </>
    );
  };
  return (
    <Section number={sectionNumber} title="Meals — Included & Optional Review">
      <div className="space-y-2 p-2">
        <Panel title="A. Day-wise Included & Optional Meals / Stay Plan">
          <div className="overflow-x-auto">
            <table className={`${grid} min-w-[900px]`}>
              <thead className="bg-[#f0f4f8] text-[9px] uppercase text-[#103353]">
                <tr>
                  <th>Day</th>
                  <th>Date</th>
                  <th className="text-left">City</th>
                  {options.map((option) => (
                    <th key={option.key} className="text-left">
                      Option {option.key} · {option.category || option.label || "Accommodation"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dayRows.map((row) => (
                  <tr key={`${row.day}:${row.cityId}`}>
                    <td>Day {row.day}</td>
                    <td>{row.date}</td>
                    <td>{row.city}</td>
                    {options.map((option) => (
                      <td key={option.key}>{stay(option.key, row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title="B. Meals — Rate Verification (Per Person)"
          helper="Hotel-plan meals are excluded from meal charges."
        >
          <div className="overflow-x-auto">
            <table className={`${grid} min-w-[1200px]`}>
              <thead>
                <tr className="bg-[#e6f0fb] text-[9px] uppercase text-[#103353]">
                  <th rowSpan={3}>Day</th>
                  <th rowSpan={3}>Date</th>
                  <th rowSpan={3} className="text-left">
                    City
                  </th>
                  {options.map((option) => (
                    <th key={option.key} colSpan={4}>
                      Option {option.key} · {option.category || option.label || "Accommodation"}
                    </th>
                  ))}
                </tr>
                <tr className="bg-[#f0f4f8] text-[8px] uppercase text-[#204e76]">
                  {options.flatMap((option) => [
                    <th key={`${option.key}-l`} colSpan={2}>
                      Lunch (PP)
                    </th>,
                    <th key={`${option.key}-d`} colSpan={2}>
                      Dinner (PP)
                    </th>,
                  ])}
                </tr>
                <tr className="bg-[#f0f4f8] text-[8px] uppercase text-[#204e76]">
                  {options.flatMap((option) =>
                    ["Included", "Optional", "Included", "Optional"].map((label, index) => (
                      <th key={`${option.key}-${index}`} className="text-right">
                        {label}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {dayRows.map((row) => (
                  <tr key={`${row.day}:${row.cityId}`}>
                    <td>Day {row.day}</td>
                    <td>{row.date}</td>
                    <td>{row.city}</td>
                    {options.flatMap((option) =>
                      [
                        price(matching(option.key, row, "Lunch", "included")),
                        price(matching(option.key, row, "Lunch", "optional")),
                        price(matching(option.key, row, "Dinner", "included")),
                        price(matching(option.key, row, "Dinner", "optional")),
                      ].map((value, index) => (
                        <td
                          key={`${option.key}-${index}`}
                          className="text-right align-top tabular-nums"
                        >
                          {value}
                        </td>
                      )),
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {[
                  "Total (Supplier incl. GST)",
                  "Markup",
                  "GST on markup",
                  "Final selling total",
                  "FINAL MEALS PRICE PP",
                ].map((label, index) => (
                  <tr
                    key={label}
                    className={
                      index === 4
                        ? "bg-[#eaf8ef] font-bold text-[#103353]"
                        : index === 3
                          ? "bg-[#e6f0fb] font-semibold"
                          : "bg-[#f5f8fb]"
                    }
                  >
                    <td colSpan={3}>{label}</td>
                    {options.flatMap((option) =>
                      [
                        summary(option.key, "Lunch", "included"),
                        summary(option.key, "Lunch", "optional"),
                        summary(option.key, "Dinner", "included"),
                        summary(option.key, "Dinner", "optional"),
                      ].map((total, totalIndex) => (
                        <td key={`${option.key}-${totalIndex}`} className="text-right tabular-nums">
                          {money(
                            index === 0
                              ? total.base_total
                              : index === 1
                                ? total.markup
                                : index === 2
                                  ? total.gst
                                  : index === 3
                                    ? total.final_total
                                    : total.per_person,
                          )}
                        </td>
                      )),
                    )}
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
        </Panel>
      </div>
    </Section>
  );
}

function ApprovedMealsReview({
  draft,
  sectionNumber = 5,
}: {
  draft: QuoteDraft;
  sectionNumber?: number;
}) {
  const db = useDB();
  const options = useMemo(() => {
    const configured = draft.hotel_options
      .filter((option) => option.selections.length > 0)
      .slice(0, 4);
    return configured.length
      ? configured
      : ([{ key: "A", label: "Option A", selections: [] }] as HotelOption[]);
  }, [draft.hotel_options]);
  const rowsByOption = useMemo(
    () =>
      new Map(
        options.map((option) => [option.key, calculateMealCostingRows(draft, db, option.key)]),
      ),
    [draft, db, options],
  );
  const cityName = (cityId?: string) => db.cities.find((city) => city.id === cityId)?.name;
  const routeCities = (route: RoutingDay) => {
    const cities = [
      route.from_city,
      cityName(route.city_id),
      route.to_city,
      cityName(route.to_city_id),
      ...(route.to_city_ids ?? []).map(cityName),
    ].filter(Boolean);
    return [...new Set(cities)].join(" → ") || "—";
  };
  const mealRows = (optionKey: OptionKey, day: number, type: "Lunch" | "Dinner") =>
    (rowsByOption.get(optionKey) ?? []).filter((row) => row.day === day && row.meal_type === type);
  const summary = (
    optionKey: OptionKey,
    meal: "Lunch" | "Dinner",
    status: "included" | "optional",
  ) => mealCostingTotal(draft, rowsByOption.get(optionKey) ?? [], meal, status);
  const venue = (rows: ReturnType<typeof mealRows>) =>
    rows
      .map((row) => row.label)
      .filter(Boolean)
      .join(" / ") || "—";
  const cities = (rows: ReturnType<typeof mealRows>) =>
    rows
      .map((row) => row.city)
      .filter(Boolean)
      .join(" / ") || "—";
  const price = (rows: ReturnType<typeof mealRows>, status: "included" | "optional") => {
    if (status === "included" && rows.some((row) => row.status === "hotel_plan"))
      return <span className="font-semibold text-emerald-800">Included in Hotel Plan</span>;
    const selected = rows.filter((row) => row.status === status);
    if (!selected.length) return "—";
    const base = selected.reduce((sum, row) => sum + row.total, 0) / (selected[0]?.pax || 1);
    const markup = base * hotelsMarkup(draft);
    const gst = (base + markup) * hotelsGst(draft);
    return (
      <>
        <div className="font-semibold">{money(base + markup + gst)}</div>
        <div className="text-[8px] text-[#73849b]">
          Net {money(base)}
          <br />
          GST {money(gst)}
        </div>
      </>
    );
  };
  const hotelPlan = (option: HotelOption, route: RoutingDay) => {
    const selection = hotelSelectionForDay(option, route);
    return selection?.meal_plan || "No Overnight Plan";
  };
  return (
    <Section number={sectionNumber} title="Meals — Option A Included & Optional Review">
      <div className="p-2">
        <div className="overflow-x-auto">
          <table className={`${grid} min-w-[1800px]`}>
            <thead>
              <tr className="bg-[#e6f0fb] text-[9px] uppercase text-[#103353]">
                <th rowSpan={3}>Day / Date / Cities Covered</th>
                {options.map((option) => (
                  <th key={option.key} colSpan={9}>
                    Option {option.key} · {option.category || option.label || "Accommodation"}
                  </th>
                ))}
              </tr>
              <tr className="bg-[#f0f4f8] text-[8px] uppercase text-[#204e76]">
                {options.flatMap((option) => [
                  <th key={`${option.key}-plan`} rowSpan={2}>
                    Hotel Plan
                  </th>,
                  <th key={`${option.key}-lunch`} colSpan={4}>
                    Lunch Arrangement
                  </th>,
                  <th key={`${option.key}-dinner`} colSpan={4}>
                    Dinner Arrangement
                  </th>,
                ])}
              </tr>
              <tr className="bg-[#f0f4f8] text-[8px] uppercase text-[#204e76]">
                {options.flatMap((option) =>
                  [
                    "City",
                    "Venue Name",
                    "Inclusion (₹)",
                    "Optional (₹)",
                    "City",
                    "Venue Name",
                    "Inclusion (₹)",
                    "Optional (₹)",
                  ].map((label, index) => (
                    <th
                      key={`${option.key}-${index}`}
                      className={
                        index === 2 || index === 3 || index === 6 || index === 7
                          ? "text-right"
                          : "text-left"
                      }
                    >
                      {label}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {draft.routing.map((route, index) => (
                <tr key={route.day}>
                  <td>
                    <b>Day {route.day}</b>
                    <div>{route.date || `Day ${index + 1}`}</div>
                    <div className="text-[8px] text-[#73849b]">{routeCities(route)}</div>
                  </td>
                  {options.flatMap((option) => {
                    const lunch = mealRows(option.key, route.day, "Lunch");
                    const dinner = mealRows(option.key, route.day, "Dinner");
                    return [
                      <td key={`${option.key}-plan`}>{hotelPlan(option, route)}</td>,
                      <td key={`${option.key}-lc`}>{cities(lunch)}</td>,
                      <td key={`${option.key}-lv`}>{venue(lunch)}</td>,
                      <td key={`${option.key}-li`} className="text-right align-top tabular-nums">
                        {price(lunch, "included")}
                      </td>,
                      <td key={`${option.key}-lo`} className="text-right align-top tabular-nums">
                        {price(lunch, "optional")}
                      </td>,
                      <td key={`${option.key}-dc`}>{cities(dinner)}</td>,
                      <td key={`${option.key}-dv`}>{venue(dinner)}</td>,
                      <td key={`${option.key}-di`} className="text-right align-top tabular-nums">
                        {price(dinner, "included")}
                      </td>,
                      <td key={`${option.key}-do`} className="text-right align-top tabular-nums">
                        {price(dinner, "optional")}
                      </td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              {[
                "Total (Supplier incl. GST)",
                "Markup",
                "GST on markup",
                "Final selling total",
                "FINAL MEALS PRICE PP",
              ].map((label, index) => (
                <tr
                  key={label}
                  className={
                    index === 4
                      ? "bg-[#eaf8ef] font-bold text-[#103353]"
                      : index === 3
                        ? "bg-[#e6f0fb] font-semibold"
                        : "bg-[#f5f8fb]"
                  }
                >
                  <td>{label}</td>
                  {options.flatMap((option) => [
                    <td key={`${option.key}-summary`} colSpan={5} />,
                    ...[
                      summary(option.key, "Lunch", "included"),
                      summary(option.key, "Lunch", "optional"),
                      summary(option.key, "Dinner", "included"),
                      summary(option.key, "Dinner", "optional"),
                    ].map((total, totalIndex) => (
                      <td key={`${option.key}-${totalIndex}`} className="text-right tabular-nums">
                        {money(
                          index === 0
                            ? total.base_total
                            : index === 1
                              ? total.markup
                              : index === 2
                                ? total.gst
                                : index === 3
                                  ? total.final_total
                                  : total.per_person,
                        )}
                      </td>
                    )),
                  ])}
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      </div>
    </Section>
  );
}

function PackageStandardCostingReviewImpl({
  draft,
  set,
  readOnly = false,
}: {
  draft: QuoteDraft;
  set: SetDraft;
  readOnly?: boolean;
}) {
  const costingDraft = useStableCostingDraft(draft);
  const scope = getQuotationScope(draft.query_for, draft.commercial_mode);
  const landMeals = scope.queryFor === "Land Part + Meals";
  const landOnly = scope.queryFor === "Land Part";
  const accommodationOnly = !scope.landPart && scope.accommodationPart;
  const dynamicAccommodation = isDynamicAccommodationMode(draft);
  return (
    <div
      className={`print-quotation-pages space-y-3 rounded-sm bg-white p-1 ${
        landOnly ? "print-land-only-pages" : landMeals ? "print-land-meals-pages" : ""
      }`}
    >
      <div className="print-trip-land-page space-y-3">
        <Masthead draft={costingDraft} />
        <TripInformation draft={costingDraft} />
        <div className="print-commercial-matrix-page [&_h2]:text-[#103353]">
          <CommercialPackageMatrix
            draft={costingDraft}
            set={set}
            readOnly={readOnly}
            displaySelection={draft.land_review_display_selection}
          />
        </div>
        {scope.landPart && (
          <LandReview draft={draft} costingDraft={costingDraft} set={set} readOnly={readOnly} />
        )}
        {accommodationOnly &&
          (dynamicAccommodation ? (
            <AccommodationDynamicCostingReview
              draft={costingDraft}
              options={costingDraft.hotel_options.slice(0, 4)}
              embedded
              embeddedSectionNumber={4}
            />
          ) : (
            <AccommodationReview draft={costingDraft} sectionNumber={4} />
          ))}
      </div>
      {!landOnly &&
        !accommodationOnly &&
        (landMeals ? (
          <div className="print-meals-section">
            <ApprovedMealsReview draft={costingDraft} />
          </div>
        ) : (
          <div className="print-accommodation-section">
            {dynamicAccommodation ? (
              <AccommodationDynamicCostingReview
                draft={costingDraft}
                options={costingDraft.hotel_options.slice(0, 4)}
                embedded
                embeddedSectionNumber={4}
              />
            ) : (
              <AccommodationReview draft={costingDraft} sectionNumber={4} />
            )}
          </div>
        ))}
      {scope.accommodationPart && (
        <div className="space-y-3 print-meals-section">
          <ApprovedMealsReview draft={costingDraft} sectionNumber={5} />
        </div>
      )}
    </div>
  );
}

export const PackageStandardCostingReview = memo(
  PackageStandardCostingReviewImpl,
  (previous, next) => previous.draft === next.draft && previous.readOnly === next.readOnly,
);
