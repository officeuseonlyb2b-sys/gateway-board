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
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Costing Variations</h2>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Markup %</Label>
          <Input type="number" value={draft.markup_percent} className="w-20"
            onChange={(e) => set({ markup_percent: parseFloat(e.target.value) || 0 })} />
        </div>
      </div>

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

      {includedOptions.filter((o) => optionUsesCustomAllocation(o)).map((o) => (
        <OptionPerPersonPreview key={`alloc-${o.key}`} draft={draft} option={o} />
      ))}

      {isGroupTour(draft) ? (
        <GroupCostingBlock draft={draft} set={set} options={includedOptions} />
      ) : totals.length === 0 ? (
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
// Group Costing block (Step 16, GIT tours)
// ============================================================
function GroupCostingBlock({ draft, set, options }: { draft: QuoteDraft; set: (p: Partial<QuoteDraft>) => void; options: HotelOption[] }) {
  const d = useDB();
  const pax = Math.max(1, effectivePaxForPricing(draft));
  const autoDbl = useMemo(() => autoDoubleMix(pax), [pax]);
  const autoTrp = useMemo(() => autoTripleMix(pax), [pax]);
  const customMix = draft.group_room_mix || autoDbl;

  const setCustom = (patch: Partial<typeof customMix>) => {
    set({ group_room_mix: { ...customMix, ...patch } });
  };

  const covered = mixCoversPax(customMix);
  const mismatch = covered !== pax;

  if (options.length === 0) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">Select at least one option above to see the group costing.</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-accent/5 border-accent/30">
        <div className="text-sm font-semibold text-accent-foreground mb-2">Customize Room Mix — {pax} pax</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-xs">Double Rooms</Label>
            <Input type="number" min={0} value={customMix.double}
              onChange={(e) => setCustom({ double: Math.max(0, parseInt(e.target.value) || 0) })} />
          </div>
          <div>
            <Label className="text-xs">Triple Rooms</Label>
            <Input type="number" min={0} value={customMix.triple}
              onChange={(e) => setCustom({ triple: Math.max(0, parseInt(e.target.value) || 0) })} />
          </div>
          <div>
            <Label className="text-xs">Single Rooms</Label>
            <Input type="number" min={0} value={customMix.single}
              onChange={(e) => setCustom({ single: Math.max(0, parseInt(e.target.value) || 0) })} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => set({ group_room_mix: autoDoubleMix(pax) })}>All Double</Button>
            <Button size="sm" variant="outline" onClick={() => set({ group_room_mix: autoTripleMix(pax) })}>All Triple</Button>
          </div>
        </div>
        <div className={cn("mt-2 text-xs", mismatch ? "text-red-600 font-medium" : "text-muted-foreground")}>
          {mismatch
            ? `⚠ Room mix covers ${covered} persons but tour has ${pax}`
            : `✓ Room mix covers all ${pax} persons`}
        </div>
      </Card>

      {options.map((o) => {
        const dblTot = computeGroupOption(draft, o, d, autoDbl);
        const trpTot = computeGroupOption(draft, o, d, autoTrp);
        const custTot = computeGroupOption(draft, o, d, customMix);
        return (
          <Card key={o.key} className="p-4">
            <div className="text-sm font-semibold mb-3">
              Option {o.key} · {o.label || "—"} — Group Package for {pax} pax
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Line</th>
                    <th className="text-right p-2">Double Sharing<br /><span className="normal-case text-[10px] text-muted-foreground/80">{mixLabel(autoDbl)}</span></th>
                    <th className="text-right p-2">Triple Sharing<br /><span className="normal-case text-[10px] text-muted-foreground/80">{mixLabel(autoTrp)}</span></th>
                    <th className="text-right p-2">Custom Mix<br /><span className="normal-case text-[10px] text-muted-foreground/80">{mixLabel(customMix)}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Room Cost (Net)", (t: GroupOptionTotals) => t.room_net],
                    ["GST on Rooms", (t: GroupOptionTotals) => t.room_gst],
                    ["Add-Ons Total", (t: GroupOptionTotals) => t.addons_total],
                    [`Markup ${draft.markup_percent}%`, (t: GroupOptionTotals) => t.markup],
                    ["GST 5%", (t: GroupOptionTotals) => t.gst5],
                  ].map(([lbl, fn], i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{lbl as string}</td>
                      <td className="p-2 text-right tabular-nums">{inr((fn as any)(dblTot))}</td>
                      <td className="p-2 text-right tabular-nums">{inr((fn as any)(trpTot))}</td>
                      <td className="p-2 text-right tabular-nums">{inr((fn as any)(custTot))}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-primary/5 font-bold text-base">
                    <td className="p-2">GRAND TOTAL ({pax} pax)</td>
                    <td className="p-2 text-right tabular-nums">{inr(dblTot.grand_total)}</td>
                    <td className="p-2 text-right tabular-nums">{inr(trpTot.grand_total)}</td>
                    <td className="p-2 text-right tabular-nums">{inr(custTot.grand_total)}</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2 text-xs text-muted-foreground">Per Person</td>
                    <td className="p-2 text-right tabular-nums text-xs">{inr(dblTot.per_person)}</td>
                    <td className="p-2 text-right tabular-nums text-xs">{inr(trpTot.per_person)}</td>
                    <td className="p-2 text-right tabular-nums text-xs">{inr(custTot.per_person)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {(dblTot.rate_missing > 0 || trpTot.rate_missing > 0) && (
              <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {dblTot.rate_missing} night(s) missing rates
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}



// ============================================================
// STEP 17 — Final Costing
