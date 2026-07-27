// Step 12 — Guide charges (language‑based rates table)
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";
import { useDB, GUIDE_LANGUAGES, guideConfiguredLanguages, guideRateForPax, guidePrimaryLanguage, type GuideLanguage } from "@/lib/mock-store";
import { totalPax } from "@/lib/wizard/calc";
import { uid, dayAllCities, type CityRef, type StepProps } from "../shared";

// Languages to display as columns (fixed as per user request)
const DISPLAY_LANGUAGES: GuideLanguage[] = ["Hindi", "English", "Language"];

export function Step13({ draft, set }: StepProps) {
  const d = useDB();
  const pax = totalPax(draft);
  const paxTier = pax <= 5 ? "1-5" : pax <= 14 ? "6-14" : "15+";
  const [langFilter, setLangFilter] = useState<GuideLanguage | "all">(draft.guide_language || "all");
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

  // Helper to get rate for a guide+language at a given pax count
  const rateForGuideLangPax = (g: typeof allGuides[number], lang: GuideLanguage, p: number) => {
    const r = g.language_rates?.[lang];
    if (r) return p <= 5 ? r.rate_1_to_5 : p <= 14 ? r.rate_6_to_14 : r.rate_15_plus;
    return guideRateForPax(g, p, lang);
  };

  // Find existing guide lines for a day
  const findLines = (day: number) =>
    draft.guides.filter((x) => !x.is_escort && (x.from_routing_days ?? []).includes(day));

  // Select/deselect a guide for a day (now we just store the guide, language is implicit)
  const selectGuide = (g: typeof allGuides[number], day: number) => {
    const gCity = g.city ?? g.destination;
    const existing = draft.guides.find(
      (x) => x.guide_id === g.id && !x.is_escort && (x.from_routing_days ?? []).includes(day)
    );
    if (existing) {
      // Deselect
      set({ guides: draft.guides.filter((x) => x.id !== existing.id) });
      return;
    }
    // Remove any other guide for the same city on this day
    const cleared = draft.guides.filter((x) => {
      if (x.is_escort) return true;
      if (!(x.from_routing_days ?? []).includes(day)) return true;
      const gm = allGuides.find((y) => y.id === x.guide_id);
      const xCity = gm?.city ?? gm?.destination;
      return xCity !== gCity;
    });
    // Store with a default language (English) – the stored language is not used for display anymore
    const primaryLang = guidePrimaryLanguage(g) || "English";
    const rate = rateForGuideLangPax(g, primaryLang, pax);
    set({
      guides: [
        ...cleared,
        {
          id: uid(),
          guide_id: g.id,
          days: 1,
          guides: 1,
          rate,
          language: primaryLang, // kept for backward compatibility
          from_routing_days: [day],
        },
      ],
    });
  };

  // Auto‑select guides for each day based on selected tours
  useEffect(() => {
    if (!draft.routing.length) return;
    let changed = false;
    const newGuides = [...draft.guides];

    draft.routing.forEach((r) => {
      const day = r.day;
      const existingForDay = newGuides.filter((x) => !x.is_escort && (x.from_routing_days ?? []).includes(day));
      // If we already have guides for this day, skip
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
        // Pick the first guide for this city
        const g = guides[0];
        const primaryLang = guidePrimaryLanguage(g) || "English";
        const rate = rateForGuideLangPax(g, primaryLang, pax);
        // Remove any existing guide for the same city (should be none, but safety)
        const existingCity = newGuides.findIndex(
          (x) => {
            if (x.is_escort) return false;
            const gm = allGuides.find((y) => y.id === x.guide_id);
            const xCity = gm?.city ?? gm?.destination;
            return xCity === city.name && (x.from_routing_days ?? []).includes(day);
          }
        );
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

    if (changed) {
      set({ guides: newGuides });
    }
  }, [draft.routing, allGuides, d.cities, cityName, pax]);

  // Update daily escort fee
  const setDayEscort = (day: number, value: number) => {
    const current = draft.guide_day_escort || {};
    set({ guide_day_escort: { ...current, [day]: value } });
  };

  const getDayEscort = (day: number) => (draft.guide_day_escort?.[day] ?? 0);

  // Compute guide total for a day for a given language (using current pax)
  const dayTotalForLang = (day: number, lang: GuideLanguage) => {
    const lines = draft.guides.filter(
      (x) => !x.is_escort && (x.from_routing_days ?? []).includes(day)
    );
    if (lines.length === 0) return 0;
    let total = 0;
    lines.forEach((line) => {
      const g = allGuides.find((x) => x.id === line.guide_id);
      if (!g) return;
      const rate = rateForGuideLangPax(g, lang, pax);
      total += rate * line.guides * line.days;
    });
    return total;
  };

  // Grand total (using current pax for guide rates + daily escorts + reporting)
  const guideGrandTotal = () => {
    let sum = 0;
    draft.routing.forEach((r) => {
      // Sum of all languages? No, we need to pick one language per day? Actually the total should be the sum of selected guide charges.
      // But we don't have a selected language per day anymore. In the old UI, the total was based on the selected language radio.
      // Now we display all languages, but the total should be the sum of guide rates for all selected guides (maybe we assume each guide has a single rate, but we have three columns).
      // The user might want the total to be the sum of the rates for the primary language? Or they might want to select a language per day?
      // The requirement: "1-5 Pax, 6-14 Pax, 15+ Pax ke jagha Hindi, English, Language aa jaega" – they just want to replace the columns.
      // The grand total should be based on the actual guide charges. In the previous version, they had a subtotal that summed the selected guide's rate (which was based on the selected language).
      // Now we show three language rates, but the actual cost is probably based on one language (the one they choose). Since they haven't specified, we'll keep the total as the sum of the rates for the primary language (or English) of each selected guide.
      // To be safe, we'll compute the total as the sum of rates for "English" (or first available) for each guide.
      // But we can also let the user select a language per day via a dropdown later. For now, we'll use "English" as the default for total.
      // The user can adjust via the filter? Not clear.
      // We'll sum using the first language in DISPLAY_LANGUAGES (Hindi) or we can sum all languages? That would be wrong.
      // Given the old UI had radio buttons to select a language, the total was based on that selection.
      // Now we don't have that, so we need to decide a default. Let's use "Hindi" as the default for total (since it's the first).
      // We'll also add a note that the total is based on Hindi rates.
      // Alternatively, we can make the total the sum of the rates for each guide's primary language.
      // For simplicity, we'll use the primary language of each guide.
      const lines = draft.guides.filter((x) => !x.is_escort && (x.from_routing_days ?? []).includes(r.day));
      lines.forEach((line) => {
        const g = allGuides.find((x) => x.id === line.guide_id);
        if (!g) return;
        const primary = guidePrimaryLanguage(g) || "English";
        const rate = rateForGuideLangPax(g, primary, pax);
        sum += rate * line.guides * line.days;
      });
      sum += getDayEscort(r.day);
    });
    sum += draft.guide_reporting_cost ?? 0;
    return sum;
  };

  // Compute totals per language across all days
  const totalForLang = (lang: GuideLanguage) => {
    let sum = 0;
    draft.routing.forEach((r) => {
      sum += dayTotalForLang(r.day, lang);
    });
    return sum;
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
              <th className="text-left p-2 w-[200px]">Route</th>
              {DISPLAY_LANGUAGES.map((lang) => (
                <th key={lang} className="text-right p-2 w-[100px]">{lang}</th>
              ))}
              <th className="text-right p-2 w-[120px]">Tour Escorted (₹)</th>
            </tr>
          </thead>
          <tbody>
            {draft.routing.map((r, ri) => {
              const fromDefault = ri === 0 ? draft.departure_city : cityName(draft.routing[ri - 1]?.city_id || "");
              const routeLabel = `${r.from_city ?? fromDefault ?? "—"} → ${cityName(r.city_id) || r.to_city || "—"}`;

              return (
                <tr key={ri} className="border-b border-[#E5E7EB] align-top">
                  <td className="p-2 font-semibold align-middle">Day {r.day}</td>
                  <td className="p-2 text-muted-foreground text-[11px] align-middle">{routeLabel}</td>
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
            <tr className="bg-muted/20 font-semibold">
              <td colSpan={2} className="p-2 text-right text-[10px] uppercase text-muted-foreground">
                Totals per language (all days)
              </td>
              {DISPLAY_LANGUAGES.map((lang) => (
                <td key={lang} className="p-2 text-right tabular-nums">{inr(totalForLang(lang))}</td>
              ))}
              <td className="p-2 text-right tabular-nums">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Reporting cost & remarks */}
      <Card className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Reporting Cost (₹)</Label>
          <Input
            type="number"
            min={0}
            value={draft.guide_reporting_cost ?? 0}
            onChange={(e) => set({ guide_reporting_cost: parseFloat(e.target.value) || 0 })}
          />
          <div className="text-[10px] text-muted-foreground mt-1">
            Cost for guide travel/reporting from a different location.
          </div>
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Remarks (optional)</Label>
          <Input
            value={draft.guide_remarks ?? ""}
            onChange={(e) => set({ guide_remarks: e.target.value })}
          />
        </div>
      </Card>

      {/* Grand total */}
      
    </div>
  );
}