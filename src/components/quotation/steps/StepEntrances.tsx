// Step 11 — Entrances. Day-per-row table with Indian/Foreigner/Student columns.
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import { totalPax } from "@/lib/wizard/calc";
import { uid, dayAllCities, type CityRef, type StepProps } from "../shared";

export function Step12({ draft, set }: StepProps) {
  const d = useDB();
  const totalPaxCount = totalPax(draft);
  const cityName = (id: string) => d.cities.find((c) => c.id === id)?.name || "";

  const findLine = (siteId: string, day: number) =>
    draft.entrances.find((x) => x.site_id === siteId && (x.from_routing_days ?? []).includes(day));

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

  const patchRate = (id: string, field: "indian_rate" | "foreign_rate" | "student_rate", v: number) => {
    set({ entrances: draft.entrances.map((x) => x.id === id ? { ...x, [field]: v } : x) });
  };

  useEffect(() => {
    let dirty = false;
    const next = draft.entrances.map((l) => {
      if (!l.site_id) return l;
      const s = d.entrance_sites.find((x) => x.id === l.site_id);
      if (!s) return l;
      const patched = { ...l };
      // Only sync from master if master has a non-zero price (respect manual entry when master is unset).
      if (s.indian_rate > 0 && patched.indian_rate !== s.indian_rate) { patched.indian_rate = s.indian_rate; dirty = true; }
      if (s.foreigner_rate > 0 && patched.foreign_rate !== s.foreigner_rate) { patched.foreign_rate = s.foreigner_rate; dirty = true; }
      const sr = s.student_rate ?? 0;
      if (sr > 0 && (patched.student_rate ?? 0) !== sr) { patched.student_rate = sr; dirty = true; }
      if (patched.indian_pax !== totalPaxCount) { patched.indian_pax = totalPaxCount; dirty = true; }
      return patched;
    });
    if (dirty) set({ entrances: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPaxCount, d.entrance_sites]);

  type DayRow = { city: CityRef; site: typeof d.entrance_sites[number] };
  const dayRows = (r: typeof draft.routing[number], ri: number): DayRow[] => {
    const fromDefault = ri === 0 ? draft.departure_city : cityName(draft.routing[ri - 1]?.city_id || "");
    const dayCities = dayAllCities(r, d.cities, fromDefault);
    const out: DayRow[] = [];
    dayCities.forEach((c) => {
      const selectedTitles = (r.tours_selected_by_city?.[c.id])
        ?? (r.tour_titles_by_city?.[c.id] ? [r.tour_titles_by_city[c.id]] : []);
      if (selectedTitles.length === 0) return;
      d.entrance_sites
        .filter((s) => s.is_active
          && d.entrance_cities.some((ec) => ec.name === c.name && ec.id === s.city_id)
          && selectedTitles.includes(s.site_name))
        .forEach((s) => out.push({ city: c, site: s }));
    });
    return out;
  };

  let grandTotal = 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Entrance Fees</h2>
        <Badge variant="secondary" className="text-[10px]">
          Indian pax: {totalPaxCount} · Foreigner: 0 · Student: 0
        </Badge>
      </div>

      <div className="border border-[#E5E7EB] rounded-lg overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-[#F3F4F6] text-[10px] uppercase text-muted-foreground tracking-wide">
            <tr className="border-b border-[#E5E7EB]">
              <th className="text-left p-2 w-[60px]">Day</th>
              <th className="text-left p-2 w-[170px]">Route</th>
              <th className="text-left p-2">City + Tour</th>
              <th className="text-right p-2 w-[160px]">Indian</th>
              <th className="text-right p-2 w-[160px]">Foreigner</th>
              <th className="text-right p-2 w-[160px]">Student</th>
              <th className="text-right p-2 w-[120px]">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {draft.routing.map((r, ri) => {
              const fromDefault = ri === 0 ? draft.departure_city : cityName(draft.routing[ri - 1]?.city_id || "");
              const routeLabel = `${r.from_city ?? fromDefault ?? "—"} → ${cityName(r.city_id) || r.to_city || "—"}`;
              const rows = dayRows(r, ri);
              if (rows.length === 0) {
                return (
                  <tr key={ri} className="border-b border-[#E5E7EB]">
                    <td className="p-2 font-semibold align-top">Day {r.day}</td>
                    <td className="p-2 text-muted-foreground align-top text-[11px]">{routeLabel}</td>
                    <td colSpan={5} className="p-2 text-muted-foreground italic">No entrance sites for this day's cities.</td>
                  </tr>
                );
              }

              // Only sum enabled rows.
              const enabled = rows.map((row) => ({ row, line: findLine(row.site.id, r.day) })).filter((x) => !!x.line);
              const indianTot = enabled.reduce((s, { line }) => s + (line!.indian_pax * line!.indian_rate), 0);
              const foreignTot = enabled.reduce((s, { line }) => s + (line!.foreign_pax * line!.foreign_rate), 0);
              const studentTot = enabled.reduce((s, { line }) => s + ((line!.student_pax ?? 0) * (line!.student_rate ?? 0)), 0);
              const daySub = indianTot + foreignTot + studentTot;
              grandTotal += daySub;

              return (
                <tr key={ri} className="border-b border-[#E5E7EB] align-top bg-white">
                  <td className="p-2 font-semibold">Day {r.day}</td>
                  <td className="p-2 text-muted-foreground text-[11px]">{routeLabel}</td>
                  <td className="p-2">
                    <div className="space-y-1.5">
                      {rows.map((row) => {
                        const line = findLine(row.site.id, r.day);
                        const on = !!line;
                        return (
                          <label key={row.site.id} className="flex items-start gap-2 cursor-pointer">
                            <Checkbox checked={on} onCheckedChange={() => toggle(row.site, r.day)} className="mt-0.5" />
                            <span className="min-w-0">
                              <span className="text-[10px] text-muted-foreground">{row.city.name}</span>
                              <span className="block text-sm font-medium truncate">{row.site.site_name}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </td>
                  {(["indian_rate", "foreign_rate", "student_rate"] as const).map((field) => {
                    const label = field === "indian_rate" ? "Indian" : field === "foreign_rate" ? "Foreigner" : "Student";
                    const pxKey = field === "indian_rate" ? "indian_pax" : field === "foreign_rate" ? "foreign_pax" : "student_pax";
                    const total = field === "indian_rate" ? indianTot : field === "foreign_rate" ? foreignTot : studentTot;
                    return (
                      <td key={field} className="p-2 text-right tabular-nums">
                        <div className="space-y-1">
                          {rows.map((row) => {
                            const line = findLine(row.site.id, r.day);
                            const on = !!line;
                            const masterVal =
                              field === "indian_rate" ? row.site.indian_rate :
                              field === "foreign_rate" ? row.site.foreigner_rate :
                              row.site.student_rate ?? 0;
                            const lineVal = on ? (line as Record<string, unknown>)[field] as number : masterVal;
                            const pax = on ? ((line as Record<string, unknown>)[pxKey] as number) ?? 0 : 0;
                            const missing = masterVal === 0;
                            if (on && missing) {
                              return (
                                <div key={row.site.id} className="flex items-center justify-end gap-1">
                                  <Input type="number" min={0} value={lineVal || 0}
                                    onChange={(e) => patchRate(line!.id, field, parseFloat(e.target.value) || 0)}
                                    className="h-6 w-20 text-[11px] text-right" />
                                  <span className="text-[10px] text-muted-foreground">× {pax}</span>
                                </div>
                              );
                            }
                            return (
                              <div key={row.site.id} className={cn("text-[11px]", on ? "" : "text-muted-foreground/70")}>
                                {on
                                  ? <>₹{lineVal.toLocaleString("en-IN")} × {pax} = <span className="font-medium">{inr(lineVal * pax)}</span></>
                                  : <>₹{lineVal.toLocaleString("en-IN")}/pp</>}
                              </div>
                            );
                          })}
                          <div className="border-t pt-1 font-semibold">{inr(total)}</div>
                          <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label} total</div>
                        </div>
                      </td>
                    );
                  })}
                  <td className="p-2 text-right tabular-nums font-semibold">{inr(daySub)}</td>
                </tr>
              );
            })}
            <tr className="bg-primary/5 font-bold">
              <td colSpan={6} className="p-2 text-right text-sm">TOTAL ENTRANCES</td>
              <td className="p-2 text-right tabular-nums text-sm">{inr(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
