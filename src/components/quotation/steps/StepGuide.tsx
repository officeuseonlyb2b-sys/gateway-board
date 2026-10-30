// Step 13 — Guide charges by routing day, language, and master pricing tier.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useDB,
  guideConfiguredLanguages,
  guidePrimaryLanguage,
  guideRateForPax,
  type GuideLanguage,
  type Guide,
} from "@/lib/mock-store";
import {
  effectivePaxForPricing,
  getCostingPaxValues,
  landMarkup,
  parsePaxRange,
} from "@/lib/wizard/calc";
import { applyLandCommercials } from "@/lib/wizard/land-pricing";
import {
  guidePaxSlabKey,
  guideSlabSelectionKey,
  type GuidePaxSlabKey,
  type GuideSelectionStatus,
} from "@/lib/wizard/guide-pricing";
import {
  guideLanguageCostingForPax,
  guidePaxValuesForSlab,
  guideServicesForPax,
} from "@/lib/wizard/guide-costing";
import {
  eligibleGuidesForDay,
  isSelectedLandServiceValid,
  landDayContext,
} from "@/lib/wizard/land-eligibility";
import {
  getEscortBaseForPax,
  getEscortPricingMode,
  getEscortRangeBase,
  getEscortRangeDayCharge,
  isEscortDayRequired,
  isEscortEnabled,
  guideRawRateForPax,
} from "@/lib/wizard/guide-pricing";
import { uid, type StepProps } from "../shared";
import type { GuideLine, QuoteDraft } from "@/lib/wizard/types";

const GUIDE_LANGUAGES: GuideLanguage[] = ["Hindi", "English", "Language"];
const PAX_TIERS = [
  { key: "1-5", label: "1–5 Pax", min: 1, max: 5, pax: 5 },
  { key: "6-14", label: "6–14 Pax", min: 6, max: 14, pax: 14 },
  { key: "15+", label: "15+ Pax", min: 15, max: Number.POSITIVE_INFINITY, pax: 15 },
] as const;
type TierKey = (typeof PAX_TIERS)[number]["key"];
type EscortEditorState = {
  escort_type: string;
  escort_ranges: NonNullable<QuoteDraft["escort_ranges"]>;
};

const languageLabel = (language: GuideLanguage) =>
  language === "Language" ? "Other Language" : language;

function reportingKey(language: GuideLanguage) {
  if (language === "Hindi") return "guide_reporting_cost_hindi";
  if (language === "English") return "guide_reporting_cost_english";
  return "guide_reporting_cost_language";
}

function makeTourKey(city: string, tour: string) {
  return `${city}||${tour}`;
}

const normalizedTourValue = (value?: string) =>
  (value ?? "")
    .normalize("NFKD")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function guideMasterRatePax(
  guide: import("@/lib/mock-store").Guide,
  language: GuideLanguage,
  pax: number,
) {
  const configuredLanguages = guideConfiguredLanguages(guide);
  const typedLanguage = guide.guide_type.startsWith("Hindi")
    ? "Hindi"
    : guide.guide_type.startsWith("English")
      ? "English"
      : undefined;
  if (configuredLanguages.length && !configuredLanguages.includes(language)) return 0;
  if (!configuredLanguages.length && typedLanguage && language !== typedLanguage) return 0;
  if (!configuredLanguages.length && !typedLanguage) return 0;
  return guideRateForPax(guide, pax, language);
}

