import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { MarkupGstSettings } from "../MarkupGstSettings";
import { CostingSheet } from "../CostingSheet";
import { ScenarioComparison } from "../ScenarioComparison";
import { useDB } from "@/lib/mock-store";
import { buildRateSheet } from "@/lib/wizard/costsheet";
import type { CostScenario, OptionKey } from "@/lib/wizard/types";
import type { StepProps } from "../shared";

export function Step16({ draft, set }: StepProps) {
  const db = useDB();
  const includedKeys = draft.included_option_keys?.length
    ? draft.included_option_keys
    : draft.hotel_options.filter((option) => option.selections.some((item) => item.room_id)).map((option) => option.key);

  const toggleInclude = (key: OptionKey) => {
    const next = new Set(includedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    set({ included_option_keys: Array.from(next) as OptionKey[], scenarios: undefined });
  };

  // Build the expected category × vehicle comparison once. Users may still
  // remove or customise individual scenarios afterwards.
  useEffect(() => {
    if (draft.scenarios !== undefined) return;
    const options = draft.commercial_mode === "transport_only"
      ? draft.hotel_options.slice(0, 1)
      : draft.hotel_options.filter(
          (option) => includedKeys.includes(option.key) && option.selections.some((item) => item.room_id),
        );
    const vehicles = draft.transport.length ? draft.transport : [undefined];
    const scenarios: CostScenario[] = options.flatMap((option) =>
      vehicles.map((vehicle, index) => ({
        id: `scenario-${option.key}-${vehicle?.id ?? index}`,
        label: `${option.category || `Option ${option.key}`} · ${vehicle ? `Vehicle ${index + 1}` : "No transport"}`,
        option_key: option.key,
        transport_line_id: vehicle?.id,
      })),
    );
    set({ scenarios });
  }, [draft.scenarios, draft.hotel_options, draft.transport, draft.commercial_mode, includedKeys.join(",")]);

  // Exact-pax quotations carry their one applicable rate row by default.
  // Range quotations carry every row inside the requested range (and each
  // vehicle's configured capacity) unless the user deliberately unticks it.
  useEffect(() => {
    const options = draft.commercial_mode === "transport_only"
      ? draft.hotel_options.slice(0, 1)
      : draft.hotel_options.filter((option) => includedKeys.includes(option.key));
    const next: Record<string, number[]> = {};
    options.forEach((option) => {
      buildRateSheet(draft, db, option, draft.transport).forEach((group) => {
        const key = `${option.key}|${group.line_id ?? group.vehicle}`;
        const valid = group.rows.map((row) => row.pax);
        const existing = draft.rate_sheet_rows?.[key];
        next[key] = existing === undefined
          ? valid
          : existing.filter((pax) => valid.includes(pax));
      });
    });
    if (JSON.stringify(next) !== JSON.stringify(draft.rate_sheet_rows ?? {})) {
      set({ rate_sheet_rows: next });
    }
  }, [db, draft, includedKeys.join(",")]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Costing &amp; Package Variations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose what enters the package, apply commercial settings, then compare each hotel and
          vehicle combination independently at the Query's exact pax or requested range.
        </p>
      </div>

      <MarkupGstSettings draft={draft} set={set} />

      {draft.commercial_mode !== "transport_only" && <Card className="border-primary/20 bg-primary/[0.04] p-4">
        <div className="text-sm font-semibold text-primary">Accommodation options in this quote</div>
        <div className="mt-3 flex flex-wrap gap-3">
          {draft.hotel_options.map((option) => {
            const complete = option.selections.some((item) => item.room_id);
            const checked = includedKeys.includes(option.key);
            return (
              <label
                key={option.key}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? "border-primary bg-background" : "border-transparent bg-muted/40 opacity-60"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!complete}
                  onChange={() => toggleInclude(option.key)}
                />
                <span className="font-medium">Option {option.key}</span>
                <span className="text-xs text-muted-foreground">
                  {option.category || "Category pending"}{!complete ? " · incomplete" : ""}
                </span>
              </label>
            );
          })}
        </div>
      </Card>}

      <CostingSheet draft={draft} set={set} />
      <ScenarioComparison draft={draft} set={set} />

      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-900">
        Optional supplements are intentionally excluded here. Only checked land components, the
        selected accommodation option and one vehicle alternative enter each package scenario.
      </div>
    </div>
  );
}
