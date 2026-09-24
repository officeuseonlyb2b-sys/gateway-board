// Step 13 — Miscellaneous. Mirrors the Activity & Experience step (Step 11)
// in visual layout, selectable-row interaction, and per-person cost breakdown.
import { useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";
import { useDB, miscRateForPax } from "@/lib/mock-store";
import { effectivePaxForPricing } from "@/lib/wizard/calc";
import { uid, CustomAdd, type StepProps } from "../shared";

export function Step14({ draft, set }: StepProps) {
  const d = useDB();
  const items = d.miscellaneous_items.filter((x) => x.is_active);
  const pax = effectivePaxForPricing(draft);
  const nights = draft.nights || 1;

  const effType = (m: typeof items[number]): "per_person" | "slab" => {
    const raw = (m.pricing_type ?? m.unit) as string;
    return raw === "slab" ? "slab" : "per_person";
  };

  const toggle = (m: typeof items[number]) => {
    const existing = draft.misc.find((x) => x.item_id === m.id);
    if (existing) { set({ misc: draft.misc.filter((x) => x.id !== existing.id) }); return; }
    const info = miscRateForPax(m, pax, nights);
    set({ misc: [...draft.misc, {
      id: uid(), item_id: m.id, qty: info.qty, rate: info.rate,
      unit: effType(m) === "slab" ? "fixed" : "per_person",
    }] });
  };

  // Keep line qty/rate in sync when pax changes (auto).
  useEffect(() => {
    let dirty = false;
    const next = draft.misc.map((l) => {
      if (!l.item_id) return l;
      const m = items.find((x) => x.id === l.item_id);
      if (!m) return l;
      const info = miscRateForPax(m, pax, nights);
      if (l.rate !== info.rate || l.qty !== info.qty) { dirty = true; return { ...l, rate: info.rate, qty: info.qty }; }
      return l;
    });
    if (dirty) set({ misc: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pax, nights, d.miscellaneous_items]);

  // Selected items (with master ref) — used for the per-person breakdown table.
  const selectedMisc = useMemo(() => {
    return draft.misc
      .filter((x) => x.item_id)
      .map((l) => {
        const m = items.find((x) => x.id === l.item_id);
        if (!m) return null;
        return { line: l, item: m, isSlab: effType(m) === "slab" };
      })
      .filter(Boolean) as Array<{ line: typeof draft.misc[number]; item: typeof items[number]; isSlab: boolean }>;
  }, [draft.misc, items]);

  const routingBanner = draft.misc.filter((x) => (x.from_routing_days?.length ?? 0) > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Miscellaneous</h2>
        <Badge variant="secondary" className="text-[10px]">Auto-priced for {pax} pax</Badge>
      </div>

      {routingBanner > 0 && (
        <div className="text-xs px-3 py-2 rounded-md bg-accent/10 text-accent border border-accent/30">
          Pre-filled from routing: {routingBanner} item{routingBanner === 1 ? "" : "s"} selected
        </div>
      )}

      {/* Selectable item list — matches Activities row style */}
      <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
        <div className="bg-[#F3F4F6] text-[10px] uppercase text-muted-foreground tracking-wide px-3 py-2 border-b border-[#E5E7EB]">
          Item + Pricing
        </div>
        <div className="divide-y divide-[#E5E7EB]">
          {items.length === 0 && (
            <div className="p-3 text-[11px] text-muted-foreground italic">No miscellaneous items configured.</div>
          )}
          {items.map((m) => {
            const line = draft.misc.find((x) => x.item_id === m.id);
            const on = !!line;
            const type = effType(m);
            const info = miscRateForPax(m, pax, nights);
            const isSlabPP = type === "slab" && !!m.slab_is_per_person;
            const typeLabel = type === "slab" ? (isSlabPP ? "Slab · Per Person" : "Slab · Total") : "Per Person";
            const fromDays = line?.from_routing_days ?? [];
            return (
              <div key={m.id} className={cn("flex items-center gap-2 px-3 py-2", on && "bg-accent/5")}>
                <Checkbox checked={on} onCheckedChange={() => toggle(m)} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                    <span className="truncate">{m.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{typeLabel}</span>
                    {fromDays.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                        From Day {fromDays.join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    ₹{info.rate.toLocaleString("en-IN")} · {info.label}
                  </div>
                  {type === "slab" && (m.price_ranges ?? []).length > 0 && (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      <span className="uppercase mr-1">Slabs:</span>
                      {(m.price_ranges ?? []).map((s, i) => {
                        const active = pax >= s.from_pax && pax <= s.to_pax;
                        return (
                          <span key={i} className={cn("inline-block mr-1 px-1.5 py-0.5 rounded",
                            active ? "bg-accent/20 text-accent font-semibold" : "bg-muted")}>
                            {s.from_pax}-{s.to_pax}: ₹{s.price.toLocaleString("en-IN")}{isSlabPP ? "/pp" : ""}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className={cn("w-28 text-right tabular-nums text-[11px] font-semibold", !on && "opacity-40")}>
                  {on && line ? inr(line.qty * line.rate) : inr(0)}
                  {on && line && (
                    <div className="text-[10px] text-muted-foreground font-normal">
                      {line.qty} × ₹{line.rate.toLocaleString("en-IN")}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-Person Cost Breakdown — mirrors Activities step */}
      {selectedMisc.length > 0 && (
        <Card className="p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
            Per Person Cost Breakdown
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-2 w-[110px]">Person Range</th>
                  {selectedMisc.map(({ item }) => (
                    <th key={item.id} className="text-right p-2 truncate">{item.name}</th>
                  ))}
                  <th className="text-right p-2 w-[110px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.max(1, pax) }, (_, i) => i + 1).map((n) => {
                  const rowPerPerson = selectedMisc.map(({ item, isSlab }) => {
                    const info = miscRateForPax(item, n, nights);
                    if (!isSlab) return info.rate;
                    const totalCost = info.rate * info.qty;
                    return totalCost / Math.max(1, n);
                  });
                  const rowTotal = rowPerPerson.reduce((s, v) => s + v, 0);
                  return (
                    <tr key={n} className="border-b">
                      <td className="p-2 font-medium">{n} pax</td>
                      {rowPerPerson.map((v, ci) => (
                        <td key={ci} className="p-2 text-right tabular-nums">{inr(v)}</td>
                      ))}
                      <td className="p-2 text-right tabular-nums font-semibold">{inr(rowTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Slab items keep the same total; per-person items scale linearly.
          </p>
        </Card>
      )}

      {/* Custom items — same Card pattern as Activities */}
      
    </div>
  );
}
