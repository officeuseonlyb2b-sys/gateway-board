import {
  GUIDE_LANGUAGES,
  guideConfiguredLanguages,
  guidePrimaryLanguage,
  activityPricingForPax,
  type DB,
  type GuideLanguage,
} from "@/lib/mock-store";
import { inr } from "@/lib/format";
import { effectivePaxForPricing } from "@/lib/wizard/calc";
import {
  buildLandPart,
  catPicked,
  entranceRateSelected,
  entranceTourSelected,
  guideOptId,
  isPicked,
} from "@/lib/wizard/costsheet";
import {
  eligibleEntrancesForDay,
  eligibleGuidesForDay,
  isSelectedLandServiceValid,
} from "@/lib/wizard/land-eligibility";
import {
  escortDayAppliesToPax,
  getEscortBaseForPax,
  getEscortDayCharge,
  getEscortPricingMode,
  getEscortRangeDayCharge,
  isEscortEnabled,
  guideRawRateForPax,
} from "@/lib/wizard/guide-pricing";
import {
  guideReviewSlabs,
  landReviewRouteLabel,
  landReviewToursForDay,
  savedQuoteRawRate,
  type LandReviewTourRow,
} from "@/lib/wizard/land-review";
import { applyLandCommercials, miscPerPersonForPax } from "@/lib/wizard/land-pricing";
import type { EntranceCat, GuideLine, QuoteDraft, RoutingDay } from "@/lib/wizard/types";
import { useDB } from "@/lib/mock-store";

const grid =
  "w-full border-separate border-spacing-0 border-l border-t border-[#d7e2ed] text-[10px] text-[#1a3045] [&_td]:border-b [&_td]:border-r [&_td]:border-[#d7e2ed] [&_td]:px-2 [&_td]:py-1.5 [&_th]:border-b [&_th]:border-r [&_th]:border-[#d7e2ed] [&_th]:px-2 [&_th]:py-1.5";
const money = (value?: number) => (value == null || !Number.isFinite(value) ? "—" : inr(value));

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

export type LandReviewFilters = {
  transport: boolean;
  hindi: boolean;
  english: boolean;
  otherLanguage: boolean;
  escort: boolean;
  indian: boolean;
  foreign: boolean;
  student: boolean;
  activities: boolean;
  misc: boolean;
  guideIncluded: boolean;
  guideOptional: boolean;
  entranceIncluded: boolean;
  entranceOptional: boolean;
  activityIncluded: boolean;
  activityOptional: boolean;
  miscIncluded: boolean;
  paxDisplay: "ranges" | "exact";
  exactPax: number;
};

type GuideColumn = {
  key: string;
  language: GuideLanguage;
  label: string;
  slab: string;
  slabIndex: number;
  inclusion: "included" | "optional";
};
type GuideReviewEntry = {
  master: DB["guides"][number];
  line?: GuideLine;
  language: GuideLanguage;
  tourSelected: boolean;
};
type EntranceColumn = {
  key: string;
  category: EntranceCat;
  inclusion: "included" | "optional";
  label: string;
};
type ActivityColumn = {
  key: "included" | "optional";
  inclusion: "included" | "optional";
  label: string;
};
type EscortColumn = { key: string; label: string; rangeId?: string };
type TourDisplayRow = {
  tour: LandReviewTourRow;
  rowType?: "tour" | "activity" | "misc";
  serviceId?: string;
  reportingLanguage?: GuideLanguage;
};
type DayGroup = {
  route: RoutingDay;
  routeLabel: string;
  sheetRow: ReturnType<typeof buildLandPart>["rows"][number];
  rows: TourDisplayRow[];
};

const norm = (value?: string) =>
  (value ?? "")
    .normalize("NFKD")
    .trim()
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const languageForLine = (
  language: string | undefined,
  primary: GuideLanguage | undefined,
): GuideLanguage | undefined => {
  const selected = language || primary;
  return selected && (GUIDE_LANGUAGES as readonly string[]).includes(selected)
    ? (selected as GuideLanguage)
    : undefined;
};

const dayApplies = (lineDays: number[] | undefined, day: number, routing: RoutingDay[]) =>
  lineDays?.length ? lineDays.includes(day) : routing.some((route) => route.day === day);

