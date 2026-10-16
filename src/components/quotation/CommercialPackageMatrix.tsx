import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import { getQuotationScope } from "@/lib/query-for";
import { buildRateSheet, type RateSheetRow } from "@/lib/wizard/costsheet";
import type { HotelOption, QuoteDraft } from "@/lib/wizard/types";

type SetDraft = (patch: Partial<QuoteDraft>) => void;
type MatrixRow = { key: string; groupKey: string; row: RateSheetRow };

export function CommercialPackageMatrix({ draft, set }: { draft: QuoteDraft; set: SetDraft }) {
  const db = useDB();
  const scope = getQuotationScope(draft.query_for, draft.commercial_mode);
  // The matrix display mode is independent from the Accommodation editor's
  // saved allocation mode. This phase intentionally implements Standard only.
  const matrixMode = "standard" as const;
  const standardPricingDraft = useMemo<QuoteDraft>(
    () => ({ ...draft, allocation_mode: "standard", dynamic_days: [] }),
    [draft],
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
  const optionRow = (optionKey: string, matrixRow: MatrixRow) =>
    sheets
      .find((sheet) => sheet.option.key === optionKey)
      ?.groups.find((group) => (group.line_id ?? group.vehicle) === matrixRow.groupKey)
      ?.rows.find((row) => row.pax === matrixRow.row.pax);
  const vehicleLabel = (matrixRow: MatrixRow) => {
    const transportOption = draft.transport_options?.find(
      (option) => option.id === matrixRow.groupKey,
    );
    if (!transportOption) return matrixRow.row.vehicle;
    const parts = transportOption.vehicles.flatMap((selection) => {
      const line = draft.transport.find((item) => item.id === selection.transport_line_id);
      const vehicle = line
        ? db.travel_options.find((item) => item.id === line.travel_id)?.vehicle_type
        : undefined;
      const quantity = Math.max(1, selection.quantity || 1);
      return vehicle ? [`${quantity} ${vehicle}`] : [];
    });
    return parts.length ? parts.join(" + ") : matrixRow.row.vehicle;
  };
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">4. Commercial Package Matrix</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Transport variation × actual Pax → common Land Cost PP → option-wise Lunch, Dinner,
            Accommodation and Package Price PP
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="pointer-events-none">
            Standard Hotel Mode
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
          Add a valid transport variation and completed standard accommodation option to generate
          commercial matrix rows.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1750px] w-full border-separate border-spacing-0 border-l border-t border-slate-200 text-xs [&_td]:border-b [&_td]:border-r [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-2 [&_th]:border-b [&_th]:border-r [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-2">
              <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr className="bg-slate-100">
                  <th rowSpan={3} className="bg-slate-100 text-center">
                    Select
                  </th>
                  <th rowSpan={3} className="min-w-56 text-left">
                    <span className="block font-semibold">Vehicle / Combination</span>
                    <span className="mt-0.5 block text-[9px] font-normal normal-case tracking-normal text-muted-foreground">
                      Transport Variations
                    </span>
                  </th>
                  <th rowSpan={3} className="p-2 text-right">
                    Pax
                  </th>
                  <th colSpan={6} className="bg-blue-50 p-2 text-center text-blue-900">
                    Land Part · Per Person
                  </th>
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
                  {["Transport", "Entrance", "Guide", "Activities", "Misc", "Land Total"].map(
                    (label) => (
                      <th key={label} rowSpan={2} className="p-2 text-right">
                        {label}
                      </th>
                    ),
                  )}
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
                          Package Price · PP
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
                {rows.map((matrixRow) => {
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
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={isSelected(matrixRow)}
                          onChange={(event) => setRows([matrixRow], event.target.checked)}
                        />
                      </td>
                      <td className="whitespace-normal font-medium leading-snug">
                        {vehicleLabel(matrixRow)}
                      </td>
                      <td className="p-2 text-right font-medium">{land.pax}</td>
                      {[
                        land.transport,
                        land.entrances,
                        land.guide + land.escort,
                        land.activities,
                        land.misc,
                        landTotal,
                      ].map((value, index) => (
                        <td key={index} className="p-2 text-right tabular-nums">
                          {inr(value)}
                        </td>
                      ))}
                      {options
                        .filter((option) => scope.accommodationPart)
                        .map((option) => {
                          const value = optionRow(option.key, matrixRow);
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
        Standard: common Land PP + option Lunch PP + Dinner PP + relevant SGL/DBL/TRP Accommodation
        PP. Dynamic accommodation matrix pricing is intentionally not included yet.
      </p>
    </div>
  );
}
