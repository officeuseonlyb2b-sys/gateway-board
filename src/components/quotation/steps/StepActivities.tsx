// Extracted verbatim from src/routes/_authenticated/costing.tsx (Step 10 UI — Activities).
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import { totalPax } from "@/lib/wizard/calc";
import type { QuoteDraft } from "@/lib/wizard/types";
import { uid, dayDestInfo, DaySection, dayTitleFor, CustomAdd, type StepProps } from "../shared";

// ============================================================
// STEP 10 (Activities) — day-wise, city-grouped, with per-pax breakdown
// ============================================================
function CityActivitiesGroup({
  cityName, activities, day, pax, draft, set,
}: {
  cityName: string;
  activities: ReturnType<typeof useDB>["activities"];
  day: number;
  pax: number;
  draft: QuoteDraft;
  set: (p: Partial<QuoteDraft>) => void;
}) {
  const [open, setOpen] = useState(true);

  const findLine = (activityId: string) =>
    draft.activities.find((x) => x.activity_id === activityId && (x.from_routing_days ?? []).includes(day));

  const slabRate = (a: typeof activities[number]) => {
    if (!a.pricing_slabs || a.pricing_slabs.length === 0) {
      return { rate: a.per_person_indian ?? a.per_person_inbound ?? a.price ?? 0, slab: null as null | { from_pax: number; to_pax: number; price: number } };
    }
    const sorted = [...a.pricing_slabs].sort((x, y) => x.from_pax - y.from_pax);
    const slab = sorted.find((s) => pax >= s.from_pax && pax <= s.to_pax)
      ?? (pax < sorted[0].from_pax ? sorted[0] : sorted[sorted.length - 1]);
    return { rate: slab.price, slab };
  };

  const isSlab = (a: typeof activities[number]) => a.slab_pricing_type === "total";

  const toggle = (a: typeof activities[number]) => {
    const existing = findLine(a.id);
    if (existing) {
      set({ activities: draft.activities.filter((x) => x.id !== existing.id) });
      return;
    }
    const { rate } = slabRate(a);
    const mode: "per_person" | "slab" = isSlab(a) ? "slab" : "per_person";
    set({
      activities: [...draft.activities, {
        id: uid(),
        activity_id: a.id,
        qty: mode === "slab" ? 1 : (pax || 1),
        rate,
        pricing_mode: mode,
        from_routing_days: [day],
      }],
    });
  };

  const selectedCount = activities.filter((a) => !!findLine(a.id)).length;

  return (
    <div className="border rounded-md overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-2 hover:bg-muted/40 text-left bg-muted/20">
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !open && "-rotate-90")} />
        <span className="text-xs font-semibold flex-1">{cityName}</span>
        {selectedCount > 0 && <Badge variant="secondary" className="text-[10px]">{selectedCount} selected</Badge>}
        <span className="text-[10px] text-muted-foreground">{activities.length} activity{activities.length === 1 ? "" : "s"}</span>
      </button>
      {open && (
        <div className="divide-y">
          {activities.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground italic">No activities configured for {cityName}.</div>
          ) : activities.map((a) => {
            const line = findLine(a.id);
            const on = !!line;
            const { rate, slab } = slabRate(a);
            const slabMode = isSlab(a);
            const qty = line?.qty ?? (slabMode ? 1 : pax);
            const total = slabMode ? rate : rate * (qty || 0);
            return (
              <div key={a.id} className={cn("px-3 py-2 flex items-center gap-3 flex-wrap", on && "bg-accent/5")}>
                <Checkbox checked={on} onCheckedChange={() => toggle(a)} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.activity_name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {slabMode
                      ? (slab ? `Slab ${slab.from_pax}-${slab.to_pax}: ₹${rate.toLocaleString("en-IN")} total` : `₹${rate.toLocaleString("en-IN")} total`)
                      : (slab ? `Slab ${slab.from_pax}-${slab.to_pax}: ₹${rate.toLocaleString("en-IN")}/pp` : `₹${rate.toLocaleString("en-IN")}/pp`)}
                    {on && slabMode && qty > 0 && ` · ${inr(rate / Math.max(1, qty * pax === 0 ? 1 : pax))}/pp for ${pax} pax`}
                  </div>
                </div>
                {on && line && !slabMode && (
                  <div>
                    <Label className="text-[10px]">Pax</Label>
                    <Input type="number" min={1} value={line.qty} className="w-16 h-8"
                      onChange={(e) => set({ activities: draft.activities.map((x) => x.id === line.id ? { ...x, qty: parseInt(e.target.value) || 1 } : x) })} />
                  </div>
                )}
                <div className={cn("w-28 text-right tabular-nums text-sm font-semibold", !on && "opacity-40")}>
                  {inr(on ? (slabMode ? rate : rate * (line?.qty ?? 0)) : total)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Step11({ draft, set }: StepProps) {
  const d = useDB();
  const pax = totalPax(draft);
  const customLines = draft.activities.filter((x) => x.custom_name);

  // Build per-person breakdown rows for all selected activities.
  const selectedActivities = useMemo(() => {
    return draft.activities
      .filter((x) => x.activity_id)
      .map((l) => {
        const a = d.activities.find((x) => x.id === l.activity_id);
        if (!a) return null;
        const isSlab = a.slab_pricing_type === "total";
        return { line: l, activity: a, isSlab };
      })
      .filter(Boolean) as Array<{ line: typeof draft.activities[number]; activity: typeof d.activities[number]; isSlab: boolean }>;
  }, [draft.activities, d.activities]);

  const grandTotal = draft.activities.reduce((s, l) => s + (l.pricing_mode === "slab" ? l.rate : l.rate * l.qty), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Activities & Experiences</h2>
        <span className="text-xs text-muted-foreground">Grouped by day → city. Pax used: {pax}.</span>
      </div>

      {draft.routing.length === 0 && (
        <p className="text-sm text-muted-foreground">Add routing days first (Step 9).</p>
      )}

      {draft.routing.map((r, idx) => {
        const isLast = idx === draft.routing.length - 1;
        const { names: destNames } = dayDestInfo(r, d.cities);
        const title = dayTitleFor(r, d.cities, isLast);
        const dayActivities = d.activities.filter((a) => {
          if (!a.is_active) return false;
          const destName = d.activity_destinations.find((x) => x.id === a.destination_id)?.name;
          return !!destName && destNames.includes(destName);
        });
        const byCity: Record<string, typeof dayActivities> = {};
        destNames.forEach((n) => (byCity[n] = []));
        dayActivities.forEach((a) => {
          const destName = d.activity_destinations.find((x) => x.id === a.destination_id)?.name ?? "";
          if (!byCity[destName]) byCity[destName] = [];
          byCity[destName].push(a);
        });
        const selectedCount = draft.activities.filter((x) => x.activity_id && (x.from_routing_days ?? []).includes(r.day)).length;
        const subtitle = destNames.length > 0 ? destNames.join(", ") : undefined;

        return (
          <DaySection key={r.day} day={r.day} title={title} subtitle={subtitle} count={selectedCount}>
            {destNames.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">No destination set for this day.</div>
            ) : destNames.map((cityName) => (
              <CityActivitiesGroup
                key={cityName}
                cityName={cityName}
                activities={byCity[cityName] ?? []}
                day={r.day}
                pax={pax}
                draft={draft}
                set={set}
              />
            ))}
          </DaySection>
        );
      })}

      {/* Per-person cost breakdown */}
      {selectedActivities.length > 0 && (
        <Card className="p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
            Per Person Cost Breakdown
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-2 w-[110px]">Person Range</th>
                  {selectedActivities.map(({ activity }) => (
                    <th key={activity.id} className="text-right p-2 truncate">{activity.activity_name}</th>
                  ))}
                  <th className="text-right p-2 w-[110px]">Total</th>
                </tr>
              </thead>
              <tbody>
  {Array.from({ length: Math.max(1, pax) }, (_, i) => i + 1).map((n) => {
    const rowPerPerson = selectedActivities.map(({ activity, line, isSlab }) => {
      if (!isSlab) {
        return line.rate; // per-person rate directly
      }
      // Slab logic: find the correct slab for this 'n'
      const slabs = [...(activity.pricing_slabs ?? [])].sort(
        (a, b) => a.from_pax - b.from_pax
      );
      if (slabs.length === 0) {
        return line.rate / Math.max(1, n); // fallback
      }
      const slab =
        slabs.find((s) => n >= s.from_pax && n <= s.to_pax) ??
        (n < slabs[0].from_pax ? slabs[0] : slabs[slabs.length - 1]);
      return slab.price / n; // per-person = slab total ÷ n
    });

    const rowTotal = rowPerPerson.reduce((s, v) => s + v, 0);

    return (
      <tr key={n} className="border-b">
        <td className="p-2 font-medium">{n} pax</td>
        {rowPerPerson.map((v, ci) => (
          <td key={ci} className="p-2 text-right tabular-nums">
            {inr(v)}
          </td>
        ))}
        <td className="p-2 text-right tabular-nums font-semibold">
          {inr(rowTotal)}
        </td>
      </tr>
    );
  })}
</tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Slab activities keep the same total; per-person activities scale linearly.
          </p>
        </Card>
      )}

      <Card className="p-3 space-y-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Custom / Other Activities</div>
        <CustomAdd label="Custom Activity" onAdd={(name, rate) => set({
          activities: [...draft.activities, { id: uid(), custom_name: name, qty: 1, rate }],
        })} />
        {customLines.map((x) => (
          <div key={x.id} className="text-xs flex justify-between p-2 bg-muted/30 rounded">
            <span>{x.custom_name} × {x.qty}</span>
            <span>{inr(x.rate * x.qty)}
              <button className="ml-2 text-destructive" onClick={() => set({ activities: draft.activities.filter((y) => y.id !== x.id) })}>×</button>
            </span>
          </div>
        ))}
      </Card>

      <div className="text-right font-semibold">Activities Total: {inr(grandTotal)}</div>
    </div>
  );
}
