// Step 11 — Activities. Day-per-row table with inline city + activity checkboxes.
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import { effectivePaxForPricing } from "@/lib/wizard/calc";
import { uid, dayDestInfo, CustomAdd, type StepProps } from "../shared";

export function Step11({ draft, set }: StepProps) {
  const d = useDB();
  const pax = effectivePaxForPricing(draft);
  const cityName = (id: string) => d.cities.find((c) => c.id === id)?.name || "";

  const findLine = (activityId: string, day: number) =>
    draft.activities.find((x) => x.activity_id === activityId && (x.from_routing_days ?? []).includes(day));

  const slabRate = (a: typeof d.activities[number]) => {
    if (!a.pricing_slabs || a.pricing_slabs.length === 0) {
      return { rate: a.per_person_indian ?? a.per_person_inbound ?? a.price ?? 0, slab: null as null | { from_pax: number; to_pax: number; price: number } };
    }
    const sorted = [...a.pricing_slabs].sort((x, y) => x.from_pax - y.from_pax);
    const slab = sorted.find((s) => pax >= s.from_pax && pax <= s.to_pax)
      ?? (pax < sorted[0].from_pax ? sorted[0] : sorted[sorted.length - 1]);
    return { rate: slab.price, slab };
  };
  const isSlab = (a: typeof d.activities[number]) => a.slab_pricing_type === "total";

  const toggle = (a: typeof d.activities[number], day: number) => {
    const existing = findLine(a.id, day);
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

  // Per-day rows: build list of activities per day (grouped by city inside the cell).
  type RowGroup = { cityName: string; activities: typeof d.activities };
  const perDayGroups = (r: typeof draft.routing[number]): RowGroup[] => {
    const { names } = dayDestInfo(r, d.cities);
    return names.map((n) => ({
      cityName: n,
      activities: d.activities.filter((a) => {
        if (!a.is_active) return false;
        const destName = d.activity_destinations.find((x) => x.id === a.destination_id)?.name;
        return destName === n;
      }),
    }));
  };

  // Per-person breakdown table below (unchanged behavior).
  const selectedActivities = useMemo(() => {
    return draft.activities
      .filter((x) => x.activity_id)
      .map((l) => {
        const a = d.activities.find((x) => x.id === l.activity_id);
        if (!a) return null;
        return { line: l, activity: a, isSlab: a.slab_pricing_type === "total" };
      })
      .filter(Boolean) as Array<{ line: typeof draft.activities[number]; activity: typeof d.activities[number]; isSlab: boolean }>;
  }, [draft.activities, d.activities]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Activities & Experiences</h2>
        {/* <Badge variant="secondary" className="text-[10px]">Pax used: {pax}</Badge> */}
      </div>

      {draft.routing.length === 0 && (
        <p className="text-sm text-muted-foreground">Add routing days first (Step 9).</p>
      )}

      <div className="border border-[#E5E7EB] rounded-lg overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-[#F3F4F6] text-[10px] uppercase text-muted-foreground tracking-wide">
            <tr className="border-b border-[#E5E7EB]">
              <th className="text-left p-2 w-[60px]">Day</th>
              <th className="text-left p-2 w-[170px]">Route</th>
              <th className="text-left p-2">City + Activity</th>
            </tr>
          </thead>
          <tbody>
            {draft.routing.map((r, ri) => {
              const fromDefault = ri === 0 ? draft.departure_city : cityName(draft.routing[ri - 1]?.city_id || "");
              const routeLabel = `${r.from_city ?? fromDefault ?? "—"} → ${cityName(r.city_id) || r.to_city || "—"}`;
              const groups = perDayGroups(r);
              const hasAny = groups.some((g) => g.activities.length > 0);

              return (
                <tr key={ri} className="border-b border-[#E5E7EB] align-top bg-white">
                  <td className="p-2 font-semibold">Day {r.day}</td>
                  <td className="p-2 text-muted-foreground text-[11px]">{routeLabel}</td>
                  <td className="p-2">
                    {!hasAny ? (
                      <div className="text-[11px] text-muted-foreground italic">No activities configured for this day's cities.</div>
                    ) : (
                      <div className="space-y-2">
                        {groups.map((g) => (
                          <div key={g.cityName}>
                            <div className="text-[10px] uppercase text-muted-foreground mb-0.5">{g.cityName}</div>
                            <div className="space-y-1">
                              {g.activities.length === 0 ? (
                                <div className="text-[11px] text-muted-foreground italic">No activities.</div>
                              ) : g.activities.map((a) => {
                                const line = findLine(a.id, r.day);
                                const on = !!line;
                                const { rate, slab } = slabRate(a);
                                const slabMode = isSlab(a);
                                return (
                                  <div key={a.id} className={cn("flex items-center gap-2 rounded px-1.5 py-1", on && "bg-accent/5")}>
                                    <Checkbox checked={on} onCheckedChange={() => toggle(a, r.day)} />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium truncate">{a.activity_name}</div>
                                      <div className="text-[10px] text-muted-foreground">
                                        {slabMode
                                          ? (slab ? `Slab ${slab.from_pax}-${slab.to_pax}: ₹${rate.toLocaleString("en-IN")} total` : `₹${rate.toLocaleString("en-IN")} total`)
                                          : (slab ? `Slab ${slab.from_pax}-${slab.to_pax}: ₹${rate.toLocaleString("en-IN")}/pp` : `₹${rate.toLocaleString("en-IN")}/pp`)}
                                      </div>
                                    </div>
                                    {/* Amount: per-person rate (or slab total) */}
                                    <div className={cn("w-24 text-right tabular-nums text-[11px] font-semibold", !on && "opacity-40")}>
                                      {on ? inr(rate) : inr(0)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
                    if (!isSlab) return line.rate;
                    const slabs = [...(activity.pricing_slabs ?? [])].sort((a, b) => a.from_pax - b.from_pax);
                    if (slabs.length === 0) return line.rate / Math.max(1, n);
                    const slab = slabs.find((s) => n >= s.from_pax && n <= s.to_pax)
                      ?? (n < slabs[0].from_pax ? slabs[0] : slabs[slabs.length - 1]);
                    return slab.price / n;
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
            Slab activities keep the same total; per-person activities scale linearly.
          </p>
        </Card>
      )}

      <Card className="p-3 space-y-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Custom / Other Activities</div>
        <CustomAdd label="Custom Activity" onAdd={(name, rate) => set({
          activities: [...draft.activities, { id: uid(), custom_name: name, qty: 1, rate }],
        })} />
        {draft.activities.filter((x) => x.custom_name).map((x) => (
          <div key={x.id} className="text-xs flex justify-between p-2 bg-muted/30 rounded">
            <span>{x.custom_name} × {x.qty}</span>
            <span>{inr(x.rate * x.qty)}
              <button className="ml-2 text-destructive" onClick={() => set({ activities: draft.activities.filter((y) => y.id !== x.id) })}>×</button>
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}