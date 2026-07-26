// Step 12 — Guide charges. All configured languages stacked per tour row with radio selection.
import { useEffect, useMemo, useState } from "react";
import React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";
import { useDB, GUIDE_LANGUAGES, guideConfiguredLanguages, guideRateForPax, guidePrimaryLanguage, type GuideLanguage } from "@/lib/mock-store";
import { totalPax } from "@/lib/wizard/calc";
import { uid, dayAllCities, type CityRef, type StepProps } from "../shared";

export function Step13({ draft, set }: StepProps) {
  const d = useDB();
  const pax = totalPax(draft);
  const paxTier = pax <= 5 ? "1-5" : pax <= 14 ? "6-14" : "15+";
  const [langFilter, setLangFilter] = useState<string>(draft.guide_language || "all");
  const cityName = (id: string) => d.cities.find((c) => c.id === id)?.name || "";
  useEffect(() => { set({ guide_language: langFilter }); /* eslint-disable-line */ }, [langFilter]);

  const allGuides = d.guides.filter((g) => g.is_active);

  const availableLanguages = useMemo(() => {
    const s = new Set<GuideLanguage>();
    allGuides.forEach((g) => guideConfiguredLanguages(g).forEach((l) => s.add(l)));
    return GUIDE_LANGUAGES.filter((l) => s.has(l));
  }, [allGuides]);

  const rateForGuideLang = (g: typeof allGuides[number], lang: GuideLanguage) => {
    const r = g.language_rates?.[lang];
    if (r) return pax <= 5 ? r.rate_1_to_5 : pax <= 14 ? r.rate_6_to_14 : r.rate_15_plus;
    return guideRateForPax(g, pax, lang);
  };

  const findLine = (guideId: string, day: number) =>
    draft.guides.find((x) => x.guide_id === guideId && !x.is_escort && (x.from_routing_days ?? []).includes(day));

  const findEscort = (day: number) =>
    draft.guides.find((x) => x.is_escort && (x.from_routing_days ?? []).includes(day));

  // Select/change guide + language for a day. Enforces one guide per city per day.
  const selectGuideLang = (g: typeof allGuides[number], day: number, lang: GuideLanguage) => {
    const gCity = g.city ?? g.destination;
    const cleared = draft.guides.filter((x) => {
      if (x.is_escort) return true;
      if (!(x.from_routing_days ?? []).includes(day)) return true;
      const gm = allGuides.find((y) => y.id === x.guide_id);
      const xCity = gm?.city ?? gm?.destination;
      return xCity !== gCity;
    });
    set({ guides: [...cleared, {
      id: uid(), guide_id: g.id, days: 1, guides: 1,
      rate: rateForGuideLang(g, lang),
      language: lang,
      from_routing_days: [day],
    }] });
  };

  const removeGuide = (guideId: string, day: number) => {
    const existing = findLine(guideId, day);
    if (existing) set({ guides: draft.guides.filter((x) => x.id !== existing.id) });
  };

  const toggleEscort = (day: number) => {
    const existing = findEscort(day);
    if (existing) set({ guides: draft.guides.filter((x) => x.id !== existing.id) });
    else set({ guides: [...draft.guides, { id: uid(), guide_id: "", days: 1, guides: 1, rate: 5000, is_escort: true, from_routing_days: [day] }] });
  };

  const patch = (id: string, p: Partial<typeof draft.guides[number]>) =>
    set({ guides: draft.guides.map((x) => x.id === id ? { ...x, ...p } : x) });

  const guideDayTotal = (day: number) =>
    draft.guides
      .filter((x) => (x.from_routing_days ?? []).includes(day))
      .reduce((s, l) => s + l.rate * l.guides * l.days, 0);

  const grandTotal = draft.guides.reduce((s, l) => s + l.rate * l.guides * l.days, 0)
    + (draft.guide_reporting_cost ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Guide Charges</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filter language:</span>
          <Select value={langFilter} onValueChange={setLangFilter}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All languages</SelectItem>
              {availableLanguages.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-[10px]">Rate tier: {paxTier} pax</Badge>
        </div>
      </div>

      <div className="border border-[#E5E7EB] rounded-lg overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-[#F3F4F6] text-[10px] uppercase text-muted-foreground tracking-wide">
            <tr className="border-b border-[#E5E7EB]">
              <th className="text-left p-2 w-[60px]">Day</th>
              <th className="text-left p-2 w-[160px]">Route</th>
              <th className="text-left p-2">City + Tour</th>
              <th className="text-left p-2 w-[240px]">Language & Rate</th>
              <th className="text-right p-2 w-[110px]">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {draft.routing.map((r, ri) => {
              const fromDefault = ri === 0 ? draft.departure_city : cityName(draft.routing[ri - 1]?.city_id || "");
              const dayCities = dayAllCities(r, d.cities, fromDefault);
              const routeLabel = `${r.from_city ?? fromDefault ?? "—"} → ${cityName(r.city_id) || r.to_city || "—"}`;

              const cityGuides: { city: CityRef; guides: typeof allGuides }[] = dayCities.map((c) => {
                const selectedTitles = (r.tours_selected_by_city?.[c.id])
                  ?? (r.tour_titles_by_city?.[c.id] ? [r.tour_titles_by_city[c.id]] : []);
                return {
                  city: c,
                  guides: selectedTitles.length === 0 ? [] : allGuides.filter((g) => {
                    const gCity = g.city ?? g.destination;
                    if (gCity !== c.name) return false;
                    const gTour = g.tour_program ?? g.name;
                    if (!selectedTitles.includes(gTour)) return false;
                    return true;
                  }),
                };
              });

              const totalGuideRows = cityGuides.reduce((s, x) => s + Math.max(x.guides.length, 1), 0);
              if (totalGuideRows === 0) {
                return (
                  <tr key={ri} className="border-b border-[#E5E7EB]">
                    <td className="p-2 font-semibold">Day {r.day}</td>
                    <td className="p-2 text-muted-foreground text-[11px]">{routeLabel}</td>
                    <td colSpan={3} className="p-2 text-muted-foreground italic">No guides available for selected tours.</td>
                  </tr>
                );
              }

              const rowNodes: React.ReactElement[] = [];
              let firstCell = true;
              const spanRows = totalGuideRows + 1;
              cityGuides.forEach(({ city, guides }) => {
                if (guides.length === 0) {
                  rowNodes.push(
                    <tr key={`${ri}-${city.id}-empty`} className="border-b border-[#E5E7EB]">
                      {firstCell && (
                        <>
                          <td rowSpan={spanRows} className="p-2 font-semibold align-top">Day {r.day}</td>
                          <td rowSpan={spanRows} className="p-2 text-muted-foreground align-top text-[11px]">{routeLabel}</td>
                        </>
                      )}
                      <td colSpan={3} className="p-2 text-muted-foreground italic text-[11px]">{city.name}: no guides</td>
                    </tr>,
                  );
                  firstCell = false;
                  return;
                }
                guides.forEach((g, gi) => {
                  const line = findLine(g.id, r.day);
                  const on = !!line;
                  const configuredLangs = guideConfiguredLanguages(g);
                  const langsToShow = configuredLangs.length > 0
                    ? configuredLangs
                    : (guidePrimaryLanguage(g) ? [guidePrimaryLanguage(g)!] : (["English"] as GuideLanguage[]));
                  const visibleLangs = langFilter === "all"
                    ? langsToShow
                    : langsToShow.filter((l) => l === langFilter);
                  const selectedLang = (line?.language as GuideLanguage | undefined) ?? null;

                  rowNodes.push(
                    <tr key={`${ri}-${g.id}`} className={cn("border-b border-[#E5E7EB] align-top", on ? "bg-accent/5" : "bg-white")}>
                      {firstCell && (
                        <>
                          <td rowSpan={spanRows} className="p-2 font-semibold align-top">Day {r.day}</td>
                          <td rowSpan={spanRows} className="p-2 text-muted-foreground align-top text-[11px]">{routeLabel}</td>
                        </>
                      )}
                      <td className="p-2">
                        {gi === 0 && <div className="text-[10px] uppercase text-muted-foreground mb-0.5">{city.name}</div>}
                        <div className="text-sm font-medium">{g.tour_program ?? g.name}</div>
                        {on && (
                          <button type="button"
                            className="text-[10px] text-destructive mt-1 hover:underline"
                            onClick={() => removeGuide(g.id, r.day)}>
                            Remove
                          </button>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="space-y-1">
                          {visibleLangs.length === 0 ? (
                            <div className="text-[11px] text-muted-foreground italic">No language configured.</div>
                          ) : visibleLangs.map((lang) => {
                            const rate = rateForGuideLang(g, lang);
                            const isSel = on && selectedLang === lang;
                            return (
                              <label key={lang}
                                className={cn(
                                  "flex items-center gap-2 rounded px-2 py-1 cursor-pointer text-[11px]",
                                  isSel ? "bg-primary/10 border border-primary/40 font-semibold" : "hover:bg-muted/40",
                                )}>
                                <input type="radio" name={`d${r.day}-${g.id}`} checked={isSel}
                                  onChange={() => selectGuideLang(g, r.day, lang)} />
                                <span className="flex-1">{lang}</span>
                                <span className="tabular-nums">₹{rate.toLocaleString("en-IN")}</span>
                              </label>
                            );
                          })}
                        </div>
                      </td>
                      <td className="p-2 text-right tabular-nums font-medium">
                        {on && line ? inr(line.rate * line.days * line.guides) : "—"}
                      </td>
                    </tr>,
                  );
                  firstCell = false;
                });
              });
              rowNodes.push(
                <tr key={`${ri}-sub`} className="bg-muted/20 border-b border-[#E5E7EB]">
                  <td colSpan={3} className="p-2 text-right text-[10px] uppercase text-muted-foreground">Day {r.day} Subtotal</td>
                  <td className="p-2 text-right tabular-nums font-semibold">{inr(guideDayTotal(r.day))}</td>
                </tr>,
              );
              return <React.Fragment key={ri}>{rowNodes}</React.Fragment>;
            })}
          </tbody>
        </table>
      </div>

      {/* Tour Escort — separate section at bottom */}
      <Card className="p-4 border-dashed">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold">Tour Escort (optional)</h3>
            <p className="text-[11px] text-muted-foreground">Add an escort for any day of the tour. Default rate ₹5,000/day.</p>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {draft.guides.filter((x) => x.is_escort).length} day{draft.guides.filter((x) => x.is_escort).length === 1 ? "" : "s"} selected
          </Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {draft.routing.map((r) => {
            const escort = findEscort(r.day);
            const on = !!escort;
            return (
              <div key={r.day} className={cn("p-2 border rounded-md flex items-center gap-2", on && "border-accent bg-accent/5")}>
                <Checkbox checked={on} onCheckedChange={() => toggleEscort(r.day)} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">Day {r.day}</div>
                  {on && (
                    <Input type="number" min={0} className="h-6 w-full text-[11px] mt-1" value={escort!.rate}
                      onChange={(e) => patch(escort!.id, { rate: parseFloat(e.target.value) || 0 })} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Reporting Cost (₹)</Label>
          <Input type="number" min={0} value={draft.guide_reporting_cost ?? 0}
            onChange={(e) => set({ guide_reporting_cost: parseFloat(e.target.value) || 0 })} />
          <div className="text-[10px] text-muted-foreground mt-1">Cost for guide travel/reporting from a different location.</div>
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Remarks (optional)</Label>
          <Input value={draft.guide_remarks ?? ""} onChange={(e) => set({ guide_remarks: e.target.value })} />
        </div>
      </Card>

      <div className="text-right font-semibold">
        Guide Total: {inr(grandTotal)}
        {draft.guide_reporting_cost ? <span className="text-xs text-muted-foreground ml-2">(incl. reporting ₹{draft.guide_reporting_cost.toLocaleString("en-IN")})</span> : null}
      </div>

    </div>
  );
}




// ============================================================
// STEP 14 — Miscellaneous