export function Step13({ draft, set }: StepProps) {
  const db = useDB();
  const pricingPax = effectivePaxForPricing(draft);
  const costingPaxValues = getCostingPaxValues(draft);
  const languageFilter = (GUIDE_LANGUAGES as readonly string[]).includes(draft.guide_language ?? "")
    ? (draft.guide_language as GuideLanguage)
    : "Hindi";
  const visibleLanguages = [languageFilter];
  const escortMode = getEscortPricingMode(draft);
  const escortEnabled = isEscortEnabled(draft);
  const escortRanges = draft.escort_ranges ?? [];
  const [escortDialogOpen, setEscortDialogOpen] = useState(false);
  const [escortEditor, setEscortEditor] = useState<EscortEditorState | null>(null);
  const [escortEditorError, setEscortEditorError] = useState("");
  const [confirmEscortRemoval, setConfirmEscortRemoval] = useState(false);
  const [serviceView, setServiceView] = useState<"guides" | "escort">("guides");
  const showRestyledGuideTable = false;
  // Kept for draft compatibility with the legacy eligible-guide dialog.
  const [addGuideDay, setAddGuideDay] = useState<number | null>(null);
  const [guideSearch, setGuideSearch] = useState("");

  const cityName = (id: string) => db.cities.find((city) => city.id === id)?.name || "";
  const allGuides = useMemo(() => db.guides.filter((guide) => guide.is_active), [db.guides]);
  const lineAppliesToDay = (line: GuideLine, day: number) =>
    line.from_routing_days?.length
      ? line.from_routing_days.includes(day)
      : draft.routing.some((route) => route.day === day);
  const findGuideLanguageLine = (
    lines: GuideLine[],
    guideId: string,
    day: number,
    language: GuideLanguage,
  ) => {
    const master = db.guides.find((guide) => guide.id === guideId);
    const matching = lines.filter(
      (line) =>
        !line.is_escort &&
        line.guide_id === guideId &&
        (line.language === language ||
          (!(GUIDE_LANGUAGES as readonly string[]).includes(line.language || "") &&
            master !== undefined &&
            guidePrimaryLanguage(master) === language)) &&
        lineAppliesToDay(line, day),
    );
    return matching.find((line) => line.inclusion_status !== "optional") ?? matching[0];
  };
  const selectedGuideLine = (guideId: string, day: number, language: GuideLanguage) =>
    findGuideLanguageLine(draft.guides, guideId, day, language);

  const getReporting = (language: GuideLanguage) =>
    (draft[reportingKey(language)] as number | undefined) ?? 0;
  const setReporting = (language: GuideLanguage, value: number) =>
    set({ [reportingKey(language)]: value } as Partial<typeof draft>);
  const guideRateForLine = useCallback(
    (
      guide: import("@/lib/mock-store").Guide,
      language: GuideLanguage,
      pax: number,
      line?: GuideLine,
    ) =>
      line
        ? (guideRawRateForPax(line, guide, language, pax, pricingPax) ?? 0)
        : guideMasterRatePax(guide, language, pax),
    [pricingPax],
  );
  const paxForGuideTier = (tier: (typeof PAX_TIERS)[number]) =>
    pricingPax >= tier.min && pricingPax <= tier.max ? pricingPax : tier.pax;
  const closeEscortEditor = () => {
    setEscortDialogOpen(false);
    setEscortEditor(null);
    setEscortEditorError("");
    setConfirmEscortRemoval(false);
  };

  const range = parsePaxRange(draft);
  const applicableTiers = PAX_TIERS.filter((tier) => {
    return range
      ? range.min <= tier.max && range.max >= tier.min
      : pricingPax >= tier.min && pricingPax <= tier.max;
  });

  const openEscortEditor = () => {
    setEscortEditor({
      escort_type: draft.escort_type || escortRanges[0]?.escort_type || "English Speaking Escort",
      escort_ranges: escortRanges.map((range) => ({ ...range })),
    });
    setEscortEditorError("");
    setConfirmEscortRemoval(false);
    setEscortDialogOpen(true);
  };

  const updateEscortEditor = (patch: Partial<EscortEditorState>) =>
    setEscortEditor((current) => (current ? { ...current, ...patch } : current));

  const saveEscortEditor = () => {
    if (
      !escortEditor?.escort_ranges.length ||
      escortEditor.escort_ranges.some(
        (rangeItem) => rangeItem.min_pax < 1 || rangeItem.max_pax < rangeItem.min_pax,
      )
    ) {
      setEscortEditorError("Add at least one valid Pax Range (Min Pax ≥ 1 and Max Pax ≥ Min Pax).");
      return;
    }
    const retainedRangeIds = new Set(
      escortEditor.escort_ranges
        .filter((next) => {
          const previous = escortRanges.find((range) => range.id === next.id);
          return previous?.min_pax === next.min_pax && previous.max_pax === next.max_pax;
        })
        .map((range) => range.id),
    );
    const escortDayRates = Object.fromEntries(
      Object.entries(draft.escort_day_rates_by_slab ?? {}).map(([day, rates]) => [
        day,
        Object.fromEntries(
          Object.entries(rates).filter(([rangeId]) => retainedRangeIds.has(rangeId)),
        ),
      ]),
    );
    set({
      escort_enabled: true,
      escort_type: escortEditor.escort_type,
      escort_pricing_mode: "pax_range",
      escort_ranges: escortEditor.escort_ranges.map((range) => ({
        ...range,
        escort_type: escortEditor.escort_type,
      })),
      escort_day_rates_by_slab: escortDayRates,
    });
    closeEscortEditor();
  };

  const removeEscort = () => setConfirmEscortRemoval(true);
  const confirmRemoveEscort = () => {
    set({
      escort_enabled: false,
      escort_pricing_mode: undefined,
      escort_type: undefined,
      escort_ranges: [],
      guide_day_escort: {},
      guide_day_escort_enabled: {},
      escort_day_rates_by_slab: {},
      guide_escort_reporting: 0,
      escort_per_person_rate: 0,
      escort_day_min_pax: undefined,
      escort_day_max_pax: undefined,
      guides: draft.guides.filter((line) => !line.is_escort),
    });
    closeEscortEditor();
  };

  const dayData = draft.routing.map((route, routeIndex) => {
    const fromDefault =
      routeIndex === 0
        ? draft.departure_city
        : cityName(draft.routing[routeIndex - 1]?.city_id || "");
    const from = route.from_city || fromDefault || "—";
    const to = cityName(route.city_id) || route.to_city || "—";
    const routeLabel = from === to ? `${to} Local` : `${from} → ${to}`;
    const context = landDayContext(draft, route, db);
    const selectedTitleMap = route.tours_selected_by_city ?? {};
    const selectedIdMap = route.tour_ids_by_city ?? {};
    const selectionCityKeys = [
      ...new Set([
        ...Object.keys(selectedTitleMap),
        ...Object.keys(selectedIdMap),
        ...Object.keys(route.tour_titles_by_city ?? {}),
      ]),
    ];
    const routingSelections = selectionCityKeys.flatMap((cityKey) => {
      const titles = [...(selectedTitleMap[cityKey] ?? [])];
      const legacyTitle = route.tour_titles_by_city?.[cityKey];
      if (legacyTitle && !titles.includes(legacyTitle)) titles.push(legacyTitle);
      const ids = selectedIdMap[cityKey] ?? [];
      return Array.from({ length: Math.max(titles.length, ids.length) }, (_, index) => {
        const tourId = ids[index];
        const title =
          titles[index] ?? db.destination_tours.find((tour) => tour.id === tourId)?.title ?? "";
        return { cityKey, title, tourId };
      }).filter(({ title }) => Boolean(title));
    });
    if (route.tour_title && !routingSelections.some(({ title }) => title === route.tour_title)) {
      routingSelections.push({
        cityKey: route.to_city_id ?? route.city_id,
        title: route.tour_title,
        tourId: undefined,
      });
    }
    const options = routingSelections.map((selection) => {
      const destinationTour = selection.tourId
        ? db.destination_tours.find((tour) => tour.id === selection.tourId)
        : context.selectedTours.find(
            (tour) => normalizedTourValue(tour.title) === normalizedTourValue(selection.title),
          );
      const city =
        db.destination_cities.find((item) => item.id === destinationTour?.city_id)?.name ??
        db.cities.find((item) => item.id === selection.cityKey)?.name ??
        db.destination_cities.find((item) => item.id === selection.cityKey)?.name ??
        selection.cityKey;
      const matchingGuide = db.guides.find(
        (guide) =>
          guide.is_active &&
          ((destinationTour?.id && guide.tour_id === destinationTour.id) ||
            (!guide.tour_id &&
              normalizedTourValue(guide.city ?? guide.destination) === normalizedTourValue(city) &&
              normalizedTourValue(guide.tour_program ?? guide.name) ===
                normalizedTourValue(selection.title))),
      );
      const key = makeTourKey(city, selection.title);
      const guide: Guide =
        matchingGuide ??
        ({
          id: `routing-tour-unconfigured::${route.day}::${key}`,
          name: selection.title,
          guide_type: "Hindi Guide - Local",
          destination: city,
          city,
          tour_program: selection.title,
          tour_id: destinationTour?.id,
          rate_per_day: 0,
          rate_1_to_5: 0,
          rate_6_to_14: 0,
          rate_15_plus: 0,
          description: "Routing tour without a configured Guide Master rate",
          is_active: false,
          created_at: "",
        } satisfies Guide);
      return { city, tour: selection.title, guide, key };
    });
    // Legacy drafts without explicit Routing tour fields retain the old eligibility behavior.
    if (!context.hasExplicitTourSelection) {
      options.push(
        ...eligibleGuidesForDay(draft, route, db).map((guide) => ({
          city: guide.city ?? guide.destination ?? "",
          tour: guide.tour_program ?? guide.name,
          guide,
          key: makeTourKey(guide.city ?? guide.destination ?? "", guide.tour_program ?? guide.name),
        })),
      );
    }
    const siteRows = options.map((option) => {
      const key = option.key;
      const languageLines = Object.fromEntries(
        GUIDE_LANGUAGES.map((language) => [
          language,
          selectedGuideLine(option.guide.id, route.day, language),
        ]),
      ) as Record<GuideLanguage, GuideLine | undefined>;
      const hasIncludedLanguage = GUIDE_LANGUAGES.some((language) =>
        Boolean(languageLines[language]),
      );
      const explicitTourSelection = draft.guide_tour_selected_by_day?.[route.day];
      const legacyDisabled = (draft.guide_tour_disabled_by_day?.[route.day] ?? []).includes(key);
      const isTourSelected = explicitTourSelection
        ? explicitTourSelection.includes(key)
        : !legacyDisabled && Boolean(hasIncludedLanguage);
      const tierRates = Object.fromEntries(
        GUIDE_LANGUAGES.map((language) => [
          language,
          Object.fromEntries(
            PAX_TIERS.map((tier) => [
              tier.key,
              guideRateForLine(
                option.guide,
                language,
                paxForGuideTier(tier),
                languageLines[language],
              ),
            ]),
          ),
        ]),
      ) as Record<GuideLanguage, Record<TierKey, number>>;
      return {
        ...option,
        key,
        languageLines,
        tierRates,
        isTourSelected,
        isSelected: isTourSelected,
      };
    });
    return {
      route,
      routeLabel,
      siteRows,
      eligibleRows: siteRows,
      hasRows: siteRows.length > 0,
    };
  });

  useEffect(() => {
    if (draft.guide_tour_selected_by_day !== undefined) return;

    let guidesChanged = false;
    const guides = draft.guides.map((line) => {
      if (line.is_escort || line.inclusion_status === "optional") return line;
      const master = db.guides.find((guide) => guide.id === line.guide_id);
      const language = (GUIDE_LANGUAGES as readonly string[]).includes(line.language || "")
        ? (line.language as GuideLanguage)
        : master
          ? guidePrimaryLanguage(master) || undefined
          : undefined;
      const hasApplicableRate =
        !!master &&
        !!language &&
        applicableTiers.some((tier) => guideRateForLine(master, language, tier.pax, line) > 0);
      if (!hasApplicableRate) {
        guidesChanged = true;
        return { ...line, inclusion_status: "optional" as const };
      }
      if (line.language === language) return line;
      guidesChanged = true;
      return {
        ...line,
        language,
        rate: guideMasterRatePax(master, language, pricingPax),
      };
    });
    const selectedByDay = Object.fromEntries(
      dayData.map((day) => [
        day.route.day,
        day.siteRows.filter((site) => site.isTourSelected).map((site) => site.key),
      ]),
    );
    const guideSelections = { ...(draft.costing_selection?.guide ?? {}) };
    let guideSelectionsChanged = false;
    guides.forEach((line) => {
      if (
        line.is_escort ||
        line.inclusion_status === "optional" ||
        !(GUIDE_LANGUAGES as readonly string[]).includes(line.language || "")
      )
        return;
      const lineDays = line.from_routing_days?.length
        ? line.from_routing_days
        : draft.routing.map((route) => route.day);
      lineDays.forEach((day) => {
        const current = guideSelections[day];
        if (!current) return;
        const selectedKey = `${line.id}::${line.language}`;
        const next = [...current.filter((key) => !key.startsWith(`${line.id}::`)), selectedKey];
        if (next.length !== current.length || next.some((key, index) => key !== current[index])) {
          guideSelections[day] = next;
          guideSelectionsChanged = true;
        }
      });
    });

    set({
      ...(guidesChanged ? { guides } : {}),
      guide_tour_selected_by_day: selectedByDay,
      ...(guideSelectionsChanged
        ? {
            costing_selection: {
              ...(draft.costing_selection ?? {}),
              guide: guideSelections,
            },
          }
        : {}),
    });
  }, [draft, dayData, applicableTiers, db.guides, guideRateForLine, pricingPax, set]);

  const paxInTier = (tier: (typeof PAX_TIERS)[number]) => guidePaxValuesForSlab(draft, tier.key);
  const summaryPaxForTier = (tier: (typeof PAX_TIERS)[number]) =>
    pricingPax >= tier.min && pricingPax <= tier.max ? pricingPax : tier.pax;
  const guideSectionData = visibleLanguages.map((language) => ({
    language,
    tiers: PAX_TIERS.map((tier) => {
      const summaryPax = summaryPaxForTier(tier);
      const costing = guideLanguageCostingForPax(draft, db, summaryPax, language);
      const optionalCommercial = applyLandCommercials(draft, costing.optionalBaseTotal);
      const personRows = paxInTier(tier).map((pax) => {
        const paxCosting = guideLanguageCostingForPax(draft, db, pax, language);
        const commercial = applyLandCommercials(draft, paxCosting.baseTotal);
        return {
          pax,
          base: paxCosting.baseTotal,
          final: commercial.final,
          perPerson: commercial.final / Math.max(1, pax),
          masterTier:
            pax <= 5 ? "Guide Master 1–5" : pax <= 14 ? "Guide Master 6–14" : "Guide Master 15+",
        };
      });
      return {
        ...tier,
        summaryPax,
        costing,
        commercial: applyLandCommercials(draft, costing.baseTotal),
        optionalCommercial,
        personRows,
      };
    }),
  }));
  const guideSlabLabel = (pax: number) =>
    PAX_TIERS.find((tier) => pax >= tier.min && pax <= tier.max)?.label ?? "15+ Pax";
  const guideBaseForPax = (language: GuideLanguage, pax: number) =>
    guideLanguageCostingForPax(draft, db, pax, language).baseTotal;
  type LegacyGuideTableRow = {
    day: number;
    routeLabel: string;
    city: string;
    tour: string;
    guide: Guide;
    line?: GuideLine;
    language: GuideLanguage;
    isTourSelected: boolean;
    tierRates: Record<GuideLanguage, Record<TierKey, number>>;
  };
  const eligibleGuideRows: LegacyGuideTableRow[] = dayData.flatMap((day) =>
    day.siteRows.flatMap((site) =>
      GUIDE_LANGUAGES.map((language) => ({
        day: day.route.day,
        routeLabel: day.routeLabel,
        city: site.city,
        tour: site.tour,
        guide: site.guide,
        line: site.languageLines[language],
        language,
        isTourSelected: site.isTourSelected,
        tierRates: site.tierRates,
      })),
    ),
  );
  const includedGuideRows = eligibleGuideRows.filter(
    (row) => row.isTourSelected && row.line?.inclusion_status === "included",
  );
  const optionalGuideRows = eligibleGuideRows.filter(
    (row) => row.isTourSelected && row.line?.inclusion_status === "optional",
  );
  const includedGuideBaseForRow = (row: LegacyGuideTableRow, pax: number) =>
    (guideRateForLine(row.guide, row.language, pax, row.line) *
      Math.max(1, row.line?.guides ?? 1) *
      Math.max(1, row.line?.days ?? 1)) /
    Math.max(1, row.line?.from_routing_days?.length ?? draft.routing.length);
  const languageCosting = (pax: number) =>
    visibleLanguages.map((language) => guideLanguageCostingForPax(draft, db, pax, language));
  const includedGuideReporting = languageCosting(pricingPax).reduce(
    (sum, costing) => sum + costing.reportingCost,
    0,
  );
  const includedGuideCommercial = applyLandCommercials(
    draft,
    languageCosting(pricingPax).reduce((sum, costing) => sum + costing.baseTotal, 0),
  );
  const optionalGuideReporting = 0;
  const optionalGuideCommercial = applyLandCommercials(
    draft,
    languageCosting(pricingPax).reduce((sum, costing) => sum + costing.optionalBaseTotal, 0),
  );
  const rangeCostingRows = costingPaxValues.map((pax) => {
    const costing = languageCosting(pax);
    const base = costing.reduce((sum, value) => sum + value.baseTotal, 0);
    const optionalBase = costing.reduce((sum, value) => sum + value.optionalBaseTotal, 0);
    return {
      pax,
      unavailable: [],
      slabs: guideSlabLabel(pax),
      base,
      optionalBase,
      commercial: applyLandCommercials(draft, base),
      optionalCommercial: applyLandCommercials(draft, optionalBase),
    };
  });

  const activeEscortRanges = escortEnabled && escortMode === "pax_range" ? escortRanges : [];
  const escortColumns = activeEscortRanges.length
    ? activeEscortRanges.map((range) => ({
        id: range.id,
        label: `${range.min_pax}–${range.max_pax} Pax`,
        base: getEscortRangeBase(draft, range),
      }))
    : escortEnabled && escortMode === "per_person"
      ? [
          {
            id: "per-person",
            label: "Per Person",
            base:
              (draft.escort_per_person_rate ?? 0) +
              (draft.guide_escort_reporting ?? 0) / Math.max(1, pricingPax),
          },
        ]
      : escortEnabled && escortMode === "day_wise"
        ? [{ id: "day-wise", label: "Day-wise", base: getEscortBaseForPax(draft, pricingPax) }]
        : [];
  const tourSelectionForDay = (day: number) => {
    const explicit = draft.guide_tour_selected_by_day?.[day];
    if (explicit !== undefined) return [...explicit];
    return (
      dayData
        .find((item) => item.route.day === day)
        ?.siteRows.filter((site) => site.isTourSelected)
        .map((site) => site.key) ?? []
    );
  };
  const updateGuideLinesForDay = (
    lines: GuideLine[],
    guideId: string,
    day: number,
    language: GuideLanguage | undefined,
    patch: Partial<GuideLine>,
  ) => {
    const updated: GuideLine[] = [];
    const affectedIds: string[] = [];
    lines.forEach((line) => {
      if (
        line.is_escort ||
        line.guide_id !== guideId ||
        (language !== undefined && line.language !== language) ||
        !lineAppliesToDay(line, day)
      ) {
        updated.push(line);
        return;
      }
      const lineDays = line.from_routing_days?.length
        ? line.from_routing_days
        : draft.routing.map((route) => route.day);
      const otherDays = lineDays.filter((lineDay) => lineDay !== day);
      if (otherDays.length) {
        updated.push({ ...line, from_routing_days: otherDays });
        const dayLine = { ...line, id: uid(), from_routing_days: [day], ...patch };
        updated.push(dayLine);
        affectedIds.push(line.id, dayLine.id);
      } else {
        updated.push({ ...line, from_routing_days: [day], ...patch });
        affectedIds.push(line.id);
      }
    });
    return { lines: updated, affectedIds: [...new Set(affectedIds)] };
  };
  const updateGuideCostingSelection = (
    selection: Record<number, string[]>,
    day: number,
    affectedIds: string[],
    selectedLanguage?: GuideLanguage,
    selectedLineId?: string,
  ) => {
    const prefixes = affectedIds.map((id) => `${id}::`);
    const current = selection[day] ?? [];
    const next = current.filter((id) => !prefixes.some((prefix) => id.startsWith(prefix)));
    if (selectedLanguage && selectedLineId) next.push(`${selectedLineId}::${selectedLanguage}`);
    selection[day] = next;
  };
  const setTourStatus = (
    day: number,
    site: (typeof dayData)[number]["siteRows"][number],
    selection: boolean | GuideSelectionStatus,
  ) => {
    const status: GuideSelectionStatus =
      typeof selection === "boolean" ? (selection ? "included" : "removed") : selection;
    const selected = status !== "removed";
    const disabledByDay = { ...(draft.guide_tour_disabled_by_day ?? {}) };
    const selectedByDay = { ...(draft.guide_tour_selected_by_day ?? {}) };
    const disabled = new Set(disabledByDay[day] ?? []);
    const selectedTours = new Set(tourSelectionForDay(day));
    if (selected) disabled.delete(site.key);
    else disabled.add(site.key);
    if (selected) selectedTours.add(site.key);
    else selectedTours.delete(site.key);
    disabledByDay[day] = [...disabled];
    selectedByDay[day] = [...selectedTours];

    let guides = [...draft.guides];
    const guideSelection = { ...(draft.costing_selection?.guide ?? {}) };
    const guideSlabs = { ...(draft.guide_slab_selection_by_day ?? {}) };
    if (!selected) {
      const result = updateGuideLinesForDay(guides, site.guide.id, day, undefined, {
        inclusion_status: "optional",
      });
      guides = result.lines;
      updateGuideCostingSelection(guideSelection, day, result.affectedIds);
      const daySlabs = { ...(guideSlabs[day] ?? {}) };
      PAX_TIERS.forEach((tier) =>
        GUIDE_LANGUAGES.forEach((language) => {
          daySlabs[guideSlabSelectionKey(site.key, site.guide.id, language, tier.key)] = "removed";
        }),
      );
      guideSlabs[day] = daySlabs;
    }
    set({
      guides,
      guide_tour_disabled_by_day: disabledByDay,
      guide_tour_selected_by_day: selectedByDay,
      costing_selection: { ...(draft.costing_selection ?? {}), guide: guideSelection },
      ...(!selected ? { guide_slab_selection_by_day: guideSlabs } : {}),
    });
  };
  const visibleGuideTours = dayData.flatMap((day) =>
    day.siteRows.map((site) => ({ day: day.route.day, site })),
  );
  const allVisibleToursSelected =
    visibleGuideTours.length > 0 && visibleGuideTours.every(({ site }) => site.isTourSelected);
  const someVisibleToursSelected = visibleGuideTours.some(({ site }) => site.isTourSelected);
  const setAllVisibleTours = (selected: boolean) => {
    const selectedByDay = { ...(draft.guide_tour_selected_by_day ?? {}) };
    const disabledByDay = { ...(draft.guide_tour_disabled_by_day ?? {}) };
    visibleGuideTours.forEach(({ day, site }) => {
      const selectedTours = new Set(selectedByDay[day] ?? tourSelectionForDay(day));
      const disabledTours = new Set(disabledByDay[day] ?? []);
      if (selected) {
        selectedTours.add(site.key);
        disabledTours.delete(site.key);
      } else {
        selectedTours.delete(site.key);
        disabledTours.add(site.key);
      }
      selectedByDay[day] = [...selectedTours];
      disabledByDay[day] = [...disabledTours];
    });
    set({
      guide_tour_selected_by_day: selectedByDay,
      guide_tour_disabled_by_day: disabledByDay,
    });
  };
  const setGuideLanguageStatus = (
    day: number,
    site: (typeof dayData)[number]["siteRows"][number],
    language: GuideLanguage,
    selection: boolean | GuideSelectionStatus,
  ) => {
    // A guide is one service with three alternative pax rates.  Keep its state
    // atomic so an unchecked Included/Optional row is genuinely removed.
    const status: GuideSelectionStatus =
      typeof selection === "boolean" ? (selection ? "included" : "removed") : selection;
    let guides = [...draft.guides];
    const rate = guideMasterRatePax(site.guide, language, pricingPax);
    const paxRanges = [
      { from_pax: 1, to_pax: 5, rate: guideMasterRatePax(site.guide, language, 1) },
      { from_pax: 6, to_pax: 14, rate: guideMasterRatePax(site.guide, language, 6) },
      {
        from_pax: 15,
        to_pax: Number.MAX_SAFE_INTEGER,
        rate: guideMasterRatePax(site.guide, language, 15),
      },
    ].filter((range) => range.rate > 0);
    const result = updateGuideLinesForDay(guides, site.guide.id, day, language, {
      inclusion_status: status === "removed" ? "optional" : status,
      rate,
      language,
      pax_ranges: paxRanges,
    });
    guides = result.lines;
    let affectedIds = result.affectedIds;
    if (status !== "removed" && !affectedIds.length) {
      const line: GuideLine = {
        id: uid(),
        guide_id: site.guide.id,
        days: 1,
        guides: 1,
        rate,
        language,
        inclusion_status: status,
        from_routing_days: [day],
        pax_ranges: paxRanges,
      };
      guides.push(line);
      affectedIds = [line.id];
    }
    const selectedLine = findGuideLanguageLine(guides, site.guide.id, day, language);
    const guideSelection = { ...(draft.costing_selection?.guide ?? {}) };
    updateGuideCostingSelection(
      guideSelection,
      day,
      affectedIds,
      status === "included" ? language : undefined,
      status === "included" ? selectedLine?.id : undefined,
    );
    const disabledByDay = { ...(draft.guide_tour_disabled_by_day ?? {}) };
    disabledByDay[day] = (disabledByDay[day] ?? []).filter((key) => key !== site.key);
    const selectedByDay = { ...(draft.guide_tour_selected_by_day ?? {}) };
    const selectedTours = new Set(tourSelectionForDay(day));
    selectedTours.add(site.key);
    selectedByDay[day] = [...selectedTours];
    const guideSlabs = { ...(draft.guide_slab_selection_by_day ?? {}) };
    const daySlabs = { ...(guideSlabs[day] ?? {}) };
    PAX_TIERS.forEach((tier) => {
      daySlabs[guideSlabSelectionKey(site.key, site.guide.id, language, tier.key)] = status;
    });
    guideSlabs[day] = daySlabs;
    set({
      guides,
      guide_tour_disabled_by_day: disabledByDay,
      guide_tour_selected_by_day: selectedByDay,
      guide_slab_selection_by_day: guideSlabs,
      costing_selection: { ...(draft.costing_selection ?? {}), guide: guideSelection },
    });
  };
  const setGuideSlabStatus = (
    row: ReturnType<typeof guideServicesForPax>[number],
    _slab: GuidePaxSlabKey,
    status: GuideSelectionStatus,
    pax: number,
  ) => {
    let guides = [...draft.guides];
    const matching = selectedGuideLine(row.guideId, row.day, row.language);
    const savedPaxRates = [
      { from_pax: 1, to_pax: 5, rate: guideMasterRatePax(row.guide, row.language, 1) },
      { from_pax: 6, to_pax: 14, rate: guideMasterRatePax(row.guide, row.language, 6) },
      {
        from_pax: 15,
        to_pax: Number.MAX_SAFE_INTEGER,
        rate: guideMasterRatePax(row.guide, row.language, 15),
      },
    ].filter((rate) => rate.rate > 0);
    if (matching) {
      const updated = updateGuideLinesForDay(guides, row.guideId, row.day, row.language, {
        inclusion_status: status === "removed" ? "optional" : status,
        language: row.language,
        pax_ranges: matching.pax_ranges?.length ? matching.pax_ranges : savedPaxRates,
      });
      guides = updated.lines;
    } else if (status !== "removed") {
      guides.push({
        id: uid(),
        guide_id: row.guideId,
        days: 1,
        guides: 1,
        rate: guideMasterRatePax(row.guide, row.language, pax),
        pax_ranges: savedPaxRates,
        language: row.language,
        inclusion_status: status,
        from_routing_days: [row.day],
      });
    }

    const guideSlabs = { ...(draft.guide_slab_selection_by_day ?? {}) };
    const daySlabs = { ...(guideSlabs[row.day] ?? {}) };
    const servicePrefix = `${row.serviceKey}::${row.guideId}::${row.language}::`;
    if (!Object.keys(daySlabs).some((key) => key.startsWith(servicePrefix))) {
      PAX_TIERS.forEach((tier) => {
        daySlabs[guideSlabSelectionKey(row.serviceKey, row.guideId, row.language, tier.key)] =
          "removed";
      });
    }
    // A Guide Service is selected once for its language; its three Guide Master
    // rates are alternatives, not independently selectable services.
    PAX_TIERS.forEach((tier) => {
      daySlabs[guideSlabSelectionKey(row.serviceKey, row.guideId, row.language, tier.key)] = status;
    });
    guideSlabs[row.day] = daySlabs;
    const tourSelections = { ...(draft.guide_tour_selected_by_day ?? {}) };
    if (status !== "removed") {
      const current = new Set(tourSelectionForDay(row.day));
      current.add(row.serviceKey);
      tourSelections[row.day] = [...current];
    }
    const costingGuideSelections = { ...(draft.costing_selection?.guide ?? {}) };
    const selectedLine = findGuideLanguageLine(guides, row.guideId, row.day, row.language);
    const lineToken = selectedLine ? `${selectedLine.id}::${row.language}` : "";
    const dayTokens = costingGuideSelections[row.day] ?? [];
    const nextDayTokens =
      status === "included" && lineToken
        ? [
            ...new Set([
              ...dayTokens.filter((token) => !token.startsWith(`${selectedLine.id}::`)),
              lineToken,
            ]),
          ]
        : dayTokens.filter((token) => !token.startsWith(`${selectedLine?.id ?? row.guideId}::`));
    if (nextDayTokens.length) costingGuideSelections[row.day] = nextDayTokens;
    else delete costingGuideSelections[row.day];
    set({
      guides,
      guide_slab_selection_by_day: guideSlabs,
      costing_selection: {
        ...(draft.costing_selection ?? {}),
        guide: costingGuideSelections,
      },
      ...(status !== "removed" ? { guide_tour_selected_by_day: tourSelections } : {}),
    });
  };
  const hasRateForLanguage = (
    site: (typeof dayData)[number]["siteRows"][number],
    language: GuideLanguage,
  ) => applicableTiers.some((tier) => site.tierRates[language][tier.key] > 0);
  const isLanguageSelected = (
    site: (typeof dayData)[number]["siteRows"][number],
    language: GuideLanguage,
  ) =>
    site.languageLines[language]?.inclusion_status !== "optional" && !!site.languageLines[language];
  const isLanguageInStatus = (
    day: number,
    site: (typeof dayData)[number]["siteRows"][number],
    language: GuideLanguage,
    status: Exclude<GuideSelectionStatus, "removed">,
  ) =>
    site.isTourSelected &&
    hasRateForLanguage(site, language) &&
    (guideServiceStatus(day, site, language) === "included" ? "included" : "optional") === status;
  const guideServiceStatus = (
    day: number,
    site: (typeof dayData)[number]["siteRows"][number],
    language: GuideLanguage,
  ): GuideSelectionStatus =>
    draft.guide_slab_selection_by_day?.[day]?.[
      guideSlabSelectionKey(site.key, site.guide.id, language, "1-5")
    ] ??
    (site.languageLines[language]?.inclusion_status === "included"
      ? "included"
      : site.languageLines[language]?.inclusion_status === "optional"
        ? "optional"
        : "removed");
  const setAllForLanguage = (language: GuideLanguage, selection: GuideSelectionStatus) => {
    const selected = selection !== "removed";
    const status = selection === "removed" ? "optional" : selection;
    let guides = [...draft.guides];
    const disabledByDay = { ...(draft.guide_tour_disabled_by_day ?? {}) };
    const selectedByDay = { ...(draft.guide_tour_selected_by_day ?? {}) };
    const guideSelection = { ...(draft.costing_selection?.guide ?? {}) };
    const guideSlabs = { ...(draft.guide_slab_selection_by_day ?? {}) };
    dayData.forEach((day) =>
      day.siteRows.forEach((site) => {
        if (!site.isTourSelected || !hasRateForLanguage(site, language)) return;
        const routeDay = day.route.day;
        const selectedTours = new Set(selectedByDay[routeDay] ?? tourSelectionForDay(routeDay));
        selectedTours.add(site.key);
        selectedByDay[routeDay] = [...selectedTours];
        const result = updateGuideLinesForDay(guides, site.guide.id, routeDay, language, {
          inclusion_status: status,
          rate: guideMasterRatePax(site.guide, language, pricingPax),
          language,
          pax_ranges: [
            { from_pax: 1, to_pax: 5, rate: guideMasterRatePax(site.guide, language, 1) },
            { from_pax: 6, to_pax: 14, rate: guideMasterRatePax(site.guide, language, 6) },
            {
              from_pax: 15,
              to_pax: Number.MAX_SAFE_INTEGER,
              rate: guideMasterRatePax(site.guide, language, 15),
            },
          ].filter((range) => range.rate > 0),
        });
        guides = result.lines;
        let affectedIds = result.affectedIds;
        if (selected && !affectedIds.length) {
          const line: GuideLine = {
            id: uid(),
            guide_id: site.guide.id,
            days: 1,
            guides: 1,
            rate: guideMasterRatePax(site.guide, language, pricingPax),
            language,
            inclusion_status: status,
            from_routing_days: [routeDay],
            pax_ranges: [
              { from_pax: 1, to_pax: 5, rate: guideMasterRatePax(site.guide, language, 1) },
              { from_pax: 6, to_pax: 14, rate: guideMasterRatePax(site.guide, language, 6) },
              {
                from_pax: 15,
                to_pax: Number.MAX_SAFE_INTEGER,
                rate: guideMasterRatePax(site.guide, language, 15),
              },
            ].filter((range) => range.rate > 0),
          };
          guides.push(line);
          affectedIds = [line.id];
        }
        const selectedLine = findGuideLanguageLine(guides, site.guide.id, routeDay, language);
        updateGuideCostingSelection(
          guideSelection,
          routeDay,
          affectedIds,
          selection === "included" ? language : undefined,
          selection === "included" ? selectedLine?.id : undefined,
        );
        disabledByDay[routeDay] = (disabledByDay[routeDay] ?? []).filter((key) => key !== site.key);
        const daySlabs = { ...(guideSlabs[routeDay] ?? {}) };
        PAX_TIERS.forEach((tier) => {
          daySlabs[guideSlabSelectionKey(site.key, site.guide.id, language, tier.key)] = selection;
        });
        guideSlabs[routeDay] = daySlabs;
      }),
    );
    set({
      guides,
      guide_tour_disabled_by_day: disabledByDay,
      guide_tour_selected_by_day: selectedByDay,
      guide_slab_selection_by_day: guideSlabs,
      costing_selection: { ...(draft.costing_selection ?? {}), guide: guideSelection },
    });
  };
  const allLanguageRatesSelected = (
    language: GuideLanguage,
    status: Exclude<GuideSelectionStatus, "removed"> = "included",
  ) => {
    const available = dayData.flatMap((day) =>
      day.siteRows
        .filter((site) => site.isTourSelected && hasRateForLanguage(site, language))
        .map((site) => ({ site, day: day.route.day })),
    );
    return (
      available.length > 0 &&
      available.every(({ site, day }) => isLanguageInStatus(day, site, language, status))
    );
  };

  const addEditorRange = () =>
    setEscortEditor((current) =>
      current
        ? {
            ...current,
            escort_ranges: [
              ...current.escort_ranges,
              {
                id: uid(),
                min_pax: Math.max(1, pricingPax),
                max_pax: Math.max(1, pricingPax),
                escort_type: current.escort_type,
                charge: 0,
              },
            ],
          }
        : current,
    );
  const patchEditorRange = (
    id: string,
    patch: Partial<EscortEditorState["escort_ranges"][number]>,
  ) =>
    setEscortEditor((current) =>
      current
        ? {
            ...current,
            escort_ranges: current.escort_ranges.map((rangeItem) =>
              rangeItem.id === id
                ? {
                    ...rangeItem,
                    ...patch,
                    charge:
                      (patch.min_pax !== undefined && patch.min_pax !== rangeItem.min_pax) ||
                      (patch.max_pax !== undefined && patch.max_pax !== rangeItem.max_pax)
                        ? 0
                        : rangeItem.charge,
                  }
                : rangeItem,
            ),
          }
        : current,
    );
  const setEscortDayRate = (day: number, rangeId: string, amount: number) =>
    set({
      escort_day_rates_by_slab: {
        ...(draft.escort_day_rates_by_slab ?? {}),
        [day]: {
          ...(draft.escort_day_rates_by_slab?.[day] ?? {}),
          [rangeId]: amount,
        },
      },
    });
  const setEscortDayRequired = (day: number, required: boolean) =>
    set({
      guide_day_escort_enabled: {
        ...(draft.guide_day_escort_enabled ?? {}),
        [day]: required,
      },
    });

  const breakdownData = costingPaxValues.map((paxCount) => ({
    pax: paxCount,
    perLanguage: Object.fromEntries(
      visibleLanguages.map((language) => [
        language,
        applyLandCommercials(draft, guideBaseForPax(language, paxCount), 0.05).final /
          Math.max(1, paxCount),
      ]),
    ) as Record<GuideLanguage, number>,
    escortBase: getEscortBaseForPax(draft, paxCount),
    escortPerPax: applyLandCommercials(
      draft,
      escortEnabled && escortMode === "per_person"
        ? (draft.escort_per_person_rate ?? 0) +
            (draft.guide_escort_reporting ?? 0) / Math.max(1, paxCount)
        : getEscortBaseForPax(draft, paxCount) / Math.max(1, paxCount),
      0.05,
    ).final,
  }));
  // Replaced in-place rather than deleting the legacy JSX so existing draft
  // state remains readable while the compact range tables own the visible UI.
  const showLegacyGuideDisplays = false;
  const showGuideChargesSelection = true;

  const renderGuideRangeTable = (status: Exclude<GuideSelectionStatus, "removed">) => {
    const included = status === "included";
    const heading = included
      ? "Included Guides — Range-wise Costing"
      : "Optional Guides — Additional Sale";
    const finalLabel = included ? "Final Total" : "Final Selling Total";
    const totalFor = (language: GuideLanguage, pax: number) => {
      const costing = guideLanguageCostingForPax(draft, db, pax, language);
      const base = included ? costing.baseTotal : costing.optionalBaseTotal;
      return {
        commercial: applyLandCommercials(draft, base),
      };
    };

    return (
      <Card className="overflow-hidden">
        <div className="border-b bg-muted/20 p-3 text-sm font-semibold">{heading}</div>
        <div className="overflow-x-auto">
          <table
            data-testid={included ? "included-guide-review-table" : "optional-guide-review-table"}
            className="w-full min-w-212.5 table-fixed border-collapse text-xs"
          >
            <colgroup>
              <col style={{ width: "72px" }} />
              <col style={{ width: "155px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "300px" }} />
              {visibleLanguages.flatMap((language) =>
                PAX_TIERS.map((tier) => (
                  <col key={`${language}-${tier.key}`} style={{ width: "96px" }} />
                )),
              )}
            </colgroup>
            <thead className="bg-[#F3F4F6] text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-[#E5E7EB]">
                <th rowSpan={2} className="p-2 text-left">
                  Day
                </th>
                <th rowSpan={2} className="p-2 text-left">
                  Route
                </th>
                <th rowSpan={2} className="p-2 text-left">
                  City
                </th>
                <th rowSpan={2} className="p-2 text-left">
                  Tour
                </th>
                {visibleLanguages.map((language) => (
                  <th key={language} colSpan={3} className="p-2 text-center">
                    {languageLabel(language)}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-[#E5E7EB]">
                {visibleLanguages.flatMap((language) =>
                  PAX_TIERS.map((tier) => (
                    <th key={`${language}-${tier.key}`} className="p-2 text-center">
                      {tier.label}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {dayData.map((day) => {
                const selectedSites = day.siteRows.filter((site) =>
                  visibleLanguages.some((language) =>
                    isLanguageInStatus(day.route.day, site, language, status),
                  ),
                );
                if (!selectedSites.length) {
                  return (
                    <tr key={day.route.day} className="border-b border-[#E5E7EB]">
                      <td className="p-2 font-semibold">Day {day.route.day}</td>
                      <td className="p-2 text-[11px] text-muted-foreground">{day.routeLabel}</td>
                      <td
                        colSpan={2 + visibleLanguages.length * 3}
                        className="p-2 italic text-muted-foreground"
                      >
                        No {included ? "included" : "optional"} guides for this routing day.
                      </td>
                    </tr>
                  );
                }
                return selectedSites.map((site, siteIndex) => (
                  <tr
                    key={`${day.route.day}-${site.key}`}
                    className="border-b border-[#E5E7EB] align-top"
                  >
                    {siteIndex === 0 && (
                      <td rowSpan={selectedSites.length} className="p-2 font-semibold">
                        Day {day.route.day}
                      </td>
                    )}
                    {siteIndex === 0 && (
                      <td
                        rowSpan={selectedSites.length}
                        className="p-2 text-[11px] text-muted-foreground"
                      >
                        {day.routeLabel}
                      </td>
                    )}
                    <td className="wrap-break-word p-2">
                      {site.city || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2">
                      <div className="line-clamp-2 wrap-break-word text-sm font-medium">
                        {site.tour}
                      </div>
                    </td>
                    {visibleLanguages.flatMap((language) => {
                      return PAX_TIERS.map((tier) => (
                        <td
                          key={`${language}-${tier.key}`}
                          className={cn(
                            "p-2 text-right tabular-nums",
                            !isLanguageInStatus(day.route.day, site, language, status) &&
                              "text-muted-foreground",
                          )}
                        >
                          <span className="text-foreground">
                            {site.tierRates[language][tier.key] > 0
                              ? inr(site.tierRates[language][tier.key])
                              : "Unavailable"}
                          </span>
                        </td>
                      ));
                    })}
                  </tr>
                ));
              })}
            </tbody>
            <tfoot>
              {(
                [
                  ["Base Total", "base"],
                  [`Markup (${(landMarkup(draft) * 100).toFixed(1)}%)`, "markup"],
                  ["GST", "gst"],
                  [finalLabel, "final"],
                ] as const
              ).map(([label, field]) => (
                <tr
                  key={field}
                  className={cn(
                    "border-t",
                    field === "final" && "bg-green-50 font-semibold text-primary",
                  )}
                >
                  <td
                    colSpan={4}
                    className="p-2 text-right text-[10px] uppercase text-muted-foreground"
                  >
                    {label}
                  </td>
                  {visibleLanguages.flatMap((language) =>
                    PAX_TIERS.map((tier) => {
                      const total = totalFor(language, tier.pax);
                      const value = total.commercial[field];
                      return (
                        <td key={`${language}-${tier.key}`} className="p-2 text-right tabular-nums">
                          {inr(value)}
                        </td>
                      );
                    }),
                  )}
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      </Card>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Guide Charges</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs text-muted-foreground">Filter Language</Label>
          <Select value={languageFilter} onValueChange={(value) => set({ guide_language: value })}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Hindi">Hindi</SelectItem>
              <SelectItem value="English">English</SelectItem>
              <SelectItem value="Language">Other Language</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-[10px]">
            {range
              ? `Costing Range: ${range.min}–${range.max}`
              : `Current Pax: ${pricingPax} (${pricingPax <= 5 ? "1–5" : pricingPax <= 14 ? "6–14" : "15+"})`}
          </Badge>
          {range && (
            <Badge variant="outline" className="text-[10px]">
              Pricing Pax: {pricingPax}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex w-fit rounded-md border p-1">
        <button
          type="button"
          onClick={() => setServiceView("guides")}
          className={cn(
            "rounded px-4 py-1.5 text-xs font-medium",
            serviceView === "guides" && "bg-primary text-primary-foreground",
          )}
        >
          Guides
        </button>
        <button
          type="button"
          onClick={() => setServiceView("escort")}
          className={cn(
            "rounded px-4 py-1.5 text-xs font-medium",
            serviceView === "escort" && "bg-primary text-primary-foreground",
          )}
        >
          Tour Escort
        </button>
      </div>

      {showRestyledGuideTable && serviceView === "guides" && (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="border-b bg-muted/20 p-3 text-sm font-semibold">
              Tour / Guide Service Selection
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="bg-muted/10 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Day</th>
                    <th className="p-2 text-left">Route</th>
                    <th className="p-2 text-left">City</th>
                    <th className="p-2 text-left">Tour / Guide Service</th>
                    <th className="p-2 text-center">Selected</th>
                  </tr>
                </thead>
                <tbody>
                  {dayData.flatMap((day) =>
                    day.siteRows.map((site) => (
                      <tr key={`${day.route.day}-${site.key}`} className="border-t">
                        <td className="p-2">{day.route.day}</td>
                        <td className="p-2">{day.routeLabel}</td>
                        <td className="p-2">{site.city || "—"}</td>
                        <td className="p-2">
                          {site.tour} · {site.guide.name}
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={site.isTourSelected}
                            onChange={(event) =>
                              setTourStatus(day.route.day, site, event.target.checked)
                            }
                            aria-label={`Select ${site.tour} guide service`}
                          />
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          {guideSectionData.map(({ language, tiers }) => {
            const tierServices = tiers.map((tier) => ({
              tier,
              rows: guideServicesForPax(draft, db, tier.summaryPax, language),
            }));
            const rowKeys = [
              ...new Set(
                tierServices.flatMap(({ rows }) =>
                  rows.map((row) => `${row.day}::${row.serviceKey}::${row.guideId}`),
                ),
              ),
            ];
            const optionalKeys = [
              ...new Set(
                tiers.flatMap((tier) =>
                  tier.costing.optionalRows.map(
                    (row) => `${row.day}::${row.serviceKey}::${row.guideId}`,
                  ),
                ),
              ),
            ];
            return (
              <section key={language} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 p-3">
                  <div>
                    <h3 className="text-sm font-semibold">
                      {languageLabel(language)} Guide Costing
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Guide Master rates are shown as independent 1–5, 6–14, and 15+ pax
                      alternatives.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    Reporting Cost
                    <Input
                      type="number"
                      min={0}
                      value={getReporting(language) || ""}
                      onChange={(event) => setReporting(language, Number(event.target.value) || 0)}
                      className="h-8 w-28 text-right"
                    />
                  </label>
                </div>
                <Card className="overflow-hidden">
                  <div className="border-b bg-muted/20 p-3 text-sm font-semibold">
                    Included Guides
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-xs">
                      <thead className="bg-muted/10 text-[10px] uppercase text-muted-foreground">
                        <tr>
                          <th className="p-2 text-left">Day</th>
                          <th className="p-2 text-left">Route</th>
                          <th className="p-2 text-left">City</th>
                          <th className="p-2 text-left">Tour / Guide Service</th>
                          {tiers.map((tier) => (
                            <th key={tier.key} className="p-2 text-right">
                              {tier.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rowKeys.map((key) => {
                          const first = tierServices
                            .flatMap(({ rows }) => rows)
                            .find(
                              (row) => `${row.day}::${row.serviceKey}::${row.guideId}` === key,
                            )!;
                          return (
                            <tr key={key} className="border-t">
                              <td className="p-2">{first.day}</td>
                              <td className="p-2">
                                {dayData.find((item) => item.route.day === first.day)?.routeLabel ||
                                  "—"}
                              </td>
                              <td className="p-2">{first.city}</td>
                              <td className="p-2">
                                {first.tour} · {first.guideName}
                              </td>
                              {tierServices.map(({ tier, rows }) => {
                                const row = rows.find(
                                  (candidate) =>
                                    `${candidate.day}::${candidate.serviceKey}::${candidate.guideId}` ===
                                    key,
                                );
                                return (
                                  <td key={tier.key} className="p-2 text-right">
                                    {row ? (
                                      <div className="flex flex-col items-end gap-1">
                                        <span className="font-medium">{inr(row.rate)}</span>
                                        <Select
                                          value={row.status}
                                          onValueChange={(value) =>
                                            setGuideSlabStatus(
                                              row,
                                              tier.key,
                                              value as GuideSelectionStatus,
                                              tier.summaryPax,
                                            )
                                          }
                                        >
                                          <SelectTrigger className="h-7 w-28 text-[10px]">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="included">Included</SelectItem>
                                            <SelectItem value="optional">Optional</SelectItem>
                                            <SelectItem value="removed">Not selected</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground">Unavailable</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                        {!rowKeys.length && (
                          <tr>
                            <td
                              colSpan={7}
                              className="p-3 text-center italic text-muted-foreground"
                            >
                              No eligible guide services for this language and routing.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot className="border-t bg-green-50">
                        {(["reportingCost", "base", "markup", "gst", "final"] as const).map(
                          (field) => (
                            <tr
                              key={field}
                              className={
                                field === "final" ? "border-t font-semibold text-primary" : ""
                              }
                            >
                              <td colSpan={4} className="p-2 text-right">
                                {field === "reportingCost"
                                  ? "Reporting Cost"
                                  : field === "base"
                                    ? "Base Total"
                                    : field === "markup"
                                      ? `Markup (${(landMarkup(draft) * 100).toFixed(1)}%)`
                                      : field === "gst"
                                        ? "GST"
                                        : "Final Total"}
                              </td>
                              {tiers.map((tier) => (
                                <td key={tier.key} className="p-2 text-right">
                                  {inr(
                                    field === "reportingCost"
                                      ? tier.costing.reportingCost
                                      : tier.commercial[field],
                                  )}
                                </td>
                              ))}
                            </tr>
                          ),
                        )}
                      </tfoot>
                    </table>
                  </div>
                  <div className="border-t bg-muted/20 p-3 text-sm font-semibold">
                    Per Person Cost Breakdown
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-xs">
                      <thead className="bg-muted/10 text-[10px] uppercase text-muted-foreground">
                        <tr>
                          <th className="p-2 text-left">Pax</th>
                          <th className="p-2 text-left">Applicable Slab</th>
                          <th className="p-2 text-right">Base Total</th>
                          <th className="p-2 text-right">Final Total</th>
                          <th className="p-2 text-right">Per Person</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tiers
                          .flatMap((tier) => tier.personRows)
                          .map((person) => (
                            <tr key={person.pax} className="border-t">
                              <td className="p-2">{person.pax}</td>
                              <td className="p-2">{guideSlabLabel(person.pax)}</td>
                              <td className="p-2 text-right">{inr(person.base)}</td>
                              <td className="p-2 text-right">{inr(person.final)}</td>
                              <td className="p-2 text-right font-semibold">
                                {inr(person.perPerson)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {optionalKeys.length > 0 && (
                    <div className="border-t bg-amber-50/60 p-3">
                      <h5 className="text-xs font-semibold">
                        Optional Guides — For Additional Sale
                      </h5>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full min-w-[720px] text-xs">
                          <thead className="text-[10px] uppercase text-muted-foreground">
                            <tr>
                              <th className="p-2 text-left">Day / Guide Service</th>
                              {tiers.map((tier) => (
                                <th key={tier.key} className="p-2 text-right">
                                  {tier.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {optionalKeys.map((key) => {
                              const row = tiers
                                .flatMap((tier) => tier.costing.optionalRows)
                                .find(
                                  (candidate) =>
                                    `${candidate.day}::${candidate.serviceKey}::${candidate.guideId}` ===
                                    key,
                                )!;
                              return (
                                <tr key={key} className="border-t">
                                  <td className="p-2">
                                    Day {row.day} · {row.tour} · {row.guideName}
                                  </td>
                                  {tiers.map((tier) => {
                                    const candidate = tier.costing.optionalRows.find(
                                      (item) =>
                                        `${item.day}::${item.serviceKey}::${item.guideId}` === key,
                                    );
                                    return (
                                      <td key={tier.key} className="p-2 text-right">
                                        {candidate
                                          ? inr(applyLandCommercials(draft, candidate.base).final)
                                          : "—"}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="border-t font-semibold">
                            <tr>
                              <td className="p-2">Optional Final Total</td>
                              {tiers.map((tier) => (
                                <td key={tier.key} className="p-2 text-right">
                                  {inr(tier.optionalCommercial.final)}
                                </td>
                              ))}
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </Card>
              </section>
            );
          })}
          {showLegacySlabCards &&
            guideSectionData.map(({ language, tiers }) => (
              <section key={language} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 p-3">
                  <div>
                    <h3 className="text-sm font-semibold">
                      {languageLabel(language)} Guide Costing
                    </h3>
                    <p className="max-w-3xl text-[11px] text-muted-foreground">
                      Guide Master rates remain authoritative: 1–5, 6–14, and 15+. The requested
                      display sections (1–6 / 7–14 / 15+) do not have separate master rate fields;
                      each pax below resolves its actual Guide Master tier (including 6 Pax).
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    Reporting Cost
                    <Input
                      type="number"
                      min={0}
                      value={getReporting(language) || ""}
                      onChange={(event) => setReporting(language, Number(event.target.value) || 0)}
                      className="h-8 w-28 text-right"
                    />
                  </label>
                </div>
                {tiers.map((tier) => {
                  const services = guideServicesForPax(draft, db, tier.summaryPax, language);
                  const optionalCommercial = tier.optionalCommercial;
                  return (
                    <Card key={tier.key} className="overflow-hidden">
                      <div className="border-b bg-muted/20 p-3">
                        <h4 className="text-sm font-semibold">
                          {tier.label} — Included Guide Costing
                        </h4>
                        <p className="text-[10px] text-muted-foreground">
                          Section total uses {tier.summaryPax} Pax. Per-person rows show only pax
                          values in the quotation’s configured range.
                        </p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[850px] text-xs">
                          <thead className="bg-muted/10 text-[10px] uppercase text-muted-foreground">
                            <tr>
                              <th className="p-2 text-left">Day</th>
                              <th className="p-2 text-left">Route</th>
                              <th className="p-2 text-left">City</th>
                              <th className="p-2 text-left">Tour / Guide Service</th>
                              <th className="p-2 text-left">Guide Selection</th>
                              <th className="p-2 text-right">Applicable Guide Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {services.map((row) => (
                              <tr
                                key={`${row.day}-${row.guideId}-${row.language}`}
                                className="border-t"
                              >
                                <td className="p-2">{row.day}</td>
                                <td className="p-2">
                                  {dayData.find((item) => item.route.day === row.day)?.routeLabel ||
                                    "—"}
                                </td>
                                <td className="p-2">{row.city}</td>
                                <td className="p-2">
                                  {row.tour} · {row.guideName}
                                </td>
                                <td className="p-2">
                                  <Select
                                    value={row.status}
                                    onValueChange={(value) =>
                                      setGuideSlabStatus(
                                        row,
                                        tier.key,
                                        value as GuideSelectionStatus,
                                        tier.summaryPax,
                                      )
                                    }
                                  >
                                    <SelectTrigger className="h-8 w-32 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="included">Included</SelectItem>
                                      <SelectItem value="optional">Optional</SelectItem>
                                      <SelectItem value="removed">Not selected</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="p-2 text-right">
                                  {inr(row.rate)}{" "}
                                  <span className="text-[10px] text-muted-foreground">
                                    (
                                    {tier.personRows.find(
                                      (person) => person.pax === tier.summaryPax,
                                    )?.masterTier ||
                                      (tier.summaryPax <= 5
                                        ? "Guide Master 1–5"
                                        : tier.summaryPax <= 14
                                          ? "Guide Master 6–14"
                                          : "Guide Master 15+")}
                                    )
                                  </span>
                                </td>
                              </tr>
                            ))}
                            {!services.length && (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="p-3 text-center italic text-muted-foreground"
                                >
                                  No eligible guide services for this language and routing.
                                </td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot className="border-t bg-green-50">
                            {[
                              ["Reporting Cost", tier.costing.reportingCost],
                              ["Base Total", tier.commercial.base],
                              [
                                `Markup (${(landMarkup(draft) * 100).toFixed(1)}%)`,
                                tier.commercial.markup,
                              ],
                              ["GST", tier.commercial.gst],
                              ["Final Total", tier.commercial.final],
                            ].map(([label, value], index) => (
                              <tr
                                key={String(label)}
                                className={index === 4 ? "border-t font-semibold text-primary" : ""}
                              >
                                <td colSpan={5} className="p-2 text-right">
                                  {label}
                                </td>
                                <td className="p-2 text-right">{inr(Number(value))}</td>
                              </tr>
                            ))}
                          </tfoot>
                        </table>
                      </div>
                      <div className="overflow-x-auto border-t">
                        <table className="w-full min-w-[720px] text-xs">
                          <thead className="bg-muted/10 text-[10px] uppercase text-muted-foreground">
                            <tr>
                              <th className="p-2 text-left">Pax</th>
                              <th className="p-2 text-left">Guide Master Rate Tier</th>
                              <th className="p-2 text-right">Base Total</th>
                              <th className="p-2 text-right">Final Total</th>
                              <th className="p-2 text-right">Per Person</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tier.personRows.map((person) => (
                              <tr key={person.pax} className="border-t">
                                <td className="p-2">{person.pax}</td>
                                <td className="p-2">{person.masterTier}</td>
                                <td className="p-2 text-right">{inr(person.base)}</td>
                                <td className="p-2 text-right">{inr(person.final)}</td>
                                <td className="p-2 text-right font-semibold">
                                  {inr(person.perPerson)}
                                </td>
                              </tr>
                            ))}
                            {!tier.personRows.length && (
                              <tr>
                                <td
                                  colSpan={5}
                                  className="p-3 text-center italic text-muted-foreground"
                                >
                                  No pax values from the configured quotation range fall in this
                                  section.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {tier.costing.optionalRows.length > 0 && (
                        <div className="border-t bg-amber-50/60 p-3">
                          <h5 className="text-xs font-semibold">
                            Optional Guides — Additional Sale · {tier.label}
                          </h5>
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full min-w-[720px] text-xs">
                              <thead className="text-[10px] uppercase text-muted-foreground">
                                <tr>
                                  <th className="p-2 text-left">Day / Guide Service</th>
                                  <th className="p-2 text-right">Base</th>
                                  <th className="p-2 text-right">Markup</th>
                                  <th className="p-2 text-right">GST</th>
                                  <th className="p-2 text-right">Final Selling Price</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tier.costing.optionalRows.map((row) => {
                                  const sale = applyLandCommercials(draft, row.base, 0.05);
                                  return (
                                    <tr key={`${row.day}-${row.guideId}`} className="border-t">
                                      <td className="p-2">
                                        Day {row.day} · {row.tour} · {row.guideName}
                                      </td>
                                      <td className="p-2 text-right">{inr(row.base)}</td>
                                      <td className="p-2 text-right">{inr(sale.markup)}</td>
                                      <td className="p-2 text-right">{inr(sale.gst)}</td>
                                      <td className="p-2 text-right font-semibold">
                                        {inr(sale.final)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot className="border-t font-semibold">
                                <tr>
                                  <td className="p-2">Optional {tier.label} Total</td>
                                  <td className="p-2 text-right">{inr(optionalCommercial.base)}</td>
                                  <td className="p-2 text-right">
                                    {inr(optionalCommercial.markup)}
                                  </td>
                                  <td className="p-2 text-right">{inr(optionalCommercial.gst)}</td>
                                  <td className="p-2 text-right">
                                    {inr(optionalCommercial.final)}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </section>
            ))}
        </div>
      )}

      {serviceView === "guides" && (
        <div className="order-30 flex flex-col gap-4">
          {renderGuideRangeTable("included")}
          <Card className="overflow-hidden">
            <div className="border-b bg-muted/20 p-3 text-sm font-semibold">
              Included Guides — Per Person Cost Breakdown
            </div>
            <div className="overflow-x-auto">
              <table data-testid="included-guide-per-person-table" className="w-full text-xs">
                <thead className="bg-muted/10 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Pax</th>
                    <th className="p-2 text-left">Applicable Slab</th>
                    <th className="p-2 text-right">Included Base Total</th>
                    <th className="p-2 text-right">Included Final Total</th>
                    <th className="p-2 text-right">Included Per Person</th>
                  </tr>
                </thead>
                <tbody>
                  {rangeCostingRows.map((row) => (
                    <tr key={row.pax} className="border-t">
                      <td className="p-2 font-medium">{row.pax} Pax</td>
                      <td className="p-2">{row.slabs}</td>
                      <td className="p-2 text-right tabular-nums">{inr(row.base)}</td>
                      <td className="p-2 text-right tabular-nums">{inr(row.commercial.final)}</td>
                      <td className="p-2 text-right font-semibold tabular-nums">
                        {inr(row.commercial.final / Math.max(1, row.pax))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {renderGuideRangeTable("optional")}
          <Card className="overflow-hidden">
            <div className="border-b bg-muted/20 p-3 text-sm font-semibold">
              Optional Guides — Per Person Cost Breakdown
            </div>
            <div className="overflow-x-auto">
              <table data-testid="optional-guide-per-person-table" className="w-full text-xs">
                <thead className="bg-muted/10 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Pax</th>
                    <th className="p-2 text-left">Applicable Slab</th>
                    <th className="p-2 text-right">Optional Base Total</th>
                    <th className="p-2 text-right">Optional Final Total</th>
                    <th className="p-2 text-right">Optional Per Person</th>
                  </tr>
                </thead>
                <tbody>
                  {rangeCostingRows.map((row) => (
                    <tr key={row.pax} className="border-t">
                      <td className="p-2 font-medium">{row.pax} Pax</td>
                      <td className="p-2">{row.slabs}</td>
                      <td className="p-2 text-right tabular-nums">{inr(row.optionalBase)}</td>
                      <td className="p-2 text-right tabular-nums">
                        {inr(row.optionalCommercial.final)}
                      </td>
                      <td className="p-2 text-right font-semibold tabular-nums">
                        {inr(row.optionalCommercial.final / Math.max(1, row.pax))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {showGuideChargesSelection && serviceView === "guides" && (
        <div className="order-20 overflow-x-auto rounded-lg border border-[#E5E7EB] bg-white">
          <table
            data-testid="guide-charges-table"
            className="w-full min-w-212.5 table-fixed border-collapse text-xs"
          >
            <colgroup>
              <col style={{ width: "72px" }} />
              <col style={{ width: "155px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "300px" }} />
              {visibleLanguages.flatMap((language) =>
                PAX_TIERS.map((tier) => (
                  <col key={`${language}-${tier.key}`} style={{ width: "112px" }} />
                )),
              )}
            </colgroup>
            <thead className="bg-[#F3F4F6] text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-[#E5E7EB]">
                <th rowSpan={2} className="p-2 text-left">
                  Day
                </th>
                <th rowSpan={2} className="p-2 text-left">
                  Route
                </th>
                <th rowSpan={2} className="p-2 text-left">
                  City
                </th>
                <th rowSpan={2} className="p-2 text-left">
                  <div>Tour</div>
                  <label className="mt-1 flex items-center gap-1 normal-case">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={
                        allVisibleToursSelected ? true : someVisibleToursSelected ? "mixed" : false
                      }
                      className="flex h-4 w-4 items-center justify-center rounded-sm border border-primary text-[10px]"
                      disabled={visibleGuideTours.length === 0}
                      onClick={() => setAllVisibleTours(!allVisibleToursSelected)}
                      aria-label="Select All Tours"
                    >
                      {allVisibleToursSelected ? "✓" : someVisibleToursSelected ? "−" : ""}
                    </button>
                    <span>Select All Tours</span>
                  </label>
                </th>
                {visibleLanguages.map((language) => (
                  <th key={language} colSpan={3} className="p-2 text-center">
                    <div>{languageLabel(language)}</div>
                    <label className="mt-1 flex items-center justify-center gap-1 normal-case">
                      <input
                        type="checkbox"
                        checked={allLanguageRatesSelected(language)}
                        disabled={
                          !dayData.some((day) =>
                            day.siteRows.some(
                              (site) => site.isTourSelected && hasRateForLanguage(site, language),
                            ),
                          )
                        }
                        onChange={() =>
                          setAllForLanguage(language, !allLanguageRatesSelected(language))
                        }
                        aria-label={`Select All ${languageLabel(language)}`}
                      />
                      <span>Select All</span>
                    </label>
                  </th>
                ))}
              </tr>
              <tr className="border-b border-[#E5E7EB]">
                {visibleLanguages.flatMap((language) =>
                  PAX_TIERS.map((tier) => (
                    <th key={`${language}-${tier.key}`} className="p-2 text-center">
                      {tier.label}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {dayData.map((day) => {
                if (!day.hasRows) {
                  return (
                    <tr key={day.route.day} className="border-b border-[#E5E7EB]">
                      <td className="p-2 font-semibold">Day {day.route.day}</td>
                      <td className="p-2 text-[11px] text-muted-foreground">{day.routeLabel}</td>
                      <td colSpan={2 + visibleLanguages.length * 3} className="p-2">
                        <span className="italic text-muted-foreground">
                          {(day.route.is_day_zero || day.route.day === 0) &&
                          landDayContext(draft, day.route, db).selectedTours.length === 0
                            ? "No sightseeing tours selected for Day 0."
                            : "No guides are eligible for this routing day."}
                        </span>
                      </td>
                    </tr>
                  );
                }
                return day.siteRows.map((site, siteIndex) => (
                  <tr
                    key={`${day.route.day}-${site.key}`}
                    className="border-b border-[#E5E7EB] align-top"
                  >
                    {siteIndex === 0 && (
                      <td rowSpan={day.siteRows.length} className="p-2 font-semibold">
                        Day {day.route.day}
                      </td>
                    )}
                    {siteIndex === 0 && (
                      <td
                        rowSpan={day.siteRows.length}
                        className="p-2 text-[11px] text-muted-foreground"
                      >
                        {day.routeLabel}
                      </td>
                    )}
                    <td className="wrap-break-word p-2">
                      {site.city || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1 shrink-0"
                          checked={site.isTourSelected}
                          onChange={(event) =>
                            setTourStatus(day.route.day, site, event.target.checked)
                          }
                          aria-label={`Select tour ${site.tour}`}
                        />
                        <div className="line-clamp-2 wrap-break-word text-sm font-medium">
                          {site.tour}
                        </div>
                      </div>
                    </td>
                    {visibleLanguages.flatMap((language) => {
                      const hasRate = hasRateForLanguage(site, language);
                      const selection = guideServiceStatus(day.route.day, site, language);
                      const selected = hasRate && selection === "included";
                      return PAX_TIERS.map((tier, tierIndex) => (
                        <td key={`${language}-${tier.key}`} className="p-2 text-right tabular-nums">
                          {tierIndex === 0 && (hasRate || selected) ? (
                            <label className="inline-flex items-center justify-end gap-1">
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={!site.isTourSelected || (!hasRate && !selected)}
                                onChange={(event) =>
                                  setGuideLanguageStatus(
                                    day.route.day,
                                    site,
                                    language,
                                    event.target.checked ? "included" : "optional",
                                  )
                                }
                                aria-label={`${selected ? "Unselect" : "Select"} ${languageLabel(language)} rate for ${site.tour}`}
                              />
                              <span className="text-foreground">
                                {site.tierRates[language][tier.key] > 0
                                  ? inr(site.tierRates[language][tier.key])
                                  : "Rate Not Configured"}
                              </span>
                            </label>
                          ) : (
                            <span className="text-foreground">
                              {site.tierRates[language][tier.key] > 0
                                ? inr(site.tierRates[language][tier.key])
                                : "Rate Not Configured"}
                            </span>
                          )}
                        </td>
                      ));
                    })}
                  </tr>
                ));
              })}

              <tr className="border-t bg-muted/10">
                <td
                  colSpan={4}
                  className="p-2 text-right text-[10px] uppercase text-muted-foreground"
                >
                  Reporting Cost
                </td>
                {visibleLanguages.map((language) => (
                  <td key={language} colSpan={3} className="p-2 text-right">
                    <Input
                      type="number"
                      min={0}
                      value={getReporting(language) || ""}
                      onChange={(event) => setReporting(language, Number(event.target.value) || 0)}
                      className="ml-auto h-7 w-28 text-right text-[11px]"
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {showLegacyGuideDisplays && serviceView === "guides" && (
        <>
          {range && (
            <Card className="overflow-hidden">
              <div className="border-b bg-muted/20 p-3 text-sm font-semibold">
                Guide Charges — Pax Slab Summary
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-xs">
                  <thead className="bg-muted/10 text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">Description</th>
                      {PAX_TIERS.map((tier) => (
                        <th key={tier.key} className="p-2 text-right">
                          {tier.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(["base", "markup", "gst", "final"] as const).map((field) => (
                      <tr
                        key={field}
                        className={
                          field === "final"
                            ? "border-t bg-green-50 font-semibold text-primary"
                            : "border-t"
                        }
                      >
                        <td className="p-2">
                          {field === "base"
                            ? "Base Total"
                            : field === "markup"
                              ? `Markup (${(landMarkup(draft) * 100).toFixed(1)}%)`
                              : field === "gst"
                                ? "GST"
                                : "Final Total"}
                        </td>
                        {PAX_TIERS.map((tier) => {
                          const base = visibleLanguages.reduce(
                            (sum, language) =>
                              sum +
                              guideLanguageCostingForPax(draft, db, tier.pax, language).baseTotal,
                            0,
                          );
                          return (
                            <td key={tier.key} className="p-2 text-right tabular-nums">
                              {inr(applyLandCommercials(draft, base)[field])}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <Card className="overflow-hidden">
            <div className="border-b bg-muted/20 p-3 text-sm font-semibold">
              Included Guides — Per Person Costing
            </div>
            {includedGuideRows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-xs">
                  <thead className="bg-muted/10 text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">Day / Tour</th>
                      <th className="p-2 text-left">Language</th>
                      <th className="p-2 text-left">Applicable Pax Slab</th>
                      <th className="p-2 text-right">Base Guide Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {includedGuideRows.map((row) => {
                      const base = includedGuideBaseForRow(row, pricingPax);
                      return (
                        <tr key={`${row.day}-${row.guide.id}-${row.language}`} className="border-t">
                          <td className="p-2 font-medium">
                            Day {row.day} · {row.tour}
                          </td>
                          <td className="p-2">{languageLabel(row.language)}</td>
                          <td className="p-2">{guideSlabLabel(pricingPax)}</td>
                          <td className="p-2 text-right">{base > 0 ? inr(base) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t bg-green-50 font-semibold">
                    <tr>
                      <td colSpan={3} className="p-2 text-right uppercase">
                        Reporting Cost
                      </td>
                      <td className="p-2 text-right tabular-nums">{inr(includedGuideReporting)}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="p-2 text-right uppercase">
                        Base Total
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {inr(includedGuideCommercial.base)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="p-2 text-right uppercase">
                        Markup ({(landMarkup(draft) * 100).toFixed(1)}%)
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {inr(includedGuideCommercial.markup)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="p-2 text-right uppercase">
                        GST 5%
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {inr(includedGuideCommercial.gst)}
                      </td>
                    </tr>
                    <tr className="border-t-2 border-green-200 bg-green-100 text-primary">
                      <td colSpan={3} className="p-2 text-right uppercase">
                        Final Total
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {inr(includedGuideCommercial.final)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="p-4 text-sm italic text-muted-foreground">No guides included.</div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b bg-muted/20 p-3 text-sm font-semibold">
              Per Person Cost Breakdown
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="bg-muted/10 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Pax</th>
                    <th className="p-2 text-left">Applicable Guide Slab</th>
                    <th className="p-2 text-right">Base Guide Total</th>
                    <th className="p-2 text-right">Final Guide Total</th>
                    <th className="p-2 text-right">Per Person</th>
                  </tr>
                </thead>
                <tbody>
                  {rangeCostingRows.map((row) => (
                    <tr key={row.pax} className="border-t">
                      <td className="p-2 font-medium">{row.pax} Pax</td>
                      {row.unavailable.length ? (
                        <td colSpan={4} className="p-2 font-medium text-amber-700">
                          Rate Not Available
                        </td>
                      ) : (
                        <>
                          <td className="p-2">{row.slabs}</td>
                          <td className="p-2 text-right tabular-nums">{inr(row.base)}</td>
                          <td className="p-2 text-right tabular-nums">
                            {inr(row.commercial.final)}
                          </td>
                          <td className="p-2 text-right font-semibold tabular-nums">
                            {inr(row.commercial.final / Math.max(1, row.pax))}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t px-3 py-2 text-[10px] text-muted-foreground">
              Each row resolves every included guide at that pax, then applies Guide markup and GST
              once.
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b bg-muted/20 p-3 text-sm font-semibold">
              Optional Guides — For Additional Sale
            </div>
            {optionalGuideRows.length ? (
              <div className="divide-y">
                {optionalGuideRows.map((row) => {
                  const base = guideRateForLine(row.guide, row.language, pricingPax, row.line);
                  const commercial = applyLandCommercials(draft, base, 0.05);
                  return (
                    <div
                      key={`${row.day}-${row.guide.id}-${row.language}`}
                      className="grid min-w-[720px] grid-cols-[1fr_repeat(4,110px)] gap-2 p-3 text-xs"
                    >
                      <div>
                        <div className="font-medium">
                          Day {row.day} · {row.tour}
                        </div>
                        <div className="text-muted-foreground">
                          {row.city} · {languageLabel(row.language)} · {guideSlabLabel(pricingPax)}
                        </div>
                      </div>
                      <div className="text-right">
                        Base
                        <br />
                        <b>{base > 0 ? inr(base) : "—"}</b>
                      </div>
                      <div className="text-right">
                        Markup
                        <br />
                        <b>{base > 0 ? inr(commercial.markup) : "—"}</b>
                      </div>
                      <div className="text-right">
                        GST
                        <br />
                        <b>{base > 0 ? inr(commercial.gst) : "—"}</b>
                      </div>
                      <div className="text-right">
                        Selling Price
                        <br />
                        <b>{base > 0 ? inr(commercial.final) : "—"}</b>
                      </div>
                    </div>
                  );
                })}
                <div className="border-t-2 bg-green-50 p-3 text-xs">
                  {[
                    ["Reporting Cost", optionalGuideReporting],
                    ["Base Total", optionalGuideCommercial.base],
                    [
                      `Markup (${(landMarkup(draft) * 100).toFixed(1)}%)`,
                      optionalGuideCommercial.markup,
                    ],
                    ["GST 5%", optionalGuideCommercial.gst],
                    ["Final Total", optionalGuideCommercial.final],
                  ].map(([label, value], index) => (
                    <div
                      key={String(label)}
                      className={cn(
                        "flex justify-between py-1",
                        index === 4 && "border-t font-semibold text-primary",
                      )}
                    >
                      <span className="uppercase">{label}</span>
                      <span className="tabular-nums">{inr(Number(value))}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 text-sm italic text-muted-foreground">
                No optional guides for the current routing.
              </div>
            )}
          </Card>
        </>
      )}

      {serviceView === "escort" && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-900 p-4 text-white">
            <div>
              <h3 className="text-sm font-semibold">Tour Escort — Day Wise Rate Entry</h3>
              <p className="text-xs text-slate-200">
                Configure pax slabs, then enter an independent Escort rate for each routing day.
              </p>
            </div>
            <Button
              size="sm"
              variant={escortEnabled ? "outline" : "default"}
              onClick={openEscortEditor}
            >
              {escortEnabled ? (
                <Pencil className="mr-1 h-3.5 w-3.5" />
              ) : (
                <Plus className="mr-1 h-3.5 w-3.5" />
              )}
              {escortEnabled ? "Edit Tour Escort" : "Add Tour Escort"}
            </Button>
          </div>
          {escortEnabled && escortColumns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-xs">
                <thead className="bg-sky-50 text-[10px] uppercase text-slate-600">
                  <tr>
                    <th className="p-2 text-left">Day</th>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Route</th>
                    <th className="p-2 text-center">Escort Required</th>
                    {escortColumns.map((column) => (
                      <th key={column.id} className="min-w-[130px] p-2 text-right">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dayData.map((day) => {
                    const required = isEscortDayRequired(draft, day.route.day);
                    return (
                      <tr
                        key={day.route.day}
                        className={cn("border-t", !required && "bg-slate-50 text-muted-foreground")}
                      >
                        <td className="p-2 font-semibold">Day {day.route.day}</td>
                        <td className="p-2 whitespace-nowrap">{day.route.date || "—"}</td>
                        <td className="p-2 text-muted-foreground">{day.routeLabel}</td>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={required}
                            onChange={(event) =>
                              setEscortDayRequired(day.route.day, event.target.checked)
                            }
                            aria-label={`Day ${day.route.day} Escort required`}
                            className="h-4 w-4 accent-primary"
                          />
                        </td>
                        {escortColumns.map((column) => (
                          <td key={column.id} className="p-2">
                            <Input
                              type="number"
                              min={0}
                              value={
                                draft.escort_day_rates_by_slab?.[day.route.day]?.[column.id] || ""
                              }
                              onChange={(event) =>
                                setEscortDayRate(
                                  day.route.day,
                                  column.id,
                                  Number(event.target.value) || 0,
                                )
                              }
                              className={cn(
                                "ml-auto h-8 w-28 text-right",
                                !required && "opacity-60",
                              )}
                              placeholder="No Escort"
                              aria-label={`Day ${day.route.day} ${column.label} Escort rate`}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  <tr className="border-t bg-muted/10">
                    <td
                      colSpan={4}
                      className="p-2 text-right text-[10px] uppercase text-muted-foreground"
                    >
                      Escort Reporting Cost
                    </td>
                    <td colSpan={escortColumns.length} className="p-2">
                      <Input
                        type="number"
                        min={0}
                        value={draft.guide_escort_reporting || ""}
                        onChange={(event) =>
                          set({ guide_escort_reporting: Number(event.target.value) || 0 })
                        }
                        className="ml-auto h-8 w-28 text-right"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
              {escortRanges.some(
                (rangeItem) =>
                  rangeItem.charge > 0 &&
                  !draft.routing.some(
                    (day) => (draft.escort_day_rates_by_slab?.[day.day]?.[rangeItem.id] ?? 0) > 0,
                  ),
              ) && (
                <p className="border-t p-3 text-xs text-amber-700">
                  Legacy flat Escort slab charges are preserved and remain costed until day-wise
                  rates are entered for that slab.
                </p>
              )}
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              Add Tour Escort to configure pax slabs and day-wise rates.
            </div>
          )}
        </Card>
      )}

      {serviceView === "escort" && escortEnabled && (
        <Card className="overflow-hidden">
          <div className="border-b bg-slate-900 p-3 text-sm font-semibold text-white">
            Tour Escort — Day-wise Costing
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs">
              <thead className="bg-sky-50 text-[10px] uppercase text-slate-600">
                <tr>
                  <th className="p-2 text-left">Day</th>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Route</th>
                  <th className="p-2 text-right">Applicable Rate</th>
                  <th className="p-2 text-right">Base Total</th>
                  <th className="p-2 text-right">Markup {(landMarkup(draft) * 100).toFixed(1)}%</th>
                  <th className="p-2 text-right">GST 5%</th>
                  <th className="p-2 text-right">Final Total</th>
                </tr>
              </thead>
              <tbody>
                {dayData.map((day) => {
                  const slab = escortRanges.find(
                    (item) => pricingPax >= item.min_pax && pricingPax <= item.max_pax,
                  );
                  const base =
                    slab && isEscortDayRequired(draft, day.route.day)
                      ? getEscortRangeDayCharge(draft, day.route.day, slab.id)
                      : 0;
                  const commercial = applyLandCommercials(draft, base, 0.05);
                  return (
                    <tr key={day.route.day} className="border-t">
                      <td className="p-2 font-semibold">Day {day.route.day}</td>
                      <td className="p-2">{day.route.date || "—"}</td>
                      <td className="p-2">{day.routeLabel}</td>
                      <td className="p-2 text-right">{base ? inr(base) : "—"}</td>
                      <td className="p-2 text-right">{inr(commercial.base)}</td>
                      <td className="p-2 text-right">{inr(commercial.markup)}</td>
                      <td className="p-2 text-right">{inr(commercial.gst)}</td>
                      <td className="p-2 text-right font-semibold">{inr(commercial.final)}</td>
                    </tr>
                  );
                })}
                {(() => {
                  const commercial = applyLandCommercials(
                    draft,
                    getEscortBaseForPax(draft, pricingPax),
                    0.05,
                  );
                  const selected = dayData.filter(
                    (day) =>
                      isEscortDayRequired(draft, day.route.day) &&
                      escortRanges.some(
                        (range) => getEscortRangeDayCharge(draft, day.route.day, range.id) > 0,
                      ),
                  ).length;
                  return (
                    <tr className="border-t bg-green-50 font-semibold">
                      <td colSpan={3} className="p-2">
                        Total selected Escort days: {selected}
                      </td>
                      <td className="p-2 text-right">—</td>
                      <td className="p-2 text-right">{inr(commercial.base)}</td>
                      <td className="p-2 text-right">{inr(commercial.markup)}</td>
                      <td className="p-2 text-right">{inr(commercial.gst)}</td>
                      <td className="p-2 text-right">{inr(commercial.final)}</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {serviceView === "escort" && (
        <Card className="overflow-hidden">
          <div className="border-b bg-slate-900 p-3 text-sm font-semibold text-white">
            Tour Escort — Per Person Costing
          </div>
          {escortEnabled ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="bg-sky-50 text-[10px] uppercase text-slate-600">
                  <tr>
                    <th className="p-2 text-left">Pax</th>
                    <th className="p-2 text-left">Applicable Escort Slab</th>
                    <th className="p-2 text-right">Base Escort Total</th>
                    <th className="p-2 text-right">Final Escort Total</th>
                    <th className="p-2 text-right">Per Person</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownData.map((row) => {
                    const commercial = applyLandCommercials(draft, row.escortBase, 0.05);
                    const slab = escortRanges.find(
                      (item) => row.pax >= item.min_pax && row.pax <= item.max_pax,
                    );
                    return (
                      <tr key={row.pax} className="border-t">
                        <td className="p-2 font-medium">{row.pax} Pax</td>
                        <td className="p-2">
                          {escortMode === "per_person"
                            ? "Per Person"
                            : slab
                              ? `${slab.min_pax}–${slab.max_pax} Pax`
                              : escortMode === "day_wise"
                                ? "Day-wise"
                                : "—"}
                        </td>
                        <td className="p-2 text-right">{inr(commercial.base)}</td>
                        <td className="p-2 text-right font-semibold">{inr(commercial.final)}</td>
                        <td className="p-2 text-right font-semibold">
                          {inr(commercial.final / Math.max(1, row.pax))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 text-sm italic text-muted-foreground">
              Configure Tour Escort to view per-person costing.
            </div>
          )}
        </Card>
      )}

      <Dialog
        open={addGuideDay != null}
        onOpenChange={(open) => {
          if (!open) {
            setAddGuideDay(null);
            setGuideSearch("");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Eligible Guides for Day {addGuideDay}</DialogTitle>
            <DialogDescription>
              Only Guide Master services mapped to this day's finalized city and tour are shown.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={guideSearch}
            onChange={(event) => setGuideSearch(event.target.value)}
            placeholder="Search eligible guides"
          />
          <div className="max-h-[55vh] divide-y overflow-y-auto rounded-md border">
            {(() => {
              const day = dayData.find((item) => item.route.day === addGuideDay);
              const choices = (day?.eligibleRows ?? []).filter(
                (row) =>
                  !row.isSelected &&
                  `${row.city} ${row.tour} ${row.guide.name}`
                    .toLowerCase()
                    .includes(guideSearch.trim().toLowerCase()),
              );
              if (!choices.length)
                return (
                  <div className="p-4 text-sm text-muted-foreground">
                    No eligible guides found for this routing day.
                  </div>
                );
              return choices.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => addGuideDay != null && setTourStatus(addGuideDay, row, true)}
                  className="grid w-full grid-cols-[1fr_150px] gap-3 p-3 text-left hover:bg-muted/40"
                >
                  <span>
                    <span className="block text-sm font-medium">{row.guide.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {row.city} · {row.tour}
                    </span>
                  </span>
                  <span className="text-right text-xs">
                    From {inr(guideRateForPax(row.guide, pricingPax))}
                  </span>
                </button>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {draft.guides.some(
        (line) =>
          !line.is_escort &&
          !isSelectedLandServiceValid(
            "guide",
            line.guide_id,
            line.from_routing_days?.[0],
            draft,
            db,
          ),
      ) && (
        <Card className="border-amber-300 bg-amber-50/50 p-3">
          <div className="text-xs font-semibold text-amber-800">
            Not applicable to current routing
          </div>
          {draft.guides
            .filter(
              (line) =>
                !line.is_escort &&
                !isSelectedLandServiceValid(
                  "guide",
                  line.guide_id,
                  line.from_routing_days?.[0],
                  draft,
                  db,
                ),
            )
            .map((line) => (
              <div key={line.id} className="mt-2 flex items-center justify-between text-xs">
                <span>
                  {db.guides.find((guide) => guide.id === line.guide_id)?.name ||
                    "Historical guide"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    set({ guides: draft.guides.filter((item) => item.id !== line.id) })
                  }
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            ))}
        </Card>
      )}

      {serviceView === "guides" &&
        optionalGuideRows.length < 0 &&
        draft.guides.some(
          (line) =>
            !line.is_escort &&
            line.inclusion_status === "optional" &&
            isSelectedLandServiceValid(
              "guide",
              line.guide_id,
              line.from_routing_days?.[0],
              draft,
              db,
            ),
        ) && (
          <Card className="order-2 p-4">
            <h3 className="text-sm font-semibold">Optional Guides — For Additional Sale</h3>
            <div className="mt-3 space-y-2">
              {draft.guides
                .filter(
                  (line) =>
                    !line.is_escort &&
                    line.inclusion_status === "optional" &&
                    isSelectedLandServiceValid(
                      "guide",
                      line.guide_id,
                      line.from_routing_days?.[0],
                      draft,
                      db,
                    ),
                )
                .map((line) => {
                  const master = db.guides.find((guide) => guide.id === line.guide_id);
                  const base = master
                    ? guideRateForPax(master, pricingPax, line.language as GuideLanguage)
                    : line.rate;
                  const commercial = applyLandCommercials(draft, base, 0.05);
                  return (
                    <div
                      key={line.id}
                      className="grid grid-cols-[1fr_repeat(4,110px)] gap-2 rounded border p-3 text-xs"
                    >
                      <div>
                        <div className="font-medium">{master?.name || "Guide"}</div>
                        <div className="text-muted-foreground">
                          {line.language ||
                            (master ? guidePrimaryLanguage(master) : null) ||
                            "English"}{" "}
                          · {pricingPax <= 5 ? "1–5" : pricingPax <= 14 ? "6–14" : "15+"} Pax
                        </div>
                      </div>
                      <div className="text-right">
                        Base
                        <br />
                        <b>{inr(base)}</b>
                      </div>
                      <div className="text-right">
                        Markup
                        <br />
                        <b>{inr(commercial.markup)}</b>
                      </div>
                      <div className="text-right">
                        GST
                        <br />
                        <b>{inr(commercial.gst)}</b>
                      </div>
                      <div className="text-right">
                        Selling
                        <br />
                        <b>{inr(commercial.final)}</b>
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>
        )}

      <Dialog
        open={escortDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeEscortEditor();
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <DialogTitle>Tour Escort</DialogTitle>
            <DialogDescription>
              Configure the Escort type and pax slabs. Day-wise rates are entered on the main Guide
              screen.
            </DialogDescription>
          </DialogHeader>
          {escortEditor && (
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Escort Type</Label>
                    <Select
                      value={escortEditor.escort_type}
                      onValueChange={(value) => updateEscortEditor({ escort_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="English Speaking Escort">
                          English Speaking Escort
                        </SelectItem>
                        <SelectItem value="Language Escort">Language Escort</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Pricing Mode</Label>
                    <Input value="Pax Slab / Range" readOnly />
                  </div>
                </div>

                <div className="space-y-3 border-t pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold">Custom Pax Ranges</div>
                    <Button size="sm" variant="outline" onClick={addEditorRange}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add Pax Range
                    </Button>
                  </div>
                  {escortEditor.escort_ranges.map((rangeItem) => (
                    <div key={rangeItem.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Min Pax</Label>
                        <Input
                          type="number"
                          min={1}
                          value={rangeItem.min_pax}
                          onChange={(event) => {
                            const min = Math.max(1, Number(event.target.value) || 1);
                            patchEditorRange(rangeItem.id, {
                              min_pax: min,
                              max_pax: Math.max(min, rangeItem.max_pax),
                            });
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Max Pax</Label>
                        <Input
                          type="number"
                          min={rangeItem.min_pax}
                          value={rangeItem.max_pax}
                          onChange={(event) =>
                            patchEditorRange(rangeItem.id, {
                              max_pax: Math.max(
                                rangeItem.min_pax,
                                Number(event.target.value) || rangeItem.min_pax,
                              ),
                            })
                          }
                        />
                      </div>
                      <Button
                        className="mt-5"
                        size="icon"
                        variant="ghost"
                        aria-label="Delete pax range"
                        onClick={() =>
                          updateEscortEditor({
                            escort_ranges: escortEditor.escort_ranges.filter(
                              (item) => item.id !== rangeItem.id,
                            ),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {escortEditor.escort_ranges.length === 0 && (
                    <div className="text-xs italic text-muted-foreground">
                      Add a custom pax range to price this Escort.
                    </div>
                  )}
                </div>

                {escortEditorError && (
                  <p className="text-xs text-destructive">{escortEditorError}</p>
                )}
                {confirmEscortRemoval && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <span className="text-sm">Remove the saved Tour Escort configuration?</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmEscortRemoval(false)}
                      >
                        Keep Escort
                      </Button>
                      <Button size="sm" variant="destructive" onClick={confirmRemoveEscort}>
                        Remove Tour Escort
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="shrink-0 items-center border-t px-6 py-3">
                {escortEnabled && !confirmEscortRemoval && (
                  <Button className="mr-auto" size="sm" variant="ghost" onClick={removeEscort}>
                    Remove Tour Escort
                  </Button>
                )}
                {!confirmEscortRemoval && (
                  <Button size="sm" variant="ghost" onClick={closeEscortEditor}>
                    Cancel
                  </Button>
                )}
                {!confirmEscortRemoval && (
                  <Button size="sm" onClick={saveEscortEditor}>
                    Save Tour Escort
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Legacy duplicate breakdown intentionally remains disabled while its replacement above is active. */}
      {/* eslint-disable-next-line no-constant-binary-expression */}
      {false && (
        <Card className="order-1 space-y-3 border-2 border-primary/20 bg-primary/5 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-primary">Per-Person Cost Breakdown</h3>
            {range && (
              <span className="text-[10px] text-muted-foreground">
                Costing Range: {range?.min}–{range?.max} Pax
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-xs">
              <thead className="bg-muted/20 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Pax</th>
                  {visibleLanguages.map((language) => (
                    <th key={language} className="min-w-[100px] p-2 text-right">
                      {languageLabel(language)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {breakdownData.map((row) => (
                  <tr key={row.pax} className="border-t border-muted-foreground/20">
                    <td className="p-2 font-medium">{row.pax} Pax</td>
                    {visibleLanguages.map((language) => (
                      <td key={language} className="p-2 text-right tabular-nums">
                        {row.perLanguage[language] > 0 ? inr(row.perLanguage[language]) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Each language remains an independent Guide alternative. Per-person amounts use the
            applicable master slab and include Land markup and Guide GST once.
          </div>
        </Card>
      )}

      <Card className="order-3 p-3">
        <Label className="text-xs">Remarks (optional)</Label>
        <Input
          value={draft.guide_remarks ?? ""}
          onChange={(event) => set({ guide_remarks: event.target.value })}
          placeholder={
            serviceView === "escort"
              ? "Add any notes about tour escort arrangements, inclusions or special instructions..."
              : undefined
          }
        />
      </Card>
    </div>
  );
}
