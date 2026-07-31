// src/components/quotation/steps/StepHotels.tsx (Step15)
// Full updated code with meal‑plan‑aware Lunch/Dinner columns.

import { useMemo, useState } from "react";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { inr, fmtDateShort } from "@/lib/format";
import { useDB, MEAL_PLANS, type MealPlan } from "@/lib/mock-store";
import {
  gstRateFor,
  computePersonTotals,
  computeDynamicOption,
  personRoomTypeLabel,
  defaultDayMix,
} from "@/lib/wizard/calc";
import type { QuoteDraft, HotelOption, OptionKey, DayRoomMix } from "@/lib/wizard/types";

import { findRatePlan, availableMealPlans } from "@/lib/wizard/rate-lookup";
import { defaultsForCategory } from "@/lib/wizard/category-defaults";
import { QuickAddHotelDialog } from "@/components/QuickAddHotelDialog";
import { WIZARD_HOTEL_CATEGORIES } from "../shared";
import type { StepProps } from "../shared";

const CATEGORY_RANK: Record<string, number> = {
  "Excellent Budget": 1,
  "Home Stay": 1,
  "3 Star": 2,
  "3 Star Deluxe": 3,
  "4 Star": 4,
  "Heritage": 4,
  "Experiential": 4,
  "4 Star Superior": 5,
  "5 Star": 6,
  "5 Star Deluxe": 7,
  "5 Star Luxury": 7,
};

// Helper to check if a meal is included in a given meal plan
function isMealIncluded(mealPlan: MealPlan, mealType: 'lunch' | 'dinner'): boolean {
  if (mealPlan === 'CP') return false;
  if (mealPlan === 'MAP') return mealType === 'dinner';
  if (mealPlan === 'AP') return true;
  return false;
}

