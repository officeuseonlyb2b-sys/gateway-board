import { useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import { effectivePaxForPricing, parsePaxRange } from "@/lib/wizard/calc";
import { applyLandCommercials } from "@/lib/wizard/land-pricing";
import {
  eligibleEntrancesForDay,
  isSelectedLandServiceValid,
  landDayContext,
} from "@/lib/wizard/land-eligibility";
import {
  catPicked,
  entranceRateSelected,
  entranceTourSelected,
  isPicked,
} from "@/lib/wizard/costsheet";
import type { EntranceCat, EntranceLine } from "@/lib/wizard/types";
import { uid, type StepProps } from "../shared";

export function Step12({ draft, set }: StepProps) {
  const db = useDB();
  const traveller = draft.entrance_traveller_category ?? draft.traveler_type ?? "indian";
  const totalPax = effectivePaxForPricing(draft);
  const paxRange = parsePaxRange(draft);
  const cityName = (id: string) => db.cities.find((city) => city.id === id)?.name || "";
  const selectedLine = (siteId: string, day: number) =>
    draft.entrances.find(
      (line) => line.site_id === siteId && (line.from_routing_days ?? []).includes(day),
    );
  const entrancePicksForDay = (day: number, lines = draft.entrances) =>
    draft.costing_selection?.entrances?.[day] ??
    lines
      .filter(
        (line) =>
          line.from_routing_days?.length
            ? line.from_routing_days.includes(day)
            : draft.routing.some((route) => route.day === day),
      )
      .filter((line) => isPicked(draft, "entrances", day, line.id))
      .map((line) => line.id);
  const idsInCategorySelections = (
    selections: Partial<Record<EntranceCat, string[]>>,
  ) => Array.from(new Set(Object.values(selections).flatMap((ids) => ids ?? [])));
  const paxFor = (category: EntranceCat) => (traveller === category ? totalPax : 0);

  useEffect(() => {
    let dirty = false;
    const entrances = draft.entrances.map((line) => {
      const site = db.entrance_sites.find((item) => item.id === line.site_id);
      if (!site) return line;
      const next = {
        ...line,
        indian_rate: site.indian_rate,
        foreign_rate: site.foreigner_rate,
        student_rate: site.student_rate ?? 0,
        indian_pax: paxFor("indian"),
        foreign_pax: paxFor("foreign"),
        student_pax: paxFor("student"),
      };
      if (
        next.indian_rate !== line.indian_rate ||
        next.foreign_rate !== line.foreign_rate ||
        next.student_rate !== line.student_rate ||
        next.indian_pax !== line.indian_pax ||
        next.foreign_pax !== line.foreign_pax ||
        next.student_pax !== line.student_pax
      )
        dirty = true;
      return next;
    });
    if (dirty) set({ entrances });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPax, traveller, db.entrance_sites]);

  const dayData = draft.routing.map((route, routeIndex) => {
    const fromDefault =
      routeIndex === 0
        ? draft.departure_city
        : cityName(draft.routing[routeIndex - 1]?.city_id || "");
    const from = route.from_city || fromDefault || "—";
    const to = cityName(route.city_id) || route.to_city || "—";
    const context = landDayContext(draft, route, db);
    const rows = eligibleEntrancesForDay(draft, route, db).map((site) => ({
      site,
      line: selectedLine(site.id, route.day),
      city: db.destination_cities.find((city) => city.id === site.city_id)?.name || "—",
      tour: db.destination_tours.find((tour) => tour.id === site.tour_id)?.title || site.site_name,
    }));
    return {
      route,
      routeLabel: from === to ? `${to} Local` : `${from} → ${to}`,
      tourLabel: context.tourTitles.join(", ") || "No tour selected",
      rows,
    };
  });

  const eligibleRows = dayData.flatMap((day) =>
    day.rows.map((row) => ({ ...row, day: day.route.day, routeLabel: day.routeLabel })),
  );
  const selectedRate = useCallback(
    (site: (typeof db.entrance_sites)[number]) =>
      traveller === "indian"
        ? site.indian_rate
        : traveller === "foreign"
          ? site.foreigner_rate
          : (site.student_rate ?? 0),
    [db, traveller],
  );
  const categoryLabel =
    traveller === "foreign" ? "Foreigner" : traveller === "indian" ? "Indian" : "Student";
  const makeEntranceLine = (
    site: (typeof db.entrance_sites)[number],
    day: number,
  ): EntranceLine => ({
    id: uid(),
    site_id: site.id,
    indian_pax: paxFor("indian"),
    indian_rate: site.indian_rate,
    foreign_pax: paxFor("foreign"),
    foreign_rate: site.foreigner_rate,
    student_pax: paxFor("student"),
    student_rate: site.student_rate ?? 0,
    from_routing_days: [day],
  });
  const isTourSelected = (row: (typeof eligibleRows)[number]) =>
    entranceTourSelected(draft, row.day, row.site.id, Boolean(row.line));
  const isPriceSelected = (row: (typeof eligibleRows)[number]) =>
    Boolean(
      row.line &&
        isTourSelected(row) &&
        entranceRateSelected(
          draft,
          row.day,
          row.line.id,
          traveller,
          isPicked(draft, "entrances", row.day, row.line.id) &&
            catPicked(draft, row.day, traveller),
        ),
    );
  const activePricedRows = eligibleRows.filter((row) => selectedRate(row.site) > 0);
  const includedRows = activePricedRows.filter(
    (row) => isTourSelected(row) && isPriceSelected(row),
  );
  // A selected tour without an active-category master rate remains visible as
  // unpriced optional work; it must never disappear or be costed as zero.
  const optionalRows = eligibleRows.filter(
    (row) => isTourSelected(row) && !isPriceSelected(row),
  );
  const selectablePricedRows = activePricedRows.filter(isTourSelected);
  const allActivePricesSelected =
    selectablePricedRows.length > 0 && selectablePricedRows.every(isPriceSelected);
  const someActivePricesSelected = selectablePricedRows.some(isPriceSelected);
  const activePriceHeaderState =
    allActivePricesSelected
      ? true
      : someActivePricesSelected
        ? "indeterminate"
        : false;
  const allToursSelected = eligibleRows.length > 0 && eligibleRows.every(isTourSelected);
  const someToursSelected = eligibleRows.some(isTourSelected);
  const tourHeaderState = allToursSelected ? true : someToursSelected ? "indeterminate" : false;

  useEffect(() => {
    const tourSelections = { ...(draft.entrance_tour_selected_by_day ?? {}) };
    const rateSelections = { ...(draft.entrance_rate_selection_by_day ?? {}) };
    let tourSelectionsChanged = false;
    let rateSelectionsChanged = false;
    dayData.forEach((day) => {
      const routeDay = day.route.day;
      if (tourSelections[routeDay] === undefined) {
        tourSelections[routeDay] = day.rows
          .filter((row) => Boolean(row.line))
          .map((row) => row.site.id);
        tourSelectionsChanged = true;
      }
      if (rateSelections[routeDay] === undefined) {
        const byCategory: Partial<Record<EntranceCat, string[]>> = {
          indian: [],
          foreign: [],
          student: [],
        };
        day.rows.forEach(({ site, line }) => {
          if (!line || selectedRate(site) <= 0) return;
          if (
            isPicked(draft, "entrances", routeDay, line.id) &&
            catPicked(draft, routeDay, traveller)
          )
            byCategory[traveller] = [...(byCategory[traveller] ?? []), line.id];
        });
        rateSelections[routeDay] = byCategory;
        rateSelectionsChanged = true;
      }
    });
    if (tourSelectionsChanged || rateSelectionsChanged)
      set({
        ...(tourSelectionsChanged
          ? { entrance_tour_selected_by_day: tourSelections }
          : {}),
        ...(rateSelectionsChanged
          ? { entrance_rate_selection_by_day: rateSelections }
          : {}),
      });
  }, [draft, dayData, selectedRate, traveller, set]);

  const setTourStatus = (
    row: (typeof eligibleRows)[number],
    selected: boolean,
  ) => {
    const tourSelections = { ...(draft.entrance_tour_selected_by_day ?? {}) };
    const selectedTours = new Set(
      tourSelections[row.day] ??
        dayData
          .find((day) => day.route.day === row.day)
          ?.rows.filter((candidate) => Boolean(candidate.line))
          .map((candidate) => candidate.site.id) ?? [],
    );
    if (selected) selectedTours.add(row.site.id);
    else selectedTours.delete(row.site.id);
    tourSelections[row.day] = [...selectedTours];

    const rateSelections = { ...(draft.entrance_rate_selection_by_day ?? {}) };
    const byCategory = { ...(rateSelections[row.day] ?? {}) };
    if (!selected && row.line) {
      (["indian", "foreign", "student"] as EntranceCat[]).forEach((category) => {
        byCategory[category] = (byCategory[category] ?? []).filter(
          (lineId) => lineId !== row.line?.id,
        );
      });
    }
    rateSelections[row.day] = byCategory;

    const costingSelection = { ...(draft.costing_selection ?? {}) };
    const entrancePicks = { ...(costingSelection.entrances ?? {}) };
    if (!selected && row.line) {
      const selectedLineIds = new Set(entrancePicks[row.day] ?? entrancePicksForDay(row.day));
      selectedLineIds.delete(row.line.id);
      entrancePicks[row.day] = [...selectedLineIds];
    }
    costingSelection.entrances = entrancePicks;
    set({
      entrance_tour_selected_by_day: tourSelections,
      entrance_rate_selection_by_day: rateSelections,
      costing_selection: costingSelection,
    });
  };

  const setAllTours = (selected: boolean) => {
    const tourSelections = { ...(draft.entrance_tour_selected_by_day ?? {}) };
    eligibleRows.forEach((row) => {
      const selectedTours = new Set(tourSelections[row.day] ?? []);
      if (selected) selectedTours.add(row.site.id);
      else selectedTours.delete(row.site.id);
      tourSelections[row.day] = [...selectedTours];
    });
    set({ entrance_tour_selected_by_day: tourSelections });
  };

  const setEntrancePrice = (
    row: (typeof eligibleRows)[number],
    selected: boolean,
  ) => {
    if (selectedRate(row.site) <= 0 || !isTourSelected(row)) return;
    const line = row.line ?? makeEntranceLine(row.site, row.day);
    const entrances = row.line ? draft.entrances : [...draft.entrances, line];
    const rateSelections = { ...(draft.entrance_rate_selection_by_day ?? {}) };
    const byCategory = {
      indian: [],
      foreign: [],
      student: [],
      ...(rateSelections[row.day] ?? {}),
    } as Record<EntranceCat, string[]>;
    const current = new Set(byCategory[traveller] ?? []);
    if (selected) current.add(line.id);
    else current.delete(line.id);
    byCategory[traveller] = [...current];
    rateSelections[row.day] = byCategory;

    const tourSelections = { ...(draft.entrance_tour_selected_by_day ?? {}) };
    const selectedTours = new Set(tourSelections[row.day] ?? [row.site.id]);
    selectedTours.add(row.site.id);
    tourSelections[row.day] = [...selectedTours];

    const costingSelection = { ...(draft.costing_selection ?? {}) };
    const entrancePicks = { ...(costingSelection.entrances ?? {}) };
    const categoryPicks = { ...(costingSelection.entrance_cats ?? {}) };
    categoryPicks[row.day] = Array.from(
      new Set([...(categoryPicks[row.day] ?? []), traveller]),
    );
    costingSelection.entrance_cats = categoryPicks;
    entrancePicks[row.day] = idsInCategorySelections(byCategory);
    costingSelection.entrances = entrancePicks;

    set({
      entrances,
      entrance_tour_selected_by_day: tourSelections,
      entrance_rate_selection_by_day: rateSelections,
      costing_selection: costingSelection,
    });
  };

  const setAllEntrancePrices = (selected: boolean) => {
    const entrances = [...draft.entrances];
    const rateSelections = { ...(draft.entrance_rate_selection_by_day ?? {}) };
    const costingSelection = { ...(draft.costing_selection ?? {}) };
    const entrancePicks = { ...(costingSelection.entrances ?? {}) };
    const categoryPicks = { ...(costingSelection.entrance_cats ?? {}) };
    selectablePricedRows.forEach((row) => {
      const routeDay = row.day;
      const existingLine = entrances.find(
        (line) =>
          line.site_id === row.site.id &&
          (line.from_routing_days ?? []).includes(routeDay),
      );
      let line = existingLine;
      if (selected && selectedRate(row.site) > 0 && !line) {
        line = makeEntranceLine(row.site, routeDay);
        entrances.push(line);
      }
      if (!line) return;

      const storedSelections = rateSelections[routeDay];
      const byCategory: Record<EntranceCat, string[]> = {
        indian:
          storedSelections?.indian ??
          (line && isPicked(draft, "entrances", routeDay, line.id) && catPicked(draft, routeDay, "indian")
            ? [line.id]
            : []),
        foreign:
          storedSelections?.foreign ??
          (line && isPicked(draft, "entrances", routeDay, line.id) && catPicked(draft, routeDay, "foreign")
            ? [line.id]
            : []),
        student:
          storedSelections?.student ??
          (line && isPicked(draft, "entrances", routeDay, line.id) && catPicked(draft, routeDay, "student")
            ? [line.id]
            : []),
      };
      const activeCategoryIds = new Set(byCategory[traveller]);
      if (selected) activeCategoryIds.add(line.id);
      else activeCategoryIds.delete(line.id);
      byCategory[traveller] = [...activeCategoryIds];
      rateSelections[routeDay] = byCategory;
      entrancePicks[routeDay] = idsInCategorySelections(byCategory);
      if (selected && selectedRate(row.site) > 0)
        categoryPicks[routeDay] = Array.from(
          new Set([...(categoryPicks[routeDay] ?? []), traveller]),
        );
    });
    costingSelection.entrances = entrancePicks;
    costingSelection.entrance_cats = categoryPicks;
    set({
      entrances,
      entrance_rate_selection_by_day: rateSelections,
      costing_selection: costingSelection,
    });
  };
  const includedBase = includedRows.reduce((sum, row) => sum + selectedRate(row.site), 0);
  const includedCommercial = applyLandCommercials(draft, includedBase, 0.05);
  const optionalBase = optionalRows.reduce((sum, row) => sum + selectedRate(row.site), 0);
  const optionalCommercial = applyLandCommercials(draft, optionalBase, 0.05);
  const invalidLines = draft.entrances.filter(
    (line) =>
      !isSelectedLandServiceValid("entrance", line.site_id, line.from_routing_days?.[0], draft, db),
  );

  const sheet = (
    title: string,
    rows: typeof eligibleRows,
    empty: string,
    included: boolean,
  ) => (
    <Card className="overflow-hidden">
      <div className="border-b bg-muted/20 p-3 text-sm font-semibold">{title}</div>
      {(
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-muted/10 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Entrance / Tour</th>
                <th className="p-2 text-left">City</th>
                <th className="p-2 text-left">Category</th>
                <th className="p-2 text-right">Base Rate PP</th>
                <th className="p-2 text-right">Markup</th>
                <th className="p-2 text-right">GST 5%</th>
                <th className="p-2 text-right">{included ? "Final PP" : "Selling Price PP"}</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="p-4 text-center italic text-muted-foreground">
                    {empty}
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const base = selectedRate(row.site);
                const commercial = applyLandCommercials(draft, base, 0.05);
                return (
                  <tr key={`${row.day}-${row.site.id}`} className="border-t">
                    <td className="p-2 font-medium">
                      {row.site.site_name}
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        Day {row.day} · {row.tour}
                      </span>
                    </td>
                    <td className="p-2">{row.city}</td>
                    <td className="p-2 capitalize">{traveller === "foreign" ? "Foreigner" : traveller}</td>
                    <td className="p-2 text-right">{base > 0 ? inr(base) : "Rate Not Configured"}</td>
                    <td className="p-2 text-right">{base > 0 ? inr(commercial.markup) : "—"}</td>
                    <td className="p-2 text-right">{base > 0 ? inr(commercial.gst) : "—"}</td>
                    <td className="p-2 text-right font-semibold">
                      {base > 0 ? inr(commercial.final) : "Rate Not Configured"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className={`border-t font-semibold ${included ? "bg-green-50" : "bg-amber-50"}`}>
                <tr>
                  <td colSpan={3} className="p-2">
                    {included ? "Included" : "Optional"} Entrance Total Per Person
                  </td>
                  <td className="p-2 text-right">{inr((included ? includedCommercial : optionalCommercial).base)}</td>
                  <td className="p-2 text-right">{inr((included ? includedCommercial : optionalCommercial).markup)}</td>
                  <td className="p-2 text-right">{inr((included ? includedCommercial : optionalCommercial).gst)}</td>
                  <td className="p-2 text-right">{inr((included ? includedCommercial : optionalCommercial).final)}</td>
                </tr>
              </tfoot>
          </table>
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Entrance Fees</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Entrance Costing For:</span>
          <div className="flex rounded-md border p-0.5">
            {(["indian", "foreign", "student"] as EntranceCat[]).map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => set({ entrance_traveller_category: category })}
                className={`rounded px-3 py-1 text-xs capitalize ${
                  traveller === category
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {category === "foreign" ? "Foreigner" : category}
              </button>
            ))}
          </div>
          <Badge variant="secondary" className="text-[10px]">
            Pax: {paxRange ? `${paxRange.min}–${paxRange.max}` : totalPax}
          </Badge>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#E5E7EB] bg-white">
        <table className="w-full min-w-225 table-fixed border-collapse text-xs">
          <colgroup>
            <col style={{ width: "8%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "40%" }} />
            <col style={{ width: "15%" }} />
          </colgroup>
          <thead className="bg-[#F3F4F6] text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-[#E5E7EB]">
              <th className="p-2 text-left">Day</th>
              <th className="p-2 text-left">Route</th>
              <th className="p-2 text-left">City</th>
              <th className="p-2 text-left">
                <div>Tour / Entrance</div>
                <label className="mt-1 flex items-center gap-1 normal-case">
                  <Checkbox
                    checked={tourHeaderState}
                    disabled={eligibleRows.length === 0}
                    onCheckedChange={(checked) => setAllTours(checked === true)}
                    aria-label="Select All Tours"
                  />
                  <span>Select All Tours</span>
                </label>
              </th>
              <th className="p-2 text-right">
                <div>{categoryLabel}</div>
                <label className="mt-1 flex items-center justify-end gap-1 normal-case">
                  <Checkbox
                    checked={activePriceHeaderState}
                    disabled={selectablePricedRows.length === 0}
                    onCheckedChange={(checked) => setAllEntrancePrices(checked === true)}
                    aria-label={`Select All ${categoryLabel} prices`}
                  />
                  <span>Select All</span>
                </label>
              </th>
            </tr>
          </thead>
          <tbody>
            {dayData.map((day) => {
              const rows = day.rows;
              if (!rows.length)
                return (
                  <tr key={day.route.day} className="border-b border-[#E5E7EB]">
                    <td className="p-2 font-semibold">Day {day.route.day}</td>
                    <td className="p-2 text-[11px] text-muted-foreground">{day.routeLabel}</td>
                    <td colSpan={2} className="p-2 italic text-muted-foreground">
                      {(day.route.is_day_zero || day.route.day === 0) &&
                      landDayContext(draft, day.route, db).selectedTours.length === 0
                        ? "No sightseeing tours selected for Day 0."
                        : "No entrance sites are mapped to this day's selected tours."}
                    </td>
                    <td className="p-2 text-right text-muted-foreground">—</td>
                  </tr>
                );
              return rows.map((row, rowIndex) => {
                const activeRate = selectedRate(row.site);
                const selected = isPriceSelected({
                  ...row,
                  day: day.route.day,
                  routeLabel: day.routeLabel,
                });
                const tourSelected = isTourSelected({
                  ...row,
                  day: day.route.day,
                  routeLabel: day.routeLabel,
                });
                return (
                  <tr
                    key={`${day.route.day}-${row.site.id}`}
                    className="border-b border-[#E5E7EB] align-top"
                  >
                    {rowIndex === 0 && (
                      <td rowSpan={rows.length} className="p-2 font-semibold">
                        Day {day.route.day}
                      </td>
                    )}
                    {rowIndex === 0 && (
                      <td
                        rowSpan={rows.length}
                        className="p-2 text-[11px] text-muted-foreground"
                      >
                        {day.routeLabel}
                      </td>
                    )}
                    <td className="p-2 text-[11px] text-muted-foreground">{row.city}</td>
                    <td className="p-2">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1 shrink-0"
                          checked={tourSelected}
                          onChange={(event) =>
                            setTourStatus(
                              { ...row, day: day.route.day, routeLabel: day.routeLabel },
                              event.target.checked,
                            )
                          }
                          aria-label={`Select ${row.tour}`}
                        />
                        <div className="min-w-0">
                          <div className="line-clamp-2 wrap-break-word text-sm font-medium">
                            {row.tour}
                          </div>
                          {row.site.site_name !== row.tour && (
                            <div className="text-[10px] text-muted-foreground">
                              {row.site.site_name}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-2 text-right font-semibold tabular-nums">
                      {activeRate > 0 ? <label className="inline-flex items-center justify-end gap-1">
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={!tourSelected}
                          onChange={(event) =>
                            setEntrancePrice(
                              { ...row, day: day.route.day, routeLabel: day.routeLabel },
                              event.target.checked,
                            )
                          }
                          aria-label={`Include ${categoryLabel} entrance rate for ${row.tour}`}
                        />
                        <span className="text-foreground">{inr(activeRate)}</span>
                      </label> : <span className="text-amber-700">Rate Not Configured</span>}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      {sheet("Included Entrances — Per Person Costing", includedRows, "No entrances included.", true)}
      {sheet("Optional Entrances — For Additional Sale", optionalRows, "No optional entrances for the current routing.", false)}

      {invalidLines.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50 p-3">
          <div className="text-xs font-semibold text-amber-800">Not applicable to current routing</div>
          {invalidLines.map((line) => (
            <div key={line.id} className="mt-2 text-xs">
              {db.entrance_sites.find((site) => site.id === line.site_id)?.site_name || line.custom_name || "Historical entrance"} — excluded from costing
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
