// Step 11 — Entrances. Day-per-row table with Indian/Foreigner/Student columns.
// Shows column-wise grand totals, per-person rates, and pax calculation breakdown.

import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
            indian_pax: totalPaxCount,
            indian_rate: s.indian_rate,
            foreign_pax: totalPaxCount,
            foreign_rate: s.foreigner_rate,
            student_pax: totalPaxCount,
            student_rate: s.student_rate ?? 0,
            from_routing_days: [day],
          },
        ],
      });
    }
  };

  // Keep rates and pax in sync with master data
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
      if (patched.indian_pax !== totalPaxCount) {
        patched.indian_pax = totalPaxCount;
        dirty = true;
      }
      if (patched.foreign_pax !== totalPaxCount) {
        patched.foreign_pax = totalPaxCount;
        dirty = true;
      }
      if ((patched.student_pax ?? 0) !== totalPaxCount) {
        patched.student_pax = totalPaxCount;
        dirty = true;
      }
      return patched;
    });
    if (dirty) set({ entrances: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPaxCount, d.entrance_sites]);

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

  // Compute all day totals for grand column totals
  let grandIndian = 0;
  let grandForeign = 0;
  let grandStudent = 0;

  const dayData = draft.routing.map((r, ri) => {
    const fromDefault =
      ri === 0
        ? draft.departure_city
        : cityName(draft.routing[ri - 1]?.city_id || "");
    const routeLabel = `${r.from_city ?? fromDefault ?? "—"} → ${
      cityName(r.city_id) || r.to_city || "—"
    }`;
    const rows = dayRows(r, ri);

    let indianTot = 0;
    let foreignTot = 0;
    let studentTot = 0;

    rows.forEach((row) => {
      const line = findLine(row.site.id, r.day);
      if (line) {
        indianTot += line.indian_pax * line.indian_rate;
        foreignTot += line.foreign_pax * line.foreign_rate;
        studentTot += (line.student_pax ?? 0) * (line.student_rate ?? 0);
      }
    });

    grandIndian += indianTot;
    grandForeign += foreignTot;
    grandStudent += studentTot;

    return { r, ri, routeLabel, rows, indianTot, foreignTot, studentTot };
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
              <th className="text-left p-2">City + Tour</th>
              <th className="text-right p-2 w-[180px]">Indian</th>
              <th className="text-right p-2 w-[180px]">Foreigner</th>
              <th className="text-right p-2 w-[180px]">Student</th>
            </tr>
          </thead>
          <tbody>
            {dayData.map(
              ({ r, ri, routeLabel, rows, indianTot, foreignTot, studentTot }) => {
                if (rows.length === 0) {
                  return (
                    <tr key={ri} className="border-b border-[#E5E7EB]">
                      <td className="p-2 font-semibold align-top">
                        Day {r.day}
                      </td>
                      <td className="p-2 text-muted-foreground align-top text-[11px]">
                        {routeLabel}
                      </td>
                      <td
                        colSpan={4} // remaining: City+Tour, Indian, Foreigner, Student
                        className="p-2 text-muted-foreground italic"
                      >
                        No entrance sites for this day's cities.
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={ri}
                    className="border-b border-[#E5E7EB] align-top bg-white"
                  >
                    {/* Day */}
                    <td className="p-2 font-semibold">Day {r.day}</td>

                    {/* Route */}
                    <td className="p-2 text-muted-foreground text-[11px]">
                      {routeLabel}
                    </td>

                    {/* City + Tour with rate info */}
                    <td className="p-2">
                      <div className="space-y-3">
                        {rows.map((row) => {
                          const line = findLine(row.site.id, r.day);
                          const on = !!line;
                          const iRate = row.site.indian_rate;
                          const fRate = row.site.foreigner_rate;
                          const sRate = row.site.student_rate ?? 0;

                          return (
                            <label
                              key={row.site.id}
                              className="flex items-start gap-2 cursor-pointer group"
                            >
                              <Checkbox
                                checked={on}
                                onCheckedChange={() =>
                                  toggle(row.site, r.day)
                                }
                                className="mt-0.5"
                              />
                              <span className="min-w-0">
                                {/* City label */}
                                <span className="text-[10px] text-muted-foreground">
                                  {row.city.name}
                                </span>
                                {/* Tour name */}
                                <span className="block text-sm font-medium truncate">
                                  {row.site.site_name}
                                </span>
                                {/* Per-person rates */}
                                <span className="block text-[10px] text-muted-foreground mt-0.5 space-x-2">
                                  <span
                                    className={cn(
                                      iRate > 0
                                        ? "text-green-700"
                                        : "text-amber-500"
                                    )}
                                  >
                                    Indian:{" "}
                                    {iRate > 0
                                      ? `${inr(iRate)}/pp`
                                      : "not set"}
                                  </span>
                                  <span className="text-muted-foreground">
                                    ·
                                  </span>
                                  <span
                                    className={cn(
                                      fRate > 0
                                        ? "text-blue-700"
                                        : "text-amber-500"
                                    )}
                                  >
                                    Foreigner:{" "}
                                    {fRate > 0
                                      ? `${inr(fRate)}/pp`
                                      : "not set"}
                                  </span>
                                  <span className="text-muted-foreground">
                                    ·
                                  </span>
                                  <span
                                    className={cn(
                                      sRate > 0
                                        ? "text-purple-700"
                                        : "text-muted-foreground"
                                    )}
                                  >
                                    Student:{" "}
                                    {sRate > 0
                                      ? `${inr(sRate)}/pp`
                                      : "—"}
                                  </span>
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </td>

                    {/* Indian total with pax breakdown */}
                    <td className="p-2 text-right tabular-nums">
                      <div className="font-semibold text-green-700">
                        {inr(indianTot)}
                      </div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">
                        {totalPaxCount} pax × rates
                      </div>
                      {/* Per-tour breakdown */}
                      {rows.map((row) => {
                        const line = findLine(row.site.id, r.day);
                        if (!line) return null;
                        const amt = line.indian_pax * line.indian_rate;
                        if (amt === 0) return null;
                        return (
                          <div
                            key={row.site.id}
                            className="text-[9px] text-muted-foreground"
                          >
                            {row.site.site_name.slice(0, 12)}:{" "}
                            {line.indian_pax}×{inr(line.indian_rate)}=
                            {inr(amt)}
                          </div>
                        );
                      })}
                    </td>

                    {/* Foreigner total with pax breakdown */}
                    <td className="p-2 text-right tabular-nums">
                      <div className="font-semibold text-blue-700">
                        {inr(foreignTot)}
                      </div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">
                        {totalPaxCount} pax × rates
                      </div>
                      {rows.map((row) => {
                        const line = findLine(row.site.id, r.day);
                        if (!line || line.foreign_pax === 0) return null;
                        const amt = line.foreign_pax * line.foreign_rate;
                        if (amt === 0) return null;
                        return (
                          <div
                            key={row.site.id}
                            className="text-[9px] text-muted-foreground"
                          >
                            {row.site.site_name.slice(0, 12)}:{" "}
                            {line.foreign_pax}×{inr(line.foreign_rate)}=
                            {inr(amt)}
                          </div>
                        );
                      })}
                    </td>

                    {/* Student total with pax breakdown */}
                    <td className="p-2 text-right tabular-nums">
                      <div className="font-semibold text-purple-700">
                        {inr(studentTot)}
                      </div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">
                        {totalPaxCount} pax × rates
                      </div>
                      {rows.map((row) => {
                        const line = findLine(row.site.id, r.day);
                        if (!line || (line.student_pax ?? 0) === 0)
                          return null;
                        const amt =
                          (line.student_pax ?? 0) * (line.student_rate ?? 0);
                        if (amt === 0) return null;
                        return (
                          <div
                            key={row.site.id}
                            className="text-[9px] text-muted-foreground"
                          >
                            {row.site.site_name.slice(0, 12)}:{" "}
                            {line.student_pax}×{inr(line.student_rate ?? 0)}=
                            {inr(amt)}
                          </div>
                        );
                      })}
                    </td>
                  </tr>
                );
              }
            )}

            {/* Column Totals Row */}
            <tr className="border-t-2 border-[#E5E7EB] bg-[#F9FAFB]">
              <td
                colSpan={3}
                className="p-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-semibold"
              >
                Column Totals
              </td>
              {/* Indian Grand Total */}
              <td className="p-2 text-right tabular-nums">
                <div className="font-bold text-green-700 text-sm">
                  {inr(grandIndian)}
                </div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide">
                  Indian total
                </div>
              </td>
              {/* Foreigner Grand Total */}
              <td className="p-2 text-right tabular-nums">
                <div className="font-bold text-blue-700 text-sm">
                  {inr(grandForeign)}
                </div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide">
                  Foreigner total
                </div>
              </td>
              {/* Student Grand Total */}
              <td className="p-2 text-right tabular-nums">
                <div className="font-bold text-purple-700 text-sm">
                  {inr(grandStudent)}
                </div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide">
                  Student total
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary chips */}
      {(grandIndian + grandForeign + grandStudent) > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {grandIndian > 0 && (
            <span className="bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1">
              🇮🇳 Indian: {inr(grandIndian)}
            </span>
          )}
          {grandForeign > 0 && (
            <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1">
              ✈ Foreigner: {inr(grandForeign)}
            </span>
          )}
          {grandStudent > 0 && (
            <span className="bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-3 py-1">
              🎓 Student: {inr(grandStudent)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}