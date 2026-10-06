import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import { effectivePaxForPricing } from "@/lib/wizard/calc";
import { uid, dayAllCities, type CityRef, type StepProps } from "../shared";

export function Step12({ draft, set }: StepProps) {
  const d = useDB();
  const traveler = draft.traveler_type ?? "indian";
  const totalPaxCount = effectivePaxForPricing(draft);
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
      const selectedTitles =
        r.tours_selected_by_city?.[c.id] ??
        (r.tour_titles_by_city?.[c.id] ? [r.tour_titles_by_city[c.id]] : []);
      if (selectedTitles.length === 0) return;
      d.entrance_sites
        .filter(
          (s) =>
            s.is_active &&
            d.entrance_cities.some(
              (ec) => ec.name === c.name && ec.id === s.city_id
            ) &&
            selectedTitles.includes(s.site_name)
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
    const routeLabel = `${r.from_city ?? fromDefault ?? "—"} → ${
      cityName(r.city_id) || r.to_city || "—"
    }`;
    const rows = dayRows(r, ri);

    const siteRows = rows.map((row) => {
      const line = findLine(row.site.id, r.day);
      const on = !!line;
      
      // Per‑person rates only (NO PAX MULTIPLIER USED)
      const indianRate = on ? line.indian_rate : 0;
      const foreignRate = on ? line.foreign_rate : 0;
      const studentRate = on ? (line.student_rate ?? 0) : 0;
      
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Entrance Fees</h2>
        <Badge variant="secondary" className="text-[10px]">
          Pax: {totalPaxCount} (Indian · Foreigner · Student)
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
              <th className="text-right p-2 w-[180px]">Indian</th>
              <th className="text-right p-2 w-[180px]">Foreigner</th>
              <th className="text-right p-2 w-[180px]">Student</th>
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
                          <span className="block text-[10px] text-muted-foreground mt-0.5 space-x-2">
                            <span
                              className={cn(
                                site.indianRate > 0
                                  ? "text-green-700"
                                  : "text-amber-500"
                              )}
                            >
                              Indian:{" "}
                              {site.indianRate > 0
                                ? `${inr(site.indianRate)}/pp`
                                : "not set"}
                            </span>
                            <span className="text-muted-foreground">·</span>
                            <span
                              className={cn(
                                site.foreignRate > 0
                                  ? "text-blue-700"
                                  : "text-amber-500"
                              )}
                            >
                              Foreigner:{" "}
                              {site.foreignRate > 0
                                ? `${inr(site.foreignRate)}/pp`
                                : "not set"}
                            </span>
                            <span className="text-muted-foreground">·</span>
                            <span
                              className={cn(
                                site.studentRate > 0
                                  ? "text-purple-700"
                                  : "text-muted-foreground"
                              )}
                            >
                              Student:{" "}
                              {site.studentRate > 0
                                ? `${inr(site.studentRate)}/pp`
                                : "—"}
                            </span>
                          </span>
                        </span>
                      </label>
                    </td>

                    {/* Indian column: ONLY per-person rate displayed (NO PAX MULTIPLIER) */}
                    <td className="p-2 text-right tabular-nums">
                      {site.on ? (
                        <div className="font-semibold text-green-700">
                          {inr(site.indianRate)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Foreigner column */}
                    <td className="p-2 text-right tabular-nums">
                      {site.on ? (
                        <div className="font-semibold text-blue-700">
                          {inr(site.foreignRate)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Student column */}
                    <td className="p-2 text-right tabular-nums">
                      {site.on ? (
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

            {/* 🔥 NEW PER-PERSON COLUMN TOTALS ROW (NO PAX MULTIPLICATION) */}
            <tr className="border-t-2 border-[#E5E7EB] bg-[#F0FDF4]">
              <td
                colSpan={3}
                className="p-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-semibold"
              >
                Total (Per-Person)
              </td>
              <td className="p-2 text-right tabular-nums">
                <div className="font-bold text-green-800 text-sm">
                  {inr(totalIndianRate)}
                </div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide">
                  Indian
                </div>
              </td>
              <td className="p-2 text-right tabular-nums">
                <div className="font-bold text-blue-800 text-sm">
                  {inr(totalForeignRate)}
                </div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide">
                  Foreigner
                </div>
              </td>
              <td className="p-2 text-right tabular-nums">
                <div className="font-bold text-purple-800 text-sm">
                  {inr(totalStudentRate)}
                </div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide">
                  Student
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary chips (Per-person totals) */}
      {(totalIndianRate + totalForeignRate + totalStudentRate) > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {totalIndianRate > 0 && (
            <span className="bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1">
              🇮🇳 Indian total: {inr(totalIndianRate)}
            </span>
          )}
          {totalForeignRate > 0 && (
            <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1">
              ✈ Foreigner total: {inr(totalForeignRate)}
            </span>
          )}
          {totalStudentRate > 0 && (
            <span className="bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-3 py-1">
              🎓 Student total: {inr(totalStudentRate)}
            </span>
          )}
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1">
            👤 Indian/pp: {inr(totalIndianRate)}
          </span>
          <span className="bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-3 py-1">
            👤 Foreigner/pp: {inr(totalForeignRate)}
          </span>
          {(totalStudentRate > 0) && (
            <span className="bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-3 py-1">
              👤 Student/pp: {inr(totalStudentRate)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
