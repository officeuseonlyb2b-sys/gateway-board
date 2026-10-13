// src/components/quotation/steps/StepTransport.tsx
// Step 10 — Transport
// Transport with per-route rates, vehicle selection, and per-person breakdown.

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import { effectivePaxForPricing, landGst, landMarkup, parsePaxRange, transportLineTotal } from "@/lib/wizard/calc";
import { uid, type StepProps } from "../shared";

// ============================================================
// STEP 10 — Transport
// ============================================================

export function Step10({ draft, set }: StepProps) {
  const d = useDB();
  const [showAllVehicles, setShowAllVehicles] = useState(false);
  const requestedPax = Math.max(1, effectivePaxForPricing(draft));
  const requestedRange = parsePaxRange(draft);
  const commercial = (amount: number) => {
    const markup = amount * landMarkup(draft);
    const gst = (amount + markup) * landGst(draft);
    return { markup, gst, final: amount + markup + gst };
  };

  const cityName = (id: string) =>
    d.cities.find((c) => c.id === id)?.name || "";

  const routing = draft.routing;

  // ============================================================
  // ALL ACTIVE VEHICLES
  // ============================================================
  //
  // IMPORTANT:
  // Previously this was restricted to min_pax <= 7.
  // That caused vehicles such as 17, 20, 25, 27, 35,
  // 40 and 45 seaters to disappear.
  //
  // Now ALL active vehicles are available.
  // ============================================================

  const allOpts = d.travel_options
    .filter((t) => t.is_active)
    .sort(
      (a, b) =>
        (a.capacity_persons ?? 0) - (b.capacity_persons ?? 0)
    );
  const fitsPax = (vehicle: typeof allOpts[number], pax: number) => {
    const min = vehicle.min_pax ?? 1;
    const max = vehicle.max_pax ?? vehicle.capacity_persons ?? Number.POSITIVE_INFINITY;
    return pax >= min && pax <= max;
  };
  const overlapsRequest = (vehicle: typeof allOpts[number]) => {
    const min = vehicle.min_pax ?? 1;
    const max = vehicle.max_pax ?? vehicle.capacity_persons ?? Number.POSITIVE_INFINITY;
    // For a pax-range quote, show every vehicle whose capacity overlaps any
    // requested pax row. The final rate sheet then prints only the rows that
    // actually fit that vehicle.
    return requestedRange
      ? max >= requestedRange.min && min <= requestedRange.max
      : fitsPax(vehicle, requestedPax);
  };
  const eligibleOpts = allOpts.filter(overlapsRequest);
  const opts = showAllVehicles ? allOpts : eligibleOpts;

  // ============================================================
  // TOTAL TRANSPORT COST
  // ============================================================

  // ============================================================
  // ADD VEHICLE
  // ============================================================

  const addVehicle = (travelId?: string) => {
    const first =
      (travelId && eligibleOpts.find((o) => o.id === travelId)) ||
      eligibleOpts[0];

    if (!first) return;

    const defaultRate = first.rate_per_day || 0;

    set({
      transport: [
        ...draft.transport,
        {
          id: uid(),
          travel_id: first.id,
          vehicles: 1,
          days: routing.length || 1,

          rate: defaultRate,
          rate_format: "per_route",

          per_route_rates: Array(routing.length).fill(defaultRate),

          reporting_cost: 0,
          remarks: "",
        },
      ],
    });
  };

  // ============================================================
  // PATCH TRANSPORT LINE
  // ============================================================

  const patchLine = (
    index: number,
    patch: Partial<typeof draft.transport[number]>
  ) => {
    const next = [...draft.transport];

    next[index] = {
      ...next[index],
      ...patch,
    };

    set({
      transport: next,
    });
  };

  // ============================================================
  // REMOVE VEHICLE
  // ============================================================

  const removeLine = (id: string) => {
    set({
      transport: draft.transport.filter(
        (item) => item.id !== id
      ),
    });
  };

  // ============================================================
  // VEHICLE LABEL
  // ============================================================

  const vehLabel = (
    transport: typeof draft.transport[number]
  ) => {
    const vehicle = d.travel_options.find(
      (x) => x.id === transport.travel_id
    );

    return vehicle?.vehicle_type || "Vehicle";
  };

  const finalVehicleCost = (line: typeof draft.transport[number]) => commercial(transportLineTotal(line)).final;
  const optionTotal = (option: NonNullable<typeof draft.transport_options>[number]) =>
    option.vehicles.reduce((sum, vehicle) => {
      const line = draft.transport.find((item) => item.id === vehicle.transport_line_id);
      return sum + (line ? finalVehicleCost(line) * Math.max(1, vehicle.quantity) : 0);
    }, 0);
  const optionLabel = (option: NonNullable<typeof draft.transport_options>[number]) => option.vehicles.map((vehicle) => {
    const line = draft.transport.find((item) => item.id === vehicle.transport_line_id);
    return line ? `${vehicle.quantity} ${vehLabel(line)}` : "Vehicle";
  }).join(" + ");

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-4">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="flex items-center justify-between flex-wrap gap-2">

        <div>
          <h2 className="text-lg font-semibold">
            Transport — Per Route
          </h2>

          <p className="text-xs text-muted-foreground mt-0.5">
            Showing vehicles suitable for {requestedRange ? `${requestedRange.min}–${requestedRange.max}` : requestedPax} pax.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAllVehicles((value) => !value)}>
            {showAllVehicles ? "Show suitable only" : "View all vehicles"}
          </Button>
          <Button size="sm" onClick={() => addVehicle()} disabled={eligibleOpts.length === 0}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Transport
          </Button>
        </div>

      </div>

      {/* ======================================================
          VEHICLE ADD DROPDOWN
      ====================================================== */}

      {opts.length > 0 && (
        <Card className="p-3">

          <div className="flex flex-wrap items-end gap-3">

            <div className="min-w-[320px] flex-1 space-y-1">

              <Label className="text-xs text-muted-foreground">
                Select a vehicle alternative to price independently
              </Label>

              <Select
                value=""
                onValueChange={(value) => addVehicle(value)}
              >

                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select a vehicle to add…" />
                </SelectTrigger>

                <SelectContent>

                  {opts.map((option) => {

                    const used = draft.transport.some(
                      (transport) =>
                        transport.travel_id === option.id
                    );

                    return (
                      <SelectItem
                        key={option.id}
                        value={option.id}
                        disabled={!overlapsRequest(option)}
                      >

                        {option.vehicle_type}

                        {option.capacity_persons
                          ? ` · ${option.capacity_persons} seats`
                          : ""}

                        {option.rate_per_day
                          ? ` · ${inr(option.rate_per_day)}/day`
                          : ""}

                        {used ? " (added)" : !overlapsRequest(option) ? " (outside Query pax)" : ""}

                      </SelectItem>
                    );
                  })}

                </SelectContent>

              </Select>

            </div>

          </div>

        </Card>
      )}

      {/* ======================================================
          NO VEHICLE
      ====================================================== */}

      {opts.length === 0 && (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">
            No active vehicles are available.
          </p>
        </Card>
      )}

      {draft.transport.length === 0 && opts.length > 0 && (
        <p className="text-sm text-muted-foreground">
          No transport added yet. Select a vehicle above or click
          "Add Transport" to add a vehicle column.
        </p>
      )}

      {/* ======================================================
          SELECTED VEHICLE CARDS
      ====================================================== */}

      {draft.transport.length > 0 && (
        <>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">

            {draft.transport.map((transport, index) => {

              const currentVehicle =
                d.travel_options.find(
                  (vehicle) =>
                    vehicle.id === transport.travel_id
                );

              const rowOpts =
                currentVehicle &&
                !opts.some(
                  (option) =>
                    option.id === currentVehicle.id
                )
                  ? [currentVehicle, ...opts]
                  : opts;

              const isTotalMode =
                transport.rate_mode === "total";

              return (
                <Card
                  key={transport.id}
                  className="p-2.5 space-y-2"
                >

                  {/* Vehicle heading */}

                  <div className="flex items-center justify-between">

                    <div className="text-xs font-semibold text-muted-foreground">
                      Vehicle {index + 1}
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        removeLine(transport.id)
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>

                  </div>

                  {/* Vehicle + number */}

                  <div className="grid grid-cols-[1fr_70px] gap-2">

                    <div>

                      <Label className="text-[10px]">
                        Vehicle Type
                      </Label>

                      <Select
                        value={transport.travel_id}
                        onValueChange={(value) => {

                          const selected =
                            rowOpts.find(
                              (vehicle) =>
                                vehicle.id === value
                            );

                          const perDay =
                            selected?.rate_per_day || 0;

                          const existingRates =
                            transport.per_route_rates ??
                            Array(
                              routing.length
                            ).fill(0);

                          patchLine(index, {
                            travel_id: value,

                            per_route_rates:
                              existingRates.map(
                                (rate) =>
                                  rate || perDay
                              ),

                            rate:
                              selected?.rate_per_day ||
                              0,
                          });
                        }}
                      >

                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>

                        <SelectContent>

                          {rowOpts.map((option) => (
                            <SelectItem
                              key={option.id}
                              value={option.id}
                              disabled={!overlapsRequest(option)}
                            >
                              {option.vehicle_type}
                            </SelectItem>
                          ))}

                        </SelectContent>

                      </Select>

                    </div>

                    <div>

                      <Label className="text-[10px]">
                        # Veh
                      </Label>

                      <Input
                        type="number"
                        min={1}
                        value={transport.vehicles}
                        className="h-8 text-xs"
                        onChange={(event) =>
                          patchLine(index, {
                            vehicles:
                              parseInt(
                                event.target.value
                              ) || 1,
                          })
                        }
                      />

                    </div>

                  </div>

                  {/* =================================================
                      RATE MODE
                  ================================================= */}

                  <div className="space-y-1">

                    <Label className="text-[10px]">
                      Rate Mode
                    </Label>

                    <div className="flex gap-1 text-[10px]">

                      <button
                        type="button"
                        onClick={() =>
                          patchLine(index, {
                            rate_mode: "daywise",
                          })
                        }
                        className={`flex-1 px-2 py-1 rounded ${
                          (transport.rate_mode ??
                            "daywise") ===
                          "daywise"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        Day-wise
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          patchLine(index, {
                            rate_mode: "total",
                          })
                        }
                        className={`flex-1 px-2 py-1 rounded ${
                          transport.rate_mode === "total"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        Total
                      </button>

                    </div>

                    {/* Total rate */}

                    {isTotalMode && (
                      <div>

                        <Label className="text-[10px]">
                          Total Rate (₹)
                        </Label>

                        <Input
                          type="number"
                          min={0}
                          className="h-8 text-xs text-right"
                          value={
                            transport.total_rate || ""
                          }
                          onChange={(event) => {

                            const totalValue =
                              parseFloat(
                                event.target.value
                              ) || 0;

                            const days =
                              routing.length;

                            const distributedValue =
                              days > 0
                                ? totalValue / days
                                : 0;

                            const newRates =
                              Array(days).fill(
                                distributedValue
                              );

                            patchLine(index, {
                              total_rate:
                                totalValue,

                              per_route_rates:
                                newRates,
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

          {/* ====================================================
              PER ROUTE RATES TABLE
          ==================================================== */}

          <div className="border border-[#E5E7EB] rounded-lg overflow-x-auto">

            <table className="w-full text-xs border-collapse">

              <thead className="bg-[#F3F4F6] text-[10px] uppercase text-muted-foreground tracking-wide">

                <tr className="border-b border-[#E5E7EB]">

                  <th className="text-left p-2 w-[70px]">
                    Day
                  </th>

                  <th className="text-left p-2">
                    Route
                  </th>

                  {draft.transport.map(
                    (transport, index) => (
                      <th
                        key={transport.id}
                        className="text-right p-2 min-w-[130px]"
                      >
                        {vehLabel(transport) ||
                          `V${index + 1}`}
                      </th>
                    )
                  )}

                </tr>

              </thead>

              <tbody>

                {/* ==================================================
                    ROUTING ROWS
                ================================================== */}

                {routing.map((routeItem, routeIndex) => {

                  const fromLabel =
                    routeItem.from_city ||
                    (routeIndex === 0
                      ? draft.departure_city
                      : cityName(
                          routing[
                            routeIndex - 1
                          ]?.city_id || ""
                        ) || "—");

                  const toLabel =
                    cityName(routeItem.city_id) ||
                    routeItem.to_city ||
                    "—";

                  const route =
                    fromLabel &&
                    toLabel &&
                    fromLabel !== toLabel
                      ? `${fromLabel} → ${toLabel}`
                      : `${toLabel} Local`;

                  return (
                    <tr
                      key={routeIndex}
                      className="border-b border-[#E5E7EB] bg-white"
                    >

                      <td className="p-2 font-medium">
                        Day {routeItem.day}
                      </td>

                      <td className="p-2 text-muted-foreground">
                        {route}
                      </td>

                      {draft.transport.map(
                        (transport, transportIndex) => {

                          const rates =
                            transport.per_route_rates ??
                            Array(
                              routing.length
                            ).fill(0);

                          const value =
                            rates[routeIndex] ?? 0;

                          const isTotalMode =
                            transport.rate_mode ===
                            "total";

                          return (
                            <td
                              key={transport.id}
                              className="p-2"
                            >

                              {isTotalMode ? (
                                <div className="h-7 flex items-center justify-end text-xs tabular-nums text-muted-foreground bg-muted/30 rounded px-2">
                                  —
                                </div>
                              ) : (
                                <Input
                                  type="number"
                                  min={0}
                                  className="h-7 text-xs text-right"
                                  value={
                                    value || ""
                                  }
                                  onChange={(event) => {

                                    const next = [
                                      ...(
                                        transport.per_route_rates ??
                                        Array(
                                          routing.length
                                        ).fill(0)
                                      ),
                                    ];

                                    while (
                                      next.length <
                                      routing.length
                                    ) {
                                      next.push(0);
                                    }

                                    next[
                                      routeIndex
                                    ] =
                                      parseFloat(
                                        event.target.value
                                      ) || 0;

                                    patchLine(
                                      transportIndex,
                                      {
                                        per_route_rates:
                                          next.slice(
                                            0,
                                            routing.length
                                          ),
                                      }
                                    );
                                  }}
                                />
                              )}

                            </td>
                          );
                        }
                      )}

                    </tr>
                  );
                })}

                {/* ==================================================
                    REPORTING COST
                ================================================== */}

                <tr className="bg-muted/30 border-b border-[#E5E7EB]">

                  <td
                    colSpan={2}
                    className="p-2 text-right text-[10px] uppercase text-muted-foreground"
                  >
                    Reporting Cost
                  </td>

                  {draft.transport.map(
                    (transport, index) => {

                      const isTotalMode =
                        transport.rate_mode ===
                        "total";

                      return (
                        <td
                          key={transport.id}
                          className="p-2"
                        >

                          <Input
                            type="number"
                            min={0}
                            className="h-7 text-xs text-right"
                            value={
                              isTotalMode
                                ? ""
                                : transport.reporting_cost ||
                                  ""
                            }
                            disabled={isTotalMode}
                            onChange={(event) =>
                              patchLine(index, {
                                reporting_cost:
                                  parseFloat(
                                    event.target.value
                                  ) || 0,
                              })
                            }
                          />

                        </td>
                      );
                    }
                  )}

                </tr>

                <tr className="bg-muted/10 border-b border-[#E5E7EB]">
                  <td colSpan={2} className="p-2 text-right text-[10px] uppercase text-muted-foreground">
                    Additional Costs
                  </td>
                  {draft.transport.map((transport, index) => (
                    <td key={transport.id} className="p-2 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px]"
                        onClick={() => patchLine(index, {
                          extra_costs: [...(transport.extra_costs ?? []), { id: uid(), name: "", amount: 0 }],
                        })}
                      >
                        <Plus className="mr-1 h-3 w-3" /> Add Cost Row
                      </Button>
                    </td>
                  ))}
                </tr>

                {draft.transport.flatMap((transport) =>
                  (transport.extra_costs ?? []).map((row) => (
                    <tr key={row.id} className="border-b border-[#E5E7EB]">
                      <td colSpan={2} className="p-2 text-right text-[10px] text-muted-foreground">
                        Additional Cost · {vehLabel(transport)}
                      </td>
                      {draft.transport.map((candidate, index) => (
                        <td key={candidate.id} className="p-1.5">
                          {candidate.id === transport.id && (
                            <div className="flex min-w-[210px] items-center gap-1">
                              <Input
                                className="h-7 min-w-0 text-xs"
                                placeholder="Cost name"
                                value={row.name}
                                onChange={(event) => patchLine(index, {
                                  extra_costs: (candidate.extra_costs ?? []).map((item) =>
                                    item.id === row.id ? { ...item, name: event.target.value } : item,
                                  ),
                                })}
                              />
                              <Input
                                className="h-7 w-24 text-right text-xs"
                                type="number"
                                min={0}
                                placeholder="Amount"
                                value={row.amount || ""}
                                onChange={(event) => patchLine(index, {
                                  extra_costs: (candidate.extra_costs ?? []).map((item) =>
                                    item.id === row.id ? { ...item, amount: Number(event.target.value) || 0 } : item,
                                  ),
                                })}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 shrink-0"
                                onClick={() => patchLine(index, {
                                  extra_costs: (candidate.extra_costs ?? []).filter((item) => item.id !== row.id),
                                })}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  )),
                )}

                {/* ==================================================
                    REMARKS
                ================================================== */}

                <tr className="bg-muted/10 border-b border-[#E5E7EB]">

                  <td
                    colSpan={2}
                    className="p-2 text-right text-[10px] uppercase text-muted-foreground"
                  >
                    Remarks
                  </td>

                  {draft.transport.map(
                    (transport, index) => {

                      const isTotalMode =
                        transport.rate_mode ===
                        "total";

                      return (
                        <td
                          key={transport.id}
                          className="p-2"
                        >

                          <Input
                            className="h-7 text-xs"
                            value={
                              isTotalMode
                                ? ""
                                : transport.remarks ||
                                  ""
                            }
                            disabled={isTotalMode}
                            onChange={(event) =>
                              patchLine(index, {
                                remarks:
                                  event.target.value,
                              })
                            }
                          />

                        </td>
                      );
                    }
                  )}

                </tr>

                {/* ==================================================
                    LINE TOTAL
                ================================================== */}

                <tr className="bg-primary/5 font-semibold">

                  <td
                    colSpan={2}
                    className="p-2 text-right text-xs"
                  >
                    Line Total
                  </td>

                  {draft.transport.map(
                    (transport) => (
                      <td
                        key={transport.id}
                        className="p-2 text-right tabular-nums"
                      >
                        {inr(
                          transportLineTotal(
                            transport
                          )
                        )}
                      </td>
                    )
                  )}

                </tr>

                <tr className="border-b border-[#E5E7EB]">
                  <td colSpan={2} className="p-2 text-right text-[10px] uppercase text-muted-foreground">
                    Markup ({(landMarkup(draft) * 100).toFixed(1)}%)
                  </td>
                  {draft.transport.map((transport) => (
                    <td key={transport.id} className="p-2 text-right tabular-nums">
                      {inr(commercial(transportLineTotal(transport)).markup)}
                    </td>
                  ))}
                </tr>

                <tr className="border-b border-[#E5E7EB]">
                  <td colSpan={2} className="p-2 text-right text-[10px] uppercase text-muted-foreground">
                    GST ({(landGst(draft) * 100).toFixed(1)}%)
                  </td>
                  {draft.transport.map((transport) => (
                    <td key={transport.id} className="p-2 text-right tabular-nums">
                      {inr(commercial(transportLineTotal(transport)).gst)}
                    </td>
                  ))}
                </tr>

                <tr className="bg-primary/10 font-bold text-primary">
                  <td colSpan={2} className="p-2 text-right text-xs uppercase">
                    Final Vehicle Cost
                  </td>
                  {draft.transport.map((transport) => (
                    <td key={transport.id} className="p-2 text-right tabular-nums text-sm">
                      {inr(commercial(transportLineTotal(transport)).final)}
                    </td>
                  ))}
                </tr>

              </tbody>

            </table>

          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-900">
            Each vehicle is an alternative costing scenario. Vehicle totals are not added together.
          </div>

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">Transport Options / Variations</h3><p className="text-xs text-muted-foreground">Uses the final vehicle costs above; no additional markup or GST is applied here.</p></div><Button size="sm" onClick={() => set({ transport_options: [...(draft.transport_options ?? []), { id: uid(), name: `Option ${(draft.transport_options?.length ?? 0) + 1}`, min_pax: 1, max_pax: 1, vehicles: draft.transport[0] ? [{ transport_line_id: draft.transport[0].id, quantity: 1 }] : [] }] })}><Plus className="mr-1 h-3.5 w-3.5" />Add Option</Button></div>
            {(draft.transport_options ?? []).map((option) => <Card key={option.id} className="p-3 space-y-2 bg-muted/20"><div className="grid gap-2 md:grid-cols-[1fr_100px_100px_auto]"><Input value={option.name} onChange={(event) => set({ transport_options: (draft.transport_options ?? []).map((item) => item.id === option.id ? { ...item, name: event.target.value } : item) })} placeholder="Option name" /><Input type="number" min={1} max={40} value={option.min_pax} onChange={(event) => set({ transport_options: (draft.transport_options ?? []).map((item) => item.id === option.id ? { ...item, min_pax: Math.max(1, Number(event.target.value) || 1) } : item) })} /><Input type="number" min={option.min_pax} max={40} value={option.max_pax} onChange={(event) => set({ transport_options: (draft.transport_options ?? []).map((item) => item.id === option.id ? { ...item, max_pax: Math.max(item.min_pax, Number(event.target.value) || item.min_pax) } : item) })} /><Button size="icon" variant="ghost" onClick={() => set({ transport_options: (draft.transport_options ?? []).filter((item) => item.id !== option.id) })}><Trash2 className="h-4 w-4 text-destructive" /></Button></div><div className="text-[10px] text-muted-foreground">Option name · Minimum Pax · Maximum Pax</div>{option.vehicles.map((vehicle, vehicleIndex) => { const line = draft.transport.find((item) => item.id === vehicle.transport_line_id); const final = line ? finalVehicleCost(line) : 0; return <div key={`${vehicle.transport_line_id}-${vehicleIndex}`} className="grid items-center gap-2 md:grid-cols-[1fr_80px_130px_130px_auto]"><Select value={vehicle.transport_line_id} onValueChange={(value) => set({ transport_options: (draft.transport_options ?? []).map((item) => item.id === option.id ? { ...item, vehicles: item.vehicles.map((entry, index) => index === vehicleIndex ? { ...entry, transport_line_id: value } : entry) } : item) })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{draft.transport.map((entry) => <SelectItem key={entry.id} value={entry.id}>{vehLabel(entry)}</SelectItem>)}</SelectContent></Select><Input className="h-8" type="number" min={1} value={vehicle.quantity} onChange={(event) => set({ transport_options: (draft.transport_options ?? []).map((item) => item.id === option.id ? { ...item, vehicles: item.vehicles.map((entry, index) => index === vehicleIndex ? { ...entry, quantity: Math.max(1, Number(event.target.value) || 1) } : entry) } : item) })} /><span className="text-xs text-right">{inr(final)}</span><span className="text-xs text-right font-medium">{inr(final * vehicle.quantity)}</span><Button size="icon" variant="ghost" onClick={() => set({ transport_options: (draft.transport_options ?? []).map((item) => item.id === option.id ? { ...item, vehicles: item.vehicles.filter((_, index) => index !== vehicleIndex) } : item) })}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>})}<Button size="sm" variant="outline" onClick={() => set({ transport_options: (draft.transport_options ?? []).map((item) => item.id === option.id ? { ...item, vehicles: [...item.vehicles, { transport_line_id: draft.transport[0]?.id ?? "", quantity: 1 }] } : item) })}><Plus className="mr-1 h-3.5 w-3.5" />Add Vehicle to this Option</Button><div className="text-right text-sm font-semibold">Final Total: {inr(optionTotal(option))}</div></Card>)}
          </Card>

          <Card className="p-4"><h3 className="mb-3 text-sm font-semibold">Pax-wise Transport Costing</h3><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-muted/40"><tr><th className="p-2 text-left">Vehicle / Combination</th><th className="p-2 text-right">Pax</th><th className="p-2 text-right">Rate (Per Person)</th></tr></thead><tbody>{(draft.transport_options ?? []).flatMap((option) => Array.from({ length: Math.max(0, Math.min(40, option.max_pax) - option.min_pax + 1) }, (_, offset) => { const pax = option.min_pax + offset; return <tr key={`${option.id}-${pax}`} className="border-t"><td className="p-2">{optionLabel(option)}</td><td className="p-2 text-right">{pax}</td><td className="p-2 text-right font-medium">{inr(optionTotal(option) / pax)}</td></tr>; }))}</tbody></table></div></Card>
        </>
      )}

    </div>
  );
}