export function LandDaywiseReview({
  draft,
  filters,
}: {
  draft: QuoteDraft;
  filters: LandReviewFilters;
}) {
  const db = useDB();
  const sheet = buildLandPart(draft, db);
  const pricingPax = Math.max(1, effectivePaxForPricing(draft));
  const languageEnabled = (language: GuideLanguage) =>
    language === "Hindi"
      ? filters.hindi
      : language === "English"
        ? filters.english
        : filters.otherLanguage;

  const dayGroups: DayGroup[] = draft.routing.map((route) => {
    const sheetRow = sheet.rows.find((row) => row.day === route.day)!;
    const tours =
      route.is_day_zero || route.day === 0 ? [] : landReviewToursForDay(draft, route, db);
    const rows: TourDisplayRow[] = tours.map((tour) => ({ tour }));
    if (!rows.length)
      rows.push({
        tour: {
          city_id: route.city_id,
          city: db.cities.find((city) => city.id === route.city_id)?.name || "—",
          title: "—",
        },
      });
    sheetRow.guide_opts
      .filter((option) => option.checked && option.id.startsWith("guide-reporting::"))
      .forEach((option) => {
        const language = option.id.slice("guide-reporting::".length) as GuideLanguage;
        if (languageEnabled(language))
          rows.push({
            tour: {
              city: "—",
              title: `${language === "Language" ? "Other Language" : language} Guide Reporting`,
            },
            reportingLanguage: language,
          });
      });
    return {
      route,
      routeLabel:
        route.is_day_zero || route.day === 0
          ? "Pre-tour"
          : landReviewRouteLabel(route, db, draft.tour_start_city || draft.departure_city),
      sheetRow,
      rows,
    };
  });

  const guideEntriesForTour = (route: RoutingDay, tour: LandReviewTourRow): GuideReviewEntry[] =>
    eligibleGuidesForDay(draft, route, db).flatMap((master) => {
      const masterCity = master.city ?? master.destination;
      if (masterCity && tour.city !== "—" && norm(masterCity) !== norm(tour.city)) return [];
      if (tour.tour_id && master.tour_id) {
        if (tour.tour_id !== master.tour_id) return [];
      } else if (norm(master.tour_program ?? master.name) !== norm(tour.title)) {
        return [];
      }

      const matchingLines = draft.guides.filter(
        (line) =>
          !line.is_escort &&
          line.guide_id === master.id &&
          dayApplies(line.from_routing_days, route.day, draft.routing),
      );
      const selectedTourKeys = draft.guide_tour_selected_by_day?.[route.day];
      const tourKey = `${master.city ?? master.destination ?? ""}||${master.tour_program ?? master.name}`;
      const legacyDisabled = (draft.guide_tour_disabled_by_day?.[route.day] ?? []).includes(
        tourKey,
      );
      const tourSelected =
        selectedTourKeys !== undefined
          ? selectedTourKeys.includes(tourKey)
          : !legacyDisabled && matchingLines.some((line) => line.inclusion_status !== "optional");
      const configured = guideConfiguredLanguages(master);
      const primary = guidePrimaryLanguage(master) ?? undefined;

      return GUIDE_LANGUAGES.flatMap((language) => {
        if (!languageEnabled(language)) return [];
        if (configured.length ? !configured.includes(language) : primary !== language) return [];
        const lines = matchingLines.filter(
          (line) => languageForLine(line.language, primary) === language,
        );
        const line =
          lines.find((candidate) => candidate.inclusion_status !== "optional") ?? lines[0];
        return [{ master, line, language, tourSelected }];
      });
    });

  const guideEntries = dayGroups.flatMap((group) =>
    group.rows.flatMap((row) =>
      row.reportingLanguage ? [] : guideEntriesForTour(group.route, row.tour),
    ),
  );
  const guideLanguages = GUIDE_LANGUAGES.filter(
    (language) =>
      languageEnabled(language) && guideEntries.some((entry) => entry.language === language),
  );
  const guideGroups = guideLanguages
    .map((language) => {
      const entries = guideEntries.filter((entry) => entry.language === language);
      const slabs =
        filters.paxDisplay === "exact"
          ? [`${filters.exactPax} Pax`]
          : Array.from(
              new Set(
                entries.flatMap(({ line, master }) => {
                  const masterSlabs = guideReviewSlabs(master, language).map((item) => item.label);
                  const savedSlabs = (line?.pax_ranges ?? []).map(
                    (item) => `${item.from_pax}–${item.to_pax}`,
                  );
                  return [...masterSlabs, ...savedSlabs];
                }),
              ),
            ).sort(
              (left, right) =>
                Number(left.match(/^\d+/)?.[0] ?? 0) - Number(right.match(/^\d+/)?.[0] ?? 0),
            );
      const inclusions: GuideColumn["inclusion"][] = [
        ...(filters.guideIncluded ? ["included" as const] : []),
        ...(filters.guideOptional ? ["optional" as const] : []),
      ];
      return {
        language,
        label: language === "Language" ? "Other Language" : language,
        slabs,
        inclusions,
        columns: slabs.flatMap((slab, slabIndex) =>
          inclusions.map((inclusion) => ({
            key: `${language}-${inclusion}-${slab}`,
            language,
            label: inclusion === "included" ? "Included" : "Optional",
            slab,
            slabIndex,
            inclusion,
          })),
        ),
      };
    })
    .filter((group) => group.columns.length > 0);
  const guideColumns = guideGroups.flatMap((group) => group.columns);

  const escortMode = getEscortPricingMode(draft);
  const escortRanges = (draft.escort_ranges ?? []).filter((range) =>
    filters.paxDisplay === "ranges"
      ? true
      : filters.exactPax >= range.min_pax && filters.exactPax <= range.max_pax,
  );
  const escortColumns: EscortColumn[] =
    !filters.escort || !isEscortEnabled(draft)
      ? []
      : escortMode === "pax_range" && escortRanges.length
        ? escortRanges.map((range) => ({
            key: range.id,
            rangeId: range.id,
            label:
              filters.paxDisplay === "exact"
                ? `${filters.exactPax} Pax`
                : `${range.min_pax}–${range.max_pax}`,
          }))
        : [
            {
              key: escortMode || "configured",
              label:
                escortMode === "day_wise"
                  ? "Day-wise"
                  : escortMode === "per_person"
                    ? "Per Person"
                    : "Configured",
            },
          ];

  const entranceInclusions: EntranceColumn["inclusion"][] = [
    ...(filters.entranceIncluded ? ["included" as const] : []),
    ...(filters.entranceOptional ? ["optional" as const] : []),
  ];
  const entranceGroups = [
    filters.indian &&
      entranceInclusions.length > 0 && { category: "indian" as const, label: "Indian" },
    filters.foreign &&
      entranceInclusions.length > 0 && { category: "foreign" as const, label: "Foreigner" },
    filters.student &&
      entranceInclusions.length > 0 && { category: "student" as const, label: "Student" },
  ].filter(Boolean) as { category: EntranceCat; label: string }[];
  const entranceColumns: EntranceColumn[] = entranceGroups.flatMap((group) =>
    entranceInclusions.map((inclusion) => ({
      key: `${group.category}-${inclusion}`,
      category: group.category,
      inclusion,
      label: inclusion === "included" ? "Included" : "Optional",
    })),
  );
  const entranceName = (value: string) =>
    db.entrance_sites.find((site) => site.id === value)?.site_name || value;

  const guideCellValue = (
    group: DayGroup,
    displayRow: TourDisplayRow,
    column: GuideColumn,
  ): number | undefined => {
    if (displayRow.reportingLanguage)
      return displayRow.reportingLanguage === column.language && column.inclusion === "included"
        ? group.sheetRow.guide_opts.find(
            (option) => option.id === `guide-reporting::${column.language}`,
          )?.amount
        : undefined;
    const entries = guideEntriesForTour(group.route, displayRow.tour).filter(
      (entry) => entry.language === column.language && entry.tourSelected,
    );
    return (
      entries.reduce((sum, { line, master }) => {
        let pax: number;
        if (filters.paxDisplay === "exact") {
          pax = filters.exactPax;
        } else {
          const [fromPax, toPax] = column.slab.split(/[–-]/).map(Number);
          pax =
            pricingPax >= fromPax && pricingPax <= (toPax || Number.POSITIVE_INFINITY)
              ? pricingPax
              : fromPax;
        }
        const rate = guideRawRateForPax(
          line ?? { rate: 0 },
          master,
          column.language,
          pax,
          pricingPax,
        );
        if (!(rate && rate > 0)) return sum;
        const included = Boolean(
          line &&
          line.inclusion_status !== "optional" &&
          isPicked(draft, "guide", group.route.day, guideOptId(line.id, column.language)),
        );
        if ((included ? "included" : "optional") !== column.inclusion) return sum;
        const targets = line?.from_routing_days?.length
          ? line.from_routing_days.filter((day) => draft.routing.some((route) => route.day === day))
          : draft.routing.map((route) => route.day);
        const multiplier = line ? (line.guides * line.days) / Math.max(1, targets.length) : 1;
        return sum + rate * multiplier;
      }, 0) || undefined
    );
  };

  const escortCellValue = (group: DayGroup, column: EscortColumn): number | undefined => {
    if (!filters.escort || !isEscortEnabled(draft)) return undefined;
    if (escortMode === "pax_range" && column.rangeId) {
      const range = (draft.escort_ranges ?? []).find((item) => item.id === column.rangeId);
      if (!range) return undefined;
      const value =
        getEscortBaseForPax(
          { ...draft, escort_ranges: [range] },
          filters.paxDisplay === "exact" ? filters.exactPax : range.min_pax,
        ) / Math.max(1, draft.routing.length);
      return value > 0 ? value : undefined;
    }
    if (escortMode === "day_wise") {
      if (!escortDayAppliesToPax(draft, pricingPax)) return undefined;
      const value = getEscortDayCharge(draft, group.route.day);
      return value > 0 ? value : undefined;
    }
    const selected = group.sheetRow.guide_opts
      .filter((item) => item.checked && item.label.toLowerCase().includes("escort"))
      .reduce((sum, item) => sum + item.amount, 0);
    return selected > 0 ? selected : undefined;
  };

  const entranceCellValue = (
    group: DayGroup,
    tour: LandReviewTourRow,
    column: EntranceColumn,
  ): number | undefined => {
    const amount = eligibleEntrancesForDay(draft, group.route, db).reduce((sum, site) => {
      const siteId = site.id;
      if (
        !entranceTourSelected(
          draft,
          group.route.day,
          siteId,
          Boolean(
            draft.entrances.find(
              (line) =>
                line.site_id === siteId &&
                dayApplies(line.from_routing_days, group.route.day, draft.routing),
            ),
          ),
        )
      ) {
        return sum;
      }
      if (tour.tour_id && site.tour_id) {
        if (tour.tour_id !== site.tour_id) return sum;
      } else if (norm(entranceName(siteId)) !== norm(tour.title)) {
        return sum;
      }
      const line = draft.entrances.find(
        (candidate) =>
          candidate.site_id === siteId &&
          dayApplies(candidate.from_routing_days, group.route.day, draft.routing),
      );
      const rate =
        column.category === "indian"
          ? site.indian_rate
          : column.category === "foreign"
            ? site.foreigner_rate
            : (site.student_rate ?? 0);
      if (!(rate > 0)) return sum;
      const selected = Boolean(
        line &&
        entranceRateSelected(
          draft,
          group.route.day,
          line.id,
          column.category,
          isPicked(draft, "entrances", group.route.day, line.id) &&
            catPicked(draft, group.route.day, column.category),
        ),
      );
      if ((selected ? "included" : "optional") !== column.inclusion) return sum;
      return sum + rate;
    }, 0);
    return amount > 0 ? amount : undefined;
  };

  const reportingOnly = (group: DayGroup) => {
    const rates = group.sheetRow.guide_opts.filter(
      (option) => option.checked && option.id.startsWith("guide-reporting::"),
    );
    return rates.flatMap((option) => {
      const language = option.id.slice("guide-reporting::".length) as GuideLanguage;
      if (!languageEnabled(language)) return [];
      return [
        {
          tour: {
            city: "—",
            title: `${language === "Language" ? "Other Language" : language} Reporting`,
          },
          rowType: "tour",
          reportingLanguage: language,
        } satisfies TourDisplayRow,
      ];
    });
  };

  const activityColumns: ActivityColumn[] = [
    filters.activities &&
      filters.activityIncluded && { key: "included", inclusion: "included", label: "Included" },
    filters.activities &&
      filters.activityOptional && { key: "optional", inclusion: "optional", label: "Optional" },
  ].filter(Boolean) as ActivityColumn[];
  const showActivities = activityColumns.length > 0;
  const showMisc = filters.misc && filters.miscIncluded;
  const groups: DayGroup[] = draft.routing.map((route) => {
    const sheetRow = sheet.rows.find((row) => row.day === route.day)!;
    const tours =
      route.is_day_zero || route.day === 0 ? [] : landReviewToursForDay(draft, route, db);
    const serviceRows: TourDisplayRow[] = tours.length
      ? tours.map((tour) => ({ tour, rowType: "tour" }))
      : [
          {
            tour: {
              city: db.cities.find((city) => city.id === route.city_id)?.name || "—",
              title: "—",
            },
            rowType: "tour",
          },
        ];
    const activityRows: TourDisplayRow[] = showActivities
      ? draft.activities.flatMap((line) => {
          const optional = line.inclusion_status === "optional";
          if (
            (optional && !filters.activityOptional) ||
            (!optional && !filters.activityIncluded) ||
            !dayApplies(line.from_routing_days, route.day, draft.routing)
          )
            return [];
          if (!isSelectedLandServiceValid("activity", line.activity_id, route.day, draft, db))
            return [];
          const option = sheetRow.activity_opts.find((item) => item.id === line.id);
          const master = db.activities.find((item) => item.id === line.activity_id);
          return [
            {
              tour: {
                city: db.cities.find((city) => city.id === route.city_id)?.name || "—",
                title: `${line.custom_name || master?.activity_name || option?.label || "Activity"}${optional ? " · Optional" : ""}`,
              },
              rowType: "activity" as const,
              serviceId: line.id,
            },
          ];
        })
      : [];
    const miscRows: TourDisplayRow[] = showMisc
      ? draft.misc.flatMap((line) => {
          if (!line.from_routing_days?.includes(route.day)) return [];
          const master = db.miscellaneous_items.find((item) => item.id === line.item_id);
          return [
            {
              tour: { city: "—", title: line.custom_name || master?.name || "Miscellaneous" },
              rowType: "misc" as const,
              serviceId: line.id,
            },
          ];
        })
      : [];
    const rows = [
      ...serviceRows,
      ...activityRows,
      ...miscRows,
      ...reportingOnly({ route, routeLabel: "", sheetRow, rows: serviceRows }),
    ];
    return {
      route,
      routeLabel: landReviewRouteLabel(route, db, draft.tour_start_city || draft.departure_city),
      sheetRow,
      rows,
    };
  });

  const generalMisc = showMisc ? draft.misc.filter((line) => !line.from_routing_days?.length) : [];
  const activityValue = (_group: DayGroup, row: TourDisplayRow, column: ActivityColumn) => {
    if (row.rowType !== "activity") return undefined;
    const line = draft.activities.find((item) => item.id === row.serviceId);
    if (
      !line ||
      (line.inclusion_status === "optional" ? "optional" : "included") !== column.inclusion
    )
      return undefined;
    const savedRate = savedQuoteRawRate(line, filters.exactPax);
    if (savedRate > 0) return savedRate;
    const master = line.activity_id
      ? db.activities.find((activity) => activity.id === line.activity_id)
      : undefined;
    if (!master) return undefined;
    const resolved = activityPricingForPax(
      master,
      filters.exactPax,
      draft.traveler_type ?? "indian",
    );
    return resolved.rate > 0 ? resolved.rate : undefined;
  };
  const rawMiscValue = (id: string) => {
    const line = draft.misc.find((item) => item.id === id);
    if (!line) return undefined;
    return savedQuoteRawRate(line, filters.exactPax);
  };
  const miscValue = (_group: DayGroup, row: TourDisplayRow) =>
    row.rowType === "misc" && row.serviceId ? rawMiscValue(row.serviceId) : undefined;
  const generalMiscValue = (id: string) => rawMiscValue(id);
  const miscBase = draft.misc.reduce(
    (total, line) => total + miscPerPersonForPax(line, pricingPax),
    0,
  );
  const summaryBases = [
    ...guideColumns.map((column) =>
      groups.reduce(
        (total, group) =>
          total +
          group.rows.reduce(
            (sum, row) =>
              sum + (row.rowType === "tour" ? (guideCellValue(group, row, column) ?? 0) : 0),
            0,
          ),
        0,
      ),
    ),
    ...escortColumns.map((column) =>
      groups.reduce((total, group) => total + (escortCellValue(group, column) ?? 0), 0),
    ),
    ...entranceColumns.map((column) =>
      groups.reduce(
        (total, group) =>
          total +
          group.rows.reduce(
            (sum, row) =>
              sum +
              (row.rowType === "tour" && !row.reportingLanguage
                ? (entranceCellValue(group, row.tour, column) ?? 0)
                : 0),
            0,
          ),
        0,
      ),
    ),
    ...activityColumns.map((column) =>
      groups.reduce(
        (total, group) =>
          total +
          group.rows.reduce((sum, row) => sum + (activityValue(group, row, column) ?? 0), 0),
        0,
      ),
    ),
    ...(showMisc ? [miscBase] : []),
  ];

  const guideHeaders = (
    <>
      {guideGroups.map((group) => (
        <th key={group.language} colSpan={group.columns.length} className="text-center">
          {group.language === "Language"
            ? group.label
            : group.language !== "Hindi" && group.language !== "English"
              ? `Other Language · ${group.label}`
              : group.label}
        </th>
      ))}
      {escortColumns.length > 0 && (
        <th colSpan={escortColumns.length} className="text-center">
          Tour Escort
        </th>
      )}
      {entranceColumns.length > 0 && (
        <th colSpan={entranceColumns.length} className="bg-[#fff5d6] text-center">
          Entrances (PP)
        </th>
      )}
    </>
  );
  return (
    <Panel
      title="A. Day-wise Land Services Pricing Review (View Only)"
      helper="Guide and Escort values use the selected Pax slabs or exact Pax"
    >
      <div className="overflow-x-auto">
        <table className={`${grid} min-w-[1250px] table-fixed border-collapse`}>
          <colgroup>
            <col className="w-[48px]" />
            <col className="w-[84px]" />
            <col className="w-[210px]" />
            <col className="w-[115px]" />
            <col className="w-[230px]" />
            {guideColumns.map((column) => (
              <col key={`guide-${column.key}`} className="w-[86px]" />
            ))}
            {escortColumns.map((column) => (
              <col key={`escort-${column.key}`} className="w-[86px]" />
            ))}
            {entranceColumns.map((column) => (
              <col key={`entrance-${column.key}`} className="w-[82px]" />
            ))}
            {activityColumns.map((column) => (
              <col key={`activity-${column.key}`} className="w-[110px]" />
            ))}
            {showMisc && <col className="w-[110px]" />}
          </colgroup>
          <thead>
            <tr className="bg-[#e6f0fb] text-[9px] uppercase text-[#103353]">
              <th rowSpan={3}>Day</th>
              <th rowSpan={3}>Date</th>
              <th rowSpan={3} className="text-left">
                Route
              </th>
              <th rowSpan={3} className="text-left">
                City
              </th>
              <th rowSpan={3} className="text-left">
                Tour / Service
              </th>
              {guideHeaders}
              {showActivities && (
                <th colSpan={activityColumns.length} className="bg-[#eef8f1] text-center">
                  Activities / Experiences
                </th>
              )}
              {showMisc && (
                <th rowSpan={3} className="bg-[#f4f0fb] text-center">
                  Miscellaneous · Included
                </th>
              )}
            </tr>
            <tr className="bg-[#f0f4f8] text-[8px] uppercase text-[#204e76]">
              {guideGroups.flatMap((group) =>
                group.slabs.map((slab) => (
                  <th
                    key={`${group.language}-${slab}`}
                    colSpan={group.inclusions.length}
                    className="text-center"
                  >
                    {slab} Pax
                  </th>
                )),
              )}
              {escortColumns.length > 0 && (
                <th colSpan={escortColumns.length} className="text-center">
                  {escortMode === "pax_range" ? "Pax Range" : "Configured"}
                </th>
              )}
              {entranceGroups.map((group) => (
                <th
                  key={group.category}
                  colSpan={entranceInclusions.length}
                  className="bg-[#fff5d6] text-center"
                >
                  {group.label}
                </th>
              ))}
              {activityColumns.map((column) => (
                <th key={`activity-${column.key}`} rowSpan={2} className="bg-[#eef8f1] text-center">
                  {column.label}
                </th>
              ))}
            </tr>
            <tr className="bg-[#f7fbff] text-[8px] uppercase text-[#204e76]">
              {guideColumns.map((column) => (
                <th key={column.key} className="text-center">
                  {column.label}
                </th>
              ))}
              {escortColumns.map((column) => (
                <th key={column.key} className="text-center">
                  {column.label}
                </th>
              ))}
              {entranceColumns.map((column) => (
                <th key={column.key} className="bg-[#fff5d6] text-center">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const count = group.rows.length;
              return group.rows.map((displayRow, rowIndex) => {
                const isFirst = rowIndex === 0;
                return (
                  <tr
                    key={`${group.route.day}-${displayRow.reportingLanguage || displayRow.tour.tour_id || displayRow.tour.title}-${rowIndex}`}
                    className={
                      isFirst && group.route.day !== 1 ? "border-t-2 border-t-[#9db6ca]" : ""
                    }
                  >
                    {isFirst && (
                      <td rowSpan={count} className="align-middle font-semibold">
                        {group.route.day}
                      </td>
                    )}
                    {isFirst && (
                      <td rowSpan={count} className="align-middle whitespace-nowrap">
                        {group.route.date || "—"}
                      </td>
                    )}
                    {isFirst && (
                      <td rowSpan={count} className="align-middle whitespace-normal">
                        {group.routeLabel}
                      </td>
                    )}
                    <td className="whitespace-normal">{displayRow.tour.city}</td>
                    <td className="whitespace-normal">{displayRow.tour.title}</td>
                    {guideColumns.map((column) => (
                      <td key={column.key} className="text-right tabular-nums">
                        {money(
                          displayRow.rowType === "tour"
                            ? guideCellValue(group, displayRow, column)
                            : undefined,
                        )}
                      </td>
                    ))}
                    {escortColumns.map((column) => (
                      <td key={column.key} className="text-right tabular-nums">
                        {isFirst && displayRow.rowType === "tour"
                          ? money(escortCellValue(group, column))
                          : "—"}
                      </td>
                    ))}
                    {entranceColumns.map((column) => (
                      <td key={column.key} className="bg-[#fffdf7] text-right tabular-nums">
                        {money(
                          displayRow.rowType === "tour" && !displayRow.reportingLanguage
                            ? entranceCellValue(group, displayRow.tour, column)
                            : undefined,
                        )}
                      </td>
                    ))}
                    {activityColumns.map((column) => (
                      <td
                        key={`activity-${column.key}`}
                        className="bg-[#f7fcf8] whitespace-nowrap text-right tabular-nums"
                      >
                        {money(activityValue(group, displayRow, column))}
                      </td>
                    ))}
                    {showMisc && (
                      <td className="bg-[#faf8fd] whitespace-nowrap text-right tabular-nums">
                        {money(miscValue(group, displayRow))}
                      </td>
                    )}
                  </tr>
                );
              });
            })}
            {generalMisc.map((line, index) => {
              const master = db.miscellaneous_items.find((item) => item.id === line.item_id);
              return (
                <tr
                  key={`general-misc-${line.id}`}
                  className={index === 0 ? "border-t-2 border-t-[#9db6ca]" : ""}
                >
                  <td>—</td>
                  <td>—</td>
                  <td>General</td>
                  <td>—</td>
                  <td className="whitespace-normal">
                    {line.custom_name || master?.name || "Miscellaneous"}
                  </td>
                  {Array.from({
                    length: guideColumns.length + escortColumns.length + entranceColumns.length,
                  }).map((_, cellIndex) => (
                    <td key={cellIndex} className="text-right">
                      —
                    </td>
                  ))}
                  {activityColumns.map((column) => (
                    <td key={`activity-${column.key}`} className="bg-[#f7fcf8] text-right">
                      —
                    </td>
                  ))}
                  {showMisc && (
                    <td className="bg-[#faf8fd] whitespace-nowrap text-right tabular-nums">
                      {money(generalMiscValue(line.id))}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="font-semibold">
            {["Base / Total", "Markup", "GST", "Final Total"].map((label, index) => (
              <tr
                key={String(label)}
                className={index === 3 ? "bg-[#eaf8ef] text-[#103353]" : "bg-[#f5f8fb]"}
              >
                <td colSpan={5} className="text-right">
                  {label}
                </td>
                {summaryBases.map((base, columnIndex) => {
                  const commercial = applyLandCommercials(draft, base);
                  const value =
                    index === 0
                      ? commercial.base
                      : index === 1
                        ? commercial.markup
                        : index === 2
                          ? commercial.gst
                          : commercial.final;
                  return (
                    <td key={columnIndex} className="whitespace-nowrap text-right tabular-nums">
                      {money(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}
