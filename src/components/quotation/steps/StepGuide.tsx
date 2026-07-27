// Step 12 — Guide charges (language‑based rates table with City+Tour column
// and per-language reporting cost inputs).
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/format";
import { useDB, GUIDE_LANGUAGES, guideConfiguredLanguages, guideRateForPax, guidePrimaryLanguage, type GuideLanguage } from "@/lib/mock-store";
import { totalPax } from "@/lib/wizard/calc";
import { uid, dayAllCities, type CityRef, type StepProps } from "../shared";

// Languages to display as columns (fixed as per user request)
const DISPLAY_LANGUAGES: GuideLanguage[] = ["Hindi", "English", "Language"];

const REPORTING_KEY: Record<GuideLanguage, "guide_reporting_cost_hindi" | "guide_reporting_cost_english" | "guide_reporting_cost_language"> = {
  Hindi: "guide_reporting_cost_hindi",
  English: "guide_reporting_cost_english",
  Language: "guide_reporting_cost_language",
} as unknown as Record<GuideLanguage, "guide_reporting_cost_hindi" | "guide_reporting_cost_english" | "guide_reporting_cost_language">;

export function Step13({ draft, set }: StepProps) {
  const d = useDB();
  const pax = totalPax(draft);
  const paxTier = pax <= 5 ? "1-5" : pax <= 14 ? "6-14" : "15+";
  const [langFilter, setLangFilter] = useState<GuideLanguage | "all">((draft.guide_language as GuideLanguage | "all") || "all");
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

  // Auto‑select guides for each day based on selected tours (unchanged behavior)
  useEffect(() => {
    if (!draft.routing.length) return;
    let changed = false;
    const newGuides = [...draft.guides];

    draft.routing.forEach((r) => {
      const day = r.day;
      const existingForDay = newGuides.filter((x) => !x.is_escort && (x.from_routing_days ?? []).includes(day));
      if (existingForDay.length > 0) return;

      const fromDefault = draft.routing.indexOf(r) === 0 ? draft.departure_city : cityName(draft.routing[draft.routing.indexOf(r) - 1]?.city_id || "");
      const dayCities = dayAllCities(r, d.cities, fromDefault);
      const cityGuides: { city: CityRef; guides: typeof allGuides }[] = dayCities.map((c) => {
        const selectedTitles = (r.tours_selected_by_city?.[c.id])
          ?? (r.tour_titles_by_city?.[c.id] ? [r.tour_titles_by_city[c.id]] : []);
        if (selectedTitles.length === 0) return { city: c, guides: [] };
        const guides = allGuides.filter((g) => {
          const gCity = g.city ?? g.destination;
          if (gCity !== c.name) return false;
          const gTour = g.tour_program ?? g.name;
          return selectedTitles.includes(gTour);
        });
        return { city: c, guides };
      });

      cityGuides.forEach(({ city, guides }) => {
        if (guides.length === 0) return;
        const g = guides[0];
        const primaryLang = guidePrimaryLanguage(g) || "English";
        const rate = rateForGuideLangPax(g, primaryLang, pax);
        const existingCity = newGuides.findIndex((x) => {
          if (x.is_escort) return false;
          const gm = allGuides.find((y) => y.id === x.guide_id);
          const xCity = gm?.city ?? gm?.destination;
          return xCity === city.name && (x.from_routing_days ?? []).includes(day);
        });
        if (existingCity !== -1) newGuides.splice(existingCity, 1);
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

  // Guide lines assigned to a day (excluding escort)
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

  const totalForLang = (lang: GuideLanguage) => {
    let sum = 0;
    draft.routing.forEach((r) => { sum += dayTotalForLang(r.day, lang); });
    const rep = (draft[REPORTING_KEY[lang]] as number | undefined) ?? 0;
    return sum + rep;
  };

  const setReporting = (lang: GuideLanguage, value: number) => {
    set({ [REPORTING_KEY[lang]]: value } as Partial<typeof draft>);
  };
  const getReporting = (lang: GuideLanguage): number =>
    (draft[REPORTING_KEY[lang]] as number | undefined) ?? 0;

  // Resolve City + Tour cell content for a day
  const cityTourFor = (day: number) => {
    const lines = dayLines(day);
    if (lines.length === 0) return null;
    return lines.map((line) => {
      const g = allGuides.find((x) => x.id === line.guide_id);
      if (!g) return null;
      const city = g.city ?? g.destination ?? "—";
      const tour = g.tour_program ?? g.name ?? "—";
      return { id: line.id, city, tour };
    }).filter(Boolean) as { id: string; city: string; tour: string }[];
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Guide Charges</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filter language:</span>
          <Select value={langFilter} onValueChange={(v) => setLangFilter(v as GuideLanguage | "all")}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All languages</SelectItem>
              {availableLanguages.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
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
              {DISPLAY_LANGUAGES.map((lang) => (
                <th key={lang} className="text-right p-2 w-[110px]">{lang}</th>
              ))}
              <th className="text-right p-2 w-[120px]">Tour Escorted (₹)</th>
            </tr>
          </thead>
          <tbody>
            {draft.routing.map((r, ri) => {
              const fromDefault = ri === 0 ? draft.departure_city : cityName(draft.routing[ri - 1]?.city_id || "");
              const routeLabel = `${r.from_city ?? fromDefault ?? "—"} → ${cityName(r.city_id) || r.to_city || "—"}`;
              const cityTours = cityTourFor(r.day);

              return (
                <tr key={ri} className="border-b border-[#E5E7EB] align-top">
                  <td className="p-2 font-semibold align-middle">Day {r.day}</td>
                  <td className="p-2 text-muted-foreground text-[11px] align-middle">{routeLabel}</td>
                  <td className="p-2">
                    {cityTours && cityTours.length > 0 ? (
                      <div className="space-y-1">
                        {cityTours.map((ct) => (
                          <div key={ct.id}>
                            <div className="text-[10px] uppercase text-muted-foreground">{ct.city}</div>
                            <div className="text-sm font-medium truncate">{ct.tour}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">No guide/tour selected.</span>
                    )}
                  </td>
                  {DISPLAY_LANGUAGES.map((lang) => {
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
                      value={getDayEscort(r.day)}
                      onChange={(e) => setDayEscort(r.day, parseFloat(e.target.value) || 0)}
                      className="h-7 w-24 text-right text-[11px] ml-auto"
                    />
                  </td>
                </tr>
              );
            })}

            {/* Per-language subtotal (guide charges only) */}
            <tr className="bg-muted/10">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase text-muted-foreground">
                Guide charges subtotal
              </td>
              {DISPLAY_LANGUAGES.map((lang) => {
                let sum = 0;
                draft.routing.forEach((r) => { sum += dayTotalForLang(r.day, lang); });
                return (
                  <td key={lang} className="p-2 text-right tabular-nums">{inr(sum)}</td>
                );
              })}
              <td className="p-2 text-right tabular-nums">—</td>
            </tr>

            {/* Reporting cost row — one input per language column */}
            <tr className="bg-muted/10 border-t border-[#E5E7EB]">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase text-muted-foreground">
                Reporting cost (₹)
              </td>
              {DISPLAY_LANGUAGES.map((lang) => (
                <td key={lang} className="p-2 text-right">
                  <Input
                    type="number"
                    min={0}
                    value={getReporting(lang)}
                    onChange={(e) => setReporting(lang, parseFloat(e.target.value) || 0)}
                    className="h-7 w-24 text-right text-[11px] ml-auto"
                  />
                </td>
              ))}
              <td className="p-2 text-right tabular-nums">—</td>
            </tr>

            {/* Totals per language (charges + reporting) */}
            <tr className="bg-muted/20 font-semibold">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase text-muted-foreground">
                Totals per language (all days + reporting)
              </td>
              {DISPLAY_LANGUAGES.map((lang) => (
                <td key={lang} className="p-2 text-right tabular-nums">{inr(totalForLang(lang))}</td>
              ))}
              <td className="p-2 text-right tabular-nums">—</td>
            </tr>
          </tbody>
        </table>
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
