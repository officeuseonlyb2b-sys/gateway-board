// Extracted verbatim from src/routes/_authenticated/costing.tsx (Step 13 UI — Miscellaneous).
import { useEffect } from "react";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";
import { useDB, miscRateForPax } from "@/lib/mock-store";
import { totalPax } from "@/lib/wizard/calc";
import { uid, CustomAdd, WIZARD_HOTEL_CATEGORIES, type StepProps } from "../shared";

export function Step14({ draft, set }: StepProps) {
  const d = useDB();
  const items = d.miscellaneous_items.filter((x) => x.is_active);
  const pax = totalPax(draft);
  const nights = draft.nights || 1;

  // Normalize legacy pricing_type -> binary (per_person | slab)
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Miscellaneous</h2>
        <Badge variant="secondary" className="text-[10px]">Auto-priced for {pax} pax</Badge>
      </div>
      {(() => {
        const n = draft.misc.filter((x) => (x.from_routing_days?.length ?? 0) > 0).length;
        return n > 0 ? (
          <div className="text-xs px-3 py-2 rounded-md bg-accent/10 text-accent border border-accent/30">
            Pre-filled from routing: {n} item{n === 1 ? "" : "s"} selected
          </div>
        ) : null;
      })()}
      <div className="space-y-2">
        {items.map((m) => {
          const line = draft.misc.find((x) => x.item_id === m.id);
          const on = !!line;
          const fromDays = line?.from_routing_days ?? [];
          const type = effType(m);
          const info = miscRateForPax(m, pax, nights);
          const isSlabPP = type === "slab" && !!m.slab_is_per_person;
          const typeLabel = type === "slab" ? (isSlabPP ? "Slab · Per Person" : "Slab · Total") : "Per Person";
          return (
            <div key={m.id} className={cn("p-3 border rounded-lg", on && "border-accent bg-accent/5")}>
              <div className="flex items-center gap-3 flex-wrap">
                <Checkbox checked={on} onCheckedChange={() => toggle(m)} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                    {m.name}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{typeLabel}</span>
                    {fromDays.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                        From Day {fromDays.join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ₹{info.rate.toLocaleString("en-IN")} · {info.label}
                  </div>
                </div>
                {on && line && (
                  <div className="w-32 text-right font-semibold tabular-nums">
                    {inr(line.qty * line.rate)}
                    <div className="text-[10px] text-muted-foreground font-normal">
                      {line.qty} × ₹{line.rate.toLocaleString("en-IN")}
                    </div>
                  </div>
                )}
              </div>
              {type === "slab" && (m.price_ranges ?? []).length > 0 && (
                <div className="mt-2 ml-8 text-[11px] text-muted-foreground">
                  <span className="uppercase mr-2">Slabs:</span>
                  {(m.price_ranges ?? []).map((s, i) => {
                    const active = pax >= s.from_pax && pax <= s.to_pax;
                    return (
                      <span key={i} className={cn("inline-block mr-2 px-1.5 py-0.5 rounded",
                        active ? "bg-accent/20 text-accent font-semibold" : "bg-muted")}>
                        {s.from_pax}-{s.to_pax}: ₹{s.price.toLocaleString("en-IN")}{isSlabPP ? "/pp" : ""}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <CustomAdd label="Custom Misc Item" onAdd={(name, rate) => set({
        misc: [...draft.misc, { id: uid(), custom_name: name, qty: 1, rate, unit: "fixed" }],
      })} />
      {draft.misc.filter((x) => x.custom_name).map((x) => (
        <div key={x.id} className="text-xs flex justify-between p-2 bg-muted/30 rounded">
          <span>{x.custom_name} × {x.qty}</span>
          <span>{inr(x.qty * x.rate)}
            <button className="ml-2 text-destructive" onClick={() => set({ misc: draft.misc.filter((y) => y.id !== x.id) })}>×</button>
          </span>
        </div>
      ))}
      <div className="text-right font-semibold">
        Misc Total: {inr(draft.misc.reduce((s, l) => s + l.rate * l.qty, 0))}
      </div>
    </div>
  );
}



// ============================================================
// STEP 15 — Accommodation
// ============================================================
// (moved to shared.tsx)
