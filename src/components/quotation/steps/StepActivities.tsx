// Step 11 — Activities. Day-per-row table with inline city + activity checkboxes.
import { useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";
import { useDB, activityPricingForPax } from "@/lib/mock-store";
import { effectivePaxForPricing, landMarkup, landGst } from "@/lib/wizard/calc";
import {
  uid,
  dayDestInfo,
  CustomAdd,
  type StepProps,
} from "../shared";

export function Step11({ draft, set }: StepProps) {
  const d = useDB();
  const traveler = draft.traveler_type ?? "indian";
  const pax = effectivePaxForPricing(draft);
  // Land Part markup & GST — same treatment as Guide / Entrances / Misc.
  const mkPct = landMarkup(draft);
  const gstPct = landGst(draft);
  const withMarkupGst = (base: number) =>
    base * (1 + mkPct) * (1 + gstPct);

  const cityName = (id: string) =>
    d.cities.find((c) => c.id === id)?.name || "";

  const findLine = (
    activityId: string,
    day: number
  ) =>
    draft.activities.find(
      (x) =>
        x.activity_id === activityId &&
        (x.from_routing_days ?? []).includes(day)
    );

  const slabRate = (
    a: typeof d.activities[number]
  ) => {
    const resolved = activityPricingForPax(a, pax, traveler);
    return {
      rate: resolved.rate,
      perPerson: resolved.per_person,
      slab: resolved.slab,
      isSlab: resolved.pricing_mode === "slab",
    };
  };

  const toggle = (
    a: typeof d.activities[number],
    day: number
  ) => {
    const existing = findLine(a.id, day);

    /*
     * Unselect activity.
     */
    if (existing) {
      set({
        activities: draft.activities.filter(
          (x) => x.id !== existing.id
        ),
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
          from_routing_days: [day],
        },
      ],
    });
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
      ) return l;
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

  const perDayGroups = (
    r: typeof draft.routing[number]
  ): RowGroup[] => {
    const { names } = dayDestInfo(
      r,
      d.cities
    );

    return names.map((n) => ({
      cityName: n,

      activities:
        d.activities.filter((a) => {
          if (!a.is_active) return false;

          const destName =
            d.activity_destinations.find(
              (x) =>
                x.id === a.destination_id
            )?.name;

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
  const selectedActivities = useMemo(() => {
    return draft.activities
      .filter((x) => x.activity_id)
      .map((line) => {
        const activity =
          d.activities.find(
            (x) =>
              x.id === line.activity_id
          );

        if (!activity) return null;

        return { activity };
      })
      .filter(Boolean) as Array<{
      activity: typeof d.activities[number];
    }>;
  }, [
    draft.activities,
    d.activities,
    pax,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">
          Activities &amp; Experiences
        </h2>

        {/* <Badge variant="secondary" className="text-[10px]">
          Pax used: {pax}
        </Badge> */}
      </div>

      {draft.routing.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Add routing days first (Step 9).
        </p>
      )}

      {/* =========================================================
          DAY-WISE ACTIVITIES
         ========================================================= */}
      <div className="border border-[#E5E7EB] rounded-lg overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-[#F3F4F6] text-[10px] uppercase text-muted-foreground tracking-wide">
            <tr className="border-b border-[#E5E7EB]">
              <th className="text-left p-2 w-[60px]">
                Day
              </th>

              <th className="text-left p-2 w-[170px]">
                Route
              </th>

              <th className="text-left p-2">
                City + Activity
              </th>
            </tr>
          </thead>

          <tbody>
            {draft.routing.map((r, ri) => {
              const fromDefault =
                ri === 0
                  ? draft.departure_city
                  : cityName(
                      draft.routing[
                        ri - 1
                      ]?.city_id || ""
                    );

              const routeLabel = `${r.from_city ?? fromDefault ?? "—"} → ${
                cityName(r.city_id) ||
                r.to_city ||
                "—"
              }`;

              const groups =
                perDayGroups(r);

              const hasAny = groups.some(
                (g) =>
                  g.activities.length > 0
              );

              return (
                <tr
                  key={ri}
                  className="border-b border-[#E5E7EB] align-top bg-white"
                >
                  <td className="p-2 font-semibold">
                    Day {r.day}
                  </td>

                  <td className="p-2 text-muted-foreground text-[11px]">
                    {routeLabel}
                  </td>

                  <td className="p-2">
                    {!hasAny ? (
                      <div className="text-[11px] text-muted-foreground italic">
                        No activities configured
                        for this day's cities.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {groups.map((g) => (
                          <div
                            key={g.cityName}
                          >
                            <div className="text-[10px] uppercase text-muted-foreground mb-0.5">
                              {g.cityName}
                            </div>

                            <div className="space-y-1">
                              {g.activities
                                .length === 0 ? (
                                <div className="text-[11px] text-muted-foreground italic">
                                  No activities.
                                </div>
                              ) : (
                                g.activities.map(
                                  (a) => {
                                    const line =
                                      findLine(
                                        a.id,
                                        r.day
                                      );

                                    const on =
                                      !!line;

                                    const {
                                      rate,
                                      perPerson,
                                      slab,
                                      isSlab,
                                    } =
                                      slabRate(a);

                                    const slabMode =
                                      isSlab;

                                    return (
                                      <div
                                        key={
                                          a.id
                                        }
                                        className={cn(
                                          "flex items-center gap-2 rounded px-1.5 py-1",
                                          on &&
                                            "bg-accent/5"
                                        )}
                                      >
                                        <Checkbox
                                          checked={
                                            on
                                          }
                                          onCheckedChange={() =>
                                            toggle(
                                              a,
                                              r.day
                                            )
                                          }
                                        />

                                        <div className="flex-1 min-w-0">
                                          <div className="text-sm font-medium truncate">
                                            {
                                              a.activity_name
                                            }
                                          </div>

                                          <div className="text-[10px] text-muted-foreground">
                                            {slabMode
                                              ? slab
                                                ? `SLAB ${slab.from_pax}-${slab.to_pax}: ${inr(rate)} total → ${inr(perPerson)}/person for ${pax} pax`
                                                : `SLAB · ${inr(rate)} total → ${inr(perPerson)}/person for ${pax} pax`
                                              : `PER PERSON · ${inr(perPerson)}/person`}
                                          </div>
                                        </div>

                                        {/* =================================================
                                            IMPORTANT:
                                            For slab, this is TOTAL.
                                            It is NOT rate × pax.
                                           ================================================= */}
                                        <div
                                          className={cn(
                                            "w-24 text-right tabular-nums text-[11px] font-semibold",
                                            !on &&
                                              "opacity-40"
                                          )}
                                        >
                                          {on
                                            ? inr(
                                                rate
                                              )
                                            : inr(
                                                0
                                              )}
                                        </div>
                                      </div>
                                    );
                                  }
                                )
                              )}
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

      {/* =========================================================
          PER PERSON COST BREAKDOWN
         ========================================================= */}
      {selectedActivities.length > 0 && (
        <Card className="p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
            Per Person Cost Breakdown
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-2 w-[110px]">
                    Person Range
                  </th>

                  {selectedActivities.map(
                    ({ activity }) => (
                      <th
                        key={activity.id}
                        className="text-right p-2 truncate"
                      >
                        {
                          activity.activity_name
                        }
                      </th>
                    )
                  )}

                  <th className="text-right p-2 w-[110px]">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {Array.from(
                  {
                    length: Math.max(
                      1,
                      pax
                    ),
                  },
                  (_, i) => i + 1
                ).map((n) => {
                          const rowPerPerson =
                    selectedActivities.map(
                      ({ activity }) => {
                                return activityPricingForPax(activity, n, traveler).per_person;
                      }
                    );

                  const rowTotal =
                    rowPerPerson.reduce(
                      (s, v) =>
                        s + v,
                      0
                    );

                  return (
                    <tr
                      key={n}
                      className="border-b"
                    >
                      <td className="p-2 font-medium">
                        {n} pax
                      </td>

                      {rowPerPerson.map(
                        (v, ci) => (
                          <td
                            key={ci}
                            className="p-2 text-right tabular-nums"
                          >
                            {inr(v)}
                          </td>
                        )
                      )}

                      <td className="p-2 text-right tabular-nums font-semibold">
                        {inr(
                          withMarkupGst(
                            rowTotal
                          )
                        )}
                        <div className="text-[9px] font-normal text-muted-foreground">
                          base {inr(rowTotal)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-muted-foreground mt-2">
            Slab activities keep the same total;
            per-person activities scale linearly.
            Total includes Land Part markup{" "}
            {(mkPct * 100).toFixed(1)}% and GST{" "}
            {(gstPct * 100).toFixed(1)}%.
          </p>
        </Card>
      )}

      {/* =========================================================
          CUSTOM / OTHER ACTIVITIES
         ========================================================= */}
      <Card className="p-3 space-y-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground">
          Custom / Other Activities
        </div>

        <CustomAdd
          label="Custom Activity"
          onAdd={(name, rate) =>
            set({
              activities: [
                ...draft.activities,
                {
                  id: uid(),
                  custom_name: name,
                  qty: 1,
                  rate,
                },
              ],
            })
          }
        />

        {draft.activities
          .filter((x) => x.custom_name)
          .map((x) => (
            <div
              key={x.id}
              className="text-xs flex justify-between p-2 bg-muted/30 rounded"
            >
              <span>
                {x.custom_name} × {x.qty}
              </span>

              <span>
                {inr(
                  x.rate * x.qty
                )}

                <button
                  className="ml-2 text-destructive"
                  onClick={() =>
                    set({
                      activities:
                        draft.activities.filter(
                          (y) =>
                            y.id !==
                            x.id
                        ),
                    })
                  }
                >
                  ×
                </button>
              </span>
            </div>
          ))}
      </Card>
    </div>
  );
}