import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import { effectivePaxForPricing, parsePaxRange } from "@/lib/wizard/calc";
import { uid, dayAllCities, type CityRef, type StepProps } from "../shared";
import { applyLandCommercials } from "@/lib/wizard/land-pricing";

export function Step12({ draft, set }: StepProps) {
  const d = useDB();
  const traveler = draft.traveler_type ?? "indian";
  const totalPaxCount = effectivePaxForPricing(draft);
  const paxRange = parsePaxRange(draft);
  // Only the selected traveler category is charged.
  const paxFor = (t: "indian" | "foreign" | "student") =>
    traveler === t ? totalPaxCount : 0;
  const cityName = (id: string) => d.cities.find((c) => c.id === id)?.name || "";

  const findLine = (siteId: string, day: number) =>
    draft.entrances.find(
      (x) => x.site_id === siteId && (x.from_routing_days ?? []).includes(day)
    );

  const toggle = (s: typeof d.entrance_sites[number], day: number) => {
    const existing = findLine(s.id, day);
    if (existing) {
      set({ entrances: draft.entrances.filter((x) => x.id !== existing.id) });
    } else {
      set({
        entrances: [
          ...draft.entrances,
          {
            id: uid(),
            site_id: s.id,
            indian_pax: paxFor("indian"),
            indian_rate: s.indian_rate,
            foreign_pax: paxFor("foreign"),
            foreign_rate: s.foreigner_rate,
            student_pax: paxFor("student"),
            student_rate: s.student_rate ?? 0,
            from_routing_days: [day],
          },
        ],
      });
    }
  };

  // Keep rates and pax in sync with master data (pax sync kept for data integrity, but we won't use pax in visuals)
  useEffect(() => {
    let dirty = false;
    const next = draft.entrances.map((l) => {
      if (!l.site_id) return l;
      const s = d.entrance_sites.find((x) => x.id === l.site_id);
      if (!s) return l;
      const patched = { ...l };
      if (s.indian_rate > 0 && patched.indian_rate !== s.indian_rate) {
        patched.indian_rate = s.indian_rate;
        dirty = true;
      }
      if (s.foreigner_rate > 0 && patched.foreign_rate !== s.foreigner_rate) {
        patched.foreign_rate = s.foreigner_rate;
        dirty = true;
      }
      const sr = s.student_rate ?? 0;
      if (sr > 0 && (patched.student_rate ?? 0) !== sr) {
        patched.student_rate = sr;
        dirty = true;
      }
      if (patched.indian_pax !== paxFor("indian")) {
        patched.indian_pax = paxFor("indian");
        dirty = true;
      }
      if (patched.foreign_pax !== paxFor("foreign")) {
        patched.foreign_pax = paxFor("foreign");
        dirty = true;
      }
      if ((patched.student_pax ?? 0) !== paxFor("student")) {
        patched.student_pax = paxFor("student");
        dirty = true;
      }
      return patched;
    });
    if (dirty) set({ entrances: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPaxCount, traveler, d.entrance_sites]);

  type DayRow = { city: CityRef; site: typeof d.entrance_sites[number] };

  const dayRows = (r: typeof draft.routing[number], ri: number): DayRow[] => {
    const fromDefault =
      ri === 0
        ? draft.departure_city
        : cityName(draft.routing[ri - 1]?.city_id || "");
    const dayCities = dayAllCities(r, d.cities, fromDefault);
    const out: DayRow[] = [];
    dayCities.forEach((c) => {
      d.entrance_sites
        .filter(
          (s) =>
            s.is_active &&
            d.entrance_cities.some(
              (ec) => ec.name === c.name && ec.id === s.city_id
            )
        )
        .forEach((s) => out.push({ city: c, site: s }));
    });
    return out;
  };

  // ✅ TOTALS ARE NOW EXCLUSIVELY PER-PERSON (NO PAX MULTIPLICATION)
  let totalIndianRate = 0; // sum of per‑person Indian rates across all selected sites
  let totalForeignRate = 0;
  let totalStudentRate = 0;

  const dayData = draft.routing.map((r, ri) => {
    const fromDefault =
      ri === 0
        ? draft.departure_city
        : cityName(draft.routing[ri - 1]?.city_id || "");
    const fromLabel = r.from_city || fromDefault || "—";
    const toLabel = cityName(r.city_id) || r.to_city || "—";
    const routeLabel = fromLabel === toLabel ? `${toLabel} Local` : `${fromLabel} → ${toLabel}`;
    const rows = dayRows(r, ri);

    const siteRows = rows.map((row) => {
      const line = findLine(row.site.id, r.day);
      const on = !!line;
      
      // Per‑person rates only (NO PAX MULTIPLIER USED)
      const indianRate = line?.indian_rate ?? row.site.indian_rate;
      const foreignRate = line?.foreign_rate ?? row.site.foreigner_rate;
      const studentRate = line?.student_rate ?? row.site.student_rate ?? 0;
      
      return {
        ...row,
        on,
        indianRate,
        foreignRate,
        studentRate,
        line,
      };
    });

    // Update per-person totals globally
    siteRows.forEach((s) => {
      if (s.on) {
        totalIndianRate += s.indianRate;
        totalForeignRate += s.foreignRate;
        totalStudentRate += s.studentRate;
      }
    });

    return {
      r,
      ri,
      routeLabel,
      siteRows,
      hasRows: siteRows.length > 0,
    };
  });
  const entranceCommercials = {
    indian: applyLandCommercials(draft, totalIndianRate, 0.05),
    foreign: applyLandCommercials(draft, totalForeignRate, 0.05),
    student: applyLandCommercials(draft, totalStudentRate, 0.05),
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Entrance Fees</h2>
        <Badge variant="secondary" className="text-[10px]">
          Pax: {paxRange ? `${paxRange.min}–${paxRange.max}` : totalPaxCount} (Indian · Foreigner · Student)
        </Badge>
      </div>

      {/* Main table */}
      <div className="border border-[#E5E7EB] rounded-lg overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-[#F3F4F6] text-[10px] uppercase text-muted-foreground tracking-wide">
            <tr className="border-b border-[#E5E7EB]">
              <th className="text-left p-2 w-[60px]">Day</th>
              <th className="text-left p-2 w-[170px]">Route</th>
              <th className="text-left p-2 min-w-[200px]">City + Tour</th>
              <th className="text-right p-2 w-[150px]">Indian</th>
              <th className="text-right p-2 w-[150px]">Foreigner</th>
              <th className="text-right p-2 w-[150px]">Student</th>
            </tr>
          </thead>
          <tbody>
            {dayData.map((day, dayIdx) => {
              if (!day.hasRows) {
                return (
                  <tr key={dayIdx} className="border-b border-[#E5E7EB]">
                    <td className="p-2 font-semibold align-top">
                      Day {day.r.day}
                    </td>
                    <td className="p-2 text-muted-foreground align-top text-[11px]">
                      {day.routeLabel}
                    </td>
                    <td colSpan={4} className="p-2 text-muted-foreground italic">
                      No entrance sites for this day's cities.
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
                          checked={site.on}
                          onCheckedChange={() => toggle(site.site, day.r.day)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="text-[10px] text-muted-foreground">
                            {site.city.name}
                          </span>
                          <span className="block text-sm font-medium truncate">
                            {site.site.site_name}
                          </span>
                        </span>
                      </label>
                    </td>

                    {/* Indian column: ONLY per-person rate displayed (NO PAX MULTIPLIER) */}
                    <td className="p-2 text-right tabular-nums">
                      {site.indianRate > 0 ? (
                        <div className="font-semibold text-green-700">
                          {inr(site.indianRate)}
                        </div>
                      ) : (
                        <span className="text-[10px] text-amber-600">not set</span>
                      )}
                    </td>

                    {/* Foreigner column */}
                    <td className="p-2 text-right tabular-nums">
                      {site.foreignRate > 0 ? (
                        <div className="font-semibold text-blue-700">
                          {inr(site.foreignRate)}
                        </div>
                      ) : (
                        <span className="text-[10px] text-amber-600">not set</span>
                      )}
                    </td>

                    {/* Student column */}
                    <td className="p-2 text-right tabular-nums">
                      {site.studentRate > 0 ? (
                        <div className="font-semibold text-purple-700">
                          {inr(site.studentRate)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              });
            })}

            <tr className="border-t-2 border-[#E5E7EB] bg-[#F0FDF4]">
              <td
                colSpan={3}
                className="p-2 text-right text-[10px] uppercase tracking-wide font-semibold"
              >
                Base Total (Per Person)
              </td>
              <td className="p-2 text-right tabular-nums font-semibold">{inr(totalIndianRate)}</td>
              <td className="p-2 text-right tabular-nums font-semibold">{inr(totalForeignRate)}</td>
              <td className="p-2 text-right tabular-nums font-semibold">{inr(totalStudentRate)}</td>
            </tr>
            <tr className="border-b border-[#E5E7EB] bg-[#F0FDF4]">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                Markup
              </td>
              <td className="p-2 text-right tabular-nums">{inr(entranceCommercials.indian.markup)}</td>
              <td className="p-2 text-right tabular-nums">{inr(entranceCommercials.foreign.markup)}</td>
              <td className="p-2 text-right tabular-nums">{inr(entranceCommercials.student.markup)}</td>
            </tr>
            <tr className="border-b-2 border-[#D1D5DB] bg-[#F0FDF4]">
              <td colSpan={3} className="p-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                GST 5%
              </td>
              <td className="p-2 text-right tabular-nums">{inr(entranceCommercials.indian.gst)}</td>
              <td className="p-2 text-right tabular-nums">{inr(entranceCommercials.foreign.gst)}</td>
              <td className="p-2 text-right tabular-nums">{inr(entranceCommercials.student.gst)}</td>
            </tr>
            <tr className="bg-[#F0FDF4] font-bold">
              <td colSpan={3} className="p-2 text-right text-xs uppercase tracking-wide">
                Final Total Per Person
              </td>
              <td className="p-2 text-right text-sm tabular-nums text-green-800">
                {inr(entranceCommercials.indian.final)}
              </td>
              <td className="p-2 text-right text-sm tabular-nums text-blue-800">
                {inr(entranceCommercials.foreign.final)}
              </td>
              <td className="p-2 text-right text-sm tabular-nums text-purple-800">
                {inr(entranceCommercials.student.final)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  );
}
