// Extracted verbatim from src/routes/_authenticated/costing.tsx (Step 14 UI — Transport).
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import { effectivePaxForPricing, transportLineTotal } from "@/lib/wizard/calc";
import { uid, type StepProps } from "../shared";

// ============================================================
// STEP 10 — Transport
// ============================================================
export function Step10({ draft, set }: StepProps) {
  const d = useDB();
  const pax = effectivePaxForPricing(draft);
  const opts = d.travel_options.filter((t) => {
    if (!t.is_active) return false;
    const min = t.min_pax ?? 1;
    const max = t.max_pax ?? t.capacity_persons ?? Number.MAX_SAFE_INTEGER;
    return pax >= min && pax <= max;
  });
  const cityName = (id: string) => d.cities.find((c) => c.id === id)?.name || "";
  const routing = draft.routing;
  const total = draft.transport.reduce((s, l) => s + transportLineTotal(l), 0);

  const addVehicle = () => {
    const first = opts[0];
    set({
      transport: [...draft.transport, {
        id: uid(), travel_id: first?.id || "", vehicles: 1, days: routing.length || 1,
        rate: first?.rate_per_day || 0, rate_format: "per_route",
        per_route_rates: Array(routing.length).fill(first?.rate_per_day || 0),
        reporting_cost: 0, remarks: "",
      }],
    });
  };

  const patchLine = (i: number, p: Partial<typeof draft.transport[number]>) => {
    const n = [...draft.transport]; n[i] = { ...n[i], ...p }; set({ transport: n });
  };

  const removeLine = (id: string) =>
    set({ transport: draft.transport.filter((x) => x.id !== id) });

  const vehLabel = (t: typeof draft.transport[number]) => {
    const v = d.travel_options.find((x) => x.id === t.travel_id);
    return v?.vehicle_type || "Vehicle";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Transport — Per Route</h2>
        <Button size="sm" onClick={addVehicle} disabled={opts.length === 0}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Transport
        </Button>
      </div>

      {draft.transport.length === 0 && (
        <p className="text-sm text-muted-foreground">No transport added yet. Click "Add Transport" to add a vehicle column.</p>
      )}

      {draft.transport.length > 0 && (
        <>
          {/* Vehicle selector cards (one per column) */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {draft.transport.map((t, i) => {
              const current = d.travel_options.find((x) => x.id === t.travel_id);
              const rowOpts = current && !opts.some((o) => o.id === current.id) ? [current, ...opts] : opts;
              const isTotalMode = t.rate_mode === "total";

              return (
                <Card key={t.id} className="p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-muted-foreground">Vehicle {i + 1}</div>
                    <Button size="icon" variant="ghost" onClick={() => removeLine(t.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-[1fr_70px] gap-2">
                    <div>
                      <Label className="text-[10px]">Vehicle Type</Label>
                      <Select value={t.travel_id} onValueChange={(v) => {
                        const to = rowOpts.find((x) => x.id === v);
                        const perDay = to?.rate_per_day || 0;
                        patchLine(i, {
                          travel_id: v,
                          per_route_rates: (t.per_route_rates ?? Array(routing.length).fill(0)).map((r) => r || perDay),
                        });
                      }}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {rowOpts.map((o) => <SelectItem key={o.id} value={o.id}>{o.vehicle_type}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px]"># Veh</Label>
                      <Input type="number" min={1} value={t.vehicles} className="h-8 text-xs"
                        onChange={(e) => patchLine(i, { vehicles: parseInt(e.target.value) || 1 })} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Rate Mode</Label>
                    <div className="flex gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => patchLine(i, { rate_mode: "daywise" })}
                        className={`flex-1 px-2 py-1 rounded ${(t.rate_mode ?? "daywise") === "daywise" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                      >Day-wise</button>
                      <button
                        type="button"
                        onClick={() => patchLine(i, { rate_mode: "total" })}
                        className={`flex-1 px-2 py-1 rounded ${t.rate_mode === "total" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                      >Total</button>
                    </div>
                    {isTotalMode && (
                      <div>
                        <Label className="text-[10px]">Total Rate (₹)</Label>
                        <Input 
                          type="number" 
                          min={0} 
                          className="h-8 text-xs text-right" 
                          value={t.total_rate || ""}
                          onChange={(e) => {
                            const totalVal = parseFloat(e.target.value) || 0;
                            const days = routing.length;
                            // Auto-distribute the total across the days
                            const distributedVal = days > 0 ? totalVal / days : 0;
                            const newRates = Array(days).fill(distributedVal);
                            
                            // Update both total_rate and the daily rates array at once
                            patchLine(i, { 
                              total_rate: totalVal, 
                              per_route_rates: newRates 
                            });
                          }} 
                        />
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Per-route rates table */}
          <div className="border border-[#E5E7EB] rounded-lg overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-[#F3F4F6] text-[10px] uppercase text-muted-foreground tracking-wide">
                <tr className="border-b border-[#E5E7EB]">
                  <th className="text-left p-2 w-[70px]">Day</th>
                  <th className="text-left p-2">Route</th>
                  {draft.transport.map((t, i) => (
                    <th key={t.id} className="text-right p-2 w-[120px]">{vehLabel(t) || `V${i + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {routing.map((r, ri) => {
                  const fromLabel = r.from_city
                    || (ri === 0 ? draft.departure_city : (cityName(routing[ri - 1]?.city_id || "") || "—"));
                  const toLabel = cityName(r.city_id) || r.to_city || "—";
                  const route = fromLabel && toLabel && fromLabel !== toLabel ? `${fromLabel} → ${toLabel}` : `${toLabel} Local`;
                  return (
                    <tr key={ri} className="border-b border-[#E5E7EB] bg-white">
                      <td className="p-2 font-medium">Day {r.day}</td>
                      <td className="p-2 text-muted-foreground">{route}</td>
                      {draft.transport.map((t, ti) => {
                        const arr = t.per_route_rates ?? Array(routing.length).fill(0);
                        const val = arr[ri] ?? 0;
                        const isTotalMode = t.rate_mode === "total";
                        
                        return (
                          <td key={t.id} className="p-2">
                            {isTotalMode ? (
                              /* 🔥 Kept blank, uneditable, and disabled */
                              <div className="h-7 flex items-center justify-end text-xs tabular-nums text-muted-foreground bg-muted/30 rounded px-2">
                                {/* Intentionally empty */}
                              </div>
                            ) : (
                              <Input 
                                type="number" 
                                min={0} 
                                className="h-7 text-xs text-right" 
                                value={val || ""}
                                onChange={(e) => {
                                  const next = [...(t.per_route_rates ?? Array(routing.length).fill(0))];
                                  while (next.length < routing.length) next.push(0);
                                  next[ri] = parseFloat(e.target.value) || 0;
                                  patchLine(ti, { per_route_rates: next.slice(0, routing.length) });
                                }} 
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr className="bg-muted/30 border-b border-[#E5E7EB">
                  <td colSpan={2} className="p-2 text-right text-[10px] uppercase text-muted-foreground">Reporting Cost</td>
                  {draft.transport.map((t, ti) => {
                    const isTotalMode = t.rate_mode === "total";
                    return (
                      <td key={t.id} className="p-2">
                        {/* 🔥 Disabled, blank, and uneditable when Total mode is active */}
                        <Input 
                          type="number" 
                          min={0} 
                          className="h-7 text-xs text-right" 
                          value={isTotalMode ? "" : t.reporting_cost || ""}
                          disabled={isTotalMode}
                          onChange={(e) => patchLine(ti, { reporting_cost: parseFloat(e.target.value) || 0 })} 
                        />
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-muted/10 border-b border-[#E5E7EB]">
                  <td colSpan={2} className="p-2 text-right text-[10px] uppercase text-muted-foreground">Remarks</td>
                  {draft.transport.map((t, ti) => {
                    const isTotalMode = t.rate_mode === "total";
                    return (
                      <td key={t.id} className="p-2">
                        {/* 🔥 Disabled, blank, and uneditable when Total mode is active */}
                        <Input 
                          className="h-7 text-xs" 
                          value={isTotalMode ? "" : t.remarks || ""}
                          disabled={isTotalMode}
                          onChange={(e) => patchLine(ti, { remarks: e.target.value })} 
                        />
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-primary/5 font-semibold">
                  <td colSpan={2} className="p-2 text-right text-xs">Line Total</td>
                  {draft.transport.map((t) => (
                    <td key={t.id} className="p-2 text-right tabular-nums">{inr(transportLineTotal(t))}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="text-right font-semibold">Transport Total: {inr(total)}</div>
        </>
      )}
    </div>
  );
}