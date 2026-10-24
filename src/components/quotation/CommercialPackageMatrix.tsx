import { memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import { getQuotationScope } from "@/lib/query-for";
import { buildRateSheet, type RateSheetRow } from "@/lib/wizard/costsheet";
import type { HotelOption, LandReviewDisplaySelection, QuoteDraft } from "@/lib/wizard/types";

type SetDraft = (patch: Partial<QuoteDraft>) => void;
type MatrixRow = { key: string; groupKey: string; row: RateSheetRow };

function CommercialPackageMatrixImpl({
  draft,
  set,
  readOnly = false,
  displaySelection,
}: {
  draft: QuoteDraft;
  set: SetDraft;
  readOnly?: boolean;
  displaySelection?: LandReviewDisplaySelection;
}) {
  const db = useDB();
  const scope = getQuotationScope(draft.query_for, draft.commercial_mode);
  // The matrix display mode is independent from the Accommodation editor's
  // saved allocation mode. This phase intentionally implements Standard only.
  const matrixMode = "standard" as const;
  const standardPricingDraft = useMemo<QuoteDraft>(
    () => ({ ...draft, allocation_mode: "standard", dynamic_days: [] }),
    // Matrix row selection is display state, not a costing input. Listing the
    // pricing fields keeps checkbox clicks from rebuilding every rate sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      draft.routing,
      draft.transport,
      draft.transport_options,
      draft.guides,
      draft.entrances,
      draft.activities,
      draft.misc,
      draft.hotel_options,
      draft.meal_selections,
      draft.meal_selections_by_option,
      draft.costing_selection,
      draft.adults,
      draft.ss,
      draft.children,
      draft.pax_mode,
      draft.pax_min,
      draft.pax_max,
      draft.pax_range,
      draft.traveler_type,
      draft.group_room_mix,
      draft.markup_percent,
      draft.land_markup_percent,
      draft.land_gst_percent,
      draft.hotel_markup_percent,
      draft.hotel_gst_percent,
      draft.escort_enabled,
      draft.escort_pricing_mode,
      draft.escort_per_person_rate,
      draft.escort_ranges,
      draft.escort_day_rates_by_slab,
      draft.guide_day_escort,
      draft.guide_day_escort_enabled,
      draft.guide_reporting_by_pax,
      draft.guide_reporting_cost,
      draft.guide_reporting_cost_hindi,
      draft.guide_reporting_cost_english,
      draft.guide_reporting_cost_language,
      draft.guide_escort_reporting,
    ],
  );
  const options = useMemo<HotelOption[]>(() => {
    if (!scope.accommodationPart) return [{ key: "A", label: "Land Part", selections: [] }];
    return draft.hotel_options
      .filter((option) => option.selections.some((selection) => selection.room_id))
      .slice(0, 4);
  }, [draft.hotel_options, scope.accommodationPart]);
  const sheets = useMemo(
    () =>
      options.map((option) => ({
        option,
        groups: buildRateSheet(
          standardPricingDraft,
          db,
          option,
          scope.landPart ? draft.transport : [],
        ),
      })),
    [options, standardPricingDraft, db, scope.landPart, draft.transport],
  );
  const primary = sheets[0];
  const rows = useMemo<MatrixRow[]>(
    () =>
      (primary?.groups ?? []).flatMap((group) =>
        group.rows.map((row) => ({
          key: `${group.line_id ?? group.vehicle}|${row.pax}`,
          groupKey: group.line_id ?? group.vehicle,
          row,
        })),
      ),
    [primary],
  );
  const rowByOptionGroupPax = useMemo(() => {
    const lookup = new Map<string, RateSheetRow>();
    sheets.forEach(({ option, groups }) =>
      groups.forEach((group) =>
        group.rows.forEach((row) =>
          lookup.set(`${option.key}|${group.line_id ?? group.vehicle}|${row.pax}`, row),
        ),
      ),
    );
    return lookup;
  }, [sheets]);
  const vehicleLabelByGroup = useMemo(() => {
    const transportById = new Map(draft.transport.map((line) => [line.id, line]));
    const vehicleByTravelId = new Map(
      db.travel_options.map((item) => [item.id, item.vehicle_type]),
    );
    return new Map(
      rows.map((matrixRow) => {
        const transportOption = draft.transport_options?.find(
          (option) => option.id === matrixRow.groupKey,
        );
        const parts = transportOption?.vehicles.flatMap((selection) => {
          const line = transportById.get(selection.transport_line_id);
          const vehicle = line ? vehicleByTravelId.get(line.travel_id) : undefined;
          return vehicle ? [`${Math.max(1, selection.quantity || 1)} ${vehicle}`] : [];
        });
        return [
          matrixRow.groupKey,
          parts?.length ? parts.join(" + ") : matrixRow.row.vehicle,
        ] as const;
      }),
    );
  }, [rows, draft.transport_options, draft.transport, db.travel_options]);
  const isSelected = (matrixRow: MatrixRow) => {
    const key = `${options[0]?.key ?? "A"}|${matrixRow.groupKey}`;
    return (draft.rate_sheet_rows?.[key] ?? []).includes(matrixRow.row.pax);
  };
  const setRows = (target: MatrixRow[], selected: boolean) => {
    const next = { ...(draft.rate_sheet_rows ?? {}) };
    options.forEach((option) =>
      target.forEach((matrixRow) => {
        const key = `${option.key}|${matrixRow.groupKey}`;
        const values = new Set(next[key] ?? []);
        if (selected) values.add(matrixRow.row.pax);
        else values.delete(matrixRow.row.pax);
        next[key] = [...values].sort((a, b) => a - b);
      }),
    );
    set({ rate_sheet_rows: next });
  };
  const displayedRows = readOnly ? rows.filter(isSelected) : rows;
  const landMeals = scope.queryFor === "Land Part + Meals";
  const landOnly = scope.queryFor === "Land Part";
  const accommodationOnly = !scope.landPart && scope.accommodationPart;
  const landScoped = landOnly || landMeals;
  const showLunch = landMeals && rows.some(({ row }) => row.lunch > 0);
  const showDinner = landMeals && rows.some(({ row }) => row.dinner > 0);
  const showTransport = Boolean(displaySelection?.transport);
  const showGuideLanguages = Boolean(
    displaySelection?.guideIncluded &&
    (displaySelection.hindi || displaySelection.english || displaySelection.otherLanguage),
  );
  const showEscort = Boolean(displaySelection?.guideIncluded && displaySelection.escort);
  const showGuide = landScoped ? showGuideLanguages : showGuideLanguages || showEscort;
  const showEntrances = Boolean(
    displaySelection?.entranceIncluded &&
    (displaySelection.indian || displaySelection.foreign || displaySelection.student),
  );
  const showActivities = Boolean(displaySelection?.activities && displaySelection.activityIncluded);
  const showMisc = Boolean(displaySelection?.misc && displaySelection.miscIncluded);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {landMeals
              ? "4. Commercial Matrix"
              : landOnly
                ? "3. Land Commercial Matrix"
                : accommodationOnly
                  ? "3. Accommodation Commercial Matrix"
                  : "4. Commercial Package Matrix"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {landMeals
              ? "Transport variation × actual Pax → Land Total PP + selected Lunch/Dinner PP → Final Land + Meals Price PP"
              : landOnly
                ? "Transport variation × actual Pax → selected Land components → Final Land Price PP"
                : accommodationOnly
                  ? "Actual Pax → option-wise selected meals, accommodation and Final Accommodation + Meals Price PP"
                  : "Transport variation × actual Pax → common Land Cost PP → option-wise Lunch, Dinner, Accommodation and Package Price PP"}
          </p>
        </div>
        <div className={readOnly ? "hidden" : "flex flex-wrap gap-2"}>
          <Button size="sm" className="pointer-events-none">
            {landMeals ? "Land + Meals Mode" : landOnly ? "Land Only Mode" : "Standard Hotel Mode"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setRows(
                rows.filter((row) => row.row.pax === Math.max(...rows.map((item) => item.row.pax))),
                true,
              )
            }
            disabled={!rows.length}
          >
            Select Threshold Rows
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRows(rows, true)}
            disabled={!rows.length}
          >
            Select All
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRows(rows, false)}
            disabled={!rows.length}
          >
            Clear
          </Button>
        </div>
      </div>

      {matrixMode === "standard" && !rows.length ? (
        <Card className="p-5 text-sm text-muted-foreground">
          {landScoped
            ? "Add a valid transport variation to generate Land commercial matrix rows."
            : accommodationOnly
              ? "Add a completed standard accommodation option to generate accommodation commercial matrix rows."
              : "Add a valid transport variation and completed standard accommodation option to generate commercial matrix rows."}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table
              className={`${landScoped || accommodationOnly ? "min-w-[1100px]" : "min-w-[1750px]"} w-full border-separate border-spacing-0 border-l border-t border-slate-200 text-xs [&_td]:border-b [&_td]:border-r [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-2 [&_th]:border-b [&_th]:border-r [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-2`}
            >
              <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr className="bg-slate-100">
                  {!readOnly && (
                    <th rowSpan={3} className="bg-slate-100 text-center">
                      Select
                    </th>
                  )}
                  {!accommodationOnly && (
                    <th rowSpan={3} className="min-w-56 text-left">
                      <span className="block font-semibold">Vehicle / Combination</span>
                      <span className="mt-0.5 block text-[9px] font-normal normal-case tracking-normal text-muted-foreground">
                        Transport Variations
                      </span>
                    </th>
                  )}
                  <th rowSpan={3} className="p-2 text-right">
                    Pax
                  </th>
                  {!accommodationOnly && (
                    <th
                      colSpan={landScoped && showEscort ? 7 : 6}
                      className="bg-blue-50 p-2 text-center text-blue-900"
                    >
                      Land Part · Per Person
                    </th>
                  )}
                  {landMeals && showLunch && (
                    <th rowSpan={3} className="bg-amber-50 text-right">
                      Lunch PP
                    </th>
                  )}
                  {landMeals && showDinner && (
                    <th rowSpan={3} className="bg-amber-50 text-right">
                      Dinner PP
                    </th>
                  )}
                  {landMeals && (
                    <th rowSpan={3} className="bg-emerald-50 text-right text-emerald-900">
                      Final Land + Meals Price PP
                    </th>
                  )}
                  {options
                    .filter((option) => scope.accommodationPart)
                    .map((option) => (
                      <th
                        key={option.key}
                        colSpan={8}
                        className="bg-emerald-50 p-2 text-center text-emerald-900"
                      >
                        Option {option.key} - {option.category || option.label || "Accommodation"}
                      </th>
                    ))}
                </tr>
                <tr className="bg-slate-50">
                  {!accommodationOnly &&
                    [
                      "Transport",
                      "Entrance",
                      "Guide",
                      ...(landScoped && showEscort ? ["Escort"] : []),
                      "Activities",
                      "Misc",
                      "Land Total",
                    ].map((label) => (
                      <th key={label} rowSpan={2} className="p-2 text-right">
                        {label}
                      </th>
                    ))}
                  {options
                    .filter((option) => scope.accommodationPart)
                    .map((option) => (
                      <>
                        <th
                          key={`${option.key}-meals`}
                          colSpan={2}
                          className="bg-amber-50 p-2 text-center"
                        >
                          Meals · PP
                        </th>
                        <th
                          key={`${option.key}-accommodation`}
                          colSpan={3}
                          className="bg-indigo-50 p-2 text-center"
                        >
                          Accommodation · PP
                        </th>
                        <th
                          key={`${option.key}-package`}
                          colSpan={3}
                          className="bg-emerald-50 p-2 text-center"
                        >
                          {accommodationOnly
                            ? "Final Accommodation + Meals Price · PP"
                            : "Package Price · PP"}
                        </th>
                      </>
                    ))}
                </tr>
                <tr className="bg-slate-50">
                  {options
                    .filter((option) => scope.accommodationPart)
                    .flatMap((option) =>
                      ["Lunch", "Dinner", "SGL", "DBL", "TRP", "SGL", "DBL", "TRP"].map((label) => (
                        <th key={`${option.key}-${label}`} className="p-2 text-right">
                          {label}
                        </th>
                      )),
                    )}
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((matrixRow) => {
                  const land = matrixRow.row;
                  const landTotal =
                    land.transport +
                    land.entrances +
                    land.guide +
                    land.escort +
                    land.activities +
                    land.misc;
                  return (
                    <tr
                      key={matrixRow.key}
                      className={isSelected(matrixRow) ? "bg-primary/5" : "hover:bg-muted/30"}
                    >
                      {!readOnly && (
                        <td className="text-center">
                          <input
                            type="checkbox"
                            checked={isSelected(matrixRow)}
                            onChange={(event) => setRows([matrixRow], event.target.checked)}
                          />
                        </td>
                      )}
                      {!accommodationOnly && (
                        <td className="whitespace-normal font-medium leading-snug">
                          {vehicleLabelByGroup.get(matrixRow.groupKey)}
                        </td>
                      )}
                      <td className="p-2 text-right font-medium">{land.pax}</td>
                      {!accommodationOnly &&
                        [
                          showTransport ? land.transport : undefined,
                          showEntrances ? land.entrances : undefined,
                          showGuide
                            ? landScoped
                              ? land.guide
                              : land.guide + land.escort
                            : undefined,
                          ...(landScoped && showEscort ? [land.escort] : []),
                          showActivities ? land.activities : undefined,
                          showMisc ? land.misc : undefined,
                          landTotal,
                        ].map((value, index) => (
                          <td key={index} className="p-2 text-right tabular-nums">
                            {value == null ? "—" : inr(value)}
                          </td>
                        ))}
                      {landMeals && showLunch && (
                        <td className="bg-amber-50 text-right tabular-nums">{inr(land.lunch)}</td>
                      )}
                      {landMeals && showDinner && (
                        <td className="bg-amber-50 text-right tabular-nums">{inr(land.dinner)}</td>
                      )}
                      {landMeals && (
                        <td className="bg-emerald-50 text-right font-semibold tabular-nums">
                          {inr(landTotal + land.lunch + land.dinner)}
                        </td>
                      )}
                      {options
                        .filter((option) => scope.accommodationPart)
                        .map((option) => {
                          const value = rowByOptionGroupPax.get(
                            `${option.key}|${matrixRow.groupKey}|${matrixRow.row.pax}`,
                          );
                          return value ? (
                            <>
                              <td className="p-2 text-right tabular-nums">{inr(value.lunch)}</td>
                              <td className="p-2 text-right tabular-nums">{inr(value.dinner)}</td>
                              <td className="p-2 text-right tabular-nums">{inr(value.single)}</td>
                              <td className="p-2 text-right tabular-nums">{inr(value.double)}</td>
                              <td className="p-2 text-right tabular-nums">{inr(value.triple)}</td>
                              <td className="p-2 text-right font-semibold tabular-nums">
                                {inr(value.pkg_single)}
                              </td>
                              <td className="p-2 text-right font-semibold tabular-nums">
                                {inr(value.pkg_double)}
                              </td>
                              <td className="p-2 text-right font-semibold tabular-nums">
                                {inr(value.pkg_triple)}
                              </td>
                            </>
                          ) : (
                            <td colSpan={8} className="p-2 text-center text-muted-foreground">
                              Not available
                            </td>
                          );
                        })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        {landMeals
          ? "Land + Meals: final Land PP plus explicitly selected Lunch and Dinner PP. Accommodation and optional activities are excluded."
          : landOnly
            ? "Land Part: selected land services only. Accommodation, hotel meals and room pricing are excluded."
            : accommodationOnly
              ? "Accommodation Part: selected hotel rooms and meals only. Land services are excluded."
              : "Standard: common Land PP + option Lunch PP + Dinner PP + relevant SGL/DBL/TRP Accommodation PP. Dynamic accommodation matrix pricing is intentionally not included yet."}
      </p>
    </div>
  );
}

export const CommercialPackageMatrix = memo(
  CommercialPackageMatrixImpl,
  (previous, next) =>
    previous.draft === next.draft &&
    previous.readOnly === next.readOnly &&
    previous.displaySelection === next.displaySelection,
);