export function Step15({ draft, set }: StepProps) {
  const d = useDB();
  const [activeOpt, setActiveOpt] = useState<OptionKey>(draft.hotel_options[0]?.key || "A");
  const [quickAdd, setQuickAdd] = useState<{ cityId: string; cityName: string } | null>(null);
  const overnightRouting = draft.routing.filter((r) => r.overnight && (r.city_id || r.to_city));

  const addOption = () => {
    const existing = draft.hotel_options.map((o) => o.key);
    const next = (["A", "B", "C", "D"] as OptionKey[]).find((k) => !existing.includes(k));
    if (!next) return;
    set({ hotel_options: [...draft.hotel_options, { key: next, label: "", category: "", selections: [], inclusions: [], exclusions: [] }] });
    setActiveOpt(next);
  };

  const updateOption = (key: OptionKey, patch: Partial<HotelOption>) => {
    set({ hotel_options: draft.hotel_options.map((o) => o.key === key ? { ...o, ...patch } : o) });
  };

  const activeOption = draft.hotel_options.find((o) => o.key === activeOpt) || draft.hotel_options[0];
  const activeCategory = activeOption?.category || "";

  const findRate = (room_id: string, meal: MealPlan, dateISO: string) => {
    return findRatePlan(d.rate_plans, room_id, meal, dateISO);
  };

  const applyCategory = (v: string) => {
    if (!activeOption) return;
    const def = defaultsForCategory(v);
    updateOption(activeOption.key, {
      category: v,
      label: v,
      selections: [],
      inclusions: def.inclusions,
      exclusions: def.exclusions,
    });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Accommodation Options (up to 4)</h2>

      <div className="flex gap-2 border-b">
        {draft.hotel_options.map((o) => (
          <button key={o.key} onClick={() => setActiveOpt(o.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
              activeOpt === o.key ? "border-accent text-accent" : "border-transparent text-muted-foreground",
            )}>
            Option {o.key} · {o.category || "Select Category"}
          </button>
        ))}
        {draft.hotel_options.length < 4 && (
          <button onClick={addOption} className="px-3 py-2 text-sm text-primary">+ Add Option</button>
        )}
      </div>

      {activeOption && (
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <Label className="text-xs">Hotel Category for this Option</Label>
              <Select value={activeCategory} onValueChange={applyCategory}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                  {WIZARD_HOTEL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {draft.hotel_options.length > 1 && (
              <Button size="sm" variant="ghost" onClick={() => {
                const next = draft.hotel_options.filter((o) => o.key !== activeOpt);
                set({ hotel_options: next });
                setActiveOpt(next[0].key);
              }}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" /> Remove option
              </Button>
            )}
          </div>

          {overnightRouting.length === 0 && (
            <p className="text-sm text-muted-foreground">Complete routing in Step 9 first.</p>
          )}

          {!activeCategory && overnightRouting.length > 0 && (
            <p className="text-sm text-amber-600">Select a hotel category above to load hotels for each city.</p>
          )}

          {activeCategory && overnightRouting.length > 0 && (
            <AccommodationSelectionTable
              draft={draft}
              option={activeOption}
              activeCategory={activeCategory}
              overnightRouting={overnightRouting}
              onUpdate={(patch) => updateOption(activeOption.key, patch)}
              onQuickAdd={(cityId, cityName) => setQuickAdd({ cityId, cityName })}
              onBackToAllocation={() => set({ step: 12 })}
            />
          )}


          {activeCategory && overnightRouting.length > 0 && activeOption.selections.some((s) => s.room_id) && (
            <OptionDynamicPreview draft={draft} option={activeOption} />
          )}


          {activeCategory && (
            <OptionInclusionsEditor
              option={activeOption}
              onChange={(patch) => updateOption(activeOption.key, patch)}
            />
          )}
        </div>
      )}

      {quickAdd && (
        <QuickAddHotelDialog
          open={!!quickAdd}
          onOpenChange={(v) => { if (!v) setQuickAdd(null); }}
          cityId={quickAdd.cityId}
          cityName={quickAdd.cityName}
          category={activeCategory}
          onCreated={(hotelId) => {
            const others = activeOption.selections.filter((s) => s.city_id !== quickAdd.cityId);
            const h = d.hotels.find((x) => x.id === hotelId);
            updateOption(activeOption.key, {
              selections: [...others, {
                city_id: quickAdd.cityId,
                hotel_id: hotelId,
                room_id: "",
                meal_plan: "CP" as MealPlan,
                is_fallback: !!h && h.hotel_category !== activeCategory,
              }],
            });
            setQuickAdd(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Accommodation Selection Table – meal‑plan‑aware Lunch/Dinner
// ============================================================
function AccommodationSelectionTable({
  draft,
  option,
  activeCategory,
  overnightRouting,
  onUpdate,
  onQuickAdd,
  onBackToAllocation,
}: {
  draft: QuoteDraft;
  option: HotelOption;
  activeCategory: string;
  overnightRouting: typeof draft.routing;
  onUpdate: (patch: Partial<HotelOption>) => void;
  onQuickAdd: (cityId: string, cityName: string) => void;
  onBackToAllocation: () => void;
}) {
  const d = useDB();

  // --- Room mix per day (driven by Step 12 Room Allocation, dynamic only) ---
  const paxForMix = Math.max(1, draft.adults + draft.ss + draft.children.length);
  const mixForDay = (dayNo: number): DayRoomMix =>
    draft.day_room_mix?.[dayNo] ?? defaultDayMix(paxForMix);
  const quadAllocatedForDay = (dayNo: number) => mixForDay(dayNo).quad > 0;
  const anyQuadAllocated = overnightRouting.some((r) => quadAllocatedForDay(r.day));

  // Toggle states for extra columns
  const [showQuadManual, setShowQuadManual] = useState(false);
  const showQuad = showQuadManual || anyQuadAllocated;
  const [showLunch, setShowLunch] = useState(false);
  const [showDinner, setShowDinner] = useState(false);



  // Total number of passengers (used for meal costing)
  const totalPax = draft.adults + draft.ss + draft.children.length;

  // Summary totals
  let totalSgl = 0,
    totalDbl = 0,
    totalTrp = 0,
    totalQuad = 0;
  let totalLunch = 0,
    totalDinner = 0;

  const rows = overnightRouting.map((day) => {
    const cityName = d.cities.find((c) => c.id === day.city_id)?.name || day.to_city || "";
    const cityKey = cityName.trim().toLowerCase();
    const catKey = activeCategory.trim().toLowerCase();
    const sel = option.selections.find((s) => s.city_id === day.city_id);

    // Hotels for this city
    const hotelCityName = (h: (typeof d.hotels)[number]) =>
      (d.cities.find((c) => c.id === h.city_id)?.name || "").trim().toLowerCase();
    const allCityHotels = cityKey
      ? d.hotels.filter((h) => hotelCityName(h) === cityKey)
      : [];
    const cityHotels = allCityHotels.filter(
      (h) => h.hotel_category.trim().toLowerCase() === catKey,
    );
    const categoryRank = CATEGORY_RANK[activeCategory] ?? 0;
    const bestRateForHotel = (hotelId: string) => {
      const roomIds = d.room_categories.filter((room) => room.hotel_id === hotelId).map((room) => room.id);
      return d.rate_plans
        .filter((plan) => roomIds.includes(plan.room_category_id) && day.date >= plan.validity_start && day.date <= plan.validity_end)
        .reduce((max, plan) => Math.max(max, plan.double_rate || 0), 0);
    };
    const noCategoryMatch = cityHotels.length === 0;
    const lowerCategoryHotels = allCityHotels.filter((h) => {
      const rank = CATEGORY_RANK[h.hotel_category] ?? 0;
      return categoryRank > 0 && rank > 0 && rank < categoryRank;
    });
    const fallbackHotels = (lowerCategoryHotels.length > 0 ? lowerCategoryHotels : allCityHotels)
      .slice()
      .sort((a, b) => {
        const rankDiff = (CATEGORY_RANK[b.hotel_category] ?? 0) - (CATEGORY_RANK[a.hotel_category] ?? 0);
        if (rankDiff !== 0) return rankDiff;
        return bestRateForHotel(b.id) - bestRateForHotel(a.id);
      });
    const categoryPool = noCategoryMatch ? fallbackHotels : cityHotels;

    // --- Filter the pool to hotels that can satisfy THIS day's allocated room mix ---
    const needs = mixForDay(day.day);
    const plansForHotel = (hotelId: string) => {
      const roomIds = d.room_categories.filter((room) => room.hotel_id === hotelId).map((room) => room.id);
      return d.rate_plans.filter(
        (plan) =>
          roomIds.includes(plan.room_category_id) &&
          day.date >= plan.validity_start &&
          day.date <= plan.validity_end,
      );
    };
    const hotelSatisfiesMix = (hotelId: string) =>
      plansForHotel(hotelId).some((plan) => {
        if (needs.single > 0 && !(plan.single_rate > 0)) return false;
        if (needs.double > 0 && !(plan.double_rate > 0)) return false;
        if (needs.triple > 0 && !(plan.double_rate > 0 && (plan.extra_bed_rate || 0) > 0)) return false;
        if (needs.quad > 0 && !(((plan as { quad_rate?: number | null }).quad_rate || 0) > 0)) return false;
        return true;
      });
    const mixPool = categoryPool.filter((h) => hotelSatisfiesMix(h.id));
    const hotelPool = mixPool;
    // True when the category pool had hotels but none can fulfil the day's mix.
    const mixUnfulfillable = categoryPool.length > 0 && mixPool.length === 0;
    const missingTypes = [
      needs.single > 0 ? "Single" : "",
      needs.double > 0 ? "Double" : "",
      needs.triple > 0 ? "Triple" : "",
      needs.quad > 0 ? "Quad" : "",
    ].filter(Boolean);

    // Does ANY hotel available for this city/date expose a Quad rate?
    const cityHasQuadHotel = categoryPool.some((h) =>
      plansForHotel(h.id).some((plan) => ((plan as { quad_rate?: number | null }).quad_rate || 0) > 0),
    );


    // Rooms and meal plans
    const rooms = sel ? d.room_categories.filter((r) => r.hotel_id === sel.hotel_id) : [];
    const meals = sel?.room_id ? availableMealPlans(d.rate_plans, sel.room_id, day.date) : [];
    const rate = sel && sel.room_id ? findRatePlan(d.rate_plans, sel.room_id, sel.meal_plan, day.date) : null;
    const selHotel = sel ? d.hotels.find((h) => h.id === sel.hotel_id) : null;
    const isFallback = sel?.is_fallback || false;

    // Get the selected meal plan (default CP)
    const mealPlan = sel?.meal_plan || 'CP';

    // Compute room rates (net, gst, total) for each occupancy
    let sglNet = 0,
      dblNet = 0,
      trpNet = 0,
      quadNet = 0;
    let sglGst = 0,
      dblGst = 0,
      trpGst = 0,
      quadGst = 0;
    let sglTotal = 0,
      dblTotal = 0,
      trpTotal = 0,
      quadTotal = 0;

    // Meal totals (only if not included in meal plan)
    let lunchNet = 0,
      lunchGst = 0,
      lunchTotal = 0;
    let dinnerNet = 0,
      dinnerGst = 0,
      dinnerTotal = 0;
    let isLunchIncluded = false,
      isDinnerIncluded = false;

    let offSeasonText = "";
    let hasRate = false;
    const quadAllocated = quadAllocatedForDay(day.day);
    // A hotel offers Quad only when an explicit quad rate is configured.
    const quadAvailable = !!(rate && (rate as { quad_rate?: number | null }).quad_rate);

    if (rate) {
      const dbl = rate.double_rate;
      const sgl = rate.single_rate;
      const extra = rate.extra_bed_rate || 0;
      const quad = (rate as { quad_rate?: number | null }).quad_rate || 0;
      const lunchRate = rate.lunch_rate || 0;
      const dinnerRate = rate.dinner_rate || 0;
      const gst = gstRateFor;

      // Room totals
      sglNet = sgl;
      dblNet = dbl;
      trpNet = dbl + extra;
      quadNet = quad;
      sglGst = sgl * gst(sgl);
      dblGst = dbl * gst(dbl);
      trpGst = trpNet * gst(trpNet);
      quadGst = quad * gst(quad);
      sglTotal = sglNet + sglGst;
      dblTotal = dblNet + dblGst;
      trpTotal = trpNet + trpGst;

      quadTotal = quadNet + quadGst;

      // Determine if lunch/dinner are included in the meal plan
      isLunchIncluded = isMealIncluded(mealPlan, 'lunch');
      isDinnerIncluded = isMealIncluded(mealPlan, 'dinner');

      // Compute meal totals only if not included
      if (!isLunchIncluded) {
        const lunchNetValue = lunchRate * totalPax;
        lunchNet = lunchNetValue;
        lunchGst = lunchNetValue * gst(lunchNetValue);
        lunchTotal = lunchNet + lunchGst;
      } else {
        lunchNet = 0;
        lunchGst = 0;
        lunchTotal = 0;
      }

      if (!isDinnerIncluded) {
        const dinnerNetValue = dinnerRate * totalPax;
        dinnerNet = dinnerNetValue;
        dinnerGst = dinnerNetValue * gst(dinnerNetValue);
        dinnerTotal = dinnerNet + dinnerGst;
      } else {
        dinnerNet = 0;
        dinnerGst = 0;
        dinnerTotal = 0;
      }

      hasRate = true;

      if (rate.validity_start && rate.validity_end) {
        const start = new Date(rate.validity_start);
        const end = new Date(rate.validity_end);
        const startStr = start.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        const endStr = end.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        offSeasonText = `Off Season (${startStr} – ${endStr})`;
      } else {
        offSeasonText = rate.season_label || "—";
      }

      // Accumulate totals for summary, weighted by the rooms actually allocated that day
      totalSgl += needs.single * sglTotal;
      totalDbl += needs.double * dblTotal;
      totalTrp += needs.triple * trpTotal;
      if (quadAllocated && quadAvailable) totalQuad += needs.quad * quadTotal;
      if (showLunch && !isLunchIncluded) totalLunch += lunchTotal;
      if (showDinner && !isDinnerIncluded) totalDinner += dinnerTotal;

    }

    const setSel = (patch: Partial<typeof sel> & object) => {
      const others = option.selections.filter((s) => s.city_id !== day.city_id);
      const cur = sel || { city_id: day.city_id, hotel_id: "", room_id: "", meal_plan: "CP" as MealPlan };
      const merged = { ...cur, ...patch };
      if ("hotel_id" in patch) {
        const h = d.hotels.find((x) => x.id === merged.hotel_id);
        merged.is_fallback = !!h && h.hotel_category !== activeCategory;
      }
      onUpdate({ selections: [...others, merged] });
    };

    return {
      day: day.day,
      date: day.date,
      city: cityName,
      cityId: day.city_id,
      sel,
      hotelPool,
      rooms,
      meals,
      rate,
      selHotel,
      isFallback,
      noCategoryMatch,
      offSeasonText,
      hasRate,
      // Room totals per occupancy
      sglTotal,
      dblTotal,
      trpTotal,
      quadTotal,
      sglNet,
      sglGst,
      dblNet,
      dblGst,
      trpNet,
      trpGst,
      quadNet,
      quadGst,
      quadAllocated,
      quadAvailable,
      cityHasQuadHotel,
      needs,
      mixUnfulfillable,
      missingTypes,

      // Meal totals (only if not included)
      lunchTotal,
      lunchNet,
      lunchGst,
      dinnerTotal,
      dinnerNet,
      dinnerGst,
      isLunchIncluded,
      isDinnerIncluded,
      mealPlan,
      setSel,
      selectedHotelId: sel?.hotel_id || "",
      selectedRoomId: sel?.room_id || "",
      selectedMeal: mealPlan,
    };
  });

  const anyNoHotels = rows.some((r) => r.noCategoryMatch && r.hotelPool.length === 0 && !r.mixUnfulfillable);
  // Days where the allocated room mix cannot be fulfilled by any hotel in that city.
  const unfulfillableRows = rows.filter((r) => r.mixUnfulfillable);


  return (
    <div className="space-y-2">
      {/* Toggle controls for extra columns */}
      <div className="flex items-center gap-4 p-2 bg-muted/30 rounded-md">
        <span className="text-xs font-medium text-muted-foreground">Show columns:</span>
        <div className="flex items-center gap-2">
          <Checkbox
            id="showQuad"
            checked={showQuad}
            onCheckedChange={(checked) => setShowQuadManual(checked === true)}
          />
          <Label htmlFor="showQuad" className="text-xs cursor-pointer">Quad</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="showLunch"
            checked={showLunch}
            onCheckedChange={(checked) => setShowLunch(checked === true)}
          />
          <Label htmlFor="showLunch" className="text-xs cursor-pointer">Lunch</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="showDinner"
            checked={showDinner}
            onCheckedChange={(checked) => setShowDinner(checked === true)}
          />
          <Label htmlFor="showDinner" className="text-xs cursor-pointer">Dinner</Label>
        </div>
      </div>

      {anyNoHotels && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Some cities have no hotels for the selected category. Please add hotels or choose a different category.
          </span>
          <Button size="sm" variant="outline" onClick={() => {
            const firstMissing = rows.find((r) => r.noCategoryMatch && r.hotelPool.length === 0);
            if (firstMissing) onQuickAdd(firstMissing.cityId, firstMissing.city);
          }}>
            <Plus className="h-3 w-3" /> Add Hotel
          </Button>
        </div>
      )}

      {unfulfillableRows.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 flex items-start justify-between gap-3">
          <span className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {unfulfillableRows
                .map(
                  (r) =>
                    `No hotel in ${r.city} can fulfil Day ${r.day}'s room mix (needs ${r.missingTypes.join(" + ")})`,
                )
                .join(". ")}
              . Please go back to Room Allocation and adjust{" "}
              {unfulfillableRows.map((r) => `Day ${r.day}`).join(", ")} — e.g. use Triple/Double instead.
            </span>
          </span>
          <Button size="sm" variant="outline" className="shrink-0" onClick={onBackToAllocation}>
            Go to Room Allocation
          </Button>
        </div>
      )}


      <Card className="p-0 overflow-hidden border border-[#E2E8F0] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#F1F4F9] border-b border-[#E2E8F0]">
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-[#475569] uppercase tracking-wider">Day</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-[#475569] uppercase tracking-wider">Date</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-[#475569] uppercase tracking-wider">Destination</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-[#475569] uppercase tracking-wider">Hotel</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-[#475569] uppercase tracking-wider">Room</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-[#475569] uppercase tracking-wider">Meal Plan</th>
                <th className="text-right py-2.5 px-3 text-[11px] font-semibold text-[#475569] uppercase tracking-wider">SGL</th>
                <th className="text-right py-2.5 px-3 text-[11px] font-semibold text-[#475569] uppercase tracking-wider">DBL</th>
                <th className="text-right py-2.5 px-3 text-[11px] font-semibold text-[#475569] uppercase tracking-wider">TRP</th>
                {showQuad && (
                  <th className="text-right py-2.5 px-3 text-[11px] font-semibold text-[#475569] uppercase tracking-wider">Quad</th>
                )}
                {showLunch && (
                  <th className="text-right py-2.5 px-3 text-[11px] font-semibold text-[#475569] uppercase tracking-wider">Lunch</th>
                )}
                {showDinner && (
                  <th className="text-right py-2.5 px-3 text-[11px] font-semibold text-[#475569] uppercase tracking-wider">Dinner</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const isMissingHotel = r.noCategoryMatch && r.hotelPool.length === 0;
                return (
                  <tr key={idx} className="border-b border-[#E2E8F0] last:border-b-0 align-top">
                    <td className="py-2.5 px-3 font-medium text-[#0F172A]">{r.day}</td>
                    <td className="py-2.5 px-3 text-[#334155] whitespace-nowrap">{fmtDateShort(r.date)}</td>
                    <td className="py-2.5 px-3 text-[#334155]">{r.city}</td>
                    <td className="py-2.5 px-3 min-w-[140px]">
                      {isMissingHotel ? (
                        <div className="text-amber-600 text-xs flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          No hotels
                          <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => onQuickAdd(r.cityId, r.city)}>
                            Add
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Select
                            value={r.selectedHotelId}
                            onValueChange={(v) => r.setSel({ hotel_id: v, room_id: "" })}
                          >
                            <SelectTrigger className="h-8 text-xs border-[#E2E8F0]">
                              <SelectValue placeholder="Select hotel…" />
                            </SelectTrigger>
                            <SelectContent>
                              {r.hotelPool.map((h) => (
                                <SelectItem key={h.id} value={h.id}>
                                  {h.name}{r.noCategoryMatch ? ` (${h.hotel_category})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {r.offSeasonText && (
                            <div className="text-[11px] text-[#64748B] mt-1">{r.offSeasonText}</div>
                          )}
                          {r.isFallback && r.selHotel && (
                            <div className="text-[10px] text-amber-700 bg-amber-50 inline-block px-1.5 py-0.5 rounded mt-1">
                              ⚠ {r.selHotel.hotel_category} selected (differs from option)
                            </div>
                          )}
                          {r.noCategoryMatch && (
                            <div className="text-[10px] text-amber-600 mt-1">
                              No {activeCategory} hotels; showing closest lower categories.
                            </div>
                          )}
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {r.hotelPool.length} hotel{r.hotelPool.length !== 1 ? "s" : ""} available
                          </div>
                        </>
                      )}
                    </td>
                    <td className="py-2.5 px-3 min-w-[120px]">
                      {r.sel?.hotel_id ? (
                        <Select
                          value={r.selectedRoomId}
                          onValueChange={(v) => r.setSel({ room_id: v })}
                          disabled={!r.sel?.hotel_id}
                        >
                          <SelectTrigger className="h-8 text-xs border-[#E2E8F0]">
                            <SelectValue placeholder="Select room…" />
                          </SelectTrigger>
                          <SelectContent>
                            {r.rooms.map((room) => (
                              <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">Select hotel first</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 min-w-[80px]">
                      {r.sel?.room_id ? (
                        <Select
                          value={r.selectedMeal}
                          onValueChange={(v) => r.setSel({ meal_plan: v as MealPlan })}
                          disabled={r.meals.length === 0}
                        >
                          <SelectTrigger className="h-8 text-xs border-[#E2E8F0]">
                            <SelectValue placeholder={r.meals.length === 0 ? "—" : "Select…"} />
                          </SelectTrigger>
                          <SelectContent>
                            {(r.meals.length ? r.meals : MEAL_PLANS).map((m) => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    {r.hasRate ? (
                      <>
                        <td className="py-2.5 px-3 text-right">
                          {r.needs.single ? (
                            <>
                              <div className="font-semibold text-[#0F172A]">{inr(r.sglTotal)}</div>
                              <div className="text-[11px] text-[#64748B]">
                                × {r.needs.single} room{r.needs.single > 1 ? "s" : ""} · Net: {inr(r.sglNet)} + GST {(gstRateFor(r.sglNet) * 100).toFixed(0)}%: {inr(r.sglGst)}
                              </div>
                            </>
                          ) : (
                            <span className="text-[11px] text-[#94A3B8]">Not allocated</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {r.needs.double ? (
                            <>
                              <div className="font-semibold text-[#0F172A]">{inr(r.dblTotal)}</div>
                              <div className="text-[11px] text-[#64748B]">
                                × {r.needs.double} room{r.needs.double > 1 ? "s" : ""} · Net: {inr(r.dblNet)} + GST {(gstRateFor(r.dblNet) * 100).toFixed(0)}%: {inr(r.dblGst)}
                              </div>
                            </>
                          ) : (
                            <span className="text-[11px] text-[#94A3B8]">Not allocated</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {r.needs.triple ? (
                            <>
                              <div className="font-semibold text-[#0F172A]">{inr(r.trpTotal)}</div>
                              <div className="text-[11px] text-[#64748B]">
                                × {r.needs.triple} room{r.needs.triple > 1 ? "s" : ""} · Net: {inr(r.trpNet)} + GST {(gstRateFor(r.trpNet) * 100).toFixed(0)}%: {inr(r.trpGst)}
                              </div>
                            </>
                          ) : (
                            <span className="text-[11px] text-[#94A3B8]">Not allocated</span>
                          )}
                        </td>
                        {showQuad && (
                          <td className="py-2.5 px-3 text-right">
                            {!r.quadAllocated ? (
                              <span className="text-[11px] text-[#94A3B8]">Not allocated</span>
                            ) : r.quadAvailable ? (
                              <>
                                <div className="font-semibold text-[#0F172A]">{inr(r.quadTotal)}</div>
                                <div className="text-[11px] text-[#64748B]">
                                  × {r.needs.quad} room{r.needs.quad > 1 ? "s" : ""} · Net: {inr(r.quadNet)} + GST {(gstRateFor(r.quadNet) * 100).toFixed(0)}%: {inr(r.quadGst)}
                                </div>
                              </>
                            ) : (
                              <span className="text-[11px] text-amber-700">No Quad rate</span>
                            )}
                          </td>
                        )}
                        {showLunch && (
                          <td className="py-2.5 px-3 text-right">
                            {r.isLunchIncluded ? (
                              <span className="text-[#64748B] text-xs font-medium">Included</span>
                            ) : (
                              <>
                                <div className="font-semibold text-[#0F172A]">{inr(r.lunchTotal)}</div>
                                <div className="text-[11px] text-[#64748B]">
                                  Net: {inr(r.lunchNet)} + GST {(gstRateFor(r.lunchNet) * 100).toFixed(0)}%: {inr(r.lunchGst)}
                                </div>
                              </>
                            )}
                          </td>
                        )}
                        {showDinner && (
                          <td className="py-2.5 px-3 text-right">
                            {r.isDinnerIncluded ? (
                              <span className="text-[#64748B] text-xs font-medium">Included</span>
                            ) : (
                              <>
                                <div className="font-semibold text-[#0F172A]">{inr(r.dinnerTotal)}</div>
                                <div className="text-[11px] text-[#64748B]">
                                  Net: {inr(r.dinnerNet)} + GST {(gstRateFor(r.dinnerNet) * 100).toFixed(0)}%: {inr(r.dinnerGst)}
                                </div>
                              </>
                            )}
                          </td>
                        )}
                      </>
                    ) : (
                      <>
                        <td className="py-2.5 px-3 text-right text-[#94A3B8] text-xs">—</td>
                        <td className="py-2.5 px-3 text-right text-[#94A3B8] text-xs">—</td>
                        <td className="py-2.5 px-3 text-right text-[#94A3B8] text-xs">—</td>
                        {showQuad && <td className="py-2.5 px-3 text-right text-[#94A3B8] text-xs">—</td>}
                        {showLunch && <td className="py-2.5 px-3 text-right text-[#94A3B8] text-xs">—</td>}
                        {showDinner && <td className="py-2.5 px-3 text-right text-[#94A3B8] text-xs">—</td>}
                      </>
                    )}

                  </tr>
                );
              })}
            </tbody>
            {rows.some((r) => r.hasRate) && (
              <tfoot>
                <tr className="border-t-2 border-[#CBD5E1] bg-[#F8FAFC]">
                  <td colSpan={6} className="py-3 px-3 text-sm font-semibold text-[#0F172A]">
                    Net rate with GST
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-[#0F172A]">{inr(totalSgl)}</td>
                  <td className="py-3 px-3 text-right font-bold text-[#0F172A]">{inr(totalDbl)}</td>
                  <td className="py-3 px-3 text-right font-bold text-[#0F172A]">{inr(totalTrp)}</td>
                  {showQuad && (
                    <td className="py-3 px-3 text-right font-bold text-[#0F172A]">{inr(totalQuad)}</td>
                  )}
                  {showLunch && (
                    <td className="py-3 px-3 text-right font-bold text-[#0F172A]">{inr(totalLunch)}</td>
                  )}
                  {showDinner && (
                    <td className="py-3 px-3 text-right font-bold text-[#0F172A]">{inr(totalDinner)}</td>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!rows.some((r) => r.hasRate) && (
          <div className="p-4 text-sm text-amber-700 bg-amber-50 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            No rates found for the selected hotels. Please check room/meal plan selections.
          </div>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------
// Per-option Inclusions & Exclusions editor (Step 15).
// (unchanged)
// ------------------------------------------------------------
function OptionInclusionsEditor({
  option, onChange,
}: {
  option: HotelOption;
  onChange: (patch: Partial<HotelOption>) => void;
}) {
  const [newInc, setNewInc] = useState("");
  const [newExc, setNewExc] = useState("");
  const inclusions = option.inclusions ?? [];
  const exclusions = option.exclusions ?? [];

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground italic">
        Auto-filled for <b>{option.category || "—"}</b>. Customize as needed.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="section-label mb-2">Inclusions · Option {option.key}</div>
          <ul className="space-y-1 mb-2">
            {inclusions.map((x, i) => (
              <li key={i} className="text-sm flex justify-between gap-2">
                <span>✓ {x}</span>
                <button
                  onClick={() => onChange({ inclusions: inclusions.filter((_, j) => j !== i) })}
                  className="text-destructive"
                  aria-label="Remove"
                >×</button>
              </li>
            ))}
            {inclusions.length === 0 && (
              <li className="text-xs text-muted-foreground">No inclusions yet.</li>
            )}
          </ul>
          <div className="flex gap-2">
            <Input value={newInc} onChange={(e) => setNewInc(e.target.value)} placeholder="Add inclusion" />
            <Button size="sm" onClick={() => {
              const v = newInc.trim();
              if (v) { onChange({ inclusions: [...inclusions, v] }); setNewInc(""); }
            }}>Add</Button>
          </div>
        </Card>
        <Card className="p-3">
          <div className="section-label mb-2">Exclusions · Option {option.key}</div>
          <ul className="space-y-1 mb-2">
            {exclusions.map((x, i) => (
              <li key={i} className="text-sm flex justify-between gap-2">
                <span>✗ {x}</span>
                <button
                  onClick={() => onChange({ exclusions: exclusions.filter((_, j) => j !== i) })}
                  className="text-destructive"
                  aria-label="Remove"
                >×</button>
              </li>
            ))}
            {exclusions.length === 0 && (
              <li className="text-xs text-muted-foreground">No exclusions yet.</li>
            )}
          </ul>
          <div className="flex gap-2">
            <Input value={newExc} onChange={(e) => setNewExc(e.target.value)} placeholder="Add exclusion" />
            <Button size="sm" onClick={() => {
              const v = newExc.trim();
              if (v) { onChange({ exclusions: [...exclusions, v] }); setNewExc(""); }
            }}>Add</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Dynamic (day-by-day) room mix preview
// (unchanged)
// ------------------------------------------------------------
function OptionDynamicPreview({ draft, option }: { draft: QuoteDraft; option: HotelOption }) {
  const d = useDB();
  const res = useMemo(() => computeDynamicOption(draft, option, d), [draft, option, d]);
  if (!res.days.length) return null;
  return (
    <Card className="p-0 overflow-hidden border-primary/20" style={{ backgroundColor: "#FBF7EE" }}>
      <div className="px-4 py-2.5 text-sm font-semibold text-primary">
        OPTION {option.key} · Dynamic Room Mix Cost Preview
      </div>
      <div className="px-4 pb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left py-1.5 font-medium">Day</th>
              <th className="text-left py-1.5 font-medium">City</th>
              <th className="text-left py-1.5 font-medium">Room Mix</th>
              <th className="text-right py-1.5 font-medium">Net</th>
              <th className="text-right py-1.5 font-medium">GST</th>
              <th className="text-right py-1.5 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {res.days.map((row) => {
              const city = d.cities.find((c) => c.id === row.city_id)?.name || "—";
              const parts = [
                row.mix.single ? `${row.mix.single} Single` : "",
                row.mix.double ? `${row.mix.double} Double` : "",
                row.mix.triple ? `${row.mix.triple} Triple` : "",
                row.mix.quad ? `${row.mix.quad} Quad` : "",
              ].filter(Boolean).join(" + ") || "—";
              return (
                <tr key={row.day} className="border-t">
                  <td className="py-1.5">Day {row.day}</td>
                  <td className="py-1.5 text-muted-foreground">{city}</td>
                  <td className="py-1.5">{parts}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.missing ? "—" : inr(row.net)}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.missing ? "—" : inr(row.gst)}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{row.missing ? "No rate" : inr(row.net + row.gst)}</td>
                </tr>
              );
            })}
            <tr className="border-t font-semibold">
              <td className="py-1.5" colSpan={3}>Total (rooms only)</td>
              <td className="py-1.5 text-right tabular-nums">{inr(res.room_net)}</td>
              <td className="py-1.5 text-right tabular-nums">{inr(res.room_gst)}</td>
              <td className="py-1.5 text-right tabular-nums text-primary">{inr(res.room_net + res.room_gst)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------
// Live per-person cost preview
// (unchanged)
// ------------------------------------------------------------
export function OptionPerPersonPreview({ draft, option }: { draft: QuoteDraft; option: HotelOption }) {
  const d = useDB();
  const rows = useMemo(() => computePersonTotals(draft, option, d), [draft, option, d]);
  const nights = draft.routing.filter((r) => r.overnight && r.city_id).length;
  if (!rows.length) return null;

  const nameById = new Map(rows.map((r) => [r.person_id, r.label]));

  return (
    <Card className="p-0 overflow-hidden border-primary/20" style={{ backgroundColor: "#FBF7EE" }}>
      <div className="px-4 py-2.5 text-sm font-semibold text-primary">
        OPTION {option.key} · Per-Person Cost Preview ({nights} night{nights === 1 ? "" : "s"})
      </div>
      <div className="px-4 pb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left py-1.5 font-medium">Person</th>
              <th className="text-left py-1.5 font-medium">Room</th>
              <th className="text-right py-1.5 font-medium">Room Net</th>
              <th className="text-right py-1.5 font-medium">Room GST</th>
              <th className="text-right py-1.5 font-medium">Rooms Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.person_id} className="border-t">
                <td className="py-1.5">{r.label}</td>
                <td className="py-1.5 text-muted-foreground">
                  {personRoomTypeLabel(r.room_type, r.sharing_with)}
                  {r.sharing_with.length > 0 && (
                    <span className="ml-1 text-xs">
                      w/ {r.sharing_with.map((id) => nameById.get(id) || `#${id}`).join(", ")}
                    </span>
                  )}
                </td>
                <td className="text-right tabular-nums">{inr(r.room_net)}</td>
                <td className="text-right tabular-nums">{inr(r.room_gst)}</td>
                <td className="text-right tabular-nums font-semibold text-primary">{inr(r.room_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 text-[11px] text-muted-foreground italic">
          Add-ons (transport, guide, activities) will be split equally across all {rows.length} traveller{rows.length === 1 ? "" : "s"} in Steps 16 & 17.
        </div>
      </div>
    </Card>
  );
}