// Extracted verbatim from src/routes/_authenticated/costing.tsx (Step 11 UI — Entrances).
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import { totalPax } from "@/lib/wizard/calc";
import { uid, dayAllCities, type CityRef, type StepProps } from "../shared";

export function Step12({ draft, set }: StepProps) {
  const d = useDB();
  const [travellerFilter, setTravellerFilter] = useState<"all" | "indian" | "foreign" | "student">("all");
  const totalPaxCount = totalPax(draft);
  const cityName = (id: string) => d.cities.find((c) => c.id === id)?.name || "";

  const findLine = (siteId: string, day: number) =>
    draft.entrances.find((x) => x.site_id === siteId && (x.from_routing_days ?? []).includes(day));

  // Ensure line exists / removed on toggle. Prices always sourced from master module.
  const toggle = (s: typeof d.entrance_sites[number], day: number) => {
    const existing = findLine(s.id, day);
    if (existing) {
      set({ entrances: draft.entrances.filter((x) => x.id !== existing.id) });
    } else {
      set({ entrances: [...draft.entrances, {
        id: uid(), site_id: s.id,
        indian_pax: totalPaxCount, indian_rate: s.indian_rate,
        foreign_pax: 0, foreign_rate: s.foreigner_rate,
        student_pax: 0, student_rate: s.student_rate ?? 0,
        from_routing_days: [day],
      }] });
    }
  };

  // Keep line rates + Indian pax in sync with master + Step 3 (auto — no editing here).
  useEffect(() => {
    let dirty = false;
    const next = draft.entrances.map((l) => {
      if (!l.site_id) return l;
      const s = d.entrance_sites.find((x) => x.id === l.site_id);
      if (!s) return l;
      const patched = { ...l };
      if (patched.indian_rate !== s.indian_rate) { patched.indian_rate = s.indian_rate; dirty = true; }
      if (patched.foreign_rate !== s.foreigner_rate) { patched.foreign_rate = s.foreigner_rate; dirty = true; }
      const sr = s.student_rate ?? 0;
      if ((patched.student_rate ?? 0) !== sr) { patched.student_rate = sr; dirty = true; }
      if (patched.indian_pax !== totalPaxCount) { patched.indian_pax = totalPaxCount; dirty = true; }
      return patched;
    });
    if (dirty) set({ entrances: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPaxCount, d.entrance_sites]);

  const lineTotals = (l: typeof draft.entrances[number]) => ({
    indian: l.indian_pax * l.indian_rate,
    foreign: l.foreign_pax * l.foreign_rate,
    student: (l.student_pax ?? 0) * (l.student_rate ?? 0),
  });
  const sumLine = (l: typeof draft.entrances[number]) => {
    const t = lineTotals(l);
    return t.indian + t.foreign + t.student;
  };
  const grandIndian = draft.entrances.reduce((s, l) => s + lineTotals(l).indian, 0);
  const grandForeign = draft.entrances.reduce((s, l) => s + lineTotals(l).foreign, 0);
  const grandStudent = draft.entrances.reduce((s, l) => s + lineTotals(l).student, 0);
  const grandTotal = grandIndian + grandForeign + grandStudent;

  const showI = travellerFilter === "all" || travellerFilter === "indian";
  const showF = travellerFilter === "all" || travellerFilter === "foreign";
  const showS = travellerFilter === "all" || travellerFilter === "student";
  const colHilite = (col: "indian" | "foreign" | "student") =>
    travellerFilter !== "all" && travellerFilter === col ? "bg-primary/5 font-semibold" : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Entrance Fees</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Traveller:</span>
          <div className="flex gap-1">
            {(["all", "indian", "foreign", "student"] as const).map((t) => (
              <button key={t} type="button"
                onClick={() => setTravellerFilter(t)}
                className={cn(
                  "text-[11px] px-2 py-1 rounded border transition-colors capitalize",
                  travellerFilter === t ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                )}>
                {t === "foreign" ? "Foreigner" : t}
              </button>
            ))}
          </div>
          <Badge variant="secondary" className="text-[10px]">Pax: {totalPaxCount} Indian (auto)</Badge>
        </div>
      </div>

      <div className="border border-[#E5E7EB] rounded-lg overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-[#F3F4F6] text-[10px] uppercase text-muted-foreground tracking-wide">
            <tr className="border-b border-[#E5E7EB]">
              <th className="text-left p-2 w-[60px]">Day</th>
              <th className="text-left p-2 w-[160px]">Route</th>
              <th className="text-left p-2">City + Tour</th>
              {showI && <th className={cn("text-right p-2 w-[140px]", colHilite("indian"))}>Indian Total</th>}
              {showF && <th className={cn("text-right p-2 w-[140px]", colHilite("foreign"))}>Foreigner Total</th>}
              {showS && <th className={cn("text-right p-2 w-[140px]", colHilite("student"))}>Student Total</th>}
              <th className="text-right p-2 w-[110px]">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {draft.routing.map((r, ri) => {
              const fromDefault = ri === 0 ? draft.departure_city : cityName(draft.routing[ri - 1]?.city_id || "");
              const dayCities = dayAllCities(r, d.cities, fromDefault);
              const routeLabel = `${r.from_city ?? fromDefault ?? "—"} → ${cityName(r.city_id) || r.to_city || "—"}`;
              const rows: { city: CityRef; site: typeof d.entrance_sites[number] }[] = [];
              dayCities.forEach((c) => {
                const selectedTitles = (r.tours_selected_by_city?.[c.id])
                  ?? (r.tour_titles_by_city?.[c.id] ? [r.tour_titles_by_city[c.id]] : []);
                if (selectedTitles.length === 0) return;
                d.entrance_sites
                  .filter((s) =>
                    s.is_active
                    && d.entrance_cities.some((ec) => ec.name === c.name && ec.id === s.city_id)
                    && selectedTitles.includes(s.site_name)
                  )
                  .forEach((s) => rows.push({ city: c, site: s }));
              });
              if (rows.length === 0) {
                return (
                  <tr key={ri} className="border-b border-[#E5E7EB]">
                    <td className="p-2 font-semibold">Day {r.day}</td>
                    <td className="p-2 text-muted-foreground">{routeLabel}</td>
                    <td colSpan={5} className="p-2 text-muted-foreground italic">No entrance sites for this day's cities.</td>
                  </tr>
                );
              }
              let daySubtotal = 0;
              const rowNodes = rows.map((row, i) => {
                const line = findLine(row.site.id, r.day);
                const on = !!line;
                const t = line ? lineTotals(line) : { indian: 0, foreign: 0, student: 0 };
                const sub = on ? t.indian + t.foreign + t.student : 0;
                daySubtotal += sub;
                const missing = row.site.indian_rate === 0 && row.site.foreigner_rate === 0;
                return (
                  <tr key={`${ri}-${row.site.id}`} className="border-b border-[#E5E7EB] bg-white">
                    {i === 0 ? (
                      <>
                        <td rowSpan={rows.length} className="p-2 font-semibold align-top">Day {r.day}</td>
                        <td rowSpan={rows.length} className="p-2 text-muted-foreground align-top text-[11px]">{routeLabel}</td>
                      </>
                    ) : null}
                    <td className="p-2">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <Checkbox checked={on} onCheckedChange={() => toggle(row.site, r.day)} className="mt-0.5" />
                        <span>
                          <span className="text-[10px] text-muted-foreground">{row.city.name}</span>
                          <span className="block text-sm font-medium">{row.site.site_name}</span>
                          {missing && (
                            <span className="block text-[10px] text-amber-600 mt-0.5">
                              Price not set — update in Entrances module
                            </span>
                          )}
                        </span>
                      </label>
                    </td>
                    {showI && (
                      <td className={cn("p-2 text-right tabular-nums", colHilite("indian"))}>
                        {on ? (
                          <>
                            <div>{inr(t.indian)}</div>
                            <div className="text-[10px] text-muted-foreground">{line!.indian_pax} × ₹{line!.indian_rate}</div>
                          </>
                        ) : <span className="text-[11px] text-muted-foreground">₹{row.site.indian_rate}/pp</span>}
                      </td>
                    )}
                    {showF && (
                      <td className={cn("p-2 text-right tabular-nums", colHilite("foreign"))}>
                        {on ? (
                          <>
                            <div>{inr(t.foreign)}</div>
                            <div className="text-[10px] text-muted-foreground">{line!.foreign_pax} × ₹{line!.foreign_rate}</div>
                          </>
                        ) : <span className="text-[11px] text-muted-foreground">₹{row.site.foreigner_rate}/pp</span>}
                      </td>
                    )}
                    {showS && (
                      <td className={cn("p-2 text-right tabular-nums", colHilite("student"))}>
                        {on ? (
                          <>
                            <div>{inr(t.student)}</div>
                            <div className="text-[10px] text-muted-foreground">{line!.student_pax ?? 0} × ₹{line!.student_rate ?? 0}</div>
                          </>
                        ) : <span className="text-[11px] text-muted-foreground">{row.site.student_rate ? `₹${row.site.student_rate}/pp` : "—"}</span>}
                      </td>
                    )}
                    <td className="p-2 text-right tabular-nums font-medium">{on ? inr(sub) : "—"}</td>
                  </tr>
                );
              });
              rowNodes.push(
                <tr key={`${ri}-sub`} className="bg-muted/20 border-b border-[#E5E7EB]">
                  <td colSpan={3 + (showI ? 1 : 0) + (showF ? 1 : 0) + (showS ? 1 : 0)} className="p-2 text-right text-[10px] uppercase text-muted-foreground">Day {r.day} Subtotal</td>
                  <td className="p-2 text-right tabular-nums font-semibold">{inr(daySubtotal)}</td>
                </tr>,
              );
              return <>{rowNodes}</>;
            })}
            <tr className="bg-muted/40 border-b border-[#E5E7EB]">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase text-muted-foreground font-semibold">Column Totals</td>
              {showI && <td className={cn("p-2 text-right tabular-nums font-semibold", colHilite("indian"))}>{inr(grandIndian)}</td>}
              {showF && <td className={cn("p-2 text-right tabular-nums font-semibold", colHilite("foreign"))}>{inr(grandForeign)}</td>}
              {showS && <td className={cn("p-2 text-right tabular-nums font-semibold", colHilite("student"))}>{inr(grandStudent)}</td>}
              <td className="p-2 text-right tabular-nums font-semibold">{inr(grandTotal)}</td>
            </tr>
            <tr className="bg-primary/5 font-bold">
              <td colSpan={3 + (showI ? 1 : 0) + (showF ? 1 : 0) + (showS ? 1 : 0)} className="p-2 text-right text-sm">TOTAL ENTRANCES</td>
              <td className="p-2 text-right tabular-nums text-sm">{inr(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {/* Suppress unused helper reference in strict mode */}
      {false && <span>{sumLine(draft.entrances[0]!)}</span>}
    </div>
  );
}


// ============================================================
// STEP 12 — Guide (day-wise table)
