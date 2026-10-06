// src/components/quotation/steps/StepHotels.tsx (Step15)
// Standard & Dynamic Layouts Combined.

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { inr, fmtDateShort } from "@/lib/format";
import { useDB, MEAL_PLANS, type MealPlan } from "@/lib/mock-store";
import {
  applyRateOverride,
  gstRateFor,
  computePersonTotals,
  optionUsesCustomAllocation,
  computeDynamicOption,
  personRoomTypeLabel,
  defaultDayMix,
  effectivePaxForPricing,
  dayMixCoversPax,
} from "@/lib/wizard/calc";
import type {
  QuoteDraft,
  HotelOption,
  OptionKey,
  DayRateOverride,
  DayRoomMix,
} from "@/lib/wizard/types";
import { findRatePlan, availableMealPlans } from "@/lib/wizard/rate-lookup";
import { defaultsForCategory } from "@/lib/wizard/category-defaults";
import { QuickAddHotelDialog } from "@/components/QuickAddHotelDialog";
import { useAuth } from "@/lib/auth-mock";
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

export function Step15({ draft, set }: StepProps) {
  const d = useDB();
  const [activeOpt, setActiveOpt] = useState<OptionKey>(draft.hotel_options[0]?.key || "A");
  const [quickAdd, setQuickAdd] = useState<{ cityId: string; cityName: string } | null>(null);
  const overnightRouting = draft.routing.filter((r) => r.overnight && (r.city_id || r.to_city));
  const paxForMix = Math.max(1, effectivePaxForPricing(draft));

  // Global Mode Toggle (Standard vs Dynamic)
  const isDynamicGlobal = (draft.dynamic_days ?? []).length > 0;
  const setGlobalMode = (isDynamic: boolean) => {
    if (isDynamic) {
      const days = overnightRouting.map((r) => r.day);
      const mixes = { ...(draft.day_room_mix ?? {}) };
      days.forEach((dayNo) => { if (!mixes[dayNo]) mixes[dayNo] = defaultDayMix(paxForMix); });
      set({ dynamic_days: days, day_room_mix: mixes });
    } else {
      // Switch to Standard: set a double-occupancy mix for all overnight days
      // so that the Per-Person Preview uses double rooms (no Quad).
      const doubles = Math.floor(paxForMix / 2);
      const single = paxForMix % 2;
      const doubleMix: DayRoomMix = { single, double: doubles, triple: 0, quad: 0 };
      const mixes: Record<number, DayRoomMix> = {};
      overnightRouting.forEach((r) => { mixes[r.day] = { ...doubleMix }; });
      set({ dynamic_days: [], day_room_mix: mixes });
    }
  };

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
            <p className="text-sm text-muted-foreground">Complete routing in Step 5 first.</p>
          )}

          {!activeCategory && overnightRouting.length > 0 && (
            <p className="text-sm text-amber-600">Select a hotel category above to load hotels for each city.</p>
          )}

          {activeCategory && overnightRouting.length > 0 && (
            <AccommodationSelectionTable
              draft={draft}
              set={set}
              option={activeOption}
              activeCategory={activeCategory}
              overnightRouting={overnightRouting}
              onUpdate={(patch) => updateOption(activeOption.key, patch)}
              onQuickAdd={(cityId, cityName) => setQuickAdd({ cityId, cityName })}
              isDynamicGlobal={isDynamicGlobal}
              setGlobalMode={setGlobalMode}
              paxForMix={paxForMix}
            />
          )}

          {activeCategory && overnightRouting.length > 0 && activeOption.selections.some((s) => s.room_id) && (
            <>
              {!isDynamicGlobal && (draft.dynamic_days ?? []).length > 0 && (
                <OptionDynamicPreview draft={draft} option={activeOption} />
              )}
              {optionUsesCustomAllocation(activeOption) && (
                <OptionPerPersonPreview draft={draft} option={activeOption} />
              )}
            </>
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
// Accommodation Selection Table (Standard + Dynamic Combined)
// ============================================================
function AccommodationSelectionTable({
  draft,
  set,
  option,
  activeCategory,
  overnightRouting,
  onUpdate,
  onQuickAdd,
  isDynamicGlobal,
  setGlobalMode,
  paxForMix,
}: {
  draft: QuoteDraft;
  set: (p: Partial<QuoteDraft>) => void;
  option: HotelOption;
  activeCategory: string;
  overnightRouting: typeof draft.routing;
  onUpdate: (patch: Partial<HotelOption>) => void;
  onQuickAdd: (cityId: string, cityName: string) => void;
  isDynamicGlobal: boolean;
  setGlobalMode: (isDynamic: boolean) => void;
  paxForMix: number;
}) {
  const d = useDB();
  const user = useAuth();
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [showQuadPref, setShowQuad] = useState(false);
  // Quad only participates in Dynamic mode; Standard stays flat SGL/DBL/TRP.
  const showQuad = showQuadPref && isDynamicGlobal;

  const overrides = option.rate_overrides ?? {};
  type RateField = "sgl" | "dbl" | "trp" | "quad";
  const setOverride = (dayNumber: number, field: RateField, value: number | undefined) => {
    const cur = { ...(overrides[dayNumber] ?? {}) };
    if (value === undefined || !(value > 0)) delete cur[field];
    else {
      cur[field] = value;
      cur.changed_by = user?.name || "Unknown";
      cur.changed_at = new Date().toISOString();
    }
    const next = { ...overrides };
    if (Object.keys(cur).length === 0) delete next[dayNumber];
    else next[dayNumber] = cur;
    onUpdate({ rate_overrides: next });
  };
  const setOverrideReason = (dayNumber: number, reason: string) => {
    const cur = { ...(overrides[dayNumber] ?? {}), reason };
    const next = { ...overrides, [dayNumber]: cur };
    onUpdate({ rate_overrides: next });
  };
  const setDayOverride = (dayNumber: number, value: DayRateOverride | undefined) => {
    const next = { ...overrides };
    if (!value || Object.keys(value).length === 0) delete next[dayNumber];
    else next[dayNumber] = value;
    onUpdate({ rate_overrides: next });
  };

  const dayMixFor = (dayNo: number): DayRoomMix =>
    draft.day_room_mix?.[dayNo] ?? defaultDayMix(paxForMix);
  const setDayMix = (dayNo: number, patch: Partial<DayRoomMix>) => {
    set({ day_room_mix: { ...(draft.day_room_mix ?? {}), [dayNo]: { ...dayMixFor(dayNo), ...patch } } });
  };

  // Toggles for "All Single/Double/Triple/Quad" in Dynamic mode
  const applyDayPreset = (dayNo: number, kind: "single" | "double" | "triple" | "quad") => {
    if (kind === "single") setDayMix(dayNo, { single: paxForMix, double: 0, triple: 0, quad: 0 });
    if (kind === "double") setDayMix(dayNo, { single: paxForMix % 2, double: Math.floor(paxForMix / 2), triple: 0, quad: 0 });
    if (kind === "triple") {
      const triple = Math.floor(paxForMix / 3);
      const rem = paxForMix % 3;
      setDayMix(dayNo, { single: rem === 1 ? 1 : 0, double: rem === 2 ? 1 : 0, triple, quad: 0 });
    }
    if (kind === "quad") {
      const quad = Math.floor(paxForMix / 4);
      const rem = paxForMix % 4;
      setDayMix(dayNo, { single: rem === 1 ? 1 : 0, double: rem === 2 ? 1 : 0, triple: rem === 3 ? 1 : 0, quad });
    }
  };
  const copyDayOneToAll = () => {
    const first = overnightRouting[0];
    if (!first) return;
    const base = dayMixFor(first.day);
    const next: Record<number, DayRoomMix> = { ...(draft.day_room_mix ?? {}) };
    overnightRouting.forEach((r) => { next[r.day] = { ...base }; });
    set({ day_room_mix: next });
  };

  // Hotel filter logic
  const hotelHasQuad = (hotelId: string, dateISO: string) => {
    const roomIds = d.room_categories.filter((room) => room.hotel_id === hotelId).map((room) => room.id);
    return roomIds.some((roomId) =>
      MEAL_PLANS.some((m) => {
        const plan = findRatePlan(d.rate_plans, roomId, m, dateISO);
        return !!plan && (plan.quad_rate ?? 0) > 0;
      }),
    );
  };

  // Build the rows
  const rows = overnightRouting.map((day) => {
    const cityName = d.cities.find((c) => c.id === day.city_id)?.name || day.to_city || "";
    const cityKey = cityName.trim().toLowerCase();
    const catKey = activeCategory.trim().toLowerCase();
    const sel = option.selections.find((s) => s.city_id === day.city_id);

    const hotelCityName = (h: (typeof d.hotels)[number]) =>
      (d.cities.find((c) => c.id === h.city_id)?.name || "").trim().toLowerCase();
    const allCityHotels = cityKey ? d.hotels.filter((h) => hotelCityName(h) === cityKey) : [];
    const cityHotels = allCityHotels.filter((h) => h.hotel_category.trim().toLowerCase() === catKey);
    const noCategoryMatch = cityHotels.length === 0;
    const lowerCategoryHotels = allCityHotels.filter((h) => {
      const rank = CATEGORY_RANK[h.hotel_category] ?? 0;
      return (CATEGORY_RANK[activeCategory] ?? 0) > 0 && rank > 0 && rank < (CATEGORY_RANK[activeCategory] ?? 0);
    });
    const fallbackHotels = (lowerCategoryHotels.length > 0 ? lowerCategoryHotels : allCityHotels)
      .slice()
      .sort((a, b) => {
        const rankDiff = (CATEGORY_RANK[b.hotel_category] ?? 0) - (CATEGORY_RANK[a.hotel_category] ?? 0);
        if (rankDiff !== 0) return rankDiff;
        const roomIdsA = d.room_categories.filter((room) => room.hotel_id === a.id).map((room) => room.id);
        const bestRateA = d.rate_plans.filter((plan) => roomIdsA.includes(plan.room_category_id) && day.date >= plan.validity_start && day.date <= plan.validity_end).reduce((max, plan) => Math.max(max, plan.double_rate || 0), 0);
        const roomIdsB = d.room_categories.filter((room) => room.hotel_id === b.id).map((room) => room.id);
        const bestRateB = d.rate_plans.filter((plan) => roomIdsB.includes(plan.room_category_id) && day.date >= plan.validity_start && day.date <= plan.validity_end).reduce((max, plan) => Math.max(max, plan.double_rate || 0), 0);
        return bestRateB - bestRateA;
      });
    let hotelPool = noCategoryMatch ? fallbackHotels : cityHotels;

    const needsQuad = showQuad || (isDynamicGlobal && (dayMixFor(day.day).quad ?? 0) > 0);
    const quadPool = hotelPool.filter((h) => hotelHasQuad(h.id, day.date));
    const noQuadHotel = needsQuad && quadPool.length === 0;
    if (needsQuad && quadPool.length > 0) hotelPool = quadPool;

    const rooms = sel ? d.room_categories.filter((r) => r.hotel_id === sel.hotel_id) : [];
    const meals = sel?.room_id ? availableMealPlans(d.rate_plans, sel.room_id, day.date) : [];
    const baseRate = sel && sel.room_id ? findRatePlan(d.rate_plans, sel.room_id, sel.meal_plan, day.date) : null;
    const dayOverride = overrides[day.day];
    const rate = applyRateOverride(baseRate, dayOverride);
    const selHotel = sel ? d.hotels.find((h) => h.id === sel.hotel_id) : null;
    const isFallback = sel?.is_fallback || false;

    let sglNet = 0, dblNet = 0, trpNet = 0, quadNet = 0;
    let sglGst = 0, dblGst = 0, trpGst = 0, quadGst = 0;
    let sglTotal = 0, dblTotal = 0, trpTotal = 0, quadTotal = 0;
    let offSeasonText = "";
    let hasRate = false;

    if (rate) {
      const dbl = rate.double_rate;
      const sgl = rate.single_rate;
      const extra = rate.extra_bed_rate || 0;
      const quad = (rate.quad_rate ?? 0) > 0 ? (rate.quad_rate as number) : dbl + 2 * extra;
      const gst = gstRateFor;

      sglNet = sgl; dblNet = dbl; trpNet = dbl + extra; quadNet = quad;
      sglGst = sgl * gst(sgl); dblGst = dbl * gst(dbl); trpGst = trpNet * gst(trpNet); quadGst = quad * gst(quad);
      sglTotal = sglNet + sglGst; dblTotal = dblNet + dblGst; trpTotal = trpNet + trpGst; quadTotal = quadNet + quadGst;
      hasRate = true;
      offSeasonText = rate.season_label || (rate.validity_start && rate.validity_end ? `Off Season (${fmtDateShort(rate.validity_start)} – ${fmtDateShort(rate.validity_end)})` : "—");
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
      day: day.day, date: day.date, city: cityName, cityId: day.city_id, dayOverride,
      sel, hotelPool, rooms, meals, rate, selHotel, isFallback, noCategoryMatch, noQuadHotel,
      offSeasonText, hasRate, sglTotal, dblTotal, trpTotal, quadTotal, sglNet, sglGst, dblNet, dblGst, trpNet, trpGst, quadNet, quadGst,
      setSel, selectedHotelId: sel?.hotel_id || "", selectedRoomId: sel?.room_id || "", selectedMeal: sel?.meal_plan || "CP"
    };
  });

  // Dynamic Totals
  let globalTotalPrice = 0;
  let totalSgl = 0, totalDbl = 0, totalTrp = 0, totalQuad = 0;
  rows.forEach((r) => {
    if (r.hasRate) {
      totalSgl += r.sglTotal; totalDbl += r.dblTotal; totalTrp += r.trpTotal; totalQuad += r.quadTotal;
    }
    if (isDynamicGlobal) {
      const currentMix = dayMixFor(r.day);
      const nightTotal = (currentMix.single * r.sglTotal) + (currentMix.double * r.dblTotal) + (currentMix.triple * r.trpTotal) + (currentMix.quad * r.quadTotal);
      globalTotalPrice += nightTotal;
    }
  });

  // Edit Dialog for Standard Mode
  const editRow = rows.find((r) => r.day === editingDay) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3 p-2 bg-muted/30 rounded-md">
        {/* Modes Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Room mode:</span>
          <div className="flex rounded-md border overflow-hidden bg-background">
            <button
              type="button"
              onClick={() => setGlobalMode(false)}
              className={cn("px-4 py-1.5 text-xs font-medium transition-colors",
                !isDynamicGlobal ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >Standard</button>
            <button
              type="button"
              onClick={() => setGlobalMode(true)}
              className={cn("px-4 py-1.5 text-xs font-medium transition-colors",
                isDynamicGlobal ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >Dynamic</button>
          </div>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            {isDynamicGlobal ? "Control per-night room mixes." : "Pricing displayed per room type."}
          </span>
        </div>
        
        {/* Quad column is a Dynamic-mode concern only — Standard mode stays
            flat Single / Double / Triple with no room-mix logic. */}
        <div className={cn("flex items-center gap-2 ml-auto", !isDynamicGlobal && "hidden")}>
          <Checkbox id="showQuad" checked={showQuad} onCheckedChange={(checked) => setShowQuad(checked === true)} />
          <Label htmlFor="showQuad" className="text-xs cursor-pointer select-none">Show Quad column</Label>
        </div>
      </div>

      {/* ============================================ */}
      {/* STANDARD MODE - HORIZONTAL TABLE             */}
      {/* ============================================ */}
      {!isDynamicGlobal && (
        <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-[#F1F4F9] text-[11px] font-semibold text-[#475569] uppercase tracking-wider border-b border-[#E2E8F0]">
                <tr>
                  <th className="text-left py-3 px-3">Day</th>
                  <th className="text-left py-3 px-3">Date</th>
                  <th className="text-left py-3 px-3">Destination</th>
                  <th className="text-left py-3 px-3">Hotel</th>
                  <th className="text-left py-3 px-3">Room</th>
                  <th className="text-left py-3 px-3">Meal Plan</th>
                  <th className="text-right py-3 px-3">SGL</th>
                  <th className="text-right py-3 px-3">DBL</th>
                  <th className="text-right py-3 px-3">TRP</th>
                  {showQuad && <th className="text-right py-3 px-3">Quad</th>}
                  <th className="text-right py-3 px-3">Edit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const isMissingHotel = r.noCategoryMatch && r.hotelPool.length === 0;
                  return (
                    <tr key={idx} className="border-b border-[#E2E8F0] last:border-0 align-top hover:bg-muted/10">
                      <td className="py-3 px-3 font-medium text-[#0F172A]">{r.day}</td>
                      <td className="py-3 px-3 text-[#334155] whitespace-nowrap">{fmtDateShort(r.date)}</td>
                      <td className="py-3 px-3 text-[#334155]">{r.city}</td>
                      <td className="py-3 px-3 min-w-[180px]">
                        {isMissingHotel ? (
                          <div className="text-amber-600 text-xs flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> No hotels <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => onQuickAdd(r.cityId, r.city)}>Add</Button>
                          </div>
                        ) : (
                          <>
                            <Select value={r.selectedHotelId} onValueChange={(v) => r.setSel({ hotel_id: v, room_id: "" })}>
                              <SelectTrigger className="h-8 text-xs border-[#E2E8F0] w-full"><SelectValue placeholder="Select hotel…" /></SelectTrigger>
                              <SelectContent>
                                {r.hotelPool.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}{r.noCategoryMatch ? ` (${h.hotel_category})` : ""}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {r.offSeasonText && <div className="text-[11px] text-[#64748B] mt-1 truncate">{r.offSeasonText}</div>}
                            {r.isFallback && r.selHotel && <div className="text-[10px] text-amber-700 bg-amber-50 inline-block px-1.5 py-0.5 rounded mt-1">⚠ {r.selHotel.hotel_category}</div>}
                            <div className="text-[10px] text-muted-foreground mt-1">{r.hotelPool.length} hotel{r.hotelPool.length !== 1 ? "s" : ""} available</div>
                          </>
                        )}
                      </td>
                      <td className="py-3 px-3 min-w-[140px]">
                        {r.sel?.hotel_id ? (
                          <Select value={r.selectedRoomId} onValueChange={(v) => r.setSel({ room_id: v })} disabled={!r.sel?.hotel_id}>
                            <SelectTrigger className="h-8 text-xs border-[#E2E8F0] w-full"><SelectValue placeholder="Select room…" /></SelectTrigger>
                            <SelectContent>
                              {r.rooms.map((room) => <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : <span className="text-xs text-muted-foreground">Select hotel first</span>}
                      </td>
                      <td className="py-3 px-3 min-w-[100px]">
                        {r.sel?.room_id ? (
                          <Select value={r.selectedMeal} onValueChange={(v) => r.setSel({ meal_plan: v as MealPlan })} disabled={r.meals.length === 0}>
                            <SelectTrigger className="h-8 text-xs border-[#E2E8F0] w-full"><SelectValue placeholder={r.meals.length === 0 ? "—" : "Select…"} /></SelectTrigger>
                            <SelectContent>
                              {(r.meals.length ? r.meals : MEAL_PLANS).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      {r.hasRate ? (
                        <>
                          <td className="py-3 px-3 text-right text-[#0F172A] font-semibold">{inr(r.sglTotal)}<div className="text-[11px] text-[#64748B] font-normal">Net: {inr(r.sglNet)} + GST {gstRateFor(r.sglNet) * 100}%</div></td>
                          <td className="py-3 px-3 text-right text-[#0F172A] font-semibold">{inr(r.dblTotal)}<div className="text-[11px] text-[#64748B] font-normal">Net: {inr(r.dblNet)} + GST {gstRateFor(r.dblNet) * 100}%</div></td>
                          <td className="py-3 px-3 text-right text-[#0F172A] font-semibold">{inr(r.trpTotal)}<div className="text-[11px] text-[#64748B] font-normal">Net: {inr(r.trpNet)} + GST {gstRateFor(r.trpNet) * 100}%</div></td>
                          {showQuad && <td className="py-3 px-3 text-right text-[#0F172A] font-semibold">{inr(r.quadTotal)}<div className="text-[11px] text-[#64748B] font-normal">Net: {inr(r.quadNet)} + GST {gstRateFor(r.quadNet) * 100}%</div></td>}
                        </>
                      ) : (
                        <>
                          <td className="py-3 px-3 text-right text-[#94A3B8] text-xs">—</td>
                          <td className="py-3 px-3 text-right text-[#94A3B8] text-xs">—</td>
                          <td className="py-3 px-3 text-right text-[#94A3B8] text-xs">—</td>
                          {showQuad && <td className="py-3 px-3 text-right text-[#94A3B8] text-xs">—</td>}
                        </>
                      )}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" disabled={!r.hasRate} onClick={() => setEditingDay(r.day)}>
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                        {r.dayOverride && Object.keys(r.dayOverride).length > 0 && <div className="text-[10px] text-amber-700 mt-1 uppercase tracking-wide">Edited</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.some((r) => r.hasRate) && (
                <tfoot className="border-t-2 border-[#CBD5E1] bg-[#F8FAFC]">
                  <tr>
                    <td colSpan={6} className="py-3 px-3 text-sm font-semibold text-[#0F172A] text-right">Net rate with GST</td>
                    <td className="py-3 px-3 text-right font-bold text-[#0F172A]">{inr(totalSgl)}</td>
                    <td className="py-3 px-3 text-right font-bold text-[#0F172A]">{inr(totalDbl)}</td>
                    <td className="py-3 px-3 text-right font-bold text-[#0F172A]">{inr(totalTrp)}</td>
                    {showQuad && <td className="py-3 px-3 text-right font-bold text-[#0F172A]">{inr(totalQuad)}</td>}
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* DYNAMIC MODE - VERTICAL CARD LAYOUT         */}
      {/* ============================================ */}
      {isDynamicGlobal && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={copyDayOneToAll} disabled={overnightRouting.length < 2}>Copy Day 1 to all</Button>
          </div>
          
          {rows.map((r) => {
            const mix = dayMixFor(r.day);
            const covered = dayMixCoversPax(mix);
            const isMissingHotel = r.noCategoryMatch && r.hotelPool.length === 0;

            // Calculate night total exactly
            let nightTotal = 0;
            let hasRate = r.hasRate;
            if (r.hasRate) {
              nightTotal += mix.single * r.sglTotal;
              nightTotal += mix.double * r.dblTotal;
              nightTotal += mix.triple * r.trpTotal;
              nightTotal += mix.quad * r.quadTotal;
            }

            return (
              <Card key={r.day} className="p-4 shadow-sm border space-y-3">
                <div className="flex flex-wrap lg:flex-nowrap items-start lg:items-center gap-3">
                  <div className="text-sm font-semibold min-w-[180px]">
                    Day {r.day} · {r.city}
                    <span className="text-xs text-muted-foreground ml-2 font-normal">{fmtDateShort(r.date)}</span>
                  </div>
                  
                  <div className="flex-1 flex flex-wrap gap-2 min-w-[240px]">
                    <div className="flex-1 min-w-[120px]">
                      <Select value={r.selectedHotelId} onValueChange={(v) => r.setSel({ hotel_id: v, room_id: "" })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Hotel" /></SelectTrigger>
                        <SelectContent>
                          {isMissingHotel ? (
                            <div className="p-2 text-xs text-amber-600 flex items-center gap-2 cursor-pointer" onClick={() => onQuickAdd(r.cityId, r.city)}>
                              <Plus className="h-3 w-3" /> Add Hotel
                            </div>
                          ) : (
                            r.hotelPool.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)
                          )}
                        </SelectContent>
                      </Select>
                      {r.noQuadHotel && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-700">
                          <AlertCircle className="h-3 w-3" /> No contracted Quad rate; use Single/Double/Triple.
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-[100px]">
                      <Select value={r.selectedRoomId} onValueChange={(v) => r.setSel({ room_id: v })} disabled={!r.sel?.hotel_id}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Room" /></SelectTrigger>
                        <SelectContent>
                          {r.rooms.map((rc) => <SelectItem key={rc.id} value={rc.id}>{rc.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-[80px]">
                      <Select value={r.selectedMeal} onValueChange={(v) => r.setSel({ meal_plan: v as MealPlan })} disabled={!r.sel?.room_id}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(r.meals.length > 0 ? r.meals : MEAL_PLANS).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className={cn("text-xs font-medium whitespace-nowrap", covered === paxForMix ? "text-emerald-700" : "text-amber-700")}>
                    {covered} / {paxForMix} pax covered
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => applyDayPreset(r.day, "single")}>All Single</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => applyDayPreset(r.day, "double")}>All Double</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => applyDayPreset(r.day, "triple")}>All Triple</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => applyDayPreset(r.day, "quad")}>All Quad</Button>
                </div>

                {/* Room Mix Inputs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                  {(["single", "double", "triple", "quad"] as (keyof DayRoomMix)[]).map((k) => {
                    // Hide Quad input if toggle is off
                    if (k === "quad" && !showQuad) return null;
                    
                    const currentVal = mix[k];
                    const capacity = { single: 1, double: 2, triple: 3, quad: 4 }[k];
                    const otherCovered = covered - currentVal * capacity;
                    const maxAllowed = Math.max(0, Math.floor((paxForMix - otherCovered) / capacity));
                    const unavailable = k === "quad" && (!r.hasRate || r.quadNet <= 0);
                    let rateHint = "";
                    if (r.hasRate) {
                      if (k === "single") rateHint = inr(r.sglTotal);
                      else if (k === "double") rateHint = inr(r.dblTotal);
                      else if (k === "triple") rateHint = inr(r.trpTotal);
                      else if (k === "quad") rateHint = inr(r.quadTotal);
                    }
                    
                    return (
                      <div key={k} className="space-y-0.5">
                        <Label className="text-[10px] uppercase text-muted-foreground">{k} rooms</Label>
                        <Input
                          type="number" min={0} max={maxAllowed} className="h-8 text-xs"
                          value={currentVal}
                          disabled={unavailable}
                          onChange={(e) => setDayMix(r.day, { [k]: Math.min(maxAllowed, Math.max(0, parseInt(e.target.value) || 0)) } as Partial<DayRoomMix>)}
                        />
                        {hasRate && currentVal > 0 && (
                          <div className="text-[10px] font-medium text-primary text-right mt-0.5">{rateHint}/night</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* === UPDATED: Detailed Night Breakdown Table === */}
                <div className="pt-3 border-t border-dashed border-muted-foreground/20">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Night Breakdown</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground uppercase text-[10px]">
                        <th className="text-left py-1">Room Type</th>
                        <th className="text-center py-1">Count</th>
                        <th className="text-right py-1">Net Rate</th>
                        <th className="text-right py-1">GST</th>
                        <th className="text-right py-1">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hasRate && (() => {
                        const rows = [];
                        if (mix.single > 0 && r.sglTotal > 0) {
                          rows.push({ type: 'Single', count: mix.single, net: r.sglNet, gst: r.sglGst, total: r.sglTotal });
                        }
                        if (mix.double > 0 && r.dblTotal > 0) {
                          rows.push({ type: 'Double', count: mix.double, net: r.dblNet, gst: r.dblGst, total: r.dblTotal });
                        }
                        if (mix.triple > 0 && r.trpTotal > 0) {
                          rows.push({ type: 'Triple', count: mix.triple, net: r.trpNet, gst: r.trpGst, total: r.trpTotal });
                        }
                        if (mix.quad > 0 && r.quadTotal > 0 && showQuad) {
                          rows.push({ type: 'Quad', count: mix.quad, net: r.quadNet, gst: r.quadGst, total: r.quadTotal });
                        }
                        return rows.map((row, idx) => (
                          <tr key={idx} className="border-t border-muted-foreground/10">
                            <td className="py-1">{row.type}</td>
                            <td className="text-center py-1">{row.count}</td>
                            <td className="text-right py-1 tabular-nums">{inr(row.net * row.count)}</td>
                            <td className="text-right py-1 tabular-nums">{inr(row.gst * row.count)}</td>
                            <td className="text-right py-1 tabular-nums font-medium">{inr(row.total * row.count)}</td>
                          </tr>
                        ));
                      })()}
                      {hasRate && (
                        <tr className="border-t border-muted-foreground/20 font-semibold">
                          <td colSpan={4} className="text-right py-1">Night Total</td>
                          <td className="text-right py-1 text-primary">{inr(nightTotal)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {hasRate && <div className="mt-1 text-right text-[10px] text-muted-foreground">GST is applied per room tariff slab before the night total.</div>}
                  {!hasRate && <div className="text-xs text-muted-foreground">Rate not found</div>}
                </div>
              </Card>
            );
          })}
          
          {/* Dynamic grand total only — occupancy columns are not additive summaries. */}
          {rows.some((r) => r.hasRate) && (
            <div className="mt-0 flex items-center justify-end gap-5 rounded-b-lg border-t-2 border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3">
              <span className="text-sm font-semibold text-[#0F172A]">Accommodation total with room GST</span>
              <span className="text-lg font-bold text-primary">{inr(globalTotalPrice)}</span>
            </div>
          )}
        </div>
      )}

      {/* Edit Rates Dialog - Standard Mode Only */}
      <Dialog open={!!editRow} onOpenChange={(v) => { if (!v) setEditingDay(null); }}>
        <DialogContent className="sm:max-w-md">
          {editRow && (
            <>
              <DialogHeader>
                <DialogTitle>Edit rates — Day {editRow.day} · {editRow.city}</DialogTitle>
                <DialogDescription>Applies to this quotation only. The hotel's master rate stays unchanged.</DialogDescription>
              </DialogHeader>
              <DayRateFields
                showQuad={showQuad || editRow.noQuadHotel}
                base={{ sgl: editRow.sglNet, dbl: editRow.dblNet, trp: editRow.trpNet, quad: editRow.quadNet }}
                override={overrides[editRow.day] ?? {}}
                onChange={(field, value) => setOverride(editRow.day, field, value)}
                onReasonChange={(reason) => setOverrideReason(editRow.day, reason)}
              />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDayOverride(editRow.day, undefined)}><RotateCcw className="h-3.5 w-3.5" /> Reset to master</Button>
                <Button
                  disabled={
                    ["sgl", "dbl", "trp", "quad"].some(
                      (key) => (overrides[editRow.day]?.[key as "sgl" | "dbl" | "trp" | "quad"] ?? 0) > 0,
                    ) && !overrides[editRow.day]?.reason?.trim()
                  }
                  onClick={() => setEditingDay(null)}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------
// Day Rate Editor Fields (SGL / DBL / TRP / Quad)
// ------------------------------------------------------------
type RateField = "sgl" | "dbl" | "trp" | "quad";
const RATE_FIELDS: { key: RateField; label: string }[] = [
  { key: "sgl", label: "Single (SGL)" },
  { key: "dbl", label: "Double (DBL)" },
  { key: "trp", label: "Triple (TRP)" },
  { key: "quad", label: "Quad" },
];

function DayRateFields({
  showQuad,
  base,
  override,
  onChange,
  onReasonChange,
}: {
  showQuad: boolean;
  base: Record<"sgl" | "dbl" | "trp" | "quad", number>;
  override: DayRateOverride;
  onChange: (field: RateField, value: number | undefined) => void;
  onReasonChange: (reason: string) => void;
}) {
  const fields = showQuad ? RATE_FIELDS : RATE_FIELDS.filter((f) => f.key !== "quad");
  return (
    <div className="space-y-3">
      {fields.map((f) => {
        const contract = Math.round(base[f.key] || 0);
        const value = override[f.key];
        const edited = (value ?? 0) > 0;
        return (
          <div key={f.key} className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">{f.label} — net rate (excl. GST)</Label>
              <Input
                type="number" className="h-9"
                value={value ?? ""}
                placeholder={String(contract)}
                onChange={(e) => onChange(f.key, parseFloat(e.target.value) || undefined)}
              />
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Contract rate: {inr(contract)}
                {edited && <span className="text-amber-700 font-medium ml-2">Edited</span>}
              </div>
            </div>
            {edited && (
              <Button size="sm" variant="ghost" className="h-9" onClick={() => onChange(f.key, undefined)}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      })}
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
        <Label className="text-xs">Reason for manual rate *</Label>
        <Input
          className="mt-1 h-9"
          value={override.reason || ""}
          placeholder="e.g. contracted festival supplement confirmed by hotel"
          onChange={(event) => onReasonChange(event.target.value)}
        />
        <p className="mt-1 text-[11px] text-amber-800">
          Manual rates are audit-marked with user and time. A reason is mandatory before generation.
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Per-option Inclusions & Exclusions editor
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
                <button onClick={() => onChange({ inclusions: inclusions.filter((_, j) => j !== i) })} className="text-destructive">×</button>
              </li>
            ))}
            {inclusions.length === 0 && <li className="text-xs text-muted-foreground">No inclusions yet.</li>}
          </ul>
          <div className="flex gap-2">
            <Input value={newInc} onChange={(e) => setNewInc(e.target.value)} placeholder="Add inclusion" />
            <Button size="sm" onClick={() => { const v = newInc.trim(); if (v) { onChange({ inclusions: [...inclusions, v] }); setNewInc(""); } }}>Add</Button>
          </div>
        </Card>
        <Card className="p-3">
          <div className="section-label mb-2">Exclusions · Option {option.key}</div>
          <ul className="space-y-1 mb-2">
            {exclusions.map((x, i) => (
              <li key={i} className="text-sm flex justify-between gap-2">
                <span>✗ {x}</span>
                <button onClick={() => onChange({ exclusions: exclusions.filter((_, j) => j !== i) })} className="text-destructive">×</button>
              </li>
            ))}
            {exclusions.length === 0 && <li className="text-xs text-muted-foreground">No exclusions yet.</li>}
          </ul>
          <div className="flex gap-2">
            <Input value={newExc} onChange={(e) => setNewExc(e.target.value)} placeholder="Add exclusion" />
            <Button size="sm" onClick={() => { const v = newExc.trim(); if (v) { onChange({ exclusions: [...exclusions, v] }); setNewExc(""); } }}>Add</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Preview Components (Required by StepCosting)
// ------------------------------------------------------------
export function OptionDynamicPreview({ draft, option }: { draft: QuoteDraft; option: HotelOption }) {
  const d = useDB();
  const res = useMemo(() => {
    const all = computeDynamicOption(draft, option, d);
    const dyn = new Set(draft.dynamic_days ?? []);
    const days = all.days.filter((x) => dyn.has(x.day));
    return { days, room_net: days.reduce((s, x) => s + x.net, 0), room_gst: days.reduce((s, x) => s + x.gst, 0) };
  }, [draft, option, d]);
  if (!res.days.length) return null;
  return (
    <Card className="p-0 overflow-hidden border-primary/20" style={{ backgroundColor: "#FBF7EE" }}>
      <div className="px-4 py-2.5 text-sm font-semibold text-primary">OPTION {option.key} · Dynamic Room Mix Cost Preview</div>
      <div className="px-4 pb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr><th className="text-left py-1.5 font-medium">Day</th><th className="text-left py-1.5 font-medium">City</th><th className="text-left py-1.5 font-medium">Room Mix</th><th className="text-right py-1.5 font-medium">Net</th><th className="text-right py-1.5 font-medium">GST</th><th className="text-right py-1.5 font-medium">Total</th></tr>
          </thead>
          <tbody>
            {res.days.map((row) => {
              const city = d.cities.find((c) => c.id === row.city_id)?.name || "—";
              const parts = [row.mix.single ? `${row.mix.single} Single` : "", row.mix.double ? `${row.mix.double} Double` : "", row.mix.triple ? `${row.mix.triple} Triple` : "", row.mix.quad ? `${row.mix.quad} Quad` : ""].filter(Boolean).join(" + ") || "—";
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

export function OptionPerPersonPreview({ draft, option }: { draft: QuoteDraft; option: HotelOption }) {
  const d = useDB();
  const rows = useMemo(() => computePersonTotals(draft, option, d), [draft, option, d]);
  const nights = draft.routing.filter((r) => r.overnight && r.city_id).length;
  if (!rows.length) return null;
  const nameById = new Map(rows.map((r) => [r.person_id, r.label]));
  return (
    <Card className="p-0 overflow-hidden border-primary/20" style={{ backgroundColor: "#FBF7EE" }}>
      <div className="px-4 py-2.5 text-sm font-semibold text-primary">OPTION {option.key} · Per-Person Cost Preview ({nights} night{nights === 1 ? "" : "s"})</div>
      <div className="px-4 pb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr><th className="text-left py-1.5 font-medium">Person</th><th className="text-left py-1.5 font-medium">Room</th><th className="text-right py-1.5 font-medium">Room Net</th><th className="text-right py-1.5 font-medium">Room GST</th><th className="text-right py-1.5 font-medium">Rooms Total</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.person_id} className="border-t">
                <td className="py-1.5">{r.label}</td>
                <td className="py-1.5 text-muted-foreground">
                  {personRoomTypeLabel(r.room_type, r.sharing_with)}
                  {r.sharing_with.length > 0 && <span className="ml-1 text-xs">w/ {r.sharing_with.map((id) => nameById.get(id) || `#${id}`).join(", ")}</span>}
                </td>
                <td className="text-right tabular-nums">{inr(r.room_net)}</td>
                <td className="text-right tabular-nums">{inr(r.room_gst)}</td>
                <td className="text-right tabular-nums font-semibold text-primary">{inr(r.room_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
