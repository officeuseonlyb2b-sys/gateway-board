// StepGuide.tsx (exports Step13)
// Guide charges with per-city+tour rows, per-language totals, and per-person breakdown sheet.

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { inr } from "@/lib/format";
import { useDB, GUIDE_LANGUAGES, guideConfiguredLanguages, guideRateForPax, guidePrimaryLanguage, type GuideLanguage } from "@/lib/mock-store";
import { effectivePaxForPricing } from "@/lib/wizard/calc";
import { uid, dayAllCities, type StepProps } from "../shared";

const DISPLAY_LANGUAGES: GuideLanguage[] = ["Hindi", "English", "Language"];

function reportingKey(lang: GuideLanguage) {
  if (lang === "Hindi") return "guide_reporting_cost_hindi";
  if (lang === "English") return "guide_reporting_cost_english";
  return "guide_reporting_cost_language";
}

function makeTourKey(city: string, tour: string) {
  return `${city}||${tour}`;
}

export function Step13({ draft, set }: StepProps) {
  const d = useDB();
  const pax = effectivePaxForPricing(draft);
  const paxTier = pax <= 5 ? "1-5" : pax <= 14 ? "6-14" : "15+";
  const [langFilter, setLangFilter] = useState<GuideLanguage | "all">(
    (draft.guide_language as GuideLanguage | "all") || "all"
  );
  const cityName = (id: string) => d.cities.find((c) => c.id === id)?.name || "";

  useEffect(() => {
    set({ guide_language: langFilter });
  }, [langFilter]);

  const allGuides = d.guides.filter((g) => g.is_active);

  const availableLanguages = useMemo(() => {
    const s = new Set<GuideLanguage>();
    allGuides.forEach((g) => guideConfiguredLanguages(g).forEach((l) => s.add(l)));
    return GUIDE_LANGUAGES.filter((l) => s.has(l));
  }, [allGuides]);

  const rateForGuideLangPax = (g: typeof allGuides[number], lang: GuideLanguage, p: number) => {
    const r = g.language_rates?.[lang];
    if (r) return p <= 5 ? r.rate_1_to_5 : p <= 14 ? r.rate_6_to_14 : r.rate_15_plus;
    return guideRateForPax(g, p, lang);
  };

  const getDisabledMap = (): Record<number, string[]> =>
    ((draft as any).guide_tour_disabled_by_day as Record<number, string[]> | undefined) || {};

  const getDisabledKeys = (day: number) => new Set(getDisabledMap()[day] || []);

  const setDisabledKey = (day: number, key: string, disabled: boolean) => {
    const current = getDisabledMap();
    const next = { ...current };
    const arr = new Set(next[day] || []);
    if (disabled) arr.add(key);
    else arr.delete(key);

    const values = Array.from(arr);
    if (values.length > 0) next[day] = values;
    else delete next[day];

    set({ guide_tour_disabled_by_day: next } as Partial<typeof draft>);
  };

  const findGuideByCityTour = (city: string, tour: string) =>
    allGuides.find((g) => (g.city ?? g.destination ?? "") === city && (g.tour_program ?? g.name ?? "") === tour) || null;

  // Auto-sync selected guides for each day based on selected tours.
  useEffect(() => {
    if (!draft.routing.length) return;

    let changed = false;
    const newGuides = [...draft.guides];
    const disabledMap = getDisabledMap();

    const ensureGuideLine = (day: number, city: string, tour: string) => {
      const key = makeTourKey(city, tour);
      if ((disabledMap[day] || []).includes(key)) return;

      const existingIndex = newGuides.findIndex((x) => {
        if (x.is_escort) return false;
        if (!(x.from_routing_days ?? []).includes(day)) return false;
        const g = allGuides.find((y) => y.id === x.guide_id);
        const xCity = g?.city ?? g?.destination ?? "";
        const xTour = g?.tour_program ?? g?.name ?? "";
        return xCity === city && xTour === tour;
      });

      if (existingIndex !== -1) return;

      const g = findGuideByCityTour(city, tour);
      if (!g) return;

      const primaryLang = guidePrimaryLanguage(g) || "English";
      const rate = rateForGuideLangPax(g, primaryLang, pax);

      newGuides.push({
        id: uid(),
        guide_id: g.id,
        days: 1,
        guides: 1,
        rate,
        language: primaryLang,
        from_routing_days: [day],
      });

      changed = true;
    };

    draft.routing.forEach((r) => {
      const day = r.day;
      const fromDefault = draft.routing.indexOf(r) === 0
        ? draft.departure_city
        : cityName(draft.routing[draft.routing.indexOf(r) - 1]?.city_id || "");
      const dayCities = dayAllCities(r, d.cities, fromDefault);

      dayCities.forEach((c) => {
        const selectedTitles =
          r.tours_selected_by_city?.[c.id]
          ?? (r.tour_titles_by_city?.[c.id] ? [r.tour_titles_by_city[c.id]] : []);
        selectedTitles.forEach((tourTitle) => ensureGuideLine(day, c.name, tourTitle));
      });
    });

    if (changed) set({ guides: newGuides });
  }, [draft.routing, allGuides, d.cities, pax]);

  const setDayEscort = (day: number, value: number) => {
    const current = draft.guide_day_escort || {};
    set({ guide_day_escort: { ...current, [day]: value } });
  };

  const getDayEscort = (day: number) => (draft.guide_day_escort?.[day] ?? 0);

  const getReporting = (lang: GuideLanguage): number =>
    (draft[reportingKey(lang)] as number | undefined) ?? 0;

  const setReporting = (lang: GuideLanguage, value: number) => {
    set({ [reportingKey(lang)]: value } as Partial<typeof draft>);
  };

  const getEscortReporting = (): number =>
    (draft.guide_escort_reporting as number | undefined) ?? 0;

  const setEscortReporting = (value: number) => {
    set({ guide_escort_reporting: value } as Partial<typeof draft>);
  };

  // Build day data
  const visibleLangs = langFilter === "all" ? DISPLAY_LANGUAGES : [langFilter as GuideLanguage];

  const dayData = draft.routing.map((r, ri) => {
    const fromDefault = ri === 0
      ? draft.departure_city
      : cityName(draft.routing[ri - 1]?.city_id || "");
    const routeLabel = `${r.from_city ?? fromDefault ?? "—"} → ${
      cityName(r.city_id) || r.to_city || "—"
    }`;

    const dayCities = dayAllCities(r, d.cities, fromDefault);
    const options: Array<{ city: string; tour: string; guide: typeof allGuides[number] }> = [];
    dayCities.forEach((c) => {
      const selectedTitles =
        r.tours_selected_by_city?.[c.id]
        ?? (r.tour_titles_by_city?.[c.id] ? [r.tour_titles_by_city[c.id]] : []);
      selectedTitles.forEach((tourTitle) => {
        const guide = findGuideByCityTour(c.name, tourTitle);
        if (guide) {
          options.push({ city: c.name, tour: tourTitle, guide });
        }
      });
    });

    const siteRows = options.map((opt) => {
      const key = makeTourKey(opt.city, opt.tour);
      const disabled = getDisabledKeys(r.day).has(key);
      const isSelected = !disabled && draft.guides.some((line) => {
        if (line.is_escort) return false;
        if (!(line.from_routing_days ?? []).includes(r.day)) return false;
        const g = allGuides.find((x) => x.id === line.guide_id);
        return (g?.city ?? g?.destination ?? "") === opt.city
          && (g?.tour_program ?? g?.name ?? "") === opt.tour;
      });

      const langRates: Record<GuideLanguage, number> = {} as Record<GuideLanguage, number>;
      visibleLangs.forEach((lang) => {
        langRates[lang] = rateForGuideLangPax(opt.guide, lang, pax);
      });

      return {
        city: opt.city,
        tour: opt.tour,
        guide: opt.guide,
        isSelected,
        langRates,
        key,
      };
    });

    const dayTotals: Record<GuideLanguage, number> = {} as Record<GuideLanguage, number>;
    visibleLangs.forEach((lang) => {
      dayTotals[lang] = 0;
    });

    siteRows.forEach((site) => {
      if (!site.isSelected) return;
      visibleLangs.forEach((lang) => {
        const rate = site.langRates[lang] || 0;
        dayTotals[lang] += rate; // Flat group rate (Not multiplied by pax)
      });
    });

    return {
      r,
      ri,
      routeLabel,
      siteRows,
      dayTotals,
      hasRows: siteRows.length > 0,
    };
  });

  // Grand totals for guides
  const grandTotals: Record<GuideLanguage, number> = {} as Record<GuideLanguage, number>;
  visibleLangs.forEach((lang) => {
    grandTotals[lang] = 0;
  });
  let escortGrand = 0;

  dayData.forEach((day) => {
    visibleLangs.forEach((lang) => {
      grandTotals[lang] += day.dayTotals[lang] || 0;
    });
    escortGrand += getDayEscort(day.r.day);
  });

  // Per-Language Grand totals (Hindi, English, Language) - EXCLUDING Escort
  const totalPerLang: Record<GuideLanguage, number> = {} as Record<GuideLanguage, number>;
  visibleLangs.forEach((lang) => {
    totalPerLang[lang] = grandTotals[lang] + getReporting(lang);
  });

  // Escort totals
  const escortReportingCost = getEscortReporting();
  const escortTotal = escortGrand + escortReportingCost;

  const toggleTourSelection = (day: number, site: typeof dayData[number]['siteRows'][0]) => {
    const key = site.key;
    const currentSelected = site.isSelected;
    const guide = site.guide; 

    if (currentSelected) {
      const currentDisabled = getDisabledMap();
      const disabledForDay = new Set(currentDisabled[day] || []);
      disabledForDay.add(key);
      const nextDisabled = { ...currentDisabled, [day]: Array.from(disabledForDay) };
      set({
        guide_tour_disabled_by_day: nextDisabled,
        guides: draft.guides.filter((line) => {
          if (line.is_escort) return true;
          if (!(line.from_routing_days ?? []).includes(day)) return true;
          const g = allGuides.find((x) => x.id === line.guide_id);
          return !((g?.city ?? g?.destination ?? "") === site.city && (g?.tour_program ?? g?.name ?? "") === site.tour);
        }),
      } as Partial<typeof draft>);
    } else {
      const currentDisabled = getDisabledMap();
      const disabledForDay = new Set(currentDisabled[day] || []);
      disabledForDay.delete(key);
      const nextDisabled = { ...currentDisabled };
      const values = Array.from(disabledForDay);
      if (values.length > 0) nextDisabled[day] = values;
      else delete nextDisabled[day];

      const exists = draft.guides.some((line) => {
        if (line.is_escort) return false;
        if (!(line.from_routing_days ?? []).includes(day)) return false;
        const g = allGuides.find((x) => x.id === line.guide_id);
        return (g?.city ?? g?.destination ?? "") === site.city && (g?.tour_program ?? g?.name ?? "") === site.tour;
      });

      if (exists) {
        set({ guide_tour_disabled_by_day: nextDisabled } as Partial<typeof draft>);
        return;
      }

      const primaryLang = guidePrimaryLanguage(guide) || "English";
      const rate = rateForGuideLangPax(guide, primaryLang, pax);

      set({
        guide_tour_disabled_by_day: nextDisabled,
        guides: [
          ...draft.guides,
          {
            id: uid(),
            guide_id: guide.id,
            days: 1,
            guides: 1,
            rate,
            language: primaryLang,
            from_routing_days: [day],
          },
        ],
      });
    }
  };

  // ===== Per‑Person Breakdown Data =====
  const MAX_PAX = 10;
  const paxRange = Array.from({ length: MAX_PAX }, (_, i) => i + 1);

  const breakdownData = paxRange.map((paxCount) => {
    const perLang: Record<string, number> = {};
    visibleLangs.forEach((lang) => {
      const total = totalPerLang[lang] || 0;
      perLang[lang] = paxCount > 0 ? total / paxCount : 0;
    });
    const escortPerPax = paxCount > 0 ? escortTotal / paxCount : 0;
    const totalPerPax = Object.values(perLang).reduce((sum, v) => sum + v, 0) + escortPerPax;
    return { pax: paxCount, perLang, escortPerPax, totalPerPax };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Guide Charges</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filter language:</span>
          <Select value={langFilter} onValueChange={(v) => setLangFilter(v as GuideLanguage | "all")}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All languages</SelectItem>
              {availableLanguages.length > 0
                ? availableLanguages.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)
                : DISPLAY_LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-[10px]">Current pax: {pax} ({paxTier})</Badge>
        </div>
      </div>

      <div className="border border-[#E5E7EB] rounded-lg overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-[#F3F4F6] text-[10px] uppercase text-muted-foreground tracking-wide">
            <tr className="border-b border-[#E5E7EB]">
              <th className="text-left p-2 w-[60px]">Day</th>
              <th className="text-left p-2 w-[170px]">Route</th>
              <th className="text-left p-2 min-w-[200px]">City + Tour</th>
              {visibleLangs.map((lang) => (
                <th key={lang} className="text-right p-2 w-[150px]">{lang}</th>
              ))}
              <th className="text-right p-2 w-[120px] whitespace-nowrap">Tour Escorted (₹)</th>
            </tr>
          </thead>
          <tbody>
            {dayData.map((day, dayIdx) => {
              if (!day.hasRows) {
                return (
                  <tr key={dayIdx} className="border-b border-[#E5E7EB]">
                    <td className="p-2 font-semibold align-top">Day {day.r.day}</td>
                    <td className="p-2 text-muted-foreground align-top text-[11px]">
                      {day.routeLabel}
                    </td>
                    <td colSpan={visibleLangs.length + 2} className="p-2 text-muted-foreground italic">
                      No guide‑assigned tours for this day's cities.
                    </td>
                  </tr>
                );
              }

              const rowSpan = day.siteRows.length;
              return day.siteRows.map((site, siteIdx) => {
                const isFirst = siteIdx === 0;
                return (
                  <tr
                    key={`${dayIdx}-${siteIdx}`}
                    className="border-b border-[#E5E7EB] align-top bg-white"
                  >
                    {isFirst && (
                      <>
                        <td rowSpan={rowSpan} className="p-2 font-semibold align-top">
                          Day {day.r.day}
                        </td>
                        <td rowSpan={rowSpan} className="p-2 text-muted-foreground text-[11px] align-top">
                          {day.routeLabel}
                        </td>
                      </>
                    )}

                    {/* City + Tour */}
                    <td className="p-2">
                      <label className="flex items-start gap-2 cursor-pointer group">
                        <Checkbox
                          checked={site.isSelected}
                          onCheckedChange={() => toggleTourSelection(day.r.day, site)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="text-[10px] text-muted-foreground">
                            {site.city}
                          </span>
                          <span className="block text-sm font-medium truncate">
                            {site.tour}
                          </span>
                          <span className="block text-[10px] text-muted-foreground mt-0.5 space-x-2">
                            {visibleLangs.map((lang) => {
                              const rate = site.langRates[lang] || 0;
                              return (
                                <span
                                  key={lang}
                                  className={cn(
                                    rate > 0 ? "text-primary" : "text-muted-foreground"
                                  )}
                                >
                                  {lang}: {rate > 0 ? `${inr(rate)}/pp` : "—"}
                                </span>
                              );
                            })}
                          </span>
                        </span>
                      </label>
                    </td>

                    {/* Language columns (Flat group rate) */}
                    {visibleLangs.map((lang) => {
                      const rate = site.langRates[lang] || 0;
                      const amount = site.isSelected ? rate : 0;
                      return (
                        <td key={lang} className="p-2 text-right tabular-nums">
                          {site.isSelected && amount > 0 ? (
                            <>
                              <div className="font-semibold">
                                {inr(amount)}
                              </div>
                              <div className="text-[9px] text-muted-foreground">
                                Flat rate for group
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Escort column */}
                    <td className="p-2 text-right">
                      {isFirst ? (
                        <Input
                          type="number"
                          min={0}
                          value={getDayEscort(day.r.day) || ""}
                          onChange={(e) => setDayEscort(day.r.day, parseFloat(e.target.value) || 0)}
                          className="h-7 w-24 text-right text-[11px] ml-auto"
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              });
            })}

            {/* Reporting cost row (Includes dedicated Escort Reporting Input) */}
            <tr className="bg-muted/10 border-t border-[#E5E7EB]">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase text-muted-foreground">
                Reporting cost
              </td>
              {visibleLangs.map((lang) => (
                <td key={lang} className="p-2 text-right">
                  <Input
                    type="number"
                    min={0}
                    value={getReporting(lang) || ""}
                    onChange={(e) => setReporting(lang, parseFloat(e.target.value) || 0)}
                    className="h-7 w-24 text-right text-[11px] ml-auto"
                  />
                </td>
              ))}
              {/* Tour Escorted Reporting Box */}
              <td className="p-2 text-right">
                <Input
                  type="number"
                  min={0}
                  value={getEscortReporting() || ""}
                  onChange={(e) => setEscortReporting(parseFloat(e.target.value) || 0)}
                  className="h-7 w-24 text-right text-[11px] ml-auto"
                />
              </td>
            </tr>

            {/* Grand Total row (Per Language + Escort Total) */}
            <tr className="bg-muted/20 font-semibold border-t border-[#E5E7EB]">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase text-muted-foreground">
                Grand Total (Per Language)
              </td>
              {visibleLangs.map((lang) => (
                <td key={lang} className="p-2 text-right tabular-nums">
                  {inr(totalPerLang[lang])}
                </td>
              ))}
              <td className="p-2 text-right tabular-nums">{inr(escortTotal)}</td>
            </tr>

            {/* Per-person row (Individual per language + Escort) */}
            <tr className="bg-[#F0FDF4] border-t border-[#E5E7EB] font-semibold">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase text-muted-foreground">
                Per-person (current pax)
              </td>
              {visibleLangs.map((lang) => {
                const pp = pax > 0 ? (totalPerLang[lang] || 0) / pax : 0;
                return (
                  <td key={lang} className="p-2 text-right tabular-nums">
                    <div className="font-bold text-emerald-700 text-sm">
                      {inr(pp)}
                    </div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide">
                      {lang} / pax
                    </div>
                  </td>
                );
              })}
              <td className="p-2 text-right tabular-nums">
                <div className="font-bold text-emerald-700 text-sm">
                  {inr(pax > 0 ? (escortTotal || 0) / pax : 0)}
                </div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide">
                  Escort / pax
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ===== NEW: Per‑Person Cost Breakdown Sheet (1–10 pax) ===== */}
      <Card className="p-4 border-2 border-primary/20 bg-primary/5">
        <h3 className="text-sm font-semibold text-primary mb-3">
          Per‑Person Cost Breakdown
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-muted/20 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-2">Pax</th>
                {visibleLangs.map((lang) => (
                  <th key={lang} className="text-right p-2 min-w-[80px]">{lang}</th>
                ))}
                <th className="text-right p-2 min-w-[80px]">Escort</th>
                <th className="text-right p-2 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {breakdownData.map((row) => (
                <tr
                  key={row.pax}
                  className="border-t border-muted-foreground/20 hover:bg-muted/10"
                >
                  <td className="p-2 font-medium">{row.pax} pax</td>
                  {visibleLangs.map((lang) => (
                    <td key={lang} className="p-2 text-right tabular-nums">
                      {inr(row.perLang[lang])}
                    </td>
                  ))}
                  <td className="p-2 text-right tabular-nums">
                    {inr(row.escortPerPax)}
                  </td>
                  <td className="p-2 text-right tabular-nums font-bold text-primary">
                    {inr(row.totalPerPax)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          * Guide fees and reporting costs are fixed group rates. Per‑person = total cost / pax.
        </div>
      </Card>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        {visibleLangs.map((lang) => {
          const total = totalPerLang[lang] || 0;
          if (total > 0) {
            return (
              <span
                key={lang}
                className="bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1"
              >
                {lang} total: {inr(total)}
              </span>
            );
          }
          return null;
        })}
        {escortTotal > 0 && (
          <span className="bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1">
            🚶 Escort total: {inr(escortTotal)}
          </span>
        )}
        {visibleLangs.map((lang) => {
          const pp = pax > 0 ? (totalPerLang[lang] || 0) / pax : 0;
          if (pp > 0) {
            return (
              <span
                key={`pp-${lang}`}
                className="bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-3 py-1"
              >
                👤 {lang}/pax: {inr(pp)}
              </span>
            );
          }
          return null;
        })}
        {pax > 0 && escortTotal > 0 && (
          <span className="bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-3 py-1">
            👤 Escort/pax: {inr(escortTotal / pax)}
          </span>
        )}
      </div>

      {/* Remarks */}
      <Card className="p-3">
        <Label className="text-xs">Remarks (optional)</Label>
        <Input
          value={draft.guide_remarks ?? ""}
          onChange={(e) => set({ guide_remarks: e.target.value })}
        />
      </Card>
    </div>
  );
}