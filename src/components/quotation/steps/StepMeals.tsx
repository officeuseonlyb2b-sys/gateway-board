import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addDaysISO, inr } from "@/lib/format";
import { restaurantsForCityNames, useDB, type Restaurant } from "@/lib/mock-store";
import { computeMealDays, effectivePaxForPricing, mealPlanCoverage } from "@/lib/wizard/calc";
import { findRatePlan } from "@/lib/wizard/rate-lookup";
import type { MealChoice, MealDaySelection, OptionKey, RoutingDay } from "@/lib/wizard/types";
import type { StepProps } from "../shared";

type MealKey = "lunch" | "dinner";

const cityIdsForDay = (day: RoutingDay): string[] =>
  Array.from(
    new Set([...(day.to_city_ids ?? []), day.to_city_id, day.city_id].filter(Boolean) as string[]),
  );

export function restaurantsForCategory(list: Restaurant[], category?: string): Restaurant[] {
  if (!category) return list;
  const wanted = category.trim().toLowerCase();
  return list.filter((restaurant) => {
    const tier = (restaurant.category || "").trim().toLowerCase();
    return !tier || tier === wanted;
  });
}

export function StepMeals({ draft, set }: StepProps) {
  const db = useDB();
  const pax = Math.max(1, effectivePaxForPricing(draft));
  const completedOptions = draft.hotel_options.filter((option) => option.selections.length > 0);
  const [activeKey, setActiveKey] = useState<OptionKey>(completedOptions[0]?.key ?? "A");
  const option = completedOptions.find((item) => item.key === activeKey) ?? completedOptions[0];
  const optionKey = option?.key ?? "A";
  const selectionMap = draft.meal_selections_by_option?.[optionKey] ?? {};

  const rows = useMemo(
    () =>
      draft.routing.flatMap((day, index) =>
        cityIdsForDay(day).map((cityId) => ({
          day: day.day,
          date: day.date || addDaysISO(draft.start_date, index),
          cityId,
          cityName: db.cities.find((city) => city.id === cityId)?.name || day.to_city || "—",
          overnight: day.city_id === cityId && day.overnight,
        })),
      ),
    [draft.routing, draft.start_date, db.cities],
  );

  const calculated = useMemo(
    () => computeMealDays(draft, db, optionKey),
    [draft, db, optionKey],
  );
  const lunchPerPerson = calculated.rows
    .filter((row) => row.meal_type === "Lunch")
    .reduce((sum, row) => sum + row.per_person, 0);
  const dinnerPerPerson = calculated.rows
    .filter((row) => row.meal_type === "Dinner")
    .reduce((sum, row) => sum + row.per_person, 0);

  const setChoice = (day: number, cityId: string, meal: MealKey, choice?: MealChoice) => {
    const key = `${day}:${cityId}`;
    const nextOptionMap = { ...selectionMap };
    const current: MealDaySelection = { ...(nextOptionMap[key] ?? {}) };
    if (!choice || choice.source === "none") delete current[meal];
    else current[meal] = choice;
    if (!current.lunch && !current.dinner) delete nextOptionMap[key];
    else nextOptionMap[key] = current;
    set({
      meal_selections_by_option: {
        ...(draft.meal_selections_by_option ?? {}),
        [optionKey]: nextOptionMap,
      },
      ...(optionKey === "A" ? { meal_selections: nextOptionMap } : {}),
    });
  };

  if (!option) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Meals</h2>
        <Card className="p-5 text-sm text-muted-foreground">
          Complete at least one accommodation option before selecting lunches and dinners.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Meals</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Meal rates are always per person. Package calculation multiplies them once by {pax} pax.
          </p>
        </div>
        <Badge variant="outline">{inr(calculated.total)} package meal cost</Badge>
      </div>

      <Tabs value={optionKey} onValueChange={(value) => setActiveKey(value as OptionKey)}>
        <TabsList className="h-auto flex-wrap justify-start">
          {completedOptions.map((item) => (
            <TabsTrigger key={item.key} value={item.key} className="text-xs">
              Option {item.key} · {item.category || item.label || "Hotel"}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-left">Day / place</th>
                <th className="px-3 py-3 text-left">Hotel plan</th>
                <th className="px-3 py-3 text-left">Lunch source</th>
                <th className="px-3 py-3 text-right">PP rate</th>
                <th className="px-3 py-3 text-left">Dinner source</th>
                <th className="px-3 py-3 text-right">PP rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = `${row.day}:${row.cityId}`;
                const selected = selectionMap[key] ?? {};
                const hotelSelection = row.overnight
                  ? option.selections.find((item) => item.city_id === row.cityId)
                  : undefined;
                const coverage = mealPlanCoverage(hotelSelection?.meal_plan);
                const selectedHotels = option.selections
                  .map((item) => ({
                    selection: item,
                    hotel: db.hotels.find((hotel) => hotel.id === item.hotel_id),
                  }))
                  .filter((item) => item.hotel);
                const restaurants = restaurantsForCategory(
                  restaurantsForCityNames(db.restaurants ?? [], [row.cityName]),
                  option.category,
                );

                const selectValue = (choice?: MealChoice) => {
                  if (!choice) return "none";
                  if (choice.source === "hotel") return `hotel:${choice.hotel_id}`;
                  if (choice.source === "restaurant") return `restaurant:${choice.restaurant_id}`;
                  return "none";
                };
                const handle = (meal: MealKey, value: string) => {
                  if (value === "none") {
                    setChoice(row.day, row.cityId, meal, undefined);
                    return;
                  }
                  if (value.startsWith("restaurant:")) {
                    const id = value.slice("restaurant:".length);
                    const restaurant = db.restaurants.find((item) => item.id === id);
                    setChoice(row.day, row.cityId, meal, {
                      source: "restaurant",
                      restaurant_id: id,
                      label: restaurant?.name || "Restaurant",
                      per_person_rate: restaurant?.price_per_person || 0,
                    });
                    return;
                  }
                  const id = value.slice("hotel:".length);
                  const matched = option.selections.find((item) => item.hotel_id === id);
                  const plan = matched
                    ? findRatePlan(db.rate_plans, matched.room_id, matched.meal_plan, row.date)
                    : null;
                  const hotel = db.hotels.find((item) => item.id === id);
                  setChoice(row.day, row.cityId, meal, {
                    source: "hotel",
                    hotel_id: id,
                    label: hotel?.name || "Hotel",
                    per_person_rate:
                      meal === "lunch" ? plan?.lunch_rate || 0 : plan?.dinner_rate || 0,
                  });
                };
                const choiceRate = (meal: MealKey) => selected[meal]?.per_person_rate ?? 0;

                const selector = (meal: MealKey, covered: boolean) =>
                  covered ? (
                    <div className="text-xs font-medium text-emerald-700">Included in hotel plan</div>
                  ) : (
                    <Select value={selectValue(selected[meal])} onValueChange={(value) => handle(meal, value)}>
                      <SelectTrigger className="h-9 min-w-[210px]">
                        <SelectValue placeholder="No meal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No meal</SelectItem>
                        {selectedHotels.map(({ selection, hotel }) => (
                          <SelectItem key={`hotel:${selection.hotel_id}`} value={`hotel:${selection.hotel_id}`}>
                            Hotel: {hotel?.name} · {db.cities.find((city) => city.id === hotel?.city_id)?.name || "selected stay"}
                          </SelectItem>
                        ))}
                        {restaurants.map((restaurant) => (
                          <SelectItem key={`restaurant:${restaurant.id}`} value={`restaurant:${restaurant.id}`}>
                            Restaurant: {restaurant.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );

                return (
                  <tr key={key} className="border-b last:border-0">
                    <td className="px-3 py-3">
                      <div className="font-medium">Day {row.day} · {row.cityName}</div>
                      <div className="text-xs text-muted-foreground">{row.date}</div>
                    </td>
                    <td className="px-3 py-3">
                      {hotelSelection?.meal_plan ? (
                        <Badge variant="secondary">{hotelSelection.meal_plan}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No overnight plan</span>
                      )}
                    </td>
                    <td className="px-3 py-3">{selector("lunch", coverage.lunch)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {coverage.lunch ? "Included" : choiceRate("lunch") ? inr(choiceRate("lunch")) : "—"}
                    </td>
                    <td className="px-3 py-3">{selector("dinner", coverage.dinner)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {coverage.dinner ? "Included" : choiceRate("dinner") ? inr(choiceRate("dinner")) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted/30 font-semibold">
              <tr>
                <td colSpan={3} className="px-3 py-3 text-right">Lunch total per person</td>
                <td className="px-3 py-3 text-right tabular-nums">{inr(lunchPerPerson)}</td>
                <td className="px-3 py-3 text-right">Dinner total per person</td>
                <td className="px-3 py-3 text-right tabular-nums">{inr(dinnerPerPerson)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-900">
        AP includes lunch and dinner; MAP includes dinner; CP leaves both available. Sources include
        the selected journey hotels and restaurants in itinerary cities.
      </div>
    </div>
  );
}
