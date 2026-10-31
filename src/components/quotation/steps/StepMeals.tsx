import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Utensils } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { addDaysISO, inr } from "@/lib/format";
import { restaurantsForCityNames, useDB, type Restaurant } from "@/lib/mock-store";
import {
  calculateMealCostingRows,
  getCostingPaxValues,
  hotelMealCommercials,
  effectiveAccommodationPax,
  isSplitAccommodation,
  mealCostingTotal,
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

// Uses the same authoritative classified rows as the detail tables. Counts are
// meal entries, never traveller/Pax quantities.
// eslint-disable-next-line react-refresh/only-export-components
export function mealDashboardCounts(rows: Array<{ meal_type: string; status: string }>) {
  const count = (meal: "Lunch" | "Dinner", statuses: string[]) =>
    rows.filter((row) => row.meal_type === meal && statuses.includes(row.status)).length;
  const includedLunch = count("Lunch", ["included", "hotel_plan"]);
  const includedDinner = count("Dinner", ["included", "hotel_plan"]);
  const optionalLunch = count("Lunch", ["optional"]);
  const optionalDinner = count("Dinner", ["optional"]);
  return {
    includedLunch,
    includedDinner,
    includedTotal: includedLunch + includedDinner,
    optionalLunch,
    optionalDinner,
    optionalTotal: optionalLunch + optionalDinner,
  };
}

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
  const [copySourceKey, setCopySourceKey] = useState<OptionKey>("A");
  const option = options.find((item) => item.key === activeKey) ?? options[0];
  const optionKey = option?.key ?? "A";
  useEffect(() => {
    if (copySourceKey === optionKey)
      setCopySourceKey(options.find((item) => item.key !== optionKey)?.key ?? optionKey);
  }, [copySourceKey, optionKey, options]);
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
    inclusion_status: "included" | "optional" | "removed",
  ) => {
    const current = selections[`${day}:${cityId}`]?.[meal];
    if (current) setMeal(day, cityId, meal, { ...current, inclusion_status });
  };
  const copyMealsFromOption = () => {
    if (!option || copySourceKey === optionKey) return;
    const source = draft.meal_selections_by_option?.[copySourceKey] ??
      (copySourceKey === "A" ? draft.meal_selections ?? {} : {});
    if (Object.keys(selections).length && !window.confirm(`Replace Option ${optionKey}'s existing meal selections?`)) return;
    const next = Object.fromEntries(Object.entries(source).map(([key, value]) => {
      const day = Number(key.split(":")[0]);
      const destinationHotel = option.selections.find((selection) => selection.routing_day === day && !selection.no_hotel);
      const copyChoice = (choice?: MealChoice): MealChoice | undefined => {
        if (!choice) return undefined;
        if (choice.source !== "hotel") return { ...choice };
        const hotel = db.hotels.find((item) => item.id === destinationHotel?.hotel_id);
        // Hotel meal rates are always re-resolved against the destination
        // option's selected hotel and meal plan; no source rate is retained.
        return { ...choice, hotel_id: destinationHotel?.hotel_id, label: hotel?.name || "Hotel", per_person_rate: undefined };
      };
      return [key, { lunch: copyChoice(value.lunch), dinner: copyChoice(value.dinner) }];
    })) as Record<string, MealDaySelection>;
    set({
      meal_selections_by_option: { ...(draft.meal_selections_by_option ?? {}), [optionKey]: next },
      ...(optionKey === "A" ? { meal_selections: next } : {}),
    });
    toast.success(`Meal selections copied from Option ${copySourceKey} to Option ${optionKey}.`);
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

  const mealRows = calculateMealCostingRows(draft, db, optionKey);
  const includedLunch = mealCostingTotal(draft, mealRows, "Lunch", "included");
  const includedDinner = mealCostingTotal(draft, mealRows, "Dinner", "included");
  const optionalLunch = mealCostingTotal(draft, mealRows, "Lunch", "optional");
  const optionalDinner = mealCostingTotal(draft, mealRows, "Dinner", "optional");
  const paxValues =
    !landMealsOnly && isSplitAccommodation(draft)
      ? [effectiveAccommodationPax(draft, option)]
      : getCostingPaxValues(draft);
  const paxWiseMeals = paxValues.map((pax) => {
    const rows = calculateMealCostingRows(draft, db, optionKey, pax);
    return {
      pax,
      lunch: mealCostingTotal(draft, rows, "Lunch", "included").per_person,
      dinner: mealCostingTotal(draft, rows, "Dinner", "included").per_person,
      optionalLunch: mealCostingTotal(draft, rows, "Lunch", "optional").per_person,
      optionalDinner: mealCostingTotal(draft, rows, "Dinner", "optional").per_person,
    };
  });
  const arrangements = (meal: MealKey, status: "included" | "optional" | "hotel_plan") =>
    mealRows
      .filter(
        (row) =>
          row.meal_type.toLowerCase() === meal && row.status === status,
      )
      .map((row) => ({
        ...row,
        city: row.city || "—",
        venue: row.label || "—",
        type:
          row.status === "hotel_plan"
            ? "Included in Hotel Plan"
            : row.source === "hotel"
              ? "Hotel"
              : "Restaurant",
      }));
  const includedLunchRows = [
    ...arrangements("lunch", "included"),
    ...arrangements("lunch", "hotel_plan"),
  ];
  const includedDinnerRows = [
    ...arrangements("dinner", "included"),
    ...arrangements("dinner", "hotel_plan"),
  ];
  const optionalLunchRows = arrangements("lunch", "optional");
  const optionalDinnerRows = arrangements("dinner", "optional");
  const dashboardCounts = mealDashboardCounts(mealRows);

  const MealSummaryCard = ({
    title,
    count,
    subtitle,
    tone,
    summary = false,
  }: {
    title: string;
    count: number;
    subtitle: string;
    tone: "blue" | "green" | "purple";
    summary?: boolean;
  }) => {
    const Icon = summary ? CalendarDays : Utensils;
    const iconTone =
      tone === "blue"
        ? "bg-blue-50 text-blue-600"
        : tone === "green"
          ? "bg-emerald-50 text-emerald-600"
          : "bg-violet-50 text-violet-600";
    return (
      <Card className="border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex min-h-24 items-start gap-3">
          <div className={`rounded-lg p-2.5 ${iconTone}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-600">{title}</div>
            <div className="mt-1 text-3xl font-bold leading-none text-slate-950">{count}</div>
            <div className="mt-2 text-xs text-muted-foreground">{subtitle}</div>
          </div>
        </div>
      </Card>
    );
  };

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
          <>
            <Select
              value={selected.choice.inclusion_status ?? "included"}
              onValueChange={(status) =>
                setMealInclusion(day, cityId, meal, status as "included" | "optional" | "removed")
              }
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="included">Included</SelectItem>
                <SelectItem value="optional">Optional</SelectItem>
                <SelectItem value="removed">Remove</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </div>
    );
  };

  const MealCostingSection = ({
    title,
    mealType,
    status,
    items,
    optional = false,
  }: {
    title: string;
    mealType: "Lunch" | "Dinner";
    status: "included" | "optional";
    items: ReturnType<typeof arrangements>;
    optional?: boolean;
  }) => {
    const total = mealCostingTotal(draft, mealRows, mealType, status);
    return (
      <Card className="overflow-hidden">
        <div className="border-b px-3 py-2 text-sm font-semibold">{title}</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-muted/20 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Day</th>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-left">City</th>
                <th className="p-2 text-left">Hotel / Restaurant</th>
                <th className="p-2 text-left">Meal</th>
                <th className="p-2 text-right">Base Rate</th>
                <th className="p-2 text-right">Applicable Pax</th>
                {optional ? (
                  <>
                    <th className="p-2 text-right">Markup</th>
                    <th className="p-2 text-right">GST</th>
                    <th className="p-2 text-right">Final Selling Price</th>
                  </>
                ) : (
                  <th className="p-2 text-right">Included Cost</th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const rowCommercial = hotelMealCommercials(draft, item.total);
                return (
                  <tr key={`${item.day}-${item.city_id}-${item.meal}`} className="border-t">
                    <td className="p-2">{item.day}</td>
                    <td className="p-2">{item.date}</td>
                    <td className="p-2">{item.city}</td>
                    <td className="p-2">{item.venue}</td>
                    <td className="p-2">{item.type}</td>
                    <td className="p-2 text-right">{item.status === "hotel_plan" ? "—" : inr(item.per_person)}</td>
                    <td className="p-2 text-right">{item.pax}</td>
                    {optional ? (
                      <>
                        <td className="p-2 text-right">{inr(rowCommercial.markup)}</td>
                        <td className="p-2 text-right">{inr(rowCommercial.gst)}</td>
                        <td className="p-2 text-right font-semibold">{inr(rowCommercial.final)}</td>
                      </>
                    ) : (
                      <td className="p-2 text-right">{item.status === "hotel_plan" ? "Included in Hotel Plan" : inr(item.total)}</td>
                    )}
                  </tr>
                );
              })}
              {!items.length && (
                <tr>
                  <td colSpan={optional ? 10 : 8} className="p-3 text-center italic text-muted-foreground">
                    No {optional ? "optional " : "included "}{mealType.toLowerCase()} selected.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 bg-muted/20">
              {optional ? (
                <>
                  <tr><td colSpan={9} className="p-2 text-right font-medium">Optional {mealType} Base Total</td><td className="p-2 text-right">{inr(total.base_total)}</td></tr>
                  <tr><td colSpan={9} className="p-2 text-right font-medium">Markup</td><td className="p-2 text-right">{inr(total.markup)}</td></tr>
                  <tr><td colSpan={9} className="p-2 text-right font-medium">GST</td><td className="p-2 text-right">{inr(total.gst)}</td></tr>
                  <tr className="border-t font-semibold"><td colSpan={9} className="p-2 text-right">Optional {mealType} Final Selling Price</td><td className="p-2 text-right">{inr(total.final_total)}</td></tr>
                </>
              ) : (
                <>
                  <tr><td colSpan={7} className="p-2 text-right font-medium">Reporting Cost</td><td className="p-2 text-right">Not configured</td></tr>
                  <tr><td colSpan={7} className="p-2 text-right font-medium">Base Total</td><td className="p-2 text-right">{inr(total.base_total)}</td></tr>
                  <tr><td colSpan={7} className="p-2 text-right font-medium">Markup</td><td className="p-2 text-right">{inr(total.markup)}</td></tr>
                  <tr><td colSpan={7} className="p-2 text-right font-medium">GST</td><td className="p-2 text-right">{inr(total.gst)}</td></tr>
                  <tr className="border-t font-semibold"><td colSpan={7} className="p-2 text-right">Included {mealType} Total</td><td className="p-2 text-right">{inr(total.final_total)}</td></tr>
                  <tr><td colSpan={7} className="p-2 text-right font-medium">Per Person</td><td className="p-2 text-right">{inr(total.per_person)}</td></tr>
                </>
              )}
            </tfoot>
          </table>
        </div>
      </Card>
    );
  };

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
      {options.length > 1 && (
        <Card className="flex flex-wrap items-end gap-2 p-3">
          <div className="min-w-44">
            <div className="mb-1 text-xs font-medium">Copy meal selections from</div>
            <Select value={copySourceKey} onValueChange={(value) => setCopySourceKey(value as OptionKey)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{options.filter((item) => item.key !== optionKey).map((item) => <SelectItem key={item.key} value={item.key}>Option {item.key} · {item.category || item.label || "Hotel"}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={copyMealsFromOption} disabled={copySourceKey === optionKey}>
            Copy to Option {optionKey}
          </Button>
        </Card>
      )}
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
          </table>
        </div>
      </Card>
      <div>
        <div className="text-[10px] font-semibold uppercase text-muted-foreground">Part 2</div>
        <h3 className="text-sm font-semibold">Included Meals</h3>
      </div>
      <div className="grid gap-3 md:grid-cols-3" data-testid="included-meal-summary-cards">
        <MealSummaryCard
          title="Included Lunch"
          count={dashboardCounts.includedLunch}
          subtitle="lunches included in itinerary"
          tone="blue"
        />
        <MealSummaryCard
          title="Included Dinner"
          count={dashboardCounts.includedDinner}
          subtitle="dinners included in itinerary"
          tone="green"
        />
        <MealSummaryCard
          title="Total Included Meals"
          count={dashboardCounts.includedTotal}
          subtitle="total meals included"
          tone="purple"
          summary
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MealCostingSection
          title="Included Lunch"
          mealType="Lunch"
          status="included"
          items={includedLunchRows}
        />
        <MealCostingSection
          title="Included Dinner"
          mealType="Dinner"
          status="included"
          items={includedDinnerRows}
        />
      </div>
      <Card className="overflow-hidden">
        <div className="border-b bg-muted/20 p-3 text-sm font-semibold">
          Included Meals — Per Person Cost Breakdown
        </div>
        <div className="overflow-x-auto">
          <table data-testid="included-meals-per-person-table" className="w-full text-xs">
            <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Pax</th>
                <th className="p-2 text-right">Included Lunch PP</th>
                <th className="p-2 text-right">Included Dinner PP</th>
                <th className="p-2 text-right">Included Meals PP</th>
              </tr>
            </thead>
            <tbody>
              {paxWiseMeals.map((row) => (
                <tr key={row.pax} className="border-t">
                  <td className="p-2 font-medium">{row.pax}</td>
                  <td className="p-2 text-right">{inr(row.lunch)}</td>
                  <td className="p-2 text-right">{inr(row.dinner)}</td>
                  <td className="p-2 text-right font-semibold">{inr(row.lunch + row.dinner)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div>
        <div className="text-[10px] font-semibold uppercase text-muted-foreground">Part 3</div>
        <h3 className="text-sm font-semibold">Optional Meals — Additional Sale</h3>
      </div>
      <div className="grid gap-3 md:grid-cols-3" data-testid="optional-meal-summary-cards">
        <MealSummaryCard
          title="Optional Lunch"
          count={dashboardCounts.optionalLunch}
          subtitle="optional lunches in itinerary"
          tone="blue"
        />
        <MealSummaryCard
          title="Optional Dinner"
          count={dashboardCounts.optionalDinner}
          subtitle="optional dinners in itinerary"
          tone="green"
        />
        <MealSummaryCard
          title="Total Optional Meals"
          count={dashboardCounts.optionalTotal}
          subtitle="total optional meals"
          tone="purple"
          summary
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MealCostingSection
          title="Optional Lunch"
          mealType="Lunch"
          status="optional"
          items={optionalLunchRows}
          optional
        />
        <MealCostingSection
          title="Optional Dinner"
          mealType="Dinner"
          status="optional"
          items={optionalDinnerRows}
          optional
        />
      </div>
      <Card className="overflow-hidden">
        <div className="border-b bg-muted/20 p-3 text-sm font-semibold">
          Optional Meals — Per Person Cost Breakdown
        </div>
        <div className="overflow-x-auto">
          <table data-testid="optional-meals-per-person-table" className="w-full text-xs">
            <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Pax</th>
                <th className="p-2 text-right">Optional Lunch PP</th>
                <th className="p-2 text-right">Optional Dinner PP</th>
                <th className="p-2 text-right">Optional Meals PP</th>
              </tr>
            </thead>
            <tbody>
              {paxWiseMeals.map((row) => (
                <tr key={row.pax} className="border-t">
                  <td className="p-2 font-medium">{row.pax}</td>
                  <td className="p-2 text-right">{inr(row.optionalLunch)}</td>
                  <td className="p-2 text-right">{inr(row.optionalDinner)}</td>
                  <td className="p-2 text-right font-semibold">
                    {inr(row.optionalLunch + row.optionalDinner)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
