// StepMeals.tsx
// Main table: each city in one row with source and rate for Lunch and Dinner.
// Breakdown Summary: Simplified, showing only Source and Total (no PP/Pax).

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDB, restaurantsForCityNames } from "@/lib/mock-store";
import { findRatePlan } from "@/lib/wizard/rate-lookup";
import { totalPax } from "@/lib/wizard/calc";
import { inr, addDaysISO } from "@/lib/format";
import type { StepProps } from "../shared";
import type { RoutingDay } from "@/lib/wizard/types";

// ====== Types ======
type MealType = "Lunch" | "Dinner";
type MealSource = "none" | "hotel" | "restaurant";

interface MealSelection {
  day: number;
  city: string;
  mealType: MealType;
  source: MealSource;
  hotel_id?: string;
  restaurant_id?: string;
}

// ====== Helpers ======
function getSelection(
  selections: MealSelection[],
  day: number,
  city: string,
  mealType: MealType
): MealSelection | undefined {
  return selections.find(
    (s) => s.day === day && s.city === city && s.mealType === mealType
  );
}

function setSelection(
  prev: MealSelection[],
  patch: Partial<MealSelection> & { day: number; city: string; mealType: MealType }
): MealSelection[] {
  const idx = prev.findIndex(
    (s) => s.day === patch.day && s.city === patch.city && s.mealType === patch.mealType
  );
  const existing = idx >= 0 ? prev[idx] : undefined;
  const updated: MealSelection = {
    day: patch.day,
    city: patch.city,
    mealType: patch.mealType,
    source: patch.source ?? existing?.source ?? "none",
    hotel_id: patch.hotel_id ?? existing?.hotel_id,
    restaurant_id: patch.restaurant_id ?? existing?.restaurant_id,
  };
  if (idx >= 0) {
    const copy = [...prev];
    copy[idx] = updated;
    return copy;
  }
  return [...prev, updated];
}

const getSafeCityIds = (r: RoutingDay): string[] => {
  if (!r) return [];

  const raw: unknown = r.to_city_ids;

  if (Array.isArray(raw)) {
    return raw.filter((id) => id != null && String(id).trim() !== "").map(String);
  }

  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return [];
    try {
      if (text.startsWith("[") && text.endsWith("]")) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return parsed.filter((id) => id != null && String(id).trim() !== "").map(String);
        }
      }
    } catch {
      /* fall through to comma split */
    }
    return text.split(",").map((s) => s.trim()).filter(Boolean);
  }

  if (r.to_city_id) return [r.to_city_id];
  if (r.city_id) return [r.city_id];

  return [];
};

/** Meals already covered by the hotel's meal plan for that day/city. */
function coveredByPlan(mealPlan?: string): { Lunch: boolean; Dinner: boolean } {
  const mp = (mealPlan || "").toUpperCase();
  if (mp === "AP") return { Lunch: true, Dinner: true };
  if (mp === "MAP") return { Lunch: false, Dinner: true };
  return { Lunch: false, Dinner: false };
}

