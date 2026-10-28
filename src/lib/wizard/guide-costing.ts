import {
  guideConfiguredLanguages,
  guidePrimaryLanguage,
  guideRateForPax,
  type DB,
  type Guide,
  type GuideLanguage,
} from "@/lib/mock-store";
import { eligibleGuidesForDay } from "@/lib/wizard/land-eligibility";
import { effectivePaxForPricing, parsePaxRange } from "@/lib/wizard/calc";
import type { GuideLine, QuoteDraft } from "@/lib/wizard/types";
import {
  guideRawRateForPax,
  guideSelectionStatusForPax,
  type GuideSelectionStatus,
} from "@/lib/wizard/guide-pricing";

export const GUIDE_COSTING_LANGUAGES: GuideLanguage[] = ["Hindi", "English", "Language"];

export interface GuideCostingServiceRow {
  day: number;
  serviceKey: string;
  guideId: string;
  guideName: string;
  city: string;
  tour: string;
  language: GuideLanguage;
  status: GuideSelectionStatus;
  rate: number;
  base: number;
  line?: GuideLine;
}

export interface GuideLanguageCosting {
  language: GuideLanguage;
  includedRows: GuideCostingServiceRow[];
  optionalRows: GuideCostingServiceRow[];
  reportingCost: number;
  baseTotal: number;
  optionalBaseTotal: number;
}

const reportingFor = (draft: QuoteDraft, language: GuideLanguage) => {
  if (language === "Hindi")
    return draft.guide_reporting_cost_hindi ?? draft.guide_reporting_cost ?? 0;
  if (language === "English")
    return draft.guide_reporting_cost_english ?? draft.guide_reporting_cost ?? 0;
  return draft.guide_reporting_cost_language ?? draft.guide_reporting_cost ?? 0;
};

function lineAppliesToDay(line: GuideLine, day: number): boolean {
  return line.from_routing_days?.length ? line.from_routing_days.includes(day) : true;
}

function lineFor(
  draft: QuoteDraft,
  guide: Guide,
  day: number,
  language: GuideLanguage,
): GuideLine | undefined {
  const matches = draft.guides.filter(
    (line) =>
      !line.is_escort &&
      line.guide_id === guide.id &&
      lineAppliesToDay(line, day) &&
      (line.language === language ||
        (!(GUIDE_COSTING_LANGUAGES as readonly string[]).includes(line.language || "") &&
          guidePrimaryLanguage(guide) === language)),
  );
  return matches.find((line) => line.inclusion_status !== "optional") ?? matches[0];
}

function serviceSelected(draft: QuoteDraft, serviceKey: string, day: number, guide: Guide) {
  const explicit = draft.guide_tour_selected_by_day?.[day];
  if (explicit !== undefined) return explicit.includes(serviceKey);
  if ((draft.guide_tour_disabled_by_day?.[day] ?? []).includes(serviceKey)) return false;
  return draft.guides.some(
    (line) => !line.is_escort && line.guide_id === guide.id && lineAppliesToDay(line, day),
  );
}

export function guideServicesForPax(
  draft: QuoteDraft,
  db: DB,
  pax: number,
  language?: GuideLanguage,
  respectCostingSelection = false,
): GuideCostingServiceRow[] {
  const routingDays = draft.routing.map((day) => day.day);
  const rows: GuideCostingServiceRow[] = [];
  for (const route of draft.routing) {
    const eligible = eligibleGuidesForDay(draft, route, db);
    for (const guide of eligible) {
      const city = guide.city ?? guide.destination ?? "";
      const tour = guide.tour_program ?? guide.name;
      const serviceKey = `${city}||${tour}`;
      if (!serviceSelected(draft, serviceKey, route.day, guide)) continue;
      for (const selectedLanguage of language ? [language] : GUIDE_COSTING_LANGUAGES) {
        if (!guideConfiguredLanguages(guide).includes(selectedLanguage)) continue;
        const line = lineFor(draft, guide, route.day, selectedLanguage);
        let status = guideSelectionStatusForPax(
          draft,
          route.day,
          serviceKey,
          guide.id,
          selectedLanguage,
          5,
          line ? (line.inclusion_status === "optional" ? "optional" : "included") : undefined,
          line?.id,
        );
        // Step 7 has one package-price checkbox (beside the 1-5 rate) for all
        // three slabs. A selected Tour is Optional whenever that checkbox is
        // unchecked; per-slab legacy statuses must not contradict the UI.
        status = status === "included" ? "included" : "optional";
        const daySelections = draft.costing_selection?.guide?.[route.day];
        if (
          respectCostingSelection &&
          status === "included" &&
          daySelections !== undefined &&
          line &&
          !daySelections.includes(`${line.id}::${selectedLanguage}`)
        ) {
          status = "removed";
        }
        const rate =
          (line
            ? guideRawRateForPax(line, guide, selectedLanguage, pax, effectivePaxForPricing(draft))
            : undefined) ?? guideRateForPax(guide, pax, selectedLanguage);
        if (!(rate > 0)) continue;
        const days = line?.from_routing_days?.length
          ? line.from_routing_days.filter((day) => routingDays.includes(day))
          : line
            ? routingDays
            : [route.day];
        rows.push({
          day: route.day,
          serviceKey,
          guideId: guide.id,
          guideName: guide.name,
          city,
          tour,
          language: selectedLanguage,
          status,
          rate,
          base:
            (rate * Math.max(1, line?.guides ?? 1) * Math.max(1, line?.days ?? 1)) /
            Math.max(1, days.length),
          line,
        });
      }
    }
  }
  return rows;
}

export function guideLanguageCostingForPax(
  draft: QuoteDraft,
  db: DB,
  pax: number,
  language: GuideLanguage,
  respectCostingSelection = false,
): GuideLanguageCosting {
  const rows = guideServicesForPax(draft, db, pax, language, respectCostingSelection);
  const includedRows = rows.filter((row) => row.status === "included");
  const optionalRows = rows.filter((row) => row.status === "optional");
  const reportingCost = includedRows.length ? reportingFor(draft, language) : 0;
  const baseTotal = includedRows.reduce((sum, row) => sum + row.base, 0) + reportingCost;
  const optionalBaseTotal = optionalRows.reduce((sum, row) => sum + row.base, 0);
  return { language, includedRows, optionalRows, reportingCost, baseTotal, optionalBaseTotal };
}

export function availableGuideLanguages(guide: Guide): GuideLanguage[] {
  return guideConfiguredLanguages(guide).filter((language) =>
    GUIDE_COSTING_LANGUAGES.includes(language),
  );
}

/** Fixed presentation slabs plus the draft's configured maximum for the open-ended tier. */
export function guidePaxValuesForSlab(draft: QuoteDraft, slab: GuidePaxSlabKey): number[] {
  const configured = parsePaxRange(draft);
  const maxSupported =
    configured?.max ??
    Math.max(
      effectivePaxForPricing(draft),
      Number.isInteger(draft.pax_max) ? (draft.pax_max ?? 0) : 0,
    );
  const min = slab === "1-5" ? 1 : slab === "6-14" ? 6 : 15;
  const max = slab === "1-5" ? 5 : slab === "6-14" ? 14 : maxSupported;
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => min + index);
}
