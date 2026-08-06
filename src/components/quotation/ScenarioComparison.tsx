// Multi-scenario comparison block for the Costing step.
// A scenario = one Accommodation Option (hotel category) + one Transport
// vehicle + every other add-on, rendered as a per-person line-by-line cost.
import { useMemo } from "react";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import { computeScenario, type ScenarioResult } from "@/lib/wizard/scenario";
import { transportLineTotal } from "@/lib/wizard/calc";
import type { QuoteDraft, CostScenario, OptionKey } from "@/lib/wizard/types";
import { uid } from "../shared";

export function ScenarioComparison({
  draft, set,
}: { draft: QuoteDraft; set: (p: Partial<QuoteDraft>) => void }) {
  const d = useDB();
  const scenarios = draft.scenarios ?? [];

  const vehicleLabel = (lineId?: string) => {
    const line = draft.transport.find((t) => t.id === lineId);
    if (!line) return "All vehicles";
    const v = d.travel_options.find((x) => x.id === line.travel_id);
    return v?.vehicle_type || "Vehicle";
  };

  const results = useMemo(
    () => scenarios
      .map((s) => computeScenario(draft, s, d))
      .filter(Boolean) as ScenarioResult[],
    [scenarios, draft, d],
  );

  const patch = (id: string, p: Partial<CostScenario>) =>
    set({ scenarios: scenarios.map((s) => (s.id === id ? { ...s, ...p } : s)) });

  const addScenario = () => {
    const optKey = (draft.hotel_options[0]?.key || "A") as OptionKey;
    const line = draft.transport[0];
    set({
      scenarios: [...scenarios, {
        id: uid(),
        label: `Scenario ${scenarios.length + 1}`,
        option_key: optKey,
        transport_line_id: line?.id,
      }],
    });
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="section-label">Scenario Comparison (per person)</div>
          <div className="text-xs text-muted-foreground">
            Pick a Hotel Category + Vehicle combination — every other cost line is pulled in automatically.
          </div>
        </div>
        <Button size="sm" onClick={addScenario} disabled={draft.hotel_options.length === 0}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Scenario
        </Button>
      </div>

      {scenarios.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No scenarios yet. Add one to compare a hotel category and vehicle combination end-to-end.
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {scenarios.map((s) => {
          const res = results.find((r) => r.id === s.id);
          return (
            <Card key={s.id} className="p-3 space-y-3 border-primary/30">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-primary">
                  {s.label}
                  {res && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {res.option_label} + {res.vehicle_label} · {res.pax} pax
                    </span>
                  )}
                </div>
                <Button size="icon" variant="ghost"
                  onClick={() => set({ scenarios: scenarios.filter((x) => x.id !== s.id) })}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">Hotel Category</Label>
                  <Select value={s.option_key} onValueChange={(v) => patch(s.id, { option_key: v as OptionKey })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {draft.hotel_options.map((o) => (
                        <SelectItem key={o.key} value={o.key}>
                          Option {o.key} · {o.category || o.label || "—"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px]">Vehicle</Label>
                  <Select value={s.transport_line_id ?? "__all"}
                    onValueChange={(v) => patch(s.id, { transport_line_id: v === "__all" ? undefined : v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">All vehicles</SelectItem>
                      {draft.transport.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {vehicleLabel(t.id)} · {inr(transportLineTotal(t))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!res ? (
                <p className="text-xs text-muted-foreground">Select a hotel option to cost this scenario.</p>
              ) : (
                <>
                  {res.rate_missing > 0 && (
                    <div className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {res.rate_missing} night(s) missing a rate
                    </div>
                  )}
                  <ScenarioBreakdown res={res} markup={draft.markup_percent} />
                </>
              )}
            </Card>
          );
        })}
      </div>

      {results.length > 1 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-2">Scenario</th>
                {results.map((r) => (
                  <th key={r.id} className="text-right p-2">{r.option_label} + {r.vehicle_label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="p-2">Average per person</td>
                {results.map((r) => <td key={r.id} className="p-2 text-right tabular-nums">{inr(r.per_person_avg)}</td>)}
              </tr>
              <tr className="border-t bg-primary/5 font-bold">
                <td className="p-2">Grand Total ({results[0].pax} pax)</td>
                {results.map((r) => <td key={r.id} className="p-2 text-right tabular-nums">{inr(r.grand_total)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ScenarioBreakdown({ res, markup }: { res: ScenarioResult; markup: number }) {
  const uniform = res.persons.length > 0 &&
    res.persons.every((p) => Math.abs(p.total - res.persons[0].total) < 0.5);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 uppercase text-[10px] text-muted-foreground">
            <tr>
              <th className="text-left p-1.5">Line</th>
              {res.persons.map((p) => (
                <th key={p.person_id} className="text-right p-1.5">{p.label}</th>
              ))}
              <th className="text-right p-1.5">Group</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Room Type" res={res} render={(p) => <span className="text-[10px] text-muted-foreground">{p.room_label}</span>} group="" />
            <Num label="Hotel (rooms + GST)" res={res} f={(p) => p.hotel_total} group={res.hotel_total} />
            <Num label="Transport" res={res} f={(p) => p.transport} group={res.transport_total} />
            <Num label="Guide" res={res} f={(p) => p.guide} group={res.guide_total} />
            <Num label="Activities" res={res} f={(p) => p.activities} group={res.activities_total} />
            <Num label="Entrances" res={res} f={(p) => p.entrances} group={res.entrances_total} />
            <Num label="Miscellaneous" res={res} f={(p) => p.misc} group={res.misc_total} />
            <Num label="Meals" res={res} f={(p) => p.meals} group={res.meals_total} />
            {res.optionals_total > 0 && (
              <Num label="Optionals" res={res} f={(p) => p.optionals} group={res.optionals_total} />
            )}
            <Num label="Subtotal" res={res} f={(p) => p.subtotal} group={res.persons.reduce((s, p) => s + p.subtotal, 0)} bold />
            <Num label={`Markup ${markup}%`} res={res} f={(p) => p.markup} group={res.markup_total} />
            <Num label="GST 5%" res={res} f={(p) => p.gst5} group={res.gst5_total} />
            <Num label="TOTAL PER PERSON" res={res} f={(p) => p.total} group={res.grand_total} bold highlight />
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center bg-primary/5 rounded p-2">
        <span className="text-xs text-muted-foreground">
          {uniform ? "Per person" : "Average per person"} · {res.pax} pax
        </span>
        <span className="text-sm font-bold text-primary tabular-nums">
          {inr(res.per_person_avg)} <span className="text-xs font-normal text-muted-foreground">· Grand Total {inr(res.grand_total)}</span>
        </span>
      </div>
    </div>
  );
}

function Num({ label, res, f, group, bold, highlight }: {
  label: string; res: ScenarioResult; f: (p: ScenarioResult["persons"][number]) => number;
  group: number; bold?: boolean; highlight?: boolean;
}) {
  if (group === 0 && !bold) return null;
  return (
    <tr className={`border-t ${highlight ? "bg-primary/5" : ""} ${bold ? "font-semibold" : ""}`}>
      <td className="p-1.5">{label}</td>
      {res.persons.map((p) => (
        <td key={p.person_id} className="p-1.5 text-right tabular-nums">{inr(f(p))}</td>
      ))}
      <td className="p-1.5 text-right tabular-nums text-muted-foreground">{inr(group)}</td>
    </tr>
  );
}

function Row({ label, res, render, group }: {
  label: string; res: ScenarioResult;
  render: (p: ScenarioResult["persons"][number]) => React.ReactNode; group: React.ReactNode;
}) {
  return (
    <tr className="border-t">
      <td className="p-1.5">{label}</td>
      {res.persons.map((p) => <td key={p.person_id} className="p-1.5 text-right">{render(p)}</td>)}
      <td className="p-1.5 text-right">{group}</td>
    </tr>
  );
}