// ====== Main component ======
export function StepMeals({ draft, set }: StepProps) {
  const d = useDB();
  const pax = Math.max(1, totalPax(draft));
  const accOption = draft.hotel_options?.[0];
  const hotelSelections = accOption?.selections ?? [];

  // ====== Compute per-city data ======
  const { cityRows, totalLunch, totalDinner } = useMemo(() => {
    const selections: MealSelection[] = Array.isArray(draft.meal_selections)
      ? draft.meal_selections
      : [];

    const cityData: {
      day: number;
      city: string;
      lunch: { source: MealSource; rate: number };
      dinner: { source: MealSource; rate: number };
    }[] = [];

    draft.routing.forEach((routing) => {
      const day = routing.day;
      
      const cityIds = getSafeCityIds(routing);

      cityIds.forEach((cityId) => {
        if (!cityId) return;
        const cityName = d.cities.find((c) => c.id === cityId)?.name || "—";
        const date = routing.date || addDaysISO(draft.start_date, day - 1);

        const lunchData = { source: "none" as MealSource, rate: 0 };
        const dinnerData = { source: "none" as MealSource, rate: 0 };

        const hsPlan = hotelSelections.find((s) => s.city_id === cityId)?.meal_plan;
        const covered = coveredByPlan(hsPlan);

        ["Lunch", "Dinner"].forEach((mealType) => {
          const mt = mealType as MealType;
          if (covered[mt]) return;
          const sel = getSelection(selections, day, cityName, mt);
          if (!sel || sel.source === "none") return;

          let rate = 0;

          if (sel.source === "hotel") {
            const hs = hotelSelections.find((s) => s.city_id === cityId);
            if (hs) {
              const hotel = d.hotels.find((h) => h.id === hs.hotel_id);
              if (hotel) {
                const plan = findRatePlan(d.rate_plans, hs.room_id, hs.meal_plan, date);
                rate = mt === "Lunch" ? (plan?.lunch_rate ?? 0) : (plan?.dinner_rate ?? 0);
              }
            }
          } else if (sel.source === "restaurant") {
            const restaurant = d.restaurants.find((r) => r.id === sel.restaurant_id);
            if (restaurant) {
              rate = restaurant.price_per_person ?? 0;
            }
          }

          if (mt === "Lunch") {
            lunchData.source = sel.source;
            lunchData.rate = rate;
          } else {
            dinnerData.source = sel.source;
            dinnerData.rate = rate;
          }
        });

        cityData.push({ day, city: cityName, lunch: lunchData, dinner: dinnerData });
      });
    });

    let totalLunch = 0;
    let totalDinner = 0;
    cityData.forEach((row) => {
      // Sums up per-person rates only
      totalLunch += row.lunch.rate; 
      totalDinner += row.dinner.rate;
    });

    return { cityRows: cityData, totalLunch, totalDinner };
  }, [draft, d, pax, hotelSelections]);

  // ====== Compute detailed breakdown ======
  const { breakdownList, totalLunchBreakdown, totalDinnerBreakdown, grandTotalBreakdown } = useMemo(() => {
    const selections: MealSelection[] = Array.isArray(draft.meal_selections)
      ? draft.meal_selections
      : [];
    const map = new Map<
      string,
      {
        day: number;
        city: string;
        lunchSource: string;
        lunchTotal: number;
        dinnerSource: string;
        dinnerTotal: number;
      }
    >();

    let totalLunchSum = 0;
    let totalDinnerSum = 0;

    draft.routing.forEach((routing) => {
      const day = routing.day;
      
      const cityIds = getSafeCityIds(routing);

      cityIds.forEach((cityId) => {
        if (!cityId) return;
        const cityName = d.cities.find((c) => c.id === cityId)?.name || "—";
        const date = routing.date || addDaysISO(draft.start_date, day - 1);
        const key = `${day}-${cityName}`;

        const coveredHere = coveredByPlan(hotelSelections.find((s) => s.city_id === cityId)?.meal_plan);
        const getMealData = (mealType: MealType) => {
          if (coveredHere[mealType]) return { source: "Included in plan", total: 0 };
          const sel = getSelection(selections, day, cityName, mealType);
          if (!sel || sel.source === "none") {
            return { source: "—", total: 0 };
          }

          let rate = 0;
          let sourceLabel = "";

          if (sel.source === "hotel") {
            const hs = hotelSelections.find((s) => s.city_id === cityId);
            if (hs) {
              const hotel = d.hotels.find((h) => h.id === hs.hotel_id);
              if (hotel) {
                sourceLabel = hotel.name;
                const plan = findRatePlan(d.rate_plans, hs.room_id, hs.meal_plan, date);
                rate = mealType === "Lunch" ? (plan?.lunch_rate ?? 0) : (plan?.dinner_rate ?? 0);
              } else {
                sourceLabel = "Hotel (not found)";
              }
            } else {
              sourceLabel = "Hotel (not found)";
            }
          } else if (sel.source === "restaurant") {
            const restaurant = d.restaurants.find((r) => r.id === sel.restaurant_id);
            if (restaurant) {
              sourceLabel = restaurant.name;
              rate = restaurant.price_per_person ?? 0;
            } else {
              sourceLabel = "Restaurant (not found)";
            }
          }

          // 🔥 FIXED: Stored per-person rate instead of multiplying by pax
          const total = rate; 
          return { source: sourceLabel, total };
        };

        const lunch = getMealData("Lunch");
        const dinner = getMealData("Dinner");

        totalLunchSum += lunch.total;
        totalDinnerSum += dinner.total;

        map.set(key, {
          day,
          city: cityName,
          lunchSource: lunch.source,
          lunchTotal: lunch.total,
          dinnerSource: dinner.source,
          dinnerTotal: dinner.total,
        });
      });
    });

    return {
      breakdownList: Array.from(map.values()),
      totalLunchBreakdown: totalLunchSum,
      totalDinnerBreakdown: totalDinnerSum,
      grandTotalBreakdown: totalLunchSum + totalDinnerSum,
    };
  }, [draft, d, pax, hotelSelections]);

  // ====== Helper to update a selection ======
  const updateSelection = (
    day: number,
    city: string,
    mealType: MealType,
    patch: Partial<Omit<MealSelection, "day" | "city" | "mealType">>
  ) => {
    const current = Array.isArray(draft.meal_selections) ? draft.meal_selections : [];
    const updated = setSelection(current, { day, city, mealType, ...patch });
    set({ meal_selections: updated });
  };

  // ====== Group routing by day ======
  const routingByDay = useMemo(() => {
    const map = new Map<number, { day: number; cityId: string; cityName: string; date: string }[]>();
    draft.routing.forEach((r) => {
      const cityIds = getSafeCityIds(r);

      cityIds.forEach((cid) => {
        const nm = d.cities.find((c) => c.id === cid)?.name || "—";
        const entries = map.get(r.day) || [];
        entries.push({
          day: r.day,
          cityId: cid,
          cityName: nm,
          date: r.date || addDaysISO(draft.start_date, r.day - 1)
        });
        map.set(r.day, entries);
      });
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [draft.routing, d.cities, draft.start_date]);

  // ====== Group breakdownList by day for the Summary Table ======
  const breakdownByDay = useMemo(() => {
    const groups = new Map<number, typeof breakdownList>();
    breakdownList.forEach((item) => {
      if (!groups.has(item.day)) {
        groups.set(item.day, []);
      }
      groups.get(item.day)!.push(item);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [breakdownList]);

  // ====== Render ======
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Meals (Lunch &amp; Dinner)</h2>
        <p className="text-sm text-muted-foreground">
          For each city, choose a source for Lunch and for Dinner. Costs are per person × {pax} pax.
        </p>
      </div>

      {draft.routing.length === 0 && (
        <p className="text-sm text-muted-foreground">Complete the routing step first.</p>
      )}

      {/* Main table – each city in one row */}
      <Card className="p-0 overflow-hidden border-primary/20" style={{ backgroundColor: "#FBF7EE" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
              <tr>
                <th className="text-left py-2 px-3 font-medium">Day</th>
                <th className="text-left py-2 px-3 font-medium">City</th>
                <th className="text-left py-2 px-3 font-medium" colSpan={2}>Lunch</th>
                <th className="text-left py-2 px-3 font-medium" colSpan={2}>Dinner</th>
              </tr>
              <tr className="text-xs text-muted-foreground bg-muted/30">
                <th className="py-1 px-3"></th>
                <th className="py-1 px-3"></th>
                <th className="text-left py-1 px-3">Source</th>
                <th className="text-right py-1 px-3">Rate</th>
                <th className="text-left py-1 px-3">Source</th>
                <th className="text-right py-1 px-3">Rate</th>
              </tr>
            </thead>
            <tbody>
              {routingByDay.map(([day, entries]) => {
                return entries.map((entry, index) => {
                  const { cityId, cityName, date } = entry;
                  const isFirstOfDay = index === 0;
                  const cityData = cityRows.find(
                    (r) => r.day === day && r.city === cityName
                  );
                  if (!cityData) return null;

                  const hs = hotelSelections.find((s) => s.city_id === cityId);
                  const hotel = hs ? d.hotels.find((h) => h.id === hs.hotel_id) : undefined;
                  const restaurants = restaurantsForCityNames(d.restaurants ?? [], [cityName]);
                  const options: { label: string; value: string }[] = [];
                  options.push({ label: "No meal", value: "none" });
                  if (hotel) {
                    options.push({ label: `Hotel: ${hotel.name}`, value: `hotel:${hotel.id}` });
                  }
                  restaurants.forEach((r) => {
                    options.push({ label: r.name, value: `restaurant:${r.id}` });
                  });

                  const getDropdownValue = (mealType: MealType) => {
                    const selections = Array.isArray(draft.meal_selections)
                      ? draft.meal_selections
                      : [];
                    const sel = getSelection(selections, day, cityName, mealType);
                    if (!sel || sel.source === "none") return "none";
                    if (sel.source === "hotel" && sel.hotel_id) return `hotel:${sel.hotel_id}`;
                    if (sel.source === "restaurant" && sel.restaurant_id)
                      return `restaurant:${sel.restaurant_id}`;
                    return "none";
                  };

                  const lunchVal = getDropdownValue("Lunch");
                  const dinnerVal = getDropdownValue("Dinner");

                  const handleChange = (mealType: MealType, val: string) => {
                    if (val === "none") {
                      updateSelection(day, cityName, mealType, {
                        source: "none",
                        hotel_id: undefined,
                        restaurant_id: undefined,
                      });
                    } else if (val.startsWith("hotel:")) {
                      const hotelId = val.replace("hotel:", "");
                      updateSelection(day, cityName, mealType, {
                        source: "hotel",
                        hotel_id: hotelId,
                        restaurant_id: undefined,
                      });
                    } else if (val.startsWith("restaurant:")) {
                      const restId = val.replace("restaurant:", "");
                      updateSelection(day, cityName, mealType, {
                        source: "restaurant",
                        restaurant_id: restId,
                        hotel_id: undefined,
                      });
                    }
                  };

                  const rowCovered = coveredByPlan(hs?.meal_plan);
                  const planBadge = (
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-xs font-medium text-emerald-700">Included in plan</span>
                      <span className="text-[10px] text-muted-foreground">{hs?.meal_plan} · {hotel?.name || "Hotel"}</span>
                    </div>
                  );

                  return (
                    <tr key={`${day}-${cityName}`} className="border-t">
                      {isFirstOfDay && (
                        <td rowSpan={entries.length} className="py-2 px-3 align-middle font-semibold">
                          {day}
                        </td>
                      )}
                      <td className="py-2 px-3 font-medium">
                        {cityName}
                        {hs?.meal_plan && (
                          <span className="ml-2 text-[10px] uppercase text-muted-foreground">{hs.meal_plan}</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {rowCovered.Lunch ? planBadge : (
                          <Select value={lunchVal} onValueChange={(v) => handleChange("Lunch", v)}>
                            <SelectTrigger className="h-8 w-[150px] text-xs">
                              <SelectValue placeholder="Source" />
                            </SelectTrigger>
                            <SelectContent>
                              {options.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {rowCovered.Lunch ? "—" : cityData.lunch.rate > 0 ? inr(cityData.lunch.rate) : "—"}
                      </td>
                      <td className="py-2 px-3">
                        {rowCovered.Dinner ? planBadge : (
                          <Select value={dinnerVal} onValueChange={(v) => handleChange("Dinner", v)}>
                            <SelectTrigger className="h-8 w-[150px] text-xs">
                              <SelectValue placeholder="Source" />
                            </SelectTrigger>
                            <SelectContent>
                              {options.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {rowCovered.Dinner ? "—" : cityData.dinner.rate > 0 ? inr(cityData.dinner.rate) : "—"}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
            <tfoot className="border-t-2 border-primary/30 font-semibold bg-muted/20">
              <tr>
                <td colSpan={3} className="py-2 px-3 text-right text-primary">
                  Total Lunch
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-primary">
                  {inr(totalLunch)}
                </td>
                <td colSpan={1} className="py-2 px-3 text-right text-primary">
                  Total Dinner
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-primary">
                  {inr(totalDinner)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ====== Detailed Breakdown Sheet – Single Row per City ====== */}
      {breakdownList.length > 0 && (
        <Card className="p-0 overflow-hidden border-primary/20">
          <div className="px-4 py-2.5 text-sm font-semibold text-primary border-b">
            Meals Breakdown Summary
          </div>
          <div className="overflow-x-auto p-4">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">Day</th>
                  <th className="text-left py-2 px-3 font-medium">City</th>
                  <th className="text-left py-2 px-3 font-medium" colSpan={2}>Lunch</th>
                  <th className="text-left py-2 px-3 font-medium" colSpan={2}>Dinner</th>
                </tr>
                <tr className="text-xs text-muted-foreground bg-muted/30">
                  <th className="py-1 px-3"></th>
                  <th className="py-1 px-3"></th>
                  <th className="text-left py-1 px-3">Source</th>
                  <th className="text-right py-1 px-3">Total</th>
                  <th className="text-left py-1 px-3">Source</th>
                  <th className="text-right py-1 px-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {breakdownByDay.map(([day, entries]) => (
                  entries.map((row, index) => {
                    const isFirstOfDay = index === 0;
                    return (
                      <tr key={`${row.day}-${row.city}`} className="border-t">
                        {isFirstOfDay && (
                          <td rowSpan={entries.length} className="py-2 px-3 align-middle">
                            {row.day}
                          </td>
                        )}
                        <td className="py-2 px-3 font-medium">{row.city}</td>
                        <td className="py-2 px-3">{row.lunchSource}</td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {row.lunchTotal > 0 ? inr(row.lunchTotal) : "—"}
                        </td>
                        <td className="py-2 px-3">{row.dinnerSource}</td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {row.dinnerTotal > 0 ? inr(row.dinnerTotal) : "—"}
                        </td>
                      </tr>
                    );
                  })
                ))}
              </tbody>
              <tfoot className="border-t-2 border-primary/30 font-bold">
                <tr>
                  <td colSpan={3} className="py-2 px-3 text-right text-primary">
                    Total Lunch
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-primary">
                    {inr(totalLunchBreakdown)}
                  </td>
                  <td colSpan={1} className="py-2 px-3 text-right text-primary">
                    Total Dinner
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-primary">
                    {inr(totalDinnerBreakdown)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={5} className="py-2 px-3 text-right text-primary">
                    Grand Total
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-primary">
                    {inr(grandTotalBreakdown)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}