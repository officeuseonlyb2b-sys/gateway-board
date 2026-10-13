// Step 13 — Guide charges by routing day, language, and master pricing tier.
import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/format";
import {
  useDB,
  guideConfiguredLanguages,
  guidePrimaryLanguage,
  guideRateForPax,
  type GuideLanguage,
} from "@/lib/mock-store";
import { effectivePaxForPricing, getCostingPaxValues, landMarkup, parsePaxRange } from "@/lib/wizard/calc";
import { applyLandCommercials } from "@/lib/wizard/land-pricing";
import {
  escortDayAppliesToPax,
  getEscortBaseForPax,
  getEscortDayCharge,
  getEscortPricingMode,
  getEscortRangeBase,
  isEscortEnabled,
} from "@/lib/wizard/guide-pricing";
import { uid, dayAllCities, type StepProps } from "../shared";
import type { QuoteDraft } from "@/lib/wizard/types";

const GUIDE_LANGUAGES: GuideLanguage[] = ["Hindi", "English", "Language"];
const PAX_TIERS = [
  { key: "1-5", label: "1–5 Pax", pax: 1 },
  { key: "6-14", label: "6–14 Pax", pax: 6 },
  { key: "15+", label: "15+ Pax", pax: 15 },
] as const;
type TierKey = (typeof PAX_TIERS)[number]["key"];
type CommercialTotals = ReturnType<typeof applyLandCommercials>;
type EscortEditorState = {
  escort_type: string;
  escort_pricing_mode?: "pax_range" | "day_wise";
  escort_ranges: NonNullable<QuoteDraft["escort_ranges"]>;
  guide_day_escort: Record<number, number>;
  guide_day_escort_enabled: Record<number, boolean>;
  guide_escort_reporting: number;
  escort_day_min_pax?: number;
  escort_day_max_pax?: number;
};

const languageLabel = (language: GuideLanguage) => language === "Language" ? "Other Language" : language;

function reportingKey(language: GuideLanguage) {
  if (language === "Hindi") return "guide_reporting_cost_hindi";
  if (language === "English") return "guide_reporting_cost_english";
  return "guide_reporting_cost_language";
}

function makeTourKey(city: string, tour: string) {
  return `${city}||${tour}`;
}

