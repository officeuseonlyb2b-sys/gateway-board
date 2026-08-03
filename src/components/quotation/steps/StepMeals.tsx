// Meals step — Lunch / Dinner costing for the whole trip, day by day.
// Each day can be sourced either from the hotel picked in the Hotels step
// (using that hotel's saved Extra Meal Charges) or from a restaurant in the
// Meals module, filtered to the cities present in this quotation's routing.
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDB, restaurantsForCityNames } from "@/lib/mock-store";
import { findRatePlan } from "@/lib/wizard/rate-lookup";
import { computeMealDays, totalPax } from "@/lib/wizard/calc";
import { inr, addDaysISO } from "@/lib/format";
import type { MealDaySelection, MealSource } from "@/lib/wizard/types";
import type { StepProps } from "../shared";

export function StepMeals({ draft, set }: StepProps) {
  const d = useDB();
  const pax = Math.max(1, totalPax(draft));
  const opt = draft.hotel_options?.[0];

  const { rows, total } = useMemo(() => computeMealDays(draft, d), [draft, d]);
  const totalByDay = new Map(rows.map((r) => [r.day, r]));

  const selFor = (dayNo: number): MealDaySelection =>
    draft.meal_selections?.[dayNo] ?? { source: "none" };

  const setSel = (dayNo: number, patch: Partial<MealDaySelection>) => {
    const cur = selFor(dayNo);
    set({ meal_selections: { ...(draft.meal_selections ?? {}), [dayNo]: { ...cur, ...patch } } });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Meals (Lunch &amp; Dinner)</h2>
        <p className="text-sm text-muted-foreground">
          Pick the source for each day — the hotel selected in Accommodation Options, or a restaurant
          from the Meals module in that day's city. Costs are per person × {pax} pax.
        </p>
      </div>

      {draft.routing.length === 0 && (
        <p className="text-sm text-muted-foreground">Complete the routing step first.</p>
      )}

      {draft.routing.map((day, i) => {
        const sel = selFor(day.day);
        const date = day.date || addDaysISO(draft.start_date, i);
        const cityId = day.city_id || day.to_city_id || "";
        const cityName = d.cities.find((c) => c.id === cityId)?.name || "—";
        const hs = opt?.selections.find((s) => s.city_id === cityId);
        const hotel = hs ? d.hotels.find((h) => h.id === hs.hotel_id) : undefined;
        const plan = hs ? findRatePlan(d.rate_plans, hs.room_id, hs.meal_plan, date) : null;
        const lunchRate = plan?.lunch_rate || 0;
        const dinnerRate = plan?.dinner_rate || 0;
        const restaurants = restaurantsForCityNames(d.restaurants ?? [], [cityName]);
        const row = totalByDay.get(day.day);

        return (
          <Card key={day.day} className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">
                Day {day.day} · {cityName}
                {date && <span className="text-xs text-muted-foreground ml-2">{date}</span>}
              </div>
              <div className="text-sm font-semibold text-primary">
                {row ? inr(row.total) : inr(0)}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(["none", "hotel", "restaurant"] as MealSource[]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={sel.source === s ? "default" : "outline"}
                  className="h-7 text-xs capitalize"
                  onClick={() => setSel(day.day, { source: s })}
                >
                  {s === "none" ? "No meal" : s === "hotel" ? "From Hotel" : "From Restaurant"}
                </Button>
              ))}
            </div>

            {sel.source === "hotel" && (
              <div className="space-y-2">
                {!hs ? (
                  <p className="text-xs text-amber-700">
                    No hotel selected for {cityName} yet — pick one in Accommodation Options.
                  </p>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground">
                      {hotel?.name || "Hotel"} · extra meal charges
                    </div>
                    <div className="flex flex-wrap items-center gap-5">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={!!sel.lunch}
                          onCheckedChange={(v) => setSel(day.day, { lunch: !!v })}
                        />
                        Lunch <span className="text-xs text-muted-foreground">{inr(lunchRate)}/pp</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={!!sel.dinner}
                          onCheckedChange={(v) => setSel(day.day, { dinner: !!v })}
                        />
                        Dinner <span className="text-xs text-muted-foreground">{inr(dinnerRate)}/pp</span>
                      </label>
                    </div>
                    {(sel.lunch || sel.dinner) && lunchRate + dinnerRate === 0 && (
                      <p className="text-xs text-amber-700">
                        This hotel has no lunch/dinner rate saved for the selected plan.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {sel.source === "restaurant" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <Label className="text-xs">Restaurant in {cityName}</Label>
                  <Select
                    value={sel.restaurant_id || ""}
                    onValueChange={(v) => setSel(day.day, { restaurant_id: v })}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={restaurants.length ? "Select restaurant…" : "None in this city"} />
                    </SelectTrigger>
                    <SelectContent>
                      {restaurants.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} · {inr(r.price_per_person)}/pp
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {restaurants.length === 0 && (
                    <p className="text-xs text-amber-700 mt-1">
                      No restaurants added for {cityName}. Add them in the Meals module.
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Meal</Label>
                  <Select
                    value={sel.meal_type || "Lunch"}
                    onValueChange={(v) => setSel(day.day, { meal_type: v as "Lunch" | "Dinner" })}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Lunch">Lunch</SelectItem>
                      <SelectItem value="Dinner">Dinner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {row && row.per_person > 0 && (
              <div className="text-xs text-muted-foreground">
                {row.label} — {inr(row.per_person)} / person × {pax} pax = <b>{inr(row.total)}</b>
              </div>
            )}
          </Card>
        );
      })}

      <Card className="p-0 overflow-hidden border-primary/20" style={{ backgroundColor: "#FBF7EE" }}>
        <div className="px-4 py-2.5 text-sm font-semibold text-primary">Meals Cost Breakdown</div>
        <div className="px-4 pb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left py-1.5 font-medium">Day</th>
                <th className="text-left py-1.5 font-medium">City</th>
                <th className="text-left py-1.5 font-medium">Source</th>
                <th className="text-right py-1.5 font-medium">Per person</th>
                <th className="text-right py-1.5 font-medium">Pax</th>
                <th className="text-right py-1.5 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="py-3 text-muted-foreground">No meals selected yet.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.day} className="border-t">
                  <td className="py-1.5">Day {r.day}</td>
                  <td className="py-1.5 text-muted-foreground">{r.city}</td>
                  <td className="py-1.5">{r.label || (r.source === "hotel" ? "Hotel" : "Restaurant")}</td>
                  <td className="py-1.5 text-right tabular-nums">{inr(r.per_person)}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.pax}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{inr(r.total)}</td>
                </tr>
              ))}
              <tr className="border-t font-semibold">
                <td className="py-1.5" colSpan={5}>Grand Total (meals)</td>
                <td className="py-1.5 text-right tabular-nums text-primary">{inr(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
