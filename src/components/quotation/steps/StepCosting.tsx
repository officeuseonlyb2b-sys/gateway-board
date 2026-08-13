// Extracted verbatim from src/routes/_authenticated/costing.tsx (Step 16 UI — Costing).
import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import {
  computeOption, totalPax, effectivePaxForPricing, transportLineTotal,
  optionUsesCustomAllocation, isGroupTour, autoDoubleMix, autoTripleMix,
  mixCoversPax, mixLabel, computeGroupOption,
  type OptionTotals, type GroupOptionTotals,
} from "@/lib/wizard/calc";
import type { QuoteDraft, HotelOption, OptionKey } from "@/lib/wizard/types";
import { OptionPerPersonPreview } from "./StepHotels";
import { PerPersonSummaryBlock } from "./StepFinal";
import { ScenarioComparison } from "../ScenarioComparison";
import { CostingSheet } from "../CostingSheet";
import { MarkupGstSettings } from "../MarkupGstSettings";
import type { StepProps } from "../shared";


export function Step16({ draft, set }: StepProps) {
  const d = useDB();
  const includedKeys = draft.included_option_keys && draft.included_option_keys.length
    ? draft.included_option_keys
    : draft.hotel_options.map((o) => o.key);

  const toggleInclude = (key: OptionKey) => {
    const current = new Set(includedKeys);
    if (current.has(key)) current.delete(key); else current.add(key);
    set({ included_option_keys: Array.from(current) as OptionKey[] });
  };

  const includedOptions = draft.hotel_options.filter((o) => includedKeys.includes(o.key));
  const totals = useMemo(
    () => includedOptions.map((o) => computeOption(draft, o, d)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, d, includedKeys.join(",")],
  );


  const addonBreakdown = useMemo(() => {
    const transport = draft.transport.reduce((s, l) => s + transportLineTotal(l), 0);
    const activities = draft.activities.reduce((s, l) => s + l.rate * l.qty, 0);
    const entrances = draft.entrances.reduce(
      (s, l) => s + l.indian_pax * l.indian_rate + l.foreign_pax * l.foreign_rate, 0);
    const guides = draft.guides.reduce((s, l) => s + l.rate * l.guides * l.days, 0);
    const misc = draft.misc.reduce((s, l) => s + l.rate * l.qty, 0);
    const optionals = draft.optionals.reduce((s, l) => s + l.rate * l.qty, 0);
    return { transport, activities, entrances, guides, misc, optionals };
  }, [draft]);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Costing Variations</h2>

      <MarkupGstSettings draft={draft} set={set} />


      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="text-sm font-semibold text-primary mb-2">Include Options in Final Quote</div>
        <div className="flex flex-wrap gap-4">
          {draft.hotel_options.map((o) => {
            const checked = includedKeys.includes(o.key);
            const hasSelections = o.selections.some((s) => s.room_id);
            return (
              <label key={o.key} className={`flex items-center gap-2 px-3 py-1.5 rounded border cursor-pointer ${checked ? "bg-white border-primary" : "bg-muted/30 border-transparent opacity-60"}`}>
                <input type="checkbox" checked={checked} onChange={() => toggleInclude(o.key)} disabled={!hasSelections} />
                <span className="text-sm font-medium">Option {o.key}</span>
                <span className="text-xs text-muted-foreground">{o.category || "—"}{!hasSelections && " · empty"}</span>
              </label>
            );
          })}
        </div>
        <div className="text-xs text-muted-foreground mt-2">Only selected options appear in the comparison and final quote.</div>
      </Card>

      <CostingSheet draft={draft} set={set} />

      {includedOptions.filter((o) => optionUsesCustomAllocation(o)).map((o) => (
        <OptionPerPersonPreview key={`alloc-${o.key}`} draft={draft} option={o} />
      ))}

      {totals.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Select at least one option above to see the comparison.</Card>
      ) : (

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-2">Line</th>
              {totals.map((t) => (
                <th key={t.key} className="text-right p-2">Option {t.key} · {t.label || "—"}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["Room Cost (Net) DBL", (t: OptionTotals) => t.room_net_dbl],
              ["GST on Rooms DBL", (t: OptionTotals) => t.gst_rooms_dbl],
            ].map(([label, fn], i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{label as string}</td>
                {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr((fn as any)(t))}</td>)}
              </tr>
            ))}
            {addonBreakdown.transport > 0 && (
              <tr className="border-t text-xs text-muted-foreground">
                <td className="p-2 pl-6">↳ Transport</td>
                {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(addonBreakdown.transport)}</td>)}
              </tr>
            )}
            {addonBreakdown.guides > 0 && (
              <tr className="text-xs text-muted-foreground">
                <td className="p-2 pl-6">↳ Guide</td>
                {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(addonBreakdown.guides)}</td>)}
              </tr>
            )}
            {addonBreakdown.activities > 0 && (
              <tr className="text-xs text-muted-foreground">
                <td className="p-2 pl-6">↳ Activities</td>
                {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(addonBreakdown.activities)}</td>)}
              </tr>
            )}
            {addonBreakdown.entrances > 0 && (
              <tr className="text-xs text-muted-foreground">
                <td className="p-2 pl-6">↳ Entrances</td>
                {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(addonBreakdown.entrances)}</td>)}
              </tr>
            )}
            {addonBreakdown.misc > 0 && (
              <tr className="text-xs text-muted-foreground">
                <td className="p-2 pl-6">↳ Miscellaneous</td>
                {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(addonBreakdown.misc)}</td>)}
              </tr>
            )}
            <tr className="border-t font-medium">
              <td className="p-2">Add-Ons Total</td>
              {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(t.addons_total)}</td>)}
            </tr>
            <tr className="border-t">
              <td className="p-2">{`Markup ${draft.markup_percent}% (DBL)`}</td>
              {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(t.markup_dbl)}</td>)}
            </tr>
            <tr className="border-t">
              <td className="p-2">GST 5% (on subtotal + markup)</td>
              {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(t.gst5_dbl)}</td>)}
            </tr>
            <tr className="border-t bg-primary/5 font-bold">
              <td className="p-2">GRAND TOTAL (DBL)</td>
              {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(t.grand_dbl)}</td>)}
            </tr>
            <tr className="border-t">
              <td className="p-2 text-xs text-muted-foreground">1 Person (Solo)</td>
              {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums text-xs">{inr(t.grand_sgl)}</td>)}
            </tr>
            <tr>
              <td className="p-2 text-xs text-muted-foreground">2 Persons (Per Head)</td>
              {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums text-xs">{inr(t.grand_dbl / 2)}</td>)}
            </tr>
            <tr>
              <td className="p-2 text-xs text-muted-foreground">3 Persons (Per Head)</td>
              {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums text-xs">{inr(t.grand_trp / 3)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      )}


      <ScenarioComparison draft={draft} set={set} />

      <PerPersonSummaryBlock draft={draft} options={includedOptions} title="Per-Person Breakdown (Custom Allocation)" />

      <div className="text-xs text-muted-foreground italic">
        Inclusions & Exclusions are managed per option in Step 15.
      </div>
    </div>
  );
}




// ============================================================
// STEP 17 — Final Costing
