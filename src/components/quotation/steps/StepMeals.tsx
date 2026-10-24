import { useMemo, useState } from "react";
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
import {
  computeMealDays,
  getCostingPaxValues,
  hotelsGst,
  hotelsMarkup,
  mealPlanCoverage,
} from "@/lib/wizard/calc";
import { findRatePlan } from "@/lib/wizard/rate-lookup";
import {
  hotelSelectionForDay,
  type MealChoice,
  type MealDaySelection,
  type OptionKey,
  type RoutingDay,
} from "@/lib/wizard/types";
import type { StepProps } from "../shared";

type MealKey = "lunch" | "dinner";

// eslint-disable-next-line react-refresh/only-export-components
export function restaurantsForCategory(list: Restaurant[], category?: string): Restaurant[] {
  if (!category) return list;
  const wanted = category.trim().toLowerCase();
  return list.filter((item) => !item.category || item.category.trim().toLowerCase() === wanted);
}

// eslint-disable-next-line react-refresh/only-export-components
export const mealCitiesForDay = (day: RoutingDay, cities: ReturnType<typeof useDB>["cities"]) => {
  const ids: string[] = [];
  const push = (value?: string) => {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return;
    const city = cities.find(
      (item) => item.id === value || item.name.trim().toLowerCase() === normalized,
    );
    if (city && !ids.includes(city.id)) ids.push(city.id);
  };
  push(day.from_city);
  (day.to_city_ids ?? []).forEach(push);
  push(day.to_city_id);
  // Legacy routes may have only the display destination saved.
  push(day.to_city);
  // city_id is the saved overnight/destination ID. It remains a valid route
  // city even when the day has no overnight accommodation plan.
  push(day.city_id);
  return ids;
};

// eslint-disable-next-line react-refresh/only-export-components
export function updateMealSelection(
  selections: Record<string, MealDaySelection>,
  day: number,
  cityId: string,
  meal: MealKey,
  choice?: MealChoice,
) {
  const next = Object.fromEntries(
    Object.entries(selections).map(([key, value]) => [key, { ...value }]),
  ) as Record<string, MealDaySelection>;
  Object.keys(next).forEach((key) => {
    if (!key.startsWith(`${day}:`)) return;
    delete next[key][meal];
    if (!next[key].lunch && !next[key].dinner) delete next[key];
  });
  // A no-meal sentinel retains the independently selected route city while
  // keeping it out of all meal-cost calculations.
  if (cityId) {
    next[`${day}:${cityId}`] = {
      ...(next[`${day}:${cityId}`] ?? {}),
      [meal]: choice ?? { source: "none" },
    };
  }
  return next;
}

