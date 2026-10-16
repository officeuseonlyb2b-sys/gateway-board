// Step 11 — Activities. Day-per-row table with inline city + activity checkboxes.
import { useEffect, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";
import { useDB, activityPricingForPax } from "@/lib/mock-store";
import {
  effectivePaxForPricing,
  getCostingPaxValues,
  landMarkup,
  landGst,
} from "@/lib/wizard/calc";
import { applyLandCommercials, optionalActivitySellingRows } from "@/lib/wizard/land-pricing";
import {
  eligibleActivitiesForDay,
  isSelectedLandServiceValid,
} from "@/lib/wizard/land-eligibility";
import { uid, dayDestInfo, type StepProps } from "../shared";

export function Step11({ draft, set }: StepProps) {
  const d = useDB();
  const traveler = draft.traveler_type ?? "indian";
  const pax = effectivePaxForPricing(draft);
  const costingPaxValues = getCostingPaxValues(draft);
  const [addForDay, setAddForDay] = useState<number | null>(null);
  const [activitySearch, setActivitySearch] = useState("");
  // Land Part markup & GST — same treatment as Guide / Entrances / Misc.
  const mkPct = landMarkup(draft);
  const gstPct = landGst(draft);

  const cityName = (id: string) => d.cities.find((c) => c.id === id)?.name || "";

  const findLine = (activityId: string, day: number) =>
    draft.activities.find(
      (x) => x.activity_id === activityId && (x.from_routing_days ?? []).includes(day),
    );

  const slabRate = (a: (typeof d.activities)[number]) => {
    const resolved = activityPricingForPax(a, pax, traveler);
    return {
      rate: resolved.rate,
      perPerson: resolved.per_person,
      slab: resolved.slab,
      isSlab: resolved.pricing_mode === "slab",
    };
  };

  const toggle = (a: (typeof d.activities)[number], day: number) => {
    const existing = findLine(a.id, day);

    /*
     * Unselect activity.
     */
    if (existing) {
      set({
        activities: draft.activities.filter((x) => x.id !== existing.id),
      });

      return;
    }

    const resolved = activityPricingForPax(a, pax, traveler);

    /*
     * IMPORTANT:
     *
     * SLAB:
     *   qty = 1
     *   rate = TOTAL slab amount
     *
     * PER PERSON:
     *   qty = pax
     *   rate = per-person amount
     */
    set({
      activities: [
        ...draft.activities,
        {
          id: uid(),
          activity_id: a.id,
          qty: resolved.qty,
          rate: resolved.rate,
          pricing_mode: resolved.pricing_mode,
          inclusion_status: "included",
          from_routing_days: [day],
        },
      ],
    });
    setAddForDay(null);
    setActivitySearch("");
  };

  // Re-price selected activities when the traveler type (or pax) changes.
  useEffect(() => {
    let dirty = false;
    const next = draft.activities.map((l) => {
      if (!l.activity_id) return l;
      const a = d.activities.find((x) => x.id === l.activity_id);
      if (!a) return l;
      const resolved = activityPricingForPax(a, pax, traveler);
      if (
        l.rate === resolved.rate &&
        l.pricing_mode === resolved.pricing_mode &&
        l.qty === resolved.qty
      )
        return l;
      dirty = true;
      return { ...l, rate: resolved.rate, pricing_mode: resolved.pricing_mode, qty: resolved.qty };
    });
    if (dirty) set({ activities: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traveler, pax, d.activities]);

  /*
   * Per-day rows:
   * Build list of activities per day,
   * grouped by city inside the cell.
   */
  type RowGroup = {
    cityName: string;
    activities: typeof d.activities;
  };

  const perDayGroups = (r: (typeof draft.routing)[number]): RowGroup[] => {
    const { names } = dayDestInfo(r, d.cities);

    return names.map((n) => ({
      cityName: n,

      activities: eligibleActivitiesForDay(draft, r, d).filter((a) => {
        const destName = d.activity_destinations.find((x) => x.id === a.destination_id)?.name;
        return destName === n;
      }),
    }));
  };

  /*
   * Selected activities for breakdown.
   *
   * IMPORTANT:
   * Determine slab mode from the ACTIVITY master,
   * not only from the draft line.
   *
   * This protects against old draft records that may
   * have pricing_mode saved incorrectly.
   */
  const selectedActivities = draft.activities
    .filter(
      (line) =>
        line.activity_id &&
        line.inclusion_status !== "optional" &&
        isSelectedLandServiceValid(
          "activity",
          line.activity_id,
          line.from_routing_days?.[0],
          draft,
          d,
        ),
    )
    .map((line) => {
      const activity = d.activities.find((candidate) => candidate.id === line.activity_id);
      return activity ? { activity } : null;
    })
    .filter(Boolean) as Array<{ activity: (typeof d.activities)[number] }>;

  const selectableCount = draft.routing.reduce(
    (total, routingDay) =>
      total +
      perDayGroups(routingDay).reduce((dayTotal, group) => dayTotal + group.activities.length, 0),
    0,
  );
  const selectedMasterLines = draft.activities.filter((line) => line.activity_id);
  const includedCount = selectedMasterLines.filter(
    (line) => line.inclusion_status !== "optional",
  ).length;
  const optionalCount = selectedMasterLines.filter(
    (line) => line.inclusion_status === "optional",
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Activities &amp; Experiences</h2>

        {/* <Badge variant="secondary" className="text-[10px]">
          Pax used: {pax}
        </Badge> */}
      </div>

      {draft.routing.length === 0 && (
        <p className="text-sm text-muted-foreground">Add routing days first (Step 9).</p>
      )}

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Part 1
        </div>
        <h3 className="text-sm font-semibold">Day-wise Activity Selection</h3>
      </div>

      {/* =========================================================
          DAY-WISE ACTIVITIES
         ========================================================= */}
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
              const fromDefault =
                ri === 0 ? draft.departure_city : cityName(draft.routing[ri - 1]?.city_id || "");

              const routeLabel = `${r.from_city ?? fromDefault ?? "—"} → ${
                cityName(r.city_id) || r.to_city || "—"
              }`;

              const groups = perDayGroups(r);

              const hasAny = groups.some((g) =>
                g.activities.some((activity) => findLine(activity.id, r.day)),
              );

              return (
                <tr key={ri} className="border-b border-[#E5E7EB] align-top bg-white">
                  <td className="p-2 font-semibold">Day {r.day}</td>

                  <td className="p-2 text-muted-foreground text-[11px]">
                    {r.date && <div className="font-medium text-foreground">{r.date}</div>}
                    {routeLabel}
                  </td>

                  <td className="p-2">
                    {!hasAny ? (
                      <div className="space-y-2">
                        <div className="text-[11px] text-muted-foreground italic">
                          No activities selected for this day.
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setAddForDay(r.day)}>
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Add Activity for Day {r.day}
                        </Button>
                      </div>
                    ) : (
                      <div className="min-w-[880px] space-y-2">
                        <div className="grid grid-cols-[110px_minmax(180px,1.5fr)_105px_minmax(190px,1.4fr)_95px_150px_65px] gap-2 border-b px-2 pb-1 text-[9px] font-medium uppercase text-muted-foreground">
                          <span>City</span>
                          <span>Activity / Experience</span>
                          <span>Rate Basis</span>
                          <span>Pax Range / Rate Details</span>
                          <span className="text-right">Base Rate</span>
                          <span>Included / Optional</span>
                          <span className="text-center">Action</span>
                        </div>
                        {groups.map((g) => (
                          <div key={g.cityName}>
                            <div className="text-[10px] uppercase text-muted-foreground mb-0.5">
                              {g.cityName}
                            </div>

                            <div className="space-y-1">
                              {g.activities.filter((activity) => findLine(activity.id, r.day))
                                .length === 0 ? (
                                <div className="text-[11px] text-muted-foreground italic">
                                  No activities.
                                </div>
                              ) : (
                                g.activities
                                  .filter((activity) => findLine(activity.id, r.day))
                                  .map((a) => {
                                    const line = findLine(a.id, r.day);

                                    const on = !!line;

                                    const { rate, perPerson, slab, isSlab } = slabRate(a);

                                    const slabMode = isSlab;

                                    return (
                                      <div
                                        key={a.id}
                                        className={cn(
                                          "grid grid-cols-[110px_minmax(180px,1.5fr)_105px_minmax(190px,1.4fr)_95px_150px_65px] items-center gap-2 rounded px-2 py-1.5",
                                          on && "bg-accent/5",
                                        )}
                                      >
                                        <div className="truncate text-[11px] font-medium">
                                          {g.cityName}
                                        </div>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          onClick={() => toggle(a, r.day)}
                                          className="col-start-7 justify-self-center"
                                          aria-label={`Delete ${a.activity_name}`}
                                        >
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>

                                        <div className="col-start-2 row-start-1 min-w-0">
                                          <div className="text-sm font-medium truncate">
                                            {a.activity_name}
                                          </div>

                                          <div className="text-[10px] text-muted-foreground">
                                            {slabMode
                                              ? slab
                                                ? `SLAB ${slab.from_pax}-${slab.to_pax}: ${inr(rate)} total → ${inr(perPerson)}/person for ${pax} pax`
                                                : `SLAB · ${inr(rate)} total → ${inr(perPerson)}/person for ${pax} pax`
                                              : `PER PERSON · ${inr(perPerson)}/person`}
                                          </div>
                                        </div>

                                        <div className="col-start-3 row-start-1 text-[10px] font-medium uppercase">
                                          {slabMode
                                            ? "Custom Slabs"
                                            : a.pricing_type === "per_person"
                                              ? "Per Person"
                                              : "Fixed Group"}
                                        </div>

                                        <div className="col-start-4 row-start-1 text-[10px] text-muted-foreground">
                                          {slabMode && slab
                                            ? `${slab.from_pax}-${slab.to_pax} pax`
                                            : a.pricing_type === "per_person"
                                              ? `${inr(perPerson)} per person`
                                              : `${inr(rate)} per group`}
                                        </div>

                                        {on && line && (
                                          <div className="col-start-6 row-start-1 flex rounded border p-0.5 text-[10px]">
                                            <button
                                              type="button"
                                              className={cn(
                                                "rounded px-2 py-1",
                                                line.inclusion_status !== "optional" &&
                                                  "bg-primary text-primary-foreground",
                                              )}
                                              onClick={() =>
                                                set({
                                                  activities: draft.activities.map((item) =>
                                                    item.id === line.id
                                                      ? { ...item, inclusion_status: "included" }
                                                      : item,
                                                  ),
                                                })
                                              }
                                            >
                                              Included
                                            </button>
                                            <button
                                              type="button"
                                              className={cn(
                                                "rounded px-2 py-1",
                                                line.inclusion_status === "optional" &&
                                                  "bg-primary text-primary-foreground",
                                              )}
                                              onClick={() =>
                                                set({
                                                  activities: draft.activities.map((item) =>
                                                    item.id === line.id
                                                      ? { ...item, inclusion_status: "optional" }
                                                      : item,
                                                  ),
                                                })
                                              }
                                            >
                                              Optional
                                            </button>
                                          </div>
                                        )}

                                        {/* =================================================
                                            IMPORTANT:
                                            For slab, this is TOTAL.
                                            It is NOT rate × pax.
                                           ================================================= */}
                                        <div
                                          className={cn(
                                            "col-start-5 row-start-1 text-right tabular-nums text-[11px] font-semibold",
                                            !on && "opacity-40",
                                          )}
                                        >
                                          {on ? inr(rate) : inr(0)}
                                        </div>
                                      </div>
                                    );
                                  })
                              )}
                            </div>
                          </div>
                        ))}
                        <Button size="sm" variant="outline" onClick={() => setAddForDay(r.day)}>
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Add Activity for Day {r.day}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog
        open={addForDay != null}
        onOpenChange={(open) => {
          if (!open) {
            setAddForDay(null);
            setActivitySearch("");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Activity for Day {addForDay}</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={activitySearch}
              onChange={(event) => setActivitySearch(event.target.value)}
              placeholder="Search eligible activities"
            />
          </div>
          <div className="max-h-[55vh] divide-y overflow-y-auto rounded-md border">
            {(() => {
              const route = draft.routing.find((day) => day.day === addForDay);
              if (!route) return null;
              const eligible = eligibleActivitiesForDay(draft, route, d).filter(
                (activity) =>
                  !findLine(activity.id, route.day) &&
                  activity.activity_name
                    .toLowerCase()
                    .includes(activitySearch.trim().toLowerCase()),
              );
              if (!eligible.length)
                return (
                  <div className="p-4 text-sm text-muted-foreground">
                    No eligible activities found for this routing day.
                  </div>
                );
              return eligible.map((activity) => {
                const pricing = slabRate(activity);
                const city = d.activity_destinations.find(
                  (destination) => destination.id === activity.destination_id,
                )?.name;
                return (
                  <button
                    key={activity.id}
                    type="button"
                    onClick={() => toggle(activity, route.day)}
                    className="grid w-full grid-cols-[120px_1fr_110px] gap-3 p-3 text-left hover:bg-muted/40"
                  >
                    <span className="text-xs text-muted-foreground">{city}</span>
                    <span>
                      <span className="block text-sm font-medium">{activity.activity_name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {pricing.isSlab
                          ? "Custom Pax Slabs"
                          : activity.pricing_type === "per_person"
                            ? "Per Person"
                            : "Fixed Group"}
                      </span>
                    </span>
                    <span className="text-right text-xs font-semibold">{inr(pricing.rate)}</span>
                  </button>
                );
              });
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {draft.activities.some(
        (line) =>
          line.activity_id &&
          !isSelectedLandServiceValid(
            "activity",
            line.activity_id,
            line.from_routing_days?.[0],
            draft,
            d,
          ),
      ) && (
        <Card className="border-amber-300 bg-amber-50/50 p-3">
          <div className="text-xs font-semibold text-amber-800">
            Not applicable to current routing
          </div>
          {draft.activities
            .filter(
              (line) =>
                line.activity_id &&
                !isSelectedLandServiceValid(
                  "activity",
                  line.activity_id,
                  line.from_routing_days?.[0],
                  draft,
                  d,
                ),
            )
            .map((line) => (
              <div key={line.id} className="mt-2 flex items-center justify-between text-xs">
                <span>
                  {d.activities.find((activity) => activity.id === line.activity_id)
                    ?.activity_name || "Historical activity"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    set({ activities: draft.activities.filter((item) => item.id !== line.id) })
                  }
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            ))}
        </Card>
      )}

      <Card className="p-3">
        <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Activity Selection Summary
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Total Selected", selectedMasterLines.length],
            ["Included", includedCount],
            ["Optional", optionalCount],
            ["Not Selected", Math.max(0, selectableCount - selectedMasterLines.length)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border bg-muted/20 px-3 py-2">
              <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
              <div className="text-lg font-semibold tabular-nums">{value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* =========================================================
          PER PERSON COST BREAKDOWN
         ========================================================= */}
      {selectedActivities.length > 0 && (
        <Card className="p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Part 2
          </div>
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
            Per Person Cost Breakdown
            <span className="ml-2 font-normal normal-case">(Included Activities Only)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-2 w-[110px]">Person Range</th>

                  {selectedActivities.map(({ activity }) => (
                    <th key={activity.id} className="text-right p-2 truncate">
                      {activity.activity_name}
                    </th>
                  ))}

                  <th className="text-right p-2 w-[110px]">Service Total</th>
                  <th className="text-right p-2 w-[90px]">Markup</th>
                  <th className="text-right p-2 w-[90px]">GST</th>
                  <th className="text-right p-2 w-[110px]">Final / Pax</th>
                </tr>
              </thead>

              <tbody>
                {costingPaxValues.map((n) => {
                  const rowPerPerson = selectedActivities.map(({ activity }) => {
                    return activityPricingForPax(activity, n, traveler).per_person;
                  });

                  const rowTotal = rowPerPerson.reduce((s, v) => s + v, 0);
                  const commercial = applyLandCommercials(draft, rowTotal);

                  return (
                    <tr key={n} className="border-b">
                      <td className="p-2 font-medium">{n} pax</td>

                      {rowPerPerson.map((v, ci) => (
                        <td key={ci} className="p-2 text-right tabular-nums">
                          {inr(v)}
                        </td>
                      ))}

                      <td className="p-2 text-right tabular-nums">{inr(rowTotal)}</td>
                      <td className="p-2 text-right tabular-nums">{inr(commercial.markup)}</td>
                      <td className="p-2 text-right tabular-nums">{inr(commercial.gst)}</td>
                      <td className="p-2 text-right tabular-nums font-semibold">
                        {inr(commercial.final)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-muted-foreground mt-2">
            Slab activities keep the same total; per-person activities scale linearly. Total
            includes Land Part markup {(mkPct * 100).toFixed(1)}% and GST{" "}
            {(gstPct * 100).toFixed(1)}%.
          </p>
        </Card>
      )}

      {draft.activities.some(
        (line) =>
          line.activity_id &&
          line.inclusion_status === "optional" &&
          isSelectedLandServiceValid(
            "activity",
            line.activity_id,
            line.from_routing_days?.[0],
            draft,
            d,
          ),
      ) && (
        <Card className="p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Part 3
          </div>
          <h3 className="text-sm font-semibold">Optional Activities — For Additional Sale</h3>
          <div className="mt-3 space-y-3">
            {draft.activities
              .filter(
                (line) =>
                  line.activity_id &&
                  line.inclusion_status === "optional" &&
                  isSelectedLandServiceValid(
                    "activity",
                    line.activity_id,
                    line.from_routing_days?.[0],
                    draft,
                    d,
                  ),
              )
              .filter(
                (line, index, lines) =>
                  lines.findIndex((candidate) => candidate.activity_id === line.activity_id) ===
                  index,
              )
              .map((line) => {
                const activity = d.activities.find((item) => item.id === line.activity_id);
                if (!activity) return null;
                const rows = optionalActivitySellingRows(draft, activity, traveler, pax);
                const isSlab = rows.some((row) => row.rate_basis === "custom_slab");
                const location = d.activity_destinations.find(
                  (destination) => destination.id === activity.destination_id,
                )?.name;
                return (
                  <div key={line.id} className="overflow-hidden rounded-lg border">
                    <div className="border-b bg-muted/30 px-3 py-2">
                      <div className="text-sm font-medium">{activity.activity_name}</div>
                      {location && (
                        <div className="text-[11px] text-muted-foreground">{location}</div>
                      )}
                      <div className="text-[10px] uppercase text-muted-foreground">
                        {isSlab
                          ? "Custom Pax Slabs"
                          : rows[0]?.rate_basis === "per_person"
                            ? "Per Person"
                            : "Fixed Group"}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[620px] text-xs">
                        <thead className="bg-muted/20 text-[10px] uppercase text-muted-foreground">
                          <tr>
                            <th className="p-2 text-left">Pax Range</th>
                            <th className="p-2 text-right">
                              {rows[0]?.rate_basis === "per_person"
                                ? "Base Per Person"
                                : rows[0]?.rate_basis === "fixed_group"
                                  ? "Base Group Rate"
                                  : "Base Rate"}
                            </th>
                            <th className="p-2 text-right">Markup</th>
                            <th className="p-2 text-right">GST</th>
                            <th className="p-2 text-right">
                              {rows[0]?.rate_basis === "per_person"
                                ? "Selling Price Per Person"
                                : "Selling Price"}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.id} className="border-t">
                              <td className="p-2">
                                {row.min_pax != null && row.max_pax != null
                                  ? `${row.min_pax}–${row.max_pax}`
                                  : row.rate_basis === "per_person"
                                    ? "Per Person"
                                    : "Fixed Group"}
                              </td>
                              <td className="p-2 text-right">{inr(row.base_rate)}</td>
                              <td className="p-2 text-right">{inr(row.markup)}</td>
                              <td className="p-2 text-right">{inr(row.gst)}</td>
                              <td className="p-2 text-right font-semibold">
                                {inr(row.selling_price)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* =========================================================
          CUSTOM / OTHER ACTIVITIES
         ========================================================= */}
      {draft.activities.some((line) => line.custom_name) && (
        <Card className="p-3 space-y-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Historical Custom Activities
          </div>

          <p className="text-[10px] text-muted-foreground">
            Legacy entries are shown read-only. New activities are created in Activity Master.
          </p>

          {draft.activities
            .filter((x) => x.custom_name)
            .map((x) => (
              <div key={x.id} className="text-xs flex justify-between p-2 bg-muted/30 rounded">
                <span>
                  {x.custom_name} × {x.qty}
                </span>

                <span>{inr(x.rate * x.qty)}</span>
              </div>
            ))}
        </Card>
      )}
    </div>
  );
}
