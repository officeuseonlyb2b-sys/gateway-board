// Step 12 — Guide charges (language-based rates table with City+Tour column
// and per-language reporting cost input row).
import { useEffect, useMemo, useState } from "react";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    allGuides.find((g) => (g.city ?? g.destination ?? "") === city && (g.tour_program ?? g.name ?? "") === tour);

  // Auto-sync selected guides for each day based on selected tours.
  // If a city+tour is manually unchecked, it stays disabled in guide_tour_disabled_by_day
  // until the user checks it again.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.routing, allGuides, d.cities, pax]);

  const setDayEscort = (day: number, value: number) => {
    const current = draft.guide_day_escort || {};
    set({ guide_day_escort: { ...current, [day]: value } });
  };

  const getDayEscort = (day: number) => (draft.guide_day_escort?.[day] ?? 0);

  const escortTotal = draft.routing.reduce((sum, r) => sum + getDayEscort(r.day), 0);

  const dayLines = (day: number) =>
    draft.guides.filter((x) => !x.is_escort && (x.from_routing_days ?? []).includes(day));

  const dayTotalForLang = (day: number, lang: GuideLanguage) => {
    let total = 0;
    dayLines(day).forEach((line) => {
      const g = allGuides.find((x) => x.id === line.guide_id);
      if (!g) return;
      const rate = rateForGuideLangPax(g, lang, pax);
      total += rate * line.guides * line.days;
    });
    return total;
  };

  const getReporting = (lang: GuideLanguage): number =>
    (draft[reportingKey(lang)] as number | undefined) ?? 0;

  const setReporting = (lang: GuideLanguage, value: number) => {
    set({ [reportingKey(lang)]: value } as Partial<typeof draft>);
  };

  const totalForLang = (lang: GuideLanguage) => {
    let sum = 0;
    draft.routing.forEach((r) => {
      sum += dayTotalForLang(r.day, lang);
    });
    return sum + getReporting(lang);
  };

  const isTourSelected = (day: number, city: string, tour: string) => {
    const key = makeTourKey(city, tour);
    const disabled = getDisabledKeys(day).has(key);
    const exists = dayLines(day).some((line) => {
      const g = allGuides.find((x) => x.id === line.guide_id);
      return (line.from_routing_days ?? []).includes(day)
        && (g?.city ?? g?.destination ?? "") === city
        && (g?.tour_program ?? g?.name ?? "") === tour;
    });
    return exists && !disabled;
  };

  const toggleTourSelection = (day: number, city: string, tour: string, desiredChecked?: boolean) => {
    const key = makeTourKey(city, tour);
    const selected = isTourSelected(day, city, tour);
    const shouldSelect = desiredChecked ?? !selected;
    const guide = findGuideByCityTour(city, tour);

    if (!shouldSelect) {
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
          return !((g?.city ?? g?.destination ?? "") === city && (g?.tour_program ?? g?.name ?? "") === tour);
        }),
      } as Partial<typeof draft>);
      return;
    }

    const currentDisabled = getDisabledMap();
    const disabledForDay = new Set(currentDisabled[day] || []);
    disabledForDay.delete(key);
    const nextDisabled = { ...currentDisabled };
    const values = Array.from(disabledForDay);
    if (values.length > 0) nextDisabled[day] = values;
    else delete nextDisabled[day];

    if (!guide) return;

    const primaryLang = guidePrimaryLanguage(guide) || "English";
    const rate = rateForGuideLangPax(guide, primaryLang, pax);

    const existingIndex = draft.guides.findIndex((line) => {
      if (line.is_escort) return false;
      if (!(line.from_routing_days ?? []).includes(day)) return false;
      const g = allGuides.find((x) => x.id === line.guide_id);
      return (g?.city ?? g?.destination ?? "") === city && (g?.tour_program ?? g?.name ?? "") === tour;
    });

    if (existingIndex !== -1) {
      set({ guide_tour_disabled_by_day: nextDisabled } as Partial<typeof draft>);
      return;
    }

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
  };

  // Resolve City + Tour options for a day.
  const cityTourFor = (day: number, r: typeof draft.routing[number]) => {
    const fromDefault = draft.routing.indexOf(r) === 0
      ? draft.departure_city
      : cityName(draft.routing[draft.routing.indexOf(r) - 1]?.city_id || "");
    const dayCities = dayAllCities(r, d.cities, fromDefault);

    const options: Array<{ id: string; city: string; tour: string; guideExists: boolean; selected: boolean }> = [];

    dayCities.forEach((c) => {
      const selectedTitles =
        r.tours_selected_by_city?.[c.id]
        ?? (r.tour_titles_by_city?.[c.id] ? [r.tour_titles_by_city[c.id]] : []);
      selectedTitles.forEach((tourTitle) => {
        const guide = findGuideByCityTour(c.name, tourTitle);
        options.push({
          id: makeTourKey(c.name, tourTitle),
          city: c.name,
          tour: tourTitle,
          guideExists: !!guide,
          selected: isTourSelected(day, c.name, tourTitle),
        });
      });
    });

    return options;
  };

  const visibleLanguages: GuideLanguage[] =
    langFilter === "all" ? DISPLAY_LANGUAGES : [langFilter as GuideLanguage];

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
              <th className="text-left p-2">City + Tour</th>
              {visibleLanguages.map((lang) => (
                <th key={lang} className="text-right p-2 w-[110px]">{lang}</th>
              ))}
              <th className="text-right p-2 w-[120px] whitespace-nowrap">Tour Escorted (₹)</th>
            </tr>
          </thead>

          <tbody>
            {draft.routing.map((r, ri) => {
              const fromDefault = ri === 0 ? draft.departure_city : cityName(draft.routing[ri - 1]?.city_id || "");
              const routeLabel = `${r.from_city ?? fromDefault ?? "—"} → ${cityName(r.city_id) || r.to_city || "—"}`;
              const cityTours = cityTourFor(r.day, r);

              return (
                <tr key={ri} className="border-b border-[#E5E7EB] align-top">
                  <td className="p-2 font-semibold align-middle">Day {r.day}</td>
                  <td className="p-2 text-muted-foreground text-[11px] align-middle">{routeLabel}</td>
                  <td className="p-2">
                    {cityTours.length > 0 ? (
                      <div className="space-y-2">
                        {cityTours.map((ct) => (
                          <label key={ct.id} className="flex items-start gap-2 rounded-md px-1 py-0.5 cursor-pointer">
                            <Checkbox
                              checked={ct.selected}
                              onCheckedChange={(checked) => toggleTourSelection(r.day, ct.city, ct.tour, checked === true)}
                              disabled={!ct.guideExists && !ct.selected}
                              className="mt-1"
                            />
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase text-muted-foreground">{ct.city}</div>
                              <div className="text-sm font-medium truncate">{ct.tour}</div>
                              {!ct.guideExists && (
                                <div className="text-[10px] text-muted-foreground italic">No matching guide found.</div>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">No guide/tour selected.</span>
                    )}
                  </td>

                  {visibleLanguages.map((lang) => {
                    const total = dayTotalForLang(r.day, lang);
                    return (
                      <td key={lang} className="p-2 text-right tabular-nums">
                        {total > 0 ? inr(total) : "—"}
                      </td>
                    );
                  })}

                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min={0}
                      value={getDayEscort(r.day) || ""}
                      onChange={(e) => setDayEscort(r.day, parseFloat(e.target.value) || 0)}
                      className="h-7 w-24 text-right text-[11px] ml-auto"
                    />
                  </td>
                </tr>
              );
            })}

            <tr className="bg-muted/10">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase text-muted-foreground">
                Guide charges subtotal
              </td>
              {visibleLanguages.map((lang) => {
                let sum = 0;
                draft.routing.forEach((r) => {
                  sum += dayTotalForLang(r.day, lang);
                });
                return (
                  <td key={lang} className="p-2 text-right tabular-nums">{inr(sum)}</td>
                );
              })}
              <td className="p-2 text-right tabular-nums">—</td>
            </tr>

            <tr className="bg-muted/10 border-t border-[#E5E7EB]">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase text-muted-foreground">
                Tour escorted total (₹)
              </td>
              {visibleLanguages.map((lang) => (
                <td key={lang} className="p-2 text-right tabular-nums">—</td>
              ))}
              <td className="p-2 text-right tabular-nums font-semibold">{inr(escortTotal)}</td>
            </tr>

            <tr className="bg-muted/10 border-t border-[#E5E7EB]">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase text-muted-foreground">
                Reporting cost
              </td>
              {visibleLanguages.map((lang) => (
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
              <td className="p-2 text-right tabular-nums">—</td>
            </tr>

            <tr className="bg-muted/20 font-semibold">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase text-muted-foreground">
                Totals per language (all days + reporting)
              </td>
              {visibleLanguages.map((lang) => (
                <td key={lang} className="p-2 text-right tabular-nums">{inr(totalForLang(lang))}</td>
              ))}
              <td className="p-2 text-right tabular-nums">{inr(escortTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

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
