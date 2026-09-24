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
import { effectivePaxForPricing, parsePaxRange, transportLineTotal } from "@/lib/wizard/calc";
import { uid, type StepProps } from "../shared";

// ============================================================
// STEP 10 — Transport
// ============================================================

export function Step10({ draft, set }: StepProps) {
  const d = useDB();
  const [showAllVehicles, setShowAllVehicles] = useState(false);
  const [showCapacityPreview, setShowCapacityPreview] = useState(false);
  const requestedPax = Math.max(1, effectivePaxForPricing(draft));
  const requestedRange = parsePaxRange(draft);

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

  // ============================================================
  // PER PERSON BREAKDOWN
  // ============================================================
  //
  // Show 1–40 pax so large group costing can also be checked.
  // ============================================================

  const paxRange = showCapacityPreview
    ? Array.from(
        { length: Math.max(requestedPax, ...draft.transport.map((line) => {
          const vehicle = d.travel_options.find((item) => item.id === line.travel_id);
          return Math.min(45, vehicle?.max_pax ?? vehicle?.capacity_persons ?? requestedPax);
        })) },
        (_, index) => index + 1,
      )
    : requestedRange
      ? Array.from({ length: requestedRange.max - requestedRange.min + 1 }, (_, index) => requestedRange.min + index)
      : [requestedPax];

  const lineTotals = draft.transport.map((transport) =>
    transportLineTotal(transport)
  );

  const breakdownData = paxRange.map((paxCount) => {
    const perVehicle: Record<string, number | undefined> = {};

    draft.transport.forEach((transport, index) => {
      const vehicle = d.travel_options.find((item) => item.id === transport.travel_id);
      if (!vehicle || !fitsPax(vehicle, paxCount)) {
        perVehicle[transport.id] = undefined;
        return;
      }
      const lineTotal = lineTotals[index] || 0;

      const perPerson =
        paxCount > 0 ? lineTotal / paxCount : 0;

      perVehicle[transport.id] = perPerson;

    });

    return {
      pax: paxCount,
      perVehicle,
    };
  });

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

              </tbody>

            </table>

          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-900">
            Each vehicle is an alternative costing scenario. Vehicle totals are not added together.
          </div>

          {/* ====================================================
              PER PERSON BREAKDOWN
          ==================================================== */}

          {draft.transport.length > 0 && (
            <Card className="p-4 border-2 border-primary/20 bg-primary/5 mt-4">

              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-primary">Per-Person Cost Breakdown</h3>
                  <p className="text-[11px] text-muted-foreground">Default view follows this Query's exact pax/range.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowCapacityPreview((value) => !value)}>
                  {showCapacityPreview ? "Query pax only" : "Preview vehicle capacity"}
                </Button>
              </div>

              <div className="overflow-x-auto">

                <table className="w-full text-xs border-collapse">

                  <thead className="bg-muted/20 text-[10px] uppercase text-muted-foreground">

                    <tr>

                      <th className="text-left p-2">
                        Pax
                      </th>

                      {draft.transport.map(
                        (transport) => (
                          <th
                            key={transport.id}
                            className="text-right p-2 min-w-[110px]"
                          >

                            {vehLabel(transport)}

                            <div className="font-normal text-[9px] text-muted-foreground">
                              total{" "}
                              {inr(
                                transportLineTotal(
                                  transport
                                )
                              )}
                            </div>

                          </th>
                        )
                      )}

                    </tr>

                  </thead>

                  <tbody>

                    {breakdownData.map((row) => (

                      <tr
                        key={row.pax}
                        className="border-t border-muted-foreground/20 hover:bg-muted/10"
                      >

                        <td className="p-2 font-medium">
                          {row.pax} pax
                        </td>

                        {draft.transport.map(
                          (transport) => (
                            <td
                              key={transport.id}
                              className="p-2 text-right tabular-nums"
                            >
                              {row.perVehicle[transport.id] == null
                                ? "—"
                                : inr(row.perVehicle[transport.id] || 0)}
                            </td>
                          )
                        )}

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

              <div className="mt-2 text-[11px] text-muted-foreground">
                * Each column is an independent alternative: that vehicle's tour cost divided by pax.
              </div>

            </Card>
          )}

        </>
      )}

    </div>
  );
}