function guideMasterRatePax(guide: import("@/lib/mock-store").Guide, language: GuideLanguage, pax: number) {
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
  const costingRange = parsePaxRange(draft);
  const languageFilter = (draft.guide_language as GuideLanguage | "all") || "all";
  const visibleLanguages = languageFilter === "all" ? GUIDE_LANGUAGES : [languageFilter];
  const escortMode = getEscortPricingMode(draft);
  const escortEnabled = isEscortEnabled(draft);
  const escortRanges = draft.escort_ranges ?? [];
  const [escortDialogOpen, setEscortDialogOpen] = useState(false);
  const [escortEditor, setEscortEditor] = useState<EscortEditorState | null>(null);
  const [escortEditorError, setEscortEditorError] = useState("");
  const [confirmEscortRemoval, setConfirmEscortRemoval] = useState(false);

  const cityName = (id: string) => db.cities.find((city) => city.id === id)?.name || "";
  const allGuides = useMemo(() => db.guides.filter((guide) => guide.is_active), [db.guides]);
  const guideAtCityTour = (city: string, tour: string) =>
    allGuides.find((guide) => (guide.city ?? guide.destination ?? "") === city
      && (guide.tour_program ?? guide.name ?? "") === tour) || null;

  const disabledMap = (): Record<number, string[]> =>
    draft.guide_tour_disabled_by_day ?? {};
  const selectedGuideLine = (guideId: string, day: number) => draft.guides.find(
    (line) => !line.is_escort && line.guide_id === guideId && (line.from_routing_days ?? []).includes(day),
  );

  // Keep the existing automatic Guide Master selection behavior for routing tours.
  useEffect(() => {
    if (!draft.routing.length) return;
    let changed = false;
    const nextGuides = [...draft.guides];
    const disabledByDay = draft.guide_tour_disabled_by_day ?? {};
    draft.routing.forEach((route, routeIndex) => {
      const fromDefault = routeIndex === 0
        ? draft.departure_city
        : db.cities.find((city) => city.id === draft.routing[routeIndex - 1]?.city_id)?.name || "";
      dayAllCities(route, db.cities, fromDefault).forEach((city) => {
        const titles = route.tours_selected_by_city?.[city.id]
          ?? (route.tour_titles_by_city?.[city.id] ? [route.tour_titles_by_city[city.id]] : []);
        titles.forEach((title) => {
          const key = makeTourKey(city.name, title);
          if ((disabledByDay[route.day] ?? []).includes(key)) return;
          const exists = nextGuides.some((line) => {
            if (line.is_escort || !(line.from_routing_days ?? []).includes(route.day)) return false;
            const master = allGuides.find((guide) => guide.id === line.guide_id);
            return (master?.city ?? master?.destination ?? "") === city.name
              && (master?.tour_program ?? master?.name ?? "") === title;
          });
          if (exists) return;
          const guide = allGuides.find((item) => (item.city ?? item.destination ?? "") === city.name
            && (item.tour_program ?? item.name ?? "") === title);
          if (!guide) return;
          const language = guidePrimaryLanguage(guide) || "English";
          nextGuides.push({
            id: uid(),
            guide_id: guide.id,
            days: 1,
            guides: 1,
            rate: guideMasterRatePax(guide, language, pricingPax),
            language,
            from_routing_days: [route.day],
          });
          changed = true;
        });
      });
    });
    if (changed) set({ guides: nextGuides });
  }, [draft.routing, draft.guides, draft.departure_city, draft.guide_tour_disabled_by_day, allGuides, db.cities, pricingPax, set]);

  const getReporting = (language: GuideLanguage) =>
    (draft[reportingKey(language)] as number | undefined) ?? 0;
  const setReporting = (language: GuideLanguage, value: number) =>
    set({ [reportingKey(language)]: value } as Partial<typeof draft>);
  const getDayEscort = (day: number) => draft.guide_day_escort?.[day] ?? 0;

  const closeEscortEditor = () => {
    setEscortDialogOpen(false);
    setEscortEditor(null);
    setEscortEditorError("");
    setConfirmEscortRemoval(false);
  };

  const openEscortEditor = () => {
    const dayEnabled = { ...(draft.guide_day_escort_enabled ?? {}) };
    draft.routing.forEach((route) => {
      if (dayEnabled[route.day] === undefined) dayEnabled[route.day] = getDayEscort(route.day) > 0;
    });
    setEscortEditor({
      escort_type: draft.escort_type || escortRanges[0]?.escort_type || "English Speaking Escort",
      escort_pricing_mode: escortMode,
      escort_ranges: escortRanges.map((range) => ({ ...range })),
      guide_day_escort: { ...(draft.guide_day_escort ?? {}) },
      guide_day_escort_enabled: dayEnabled,
      guide_escort_reporting: draft.guide_escort_reporting ?? 0,
      escort_day_min_pax: draft.escort_day_min_pax,
      escort_day_max_pax: draft.escort_day_max_pax,
    });
    setEscortEditorError("");
    setConfirmEscortRemoval(false);
    setEscortDialogOpen(true);
  };

  const updateEscortEditor = (patch: Partial<EscortEditorState>) =>
    setEscortEditor((current) => current ? { ...current, ...patch } : current);

  const saveEscortEditor = () => {
    if (!escortEditor?.escort_pricing_mode) {
      setEscortEditorError("Choose Pax Slab / Range or Day-wise pricing.");
      return;
    }
    if (escortEditor.escort_pricing_mode === "pax_range") {
      if (!escortEditor.escort_ranges.length || escortEditor.escort_ranges.some(
        (rangeItem) => rangeItem.min_pax < 1 || rangeItem.max_pax < rangeItem.min_pax,
      )) {
        setEscortEditorError("Add at least one valid Pax Range (Min Pax ≥ 1 and Max Pax ≥ Min Pax).");
        return;
      }
    } else {
      if (
        (escortEditor.escort_day_min_pax != null && escortEditor.escort_day_min_pax < 1)
        || (escortEditor.escort_day_min_pax != null && escortEditor.escort_day_max_pax != null
          && escortEditor.escort_day_max_pax < escortEditor.escort_day_min_pax)
      ) {
        setEscortEditorError("Enter a valid optional Escort pax range.");
        return;
      }
      if (!draft.routing.some((route) => escortEditor.guide_day_escort_enabled[route.day])) {
        setEscortEditorError("Include Escort on at least one routing day.");
        return;
      }
    }
    set({
      escort_enabled: true,
      escort_type: escortEditor.escort_type,
      escort_pricing_mode: escortEditor.escort_pricing_mode,
      escort_ranges: escortEditor.escort_ranges,
      guide_day_escort: escortEditor.guide_day_escort,
      guide_day_escort_enabled: escortEditor.guide_day_escort_enabled,
      guide_escort_reporting: escortEditor.guide_escort_reporting,
      escort_day_min_pax: escortEditor.escort_day_min_pax,
      escort_day_max_pax: escortEditor.escort_day_max_pax,
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
      guide_escort_reporting: 0,
      escort_day_min_pax: undefined,
      escort_day_max_pax: undefined,
      guides: draft.guides.filter((line) => !line.is_escort),
    });
    closeEscortEditor();
  };

  const dayData = draft.routing.map((route, routeIndex) => {
    const fromDefault = routeIndex === 0
      ? draft.departure_city
      : cityName(draft.routing[routeIndex - 1]?.city_id || "");
    const from = route.from_city || fromDefault || "—";
    const to = cityName(route.city_id) || route.to_city || "—";
    const routeLabel = from === to ? `${to} Local` : `${from} → ${to}`;
    const options = dayAllCities(route, db.cities, fromDefault).flatMap((city) => {
      const titles = route.tours_selected_by_city?.[city.id]
        ?? (route.tour_titles_by_city?.[city.id] ? [route.tour_titles_by_city[city.id]] : []);
      return titles.flatMap((tour) => {
        const guide = guideAtCityTour(city.name, tour);
        return guide ? [{ city: city.name, tour, guide }] : [];
      });
    });
    const siteRows = options.map((option) => {
      const key = makeTourKey(option.city, option.tour);
      const isDisabled = (disabledMap()[route.day] ?? []).includes(key);
      const line = selectedGuideLine(option.guide.id, route.day);
      const tierRates = Object.fromEntries(GUIDE_LANGUAGES.map((language) => [
        language,
        Object.fromEntries(PAX_TIERS.map((tier) => [
          tier.key,
          guideMasterRatePax(option.guide, language, tier.pax),
        ])),
      ])) as Record<GuideLanguage, Record<TierKey, number>>;
      return { ...option, key, line, tierRates, isSelected: !isDisabled && !!line };
    });
    return { route, routeLabel, siteRows, hasRows: siteRows.length > 0 };
  });

  const selectedGuideRows = dayData.flatMap((day) => day.siteRows.filter((row) => row.isSelected));
  const guideBaseForPax = (language: GuideLanguage, pax: number) => selectedGuideRows.reduce(
    (sum, row) => {
      const line = row.line;
      const targetDayCount = Math.max(1, line?.from_routing_days?.length ?? draft.routing.length);
      return sum + guideMasterRatePax(row.guide, language, pax)
        * Math.max(1, line?.guides ?? 1)
        * Math.max(1, line?.days ?? 1)
        / targetDayCount;
    },
    0,
  ) + getReporting(language);
  const guideCommercials = Object.fromEntries(visibleLanguages.map((language) => [
    language,
    Object.fromEntries(PAX_TIERS.map((tier) => [
      tier.key,
      applyLandCommercials(draft, guideBaseForPax(language, tier.pax), 0.05),
    ])),
  ])) as Record<GuideLanguage, Record<TierKey, CommercialTotals>>;

  const activeEscortRanges = escortEnabled && escortMode === "pax_range" ? escortRanges : [];
  const escortColumns = activeEscortRanges.length
    ? activeEscortRanges.map((range) => ({
        id: range.id,
        label: `${range.min_pax}–${range.max_pax} Pax`,
        base: getEscortRangeBase(draft, range),
      }))
    : escortEnabled && escortMode === "day_wise"
      ? [{ id: "day-wise", label: "Day-wise", base: getEscortBaseForPax(draft, pricingPax) }]
      : [];
  const escortCommercials = escortColumns.map((column) => ({
    ...column,
    commercial: applyLandCommercials(draft, column.base, 0.05),
  }));

  const toggleTourSelection = (day: number, site: (typeof dayData)[number]["siteRows"][number]) => {
    const key = site.key;
    if (site.isSelected) {
      const nextDisabled = { ...disabledMap() };
      nextDisabled[day] = Array.from(new Set([...(nextDisabled[day] ?? []), key]));
      set({
        guide_tour_disabled_by_day: nextDisabled,
        guides: draft.guides.filter((line) => {
          if (line.is_escort || !(line.from_routing_days ?? []).includes(day)) return true;
          const master = allGuides.find((guide) => guide.id === line.guide_id);
          return !((master?.city ?? master?.destination ?? "") === site.city
            && (master?.tour_program ?? master?.name ?? "") === site.tour);
        }),
      });
      return;
    }
    const nextDisabled = { ...disabledMap() };
    nextDisabled[day] = (nextDisabled[day] ?? []).filter((item) => item !== key);
    if (!nextDisabled[day].length) delete nextDisabled[day];
    const language = guidePrimaryLanguage(site.guide) || "English";
    set({
      guide_tour_disabled_by_day: nextDisabled,
      guides: [
        ...draft.guides,
        {
          id: uid(), guide_id: site.guide.id, days: 1, guides: 1,
          rate: guideMasterRatePax(site.guide, language, pricingPax),
          language, from_routing_days: [day],
        },
      ],
    });
  };

  const addEditorRange = () => setEscortEditor((current) => current ? {
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
  } : current);
  const patchEditorRange = (id: string, patch: Partial<EscortEditorState["escort_ranges"][number]>) =>
    setEscortEditor((current) => current ? {
      ...current,
      escort_ranges: current.escort_ranges.map((rangeItem) => rangeItem.id === id ? { ...rangeItem, ...patch } : rangeItem),
    } : current);
  const updateEditorDayPaxBound = (field: "escort_day_min_pax" | "escort_day_max_pax", raw: string) => {
    const value = raw === "" ? undefined : Math.max(1, Number(raw) || 1);
    setEscortEditor((current) => {
      if (!current) return current;
      if (field === "escort_day_min_pax") {
        const max = value != null && current.escort_day_max_pax != null && current.escort_day_max_pax < value
          ? value
          : current.escort_day_max_pax;
        return { ...current, escort_day_min_pax: value, escort_day_max_pax: max };
      }
      const min = current.escort_day_min_pax ?? 1;
      return { ...current, escort_day_max_pax: value == null ? undefined : Math.max(min, value) };
    });
  };
  const summaryCells = (kind: keyof CommercialTotals) => (
    <>
      {visibleLanguages.flatMap((language) => PAX_TIERS.map((tier) => (
        <td key={`${language}-${tier.key}`} className="p-2 text-right tabular-nums">
          {inr(guideCommercials[language][tier.key][kind])}
        </td>
      )))}
      {escortCommercials.map((column) => (
        <td key={column.id} className="p-2 text-right tabular-nums">
          {inr(column.commercial[kind])}
        </td>
      ))}
    </>
  );

  const breakdownData = costingPaxValues.map((paxCount) => ({
    pax: paxCount,
    perLanguage: Object.fromEntries(visibleLanguages.map((language) => [
      language,
      applyLandCommercials(draft, guideBaseForPax(language, paxCount), 0.05).final / Math.max(1, paxCount),
    ])) as Record<GuideLanguage, number>,
    escortBase: getEscortBaseForPax(draft, paxCount),
    escortPerPax: applyLandCommercials(draft, getEscortBaseForPax(draft, paxCount), 0.05).final / Math.max(1, paxCount),
  }));

  const range = parsePaxRange(draft);
  const escortSummary = escortMode === "pax_range"
    ? `${draft.escort_type || escortRanges[0]?.escort_type || "Tour Escort"} · ${escortRanges.map((rangeItem) => `${rangeItem.min_pax}–${rangeItem.max_pax}`).join(", ") || "Pax Slab / Range"}`
    : `${draft.escort_type || "Tour Escort"} · Day-wise`;
  const escortDayRangeValid =
    (!Number.isInteger(draft.escort_day_min_pax) || (draft.escort_day_min_pax ?? 0) >= 1)
    && (!Number.isInteger(draft.escort_day_max_pax) || (draft.escort_day_max_pax ?? 0) >= (draft.escort_day_min_pax ?? 1));
  const escortAppliesAtPricingPax = escortDayAppliesToPax(draft, pricingPax);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Guide Charges</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs text-muted-foreground">Filter Language</Label>
          <Select value={languageFilter} onValueChange={(value) => set({ guide_language: value })}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Languages</SelectItem>
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
          {range && <Badge variant="outline" className="text-[10px]">Pricing Pax: {pricingPax}</Badge>}
          {escortEnabled && <span className="text-[10px] text-muted-foreground">Tour Escort: {escortSummary}</span>}
          <Button size="sm" variant={escortEnabled ? "outline" : "default"} onClick={openEscortEditor}>
            {escortEnabled ? <Pencil className="mr-1 h-3.5 w-3.5" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
            {escortEnabled ? "Edit Tour Escort" : "Add Tour Escort"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#E5E7EB] bg-white">
        <table className="w-full min-w-[1050px] border-collapse text-xs">
          <thead className="bg-[#F3F4F6] text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-[#E5E7EB]">
              <th rowSpan={2} className="w-[65px] p-2 text-left">Day</th>
              <th rowSpan={2} className="w-[165px] p-2 text-left">Route</th>
              <th rowSpan={2} className="min-w-[220px] p-2 text-left">City + Tour</th>
              {visibleLanguages.map((language) => (
                <th key={language} colSpan={3} className="p-2 text-center">{languageLabel(language)}</th>
              ))}
              {escortColumns.length > 0 && <th colSpan={escortColumns.length} className="p-2 text-center">Tour Escort</th>}
            </tr>
            <tr className="border-b border-[#E5E7EB]">
              {visibleLanguages.flatMap((language) => PAX_TIERS.map((tier) => (
                <th key={`${language}-${tier.key}`} className="min-w-[92px] p-2 text-right">{tier.label}</th>
              )))}
              {escortColumns.map((column) => <th key={column.id} className="min-w-[110px] p-2 text-right">{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {dayData.map((day) => {
              if (!day.hasRows) {
                return (
                  <tr key={day.route.day} className="border-b border-[#E5E7EB]">
                    <td className="p-2 font-semibold">Day {day.route.day}</td>
                    <td className="p-2 text-[11px] text-muted-foreground">{day.routeLabel}</td>
                    <td colSpan={1 + visibleLanguages.length * 3} className="p-2 italic text-muted-foreground">
                      No guide-assigned tours for this day's cities.
                    </td>
                    {escortColumns.map((column) => (
                      <td key={column.id} className="p-2 text-right text-muted-foreground">
                        {escortMode === "day_wise" && escortEnabled && escortAppliesAtPricingPax && getEscortDayCharge(draft, day.route.day) > 0
                          ? inr(getEscortDayCharge(draft, day.route.day)
                            + (day.route.day === draft.routing[0]?.day ? (draft.guide_escort_reporting ?? 0) : 0))
                          : "—"}
                      </td>
                    ))}
                  </tr>
                );
              }
              return day.siteRows.map((site, siteIndex) => (
                <tr key={`${day.route.day}-${site.key}`} className="border-b border-[#E5E7EB] align-top">
                  {siteIndex === 0 && <td rowSpan={day.siteRows.length} className="p-2 font-semibold">Day {day.route.day}</td>}
                  {siteIndex === 0 && <td rowSpan={day.siteRows.length} className="p-2 text-[11px] text-muted-foreground">{day.routeLabel}</td>}
                  <td className="p-2">
                    <label className="flex cursor-pointer items-start gap-2">
                      <Checkbox checked={site.isSelected} onCheckedChange={() => toggleTourSelection(day.route.day, site)} className="mt-0.5" />
                      <span className="min-w-0">
                        <span className="text-[10px] text-muted-foreground">{site.city}</span>
                        <span className="block truncate text-sm font-medium">{site.tour}</span>
                      </span>
                    </label>
                  </td>
                  {visibleLanguages.flatMap((language) => PAX_TIERS.map((tier) => {
                    const rate = site.tierRates[language][tier.key];
                    return (
                      <td key={`${language}-${tier.key}`} className="p-2 text-right tabular-nums">
                        {rate > 0 ? inr(rate) : <span className="text-muted-foreground">—</span>}
                      </td>
                    );
                  }))}
                  {escortColumns.map((column) => {
                    const showDayCharge = escortMode === "day_wise"
                      && escortEnabled
                      && escortAppliesAtPricingPax
                      && siteIndex === 0
                      && getEscortDayCharge(draft, day.route.day) > 0;
                    const showSlabCharge = escortMode === "pax_range"
                      && escortEnabled
                      && day.route.day === draft.routing[0]?.day
                      && siteIndex === 0;
                    return (
                      <td key={column.id} className="p-2 text-right tabular-nums">
                        {showDayCharge
                          ? inr(getEscortDayCharge(draft, day.route.day))
                          : showSlabCharge
                            ? inr(column.base)
                            : <span className="text-muted-foreground">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ));
            })}

            <tr className="border-t bg-muted/10">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase text-muted-foreground">Reporting Cost</td>
              {visibleLanguages.map((language) => (
                <td key={language} colSpan={3} className="p-2 text-right">
                  <Input type="number" min={0} value={getReporting(language) || ""} onChange={(event) => setReporting(language, Number(event.target.value) || 0)} className="ml-auto h-7 w-28 text-right text-[11px]" />
                </td>
              ))}
              {escortColumns.length > 0 && <td colSpan={escortColumns.length} className="p-2 text-center text-[10px] text-muted-foreground">Escort reporting is configured in Tour Escort</td>}
            </tr>
            <tr className="border-t-2 border-[#E5E7EB] bg-[#F0FDF4] font-semibold">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase">Base Total</td>
              {summaryCells("base")}
            </tr>
            <tr className="bg-[#F0FDF4]">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase text-muted-foreground">Markup ({(landMarkup(draft) * 100).toFixed(1)}%)</td>
              {summaryCells("markup")}
            </tr>
            <tr className="border-b-2 border-[#D1D5DB] bg-[#F0FDF4]">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase text-muted-foreground">GST 5%</td>
              {summaryCells("gst")}
            </tr>
            <tr className="bg-[#F0FDF4] text-sm font-bold text-primary">
              <td colSpan={3} className="p-2 text-right uppercase">Final Total</td>
              {summaryCells("final")}
            </tr>
          </tbody>
        </table>
      </div>

      <Dialog open={escortDialogOpen} onOpenChange={(open) => { if (!open) closeEscortEditor(); }}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <DialogTitle>Tour Escort</DialogTitle>
            <DialogDescription>Optional service; only the active pricing mode is costed.</DialogDescription>
          </DialogHeader>
          {escortEditor && (
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Escort Type</Label>
                    <Select value={escortEditor.escort_type} onValueChange={(value) => updateEscortEditor({ escort_type: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="English Speaking Escort">English Speaking Escort</SelectItem>
                        <SelectItem value="Language Escort">Language Escort</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Pricing Mode</Label>
                    <Select
                      value={escortEditor.escort_pricing_mode ?? "unset"}
                      onValueChange={(value) => updateEscortEditor({
                        escort_pricing_mode: value === "pax_range" || value === "day_wise" ? value : undefined,
                      })}
                    >
                      <SelectTrigger><SelectValue placeholder="Choose pricing mode" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">Choose pricing mode</SelectItem>
                        <SelectItem value="pax_range">Pax Slab / Range</SelectItem>
                        <SelectItem value="day_wise">Day-wise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {escortEditor.escort_pricing_mode === "pax_range" && (
                  <div className="space-y-3 border-t pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold">Custom Pax Ranges</div>
                      <Button size="sm" variant="outline" onClick={addEditorRange}>
                        <Plus className="mr-1 h-3.5 w-3.5" />Add Pax Range
                      </Button>
                    </div>
                    {escortEditor.escort_ranges.map((rangeItem) => (
                      <div key={rangeItem.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr_1fr_auto]">
                        <div className="space-y-1">
                          <Label className="text-[10px]">Min Pax</Label>
                          <Input type="number" min={1} value={rangeItem.min_pax} onChange={(event) => {
                            const min = Math.max(1, Number(event.target.value) || 1);
                            patchEditorRange(rangeItem.id, { min_pax: min, max_pax: Math.max(min, rangeItem.max_pax) });
                          }} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Max Pax</Label>
                          <Input type="number" min={rangeItem.min_pax} value={rangeItem.max_pax} onChange={(event) => patchEditorRange(rangeItem.id, { max_pax: Math.max(rangeItem.min_pax, Number(event.target.value) || rangeItem.min_pax) })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Escort Type</Label>
                          <Select value={rangeItem.escort_type} onValueChange={(value) => patchEditorRange(rangeItem.id, { escort_type: value })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="English Speaking Escort">English Speaking Escort</SelectItem>
                              <SelectItem value="Language Escort">Language Escort</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Charge</Label>
                          <Input type="number" min={0} value={rangeItem.charge || ""} onChange={(event) => patchEditorRange(rangeItem.id, { charge: Number(event.target.value) || 0 })} />
                        </div>
                        <Button className="mt-5" size="icon" variant="ghost" aria-label="Delete pax range" onClick={() => updateEscortEditor({ escort_ranges: escortEditor.escort_ranges.filter((item) => item.id !== rangeItem.id) })}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                    {escortEditor.escort_ranges.length === 0 && <div className="text-xs italic text-muted-foreground">Add a custom pax range to price this Escort.</div>}
                  </div>
                )}

                {escortEditor.escort_pricing_mode === "day_wise" && (
                  <div className="space-y-3 border-t pt-3">
                    <div className="grid max-w-md gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Applicable Min Pax (optional)</Label>
                        <Input type="number" min={1} value={escortEditor.escort_day_min_pax ?? ""} onChange={(event) => updateEditorDayPaxBound("escort_day_min_pax", event.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Applicable Max Pax (optional)</Label>
                        <Input type="number" min={escortEditor.escort_day_min_pax ?? 1} value={escortEditor.escort_day_max_pax ?? ""} onChange={(event) => updateEditorDayPaxBound("escort_day_max_pax", event.target.value)} />
                      </div>
                    </div>
                    <div className="divide-y rounded-md border">
                      {draft.routing.map((route, routeIndex) => {
                        const from = route.from_city || (routeIndex === 0 ? draft.departure_city : db.cities.find((city) => city.id === draft.routing[routeIndex - 1]?.city_id)?.name) || "—";
                        const to = db.cities.find((city) => city.id === route.city_id)?.name || route.to_city || "—";
                        const included = escortEditor.guide_day_escort_enabled[route.day] ?? (escortEditor.guide_day_escort[route.day] ?? 0) > 0;
                        return (
                          <div key={route.day} className="grid items-center gap-2 p-2 sm:grid-cols-[70px_1fr_auto_130px]">
                            <div className="text-xs font-semibold">Day {route.day}</div>
                            <div className="text-xs text-muted-foreground">{from === to ? `${to} Local` : `${from} → ${to}`}</div>
                            <label className="flex items-center gap-2 text-xs">
                              <Checkbox checked={included} onCheckedChange={(checked) => updateEscortEditor({ guide_day_escort_enabled: { ...escortEditor.guide_day_escort_enabled, [route.day]: checked === true } })} />
                              Include Escort
                            </label>
                            <Input type="number" min={0} disabled={!included} placeholder="Charge" value={escortEditor.guide_day_escort[route.day] || ""} onChange={(event) => updateEscortEditor({ guide_day_escort: { ...escortEditor.guide_day_escort, [route.day]: Number(event.target.value) || 0 } })} />
                          </div>
                        );
                      })}
                      {draft.routing.length === 0 && <div className="p-3 text-xs italic text-muted-foreground">Add routing days to configure day-wise Escort charges.</div>}
                    </div>
                  </div>
                )}

                {escortEditor.escort_pricing_mode && (
                  <div className="max-w-xs space-y-1 border-t pt-3">
                    <Label className="text-[10px]">Escort Reporting</Label>
                    <Input type="number" min={0} value={escortEditor.guide_escort_reporting || ""} onChange={(event) => updateEscortEditor({ guide_escort_reporting: Number(event.target.value) || 0 })} />
                  </div>
                )}

                {escortEditorError && <p className="text-xs text-destructive">{escortEditorError}</p>}
                {confirmEscortRemoval && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <span className="text-sm">Remove the saved Tour Escort configuration?</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setConfirmEscortRemoval(false)}>Keep Escort</Button>
                      <Button size="sm" variant="destructive" onClick={confirmRemoveEscort}>Remove Tour Escort</Button>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="shrink-0 items-center border-t px-6 py-3">
                {escortEnabled && !confirmEscortRemoval && <Button className="mr-auto" size="sm" variant="ghost" onClick={removeEscort}>Remove Tour Escort</Button>}
                {!confirmEscortRemoval && <Button size="sm" variant="ghost" onClick={closeEscortEditor}>Cancel</Button>}
                {!confirmEscortRemoval && <Button size="sm" onClick={saveEscortEditor}>Save Tour Escort</Button>}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Card className="space-y-3 border-2 border-primary/20 bg-primary/5 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-primary">Per-Person Cost Breakdown</h3>
          {range && <span className="text-[10px] text-muted-foreground">Costing Range: {range.min}–{range.max} Pax</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-xs">
            <thead className="bg-muted/20 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Pax</th>
                {visibleLanguages.map((language) => <th key={language} className="min-w-[100px] p-2 text-right">{languageLabel(language)}</th>)}
                <th className="min-w-[100px] p-2 text-right">Tour Escort</th>
              </tr>
            </thead>
            <tbody>
              {breakdownData.map((row) => (
                <tr key={row.pax} className="border-t border-muted-foreground/20">
                  <td className="p-2 font-medium">{row.pax} Pax</td>
                  {visibleLanguages.map((language) => <td key={language} className="p-2 text-right tabular-nums">{row.perLanguage[language] > 0 ? inr(row.perLanguage[language]) : "—"}</td>)}
                  <td className="p-2 text-right tabular-nums">{row.escortBase > 0 ? inr(row.escortPerPax) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] text-muted-foreground">Each language remains an independent Guide alternative. Per-person amounts use the applicable master slab and include Land markup and Guide GST once.</div>
      </Card>

      <Card className="p-3">
        <Label className="text-xs">Remarks (optional)</Label>
        <Input value={draft.guide_remarks ?? ""} onChange={(event) => set({ guide_remarks: event.target.value })} />
      </Card>
    </div>
  );
}
