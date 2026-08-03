// StepMeals.tsx
// Main table: each city in one row with source and rate for Lunch and Dinner.
// Breakdown Summary: Detailed row-wise breakdown with Lunch and Dinner side-by-side,
// including Per Person, Pax, and Total for each meal. Horizontal scroller added for wide tables.

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

// ====== Main component ======
export function StepMeals({ draft, set }: StepProps) {
  const d = useDB();
  const pax = Math.max(1, totalPax(draft));
  const accOption = draft.hotel_options?.[0];
  const hotelSelections = accOption?.selections ?? [];

  // ====== Compute per-city data for main table ======
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
      const cityId = routing.city_id || routing.to_city_id || "";
      const cityName = d.cities.find((c) => c.id === cityId)?.name || "—";
      const date = routing.date || addDaysISO(draft.start_date, day - 1);

      const lunchData = { source: "none" as MealSource, rate: 0 };
      const dinnerData = { source: "none" as MealSource, rate: 0 };

      ["Lunch", "Dinner"].forEach((mealType) => {
        const mt = mealType as MealType;
        const sel = getSelection(selections, day, cityName, mt);
        if (!sel || sel.source === "none") return;

        let rate = 0;

        if (sel.source === "hotel") {
          const hs = hotelSelections.find((s) => s.city_id === cityId);
          const hotel = hs ? d.hotels.find((h) => h.id === hs.hotel_id) : undefined;
          if (hotel) {
            const plan = findRatePlan(d.rate_plans, hs.room_id, hs.meal_plan, date);
            rate = mt === "Lunch" ? (plan?.lunch_rate ?? 0) : (plan?.dinner_rate ?? 0);
          }
        } else if (sel.source === "restaurant") {
          const restaurant = d.restaurants.find((r) => r.id === sel.restaurant_id);
          if (restaurant) {
            rate = mt === "Lunch"
              ? (restaurant.lunch_rate ?? restaurant.price_per_person ?? 0)
              : (restaurant.dinner_rate ?? restaurant.price_per_person ?? 0);
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

    let totalLunch = 0;
    let totalDinner = 0;
    cityData.forEach((row) => {
      totalLunch += row.lunch.rate * pax;
      totalDinner += row.dinner.rate * pax;
    });

    return { cityRows: cityData, totalLunch, totalDinner };
  }, [draft, d, pax, hotelSelections]);

  // ====== Compute detailed breakdown rows (single row per city) ======
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
        lunchPerPerson: number;
        lunchTotal: number;
        dinnerSource: string;
        dinnerPerPerson: number;
        dinnerTotal: number;
      }
    >();

    let totalLunchSum = 0;
    let totalDinnerSum = 0;

    draft.routing.forEach((routing) => {
      const day = routing.day;
      const cityId = routing.city_id || routing.to_city_id || "";
      const cityName = d.cities.find((c) => c.id === cityId)?.name || "—";
      const date = routing.date || addDaysISO(draft.start_date, day - 1);
      const key = `${day}-${cityName}`;

      const getMealData = (mealType: MealType) => {
        const sel = getSelection(selections, day, cityName, mealType);
        if (!sel || sel.source === "none") {
          return { source: "—", perPerson: 0, total: 0 };
        }

        let rate = 0;
        let sourceLabel = "";

        if (sel.source === "hotel") {
          const hs = hotelSelections.find((s) => s.city_id === cityId);
          const hotel = hs ? d.hotels.find((h) => h.id === hs.hotel_id) : undefined;
          if (hotel) {
            sourceLabel = hotel.name;
            const plan = findRatePlan(d.rate_plans, hs.room_id, hs.meal_plan, date);
            rate = mealType === "Lunch" ? (plan?.lunch_rate ?? 0) : (plan?.dinner_rate ?? 0);
          } else {
            sourceLabel = "Hotel (not found)";
          }
        } else if (sel.source === "restaurant") {
          const restaurant = d.restaurants.find((r) => r.id === sel.restaurant_id);
          if (restaurant) {
            sourceLabel = restaurant.name;
            rate = mealType === "Lunch"
              ? (restaurant.lunch_rate ?? restaurant.price_per_person ?? 0)
              : (restaurant.dinner_rate ?? restaurant.price_per_person ?? 0);
          } else {
            sourceLabel = "Restaurant (not found)";
          }
        }

        const total = rate * pax;
        return { source: sourceLabel, perPerson: rate, total };
      };

      const lunch = getMealData("Lunch");
      const dinner = getMealData("Dinner");

      totalLunchSum += lunch.total;
      totalDinnerSum += dinner.total;

      map.set(key, {
        day,
        city: cityName,
        lunchSource: lunch.source,
        lunchPerPerson: lunch.perPerson,
        lunchTotal: lunch.total,
        dinnerSource: dinner.source,
        dinnerPerPerson: dinner.perPerson,
        dinnerTotal: dinner.total,
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

  // ====== Group routing by day for UI ======
  const routingByDay = useMemo(() => {
    const map = new Map<number, typeof draft.routing>();
    draft.routing.forEach((r) => {
      const entries = map.get(r.day) || [];
      entries.push(r);
      map.set(r.day, entries);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [draft.routing]);

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
                return entries.map((routing) => {
                  const cityId = routing.city_id || routing.to_city_id || "";
                  const cityName = d.cities.find((c) => c.id === cityId)?.name || "—";
                  const date = routing.date || addDaysISO(draft.start_date, day - 1);

                  const cityData = cityRows.find(
                    (r) => r.day === day && r.city === cityName
                  );
                  if (!cityData) return null;

                  // Build options for dropdown (same for both meals)
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

                  // Get current selected values
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

                  return (
                    <tr key={`${day}-${cityName}`} className="border-t">
                      <td className="py-2 px-3">{day}</td>
                      <td className="py-2 px-3 font-medium">{cityName}</td>
                      {/* Lunch Source */}
                      <td className="py-2 px-3">
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
                      </td>
                      {/* Lunch Rate */}
                      <td className="py-2 px-3 text-right tabular-nums">
                        {cityData.lunch.rate > 0 ? inr(cityData.lunch.rate) : "—"}
                      </td>
                      {/* Dinner Source */}
                      <td className="py-2 px-3">
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
                      </td>
                      {/* Dinner Rate */}
                      <td className="py-2 px-3 text-right tabular-nums">
                        {cityData.dinner.rate > 0 ? inr(cityData.dinner.rate) : "—"}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
            {/* Footer: Total Lunch and Total Dinner */}
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
          {/* Added overflow-x-auto for horizontal scrolling if the table gets too wide */}
          <div className="overflow-x-auto p-4">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">Day</th>
                  <th className="text-left py-2 px-3 font-medium">City</th>
                  <th className="text-left py-2 px-3 font-medium" colSpan={4}>Lunch</th>
                  <th className="text-left py-2 px-3 font-medium" colSpan={4}>Dinner</th>
                </tr>
                <tr className="text-xs text-muted-foreground bg-muted/30">
                  <th className="py-1 px-3"></th>
                  <th className="py-1 px-3"></th>
                  <th className="text-left py-1 px-3">Source</th>
                  <th className="text-right py-1 px-3">PP</th>
                  <th className="text-right py-1 px-3">Pax</th>
                  <th className="text-right py-1 px-3">Total</th>
                  <th className="text-left py-1 px-3">Source</th>
                  <th className="text-right py-1 px-3">PP</th>
                  <th className="text-right py-1 px-3">Pax</th>
                  <th className="text-right py-1 px-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {breakdownList.map((row) => (
                  <tr key={`${row.day}-${row.city}`} className="border-t">
                    <td className="py-2 px-3">{row.day}</td>
                    <td className="py-2 px-3 font-medium">{row.city}</td>
                    {/* Lunch Data */}
                    <td className="py-2 px-3">{row.lunchSource}</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {row.lunchPerPerson > 0 ? inr(row.lunchPerPerson) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {row.lunchPerPerson > 0 ? pax : "—"}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {row.lunchTotal > 0 ? inr(row.lunchTotal) : "—"}
                    </td>
                    {/* Dinner Data */}
                    <td className="py-2 px-3">{row.dinnerSource}</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {row.dinnerPerPerson > 0 ? inr(row.dinnerPerPerson) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {row.dinnerPerPerson > 0 ? pax : "—"}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {row.dinnerTotal > 0 ? inr(row.dinnerTotal) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-primary/30 font-bold">
                <tr>
                  <td colSpan={5} className="py-2 px-3 text-right text-primary">
                    Total Lunch
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-primary">
                    {inr(totalLunchBreakdown)}
                  </td>
                  <td colSpan={3} className="py-2 px-3 text-right text-primary">
                    Total Dinner
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-primary">
                    {inr(totalDinnerBreakdown)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={9} className="py-2 px-3 text-right text-primary">
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