export function StepMeals({ draft, set }: StepProps) {
  const db = useDB();
  const landMealsOnly = draft.query_for === "Land Part + Meals";
  const options = landMealsOnly
    ? [{ key: "A" as const, label: "Land + Meals", selections: [] }]
    : draft.hotel_options.filter((option) => option.selections.length > 0);
  const [activeKey, setActiveKey] = useState<OptionKey>(options[0]?.key ?? "A");
  const option = options.find((item) => item.key === activeKey) ?? options[0];
  const optionKey = option?.key ?? "A";
  const selections =
    draft.meal_selections_by_option?.[optionKey] ??
    (optionKey === "A" ? (draft.meal_selections ?? {}) : {});
  const days = useMemo(
    () =>
      draft.routing.map((day, index) => {
        const cityIds = mealCitiesForDay(day, db.cities);
        return {
          day,
          cityIds,
          date: day.date || addDaysISO(draft.start_date, index),
          route: cityIds
            .map((id) => db.cities.find((city) => city.id === id)?.name)
            .filter(Boolean)
            .join(" → "),
        };
      }),
    [draft.routing, draft.start_date, db.cities],
  );

  const selectedFor = (day: number, meal: MealKey, cityIds?: string[]) => {
    for (const [key, value] of Object.entries(selections)) {
      const cityId = key.split(":")[1];
      if (key.startsWith(`${day}:`) && value[meal] && (!cityIds || cityIds.includes(cityId)))
        return { cityId, choice: value[meal] };
    }
    return { cityId: "", choice: undefined as MealChoice | undefined };
  };
  const setMeal = (day: number, cityId: string, meal: MealKey, choice?: MealChoice) => {
    const next = updateMealSelection(selections, day, cityId, meal, choice);
    set({
      meal_selections_by_option: { ...(draft.meal_selections_by_option ?? {}), [optionKey]: next },
      ...(optionKey === "A" ? { meal_selections: next } : {}),
    });
  };
  const setMealInclusion = (
    day: number,
    cityId: string,
    meal: MealKey,
    inclusion_status: "included" | "optional",
  ) => {
    const current = selections[`${day}:${cityId}`]?.[meal];
    if (current) setMeal(day, cityId, meal, { ...current, inclusion_status });
  };

  if (!option)
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Meals</h2>
        <Card className="p-5 text-sm text-muted-foreground">
          Complete at least one accommodation option first.
        </Card>
      </div>
    );

  const priced = days.flatMap(({ day, date, cityIds }) => {
    const stay = !landMealsOnly && day.overnight ? hotelSelectionForDay(option, day) : undefined;
    const covered = mealPlanCoverage(stay?.meal_plan);
    return (["lunch", "dinner"] as const).map((meal) => {
      const selected = selectedFor(day.day, meal, cityIds);
      return {
        day: day.day,
        date,
        meal,
        included: covered[meal],
        cityId: covered[meal] ? day.city_id : selected.cityId,
        choice: selected.choice,
        rate: covered[meal] ? 0 : (selected.choice?.per_person_rate ?? 0),
      };
    });
  });
  const commercials = (base: number) => {
    const markup = base * hotelsMarkup(draft);
    const gst = (base + markup) * hotelsGst(draft);
    return { base, markup, gst, final: base + markup + gst };
  };
  const sharedMealRows = computeMealDays(draft, db, optionKey).rows;
  const lunch = commercials(
    sharedMealRows
      .filter((row) => row.meal_type === "Lunch")
      .reduce((sum, row) => sum + row.per_person, 0),
  );
  const dinner = commercials(
    sharedMealRows
      .filter((row) => row.meal_type === "Dinner")
      .reduce((sum, row) => sum + row.per_person, 0),
  );
  const arrangements = (meal: MealKey) =>
    priced
      .filter((row) => row.meal === meal)
      .map((row) => ({
        ...row,
        city: db.cities.find((city) => city.id === row.cityId)?.name || "—",
        venue: row.included ? "Included in Hotel Plan" : row.choice?.label || "No Meal",
        type: row.included
          ? "Included in Hotel Plan"
          : row.choice?.source === "hotel"
            ? "Hotel"
            : row.choice?.source === "restaurant"
              ? "Restaurant"
              : "No Meal",
        inclusion: row.included
          ? "included"
          : row.choice?.inclusion_status === "optional"
            ? "optional"
            : "included",
      }));
  const lunches = arrangements("lunch");
  const dinners = arrangements("dinner");
  const mealArrangements = [...lunches, ...dinners].filter((item) => item.type !== "No Meal");
  const includedMeals = mealArrangements.filter((item) => item.inclusion === "included");
  const optionalMeals = mealArrangements.filter((item) => item.inclusion === "optional");

  const selector = (
    day: number,
    date: string,
    cityIds: string[],
    meal: MealKey,
    covered: boolean,
  ) => {
    if (covered)
      return <span className="text-xs font-medium text-emerald-700">Included in Hotel Plan</span>;
    const selected = selectedFor(day, meal, cityIds);
    const cityId = selected.cityId || cityIds[0] || "";
    const cityName = db.cities.find((city) => city.id === cityId)?.name || "";
    const hotels = db.hotels.filter((hotel) => hotel.city_id === cityId);
    const restaurants = restaurantsForCategory(
      restaurantsForCityNames(db.restaurants ?? [], [cityName]),
      option.category,
    );
    const value =
      selected.choice?.source === "hotel"
        ? `hotel:${selected.choice.hotel_id}`
        : selected.choice?.source === "restaurant"
          ? `restaurant:${selected.choice.restaurant_id}`
          : "none";
    const choose = (venue: string) => {
      if (venue === "none") return setMeal(day, cityId, meal);
      if (venue.startsWith("restaurant:")) {
        const id = venue.slice(11);
        const item = db.restaurants.find((row) => row.id === id);
        return setMeal(day, cityId, meal, {
          source: "restaurant",
          restaurant_id: id,
          label: item?.name || "Restaurant",
          per_person_rate: item?.price_per_person ?? 0,
        });
      }
      const id = venue.slice(6);
      const hotel = db.hotels.find((row) => row.id === id);
      const stay = option.selections.find((row) => row.hotel_id === id);
      const roomId = stay?.room_id ?? db.room_categories.find((room) => room.hotel_id === id)?.id;
      const plan = roomId
        ? findRatePlan(db.rate_plans, roomId, stay?.meal_plan ?? "CP", date)
        : null;
      return setMeal(day, cityId, meal, {
        source: "hotel",
        hotel_id: id,
        label: hotel?.name || "Hotel",
        per_person_rate: meal === "lunch" ? (plan?.lunch_rate ?? 0) : (plan?.dinner_rate ?? 0),
      });
    };
    return (
      <div className="flex min-w-[430px] gap-2">
        <Select value={cityId} onValueChange={(id) => setMeal(day, id, meal)}>
          <SelectTrigger className="h-8 w-32">
            <SelectValue placeholder="City" />
          </SelectTrigger>
          <SelectContent>
            {cityIds.map((id) => (
              <SelectItem key={id} value={id}>
                {db.cities.find((city) => city.id === id)?.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={value} onValueChange={choose}>
          <SelectTrigger className="h-8 min-w-48 flex-1">
            <SelectValue placeholder="No Meal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Meal</SelectItem>
            {hotels.map((hotel) => (
              <SelectItem key={`hotel:${hotel.id}`} value={`hotel:${hotel.id}`}>
                Hotel: {hotel.name}
              </SelectItem>
            ))}
            {restaurants.map((restaurant) => (
              <SelectItem key={`restaurant:${restaurant.id}`} value={`restaurant:${restaurant.id}`}>
                Restaurant: {restaurant.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected.choice && selected.choice.source !== "none" && (
          <Select
            value={selected.choice.inclusion_status ?? "included"}
            onValueChange={(status) =>
              setMealInclusion(day, cityId, meal, status as "included" | "optional")
            }
          >
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="included">Included</SelectItem>
              <SelectItem value="optional">Optional</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
    );
  };

  const ArrangementTable = ({
    title,
    items,
  }: {
    title: string;
    items: ReturnType<typeof arrangements>;
  }) => (
    <Card className="overflow-hidden">
      <div className="border-b px-3 py-2 text-sm font-semibold">{title}</div>
      <table className="w-full text-xs">
        <thead className="bg-muted/20 text-[10px] uppercase text-muted-foreground">
          <tr>
            <th className="p-2 text-left">Day</th>
            <th className="p-2 text-left">Date</th>
            <th className="p-2 text-left">City</th>
            <th className="p-2 text-left">Hotel/Restaurant</th>
            <th className="p-2 text-left">Type</th>
            <th className="p-2 text-left">Meal</th>
            <th className="p-2 text-right">Selling PP</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.day}-${item.meal}`} className="border-t">
              <td className="p-2">{item.day}</td>
              <td className="p-2">{item.date}</td>
              <td className="p-2">{item.city}</td>
              <td className="p-2">{item.venue}</td>
              <td className="p-2">{item.type}</td>
              <td className="p-2 capitalize">{item.meal}</td>
              <td className="p-2 text-right">
                {item.included ? "Included" : inr(commercials(item.rate).final)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Meals</h2>
        <p className="text-sm text-muted-foreground">
          One shared per-person meal engine for Standard and Dynamic accommodation.
        </p>
      </div>
      <Tabs value={optionKey} onValueChange={(value) => setActiveKey(value as OptionKey)}>
        <TabsList className="h-auto flex-wrap justify-start">
          {options.map((item) => (
            <TabsTrigger key={item.key} value={item.key}>
              Option {item.key} · {item.category || item.label || "Hotel"}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div>
        <div className="text-[10px] font-semibold uppercase text-muted-foreground">Part 1</div>
        <h3 className="text-sm font-semibold">Meal Selection &amp; Costing</h3>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-xs">
            <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Day / Route / Cities Covered</th>
                <th className="p-2 text-left">Hotel Plan</th>
                <th className="p-2 text-left">Lunch Arrangement</th>
                <th className="p-2 text-right">Lunch PP Rate</th>
                <th className="p-2 text-left">Dinner Arrangement</th>
                <th className="p-2 text-right">Dinner PP Rate</th>
              </tr>
            </thead>
            <tbody>
              {days.map(({ day, date, cityIds, route }) => {
                const stay =
                  !landMealsOnly && day.overnight ? hotelSelectionForDay(option, day) : undefined;
                const coverage = mealPlanCoverage(stay?.meal_plan);
                const lunchChoice = selectedFor(day.day, "lunch", cityIds).choice;
                const dinnerChoice = selectedFor(day.day, "dinner", cityIds).choice;
                return (
                  <tr key={day.day} className="border-t align-top">
                    <td className="p-2">
                      <b>
                        Day {day.day} · {date}
                      </b>
                      <div className="text-muted-foreground">{route || "Route not configured"}</div>
                    </td>
                    <td className="p-2">{stay?.meal_plan || "No overnight plan"}</td>
                    <td className="p-2">
                      {selector(day.day, date, cityIds, "lunch", coverage.lunch)}
                    </td>
                    <td className="p-2 text-right">
                      {coverage.lunch
                        ? "Included"
                        : lunchChoice?.per_person_rate
                          ? inr(lunchChoice.per_person_rate)
                          : "—"}
                    </td>
                    <td className="p-2">
                      {selector(day.day, date, cityIds, "dinner", coverage.dinner)}
                    </td>
                    <td className="p-2 text-right">
                      {coverage.dinner
                        ? "Included"
                        : dinnerChoice?.per_person_rate
                          ? inr(dinnerChoice.per_person_rate)
                          : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 bg-muted/20">
              {[
                ["Total Cost Per Person", lunch.base, dinner.base],
                ["Markup", lunch.markup, dinner.markup],
                ["GST", lunch.gst, dinner.gst],
                ["Final Meal Cost Per Person", lunch.final, dinner.final],
              ].map(([label, l, d]) => (
                <tr key={String(label)}>
                  <td colSpan={2} className="p-2 text-right font-medium">
                    {label}
                  </td>
                  <td colSpan={2} className="p-2 text-right">
                    {inr(Number(l))}
                  </td>
                  <td colSpan={2} className="p-2 text-right">
                    {inr(Number(d))}
                  </td>
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      </Card>
      <div>
        <div className="text-[10px] font-semibold uppercase text-muted-foreground">Part 2</div>
        <h3 className="text-sm font-semibold">Meal Arrangement Summary</h3>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ArrangementTable title="Included Meals" items={includedMeals} />
        <ArrangementTable title="Optional Meals — For Additional Sale" items={optionalMeals} />
      </div>
      <Card className="p-3">
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-8">
          {[
            ["Total Lunches", lunches.filter((row) => row.type !== "No Meal").length],
            ["Total Dinners", dinners.filter((row) => row.type !== "No Meal").length],
            ["Lunches in Hotels", lunches.filter((row) => row.type === "Hotel").length],
            ["Lunches in Restaurants", lunches.filter((row) => row.type === "Restaurant").length],
            ["Dinners in Hotels", dinners.filter((row) => row.type === "Hotel").length],
            ["Dinners in Restaurants", dinners.filter((row) => row.type === "Restaurant").length],
            ["Lunches Included", lunches.filter((row) => row.included).length],
            ["Dinners Included", dinners.filter((row) => row.included).length],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded border p-2">
              <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
              <div className="text-lg font-semibold">{value}</div>
            </div>
          ))}
        </div>
      </Card>
      <div>
        <div className="text-[10px] font-semibold uppercase text-muted-foreground">Part 3</div>
        <h3 className="text-sm font-semibold">Pax-wise Meal Costing</h3>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Pax</th>
              <th className="p-2 text-right">Lunch (Per Person)</th>
              <th className="p-2 text-right">Dinner (Per Person)</th>
            </tr>
          </thead>
          <tbody>
            {getCostingPaxValues(draft).map((pax) => (
              <tr key={pax} className="border-t">
                <td className="p-2 font-medium">{pax}</td>
                <td className="p-2 text-right">{inr(lunch.final)}</td>
                <td className="p-2 text-right">{inr(dinner.final)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
