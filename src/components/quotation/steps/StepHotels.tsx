// src/components/quotation/steps/StepHotels.tsx (Step15)
// Standard & Dynamic Layouts Combined.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlertCircle, Check, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  canUseDynamicAccommodation,
  hotelsMarkup,
  hotelsGst,
  totalPax,
  dynamicAccommodationBreakdown,
  effectiveAccommodationPax,
  isSplitAccommodation,
  splitAccommodationAllocation,
  paxRangeActive,
} from "@/lib/wizard/calc";
import type {
  QuoteDraft,
  HotelOption,
  OptionKey,
  DayRateOverride,
  DayRoomMix,
  DynamicOccupancy,
  DynamicRoomAllocation,
} from "@/lib/wizard/types";
import {
  hasHotelExemptionConflict,
  accommodationNightsForOption,
  isAccommodationNightForOption,
  hotelSelectionForDay,
  isDynamicAccommodationMode,
} from "@/lib/wizard/types";
import { findRatePlan, availableMealPlans } from "@/lib/wizard/rate-lookup";
import {
  diagnoseHotelAvailability,
  hotelsForAccommodation,
  normalizeHotelLookupValue,
  resolveAccommodationCity,
} from "@/lib/wizard/hotel-availability";
import { getMasterSyncState, subscribeMasterSync } from "@/lib/masters-remote";
import { defaultsForCategory } from "@/lib/wizard/category-defaults";
import { QuickAddHotelDialog } from "@/components/QuickAddHotelDialog";
import { useAuth } from "@/lib/auth-mock";
import { NumericStepper, WIZARD_HOTEL_CATEGORIES } from "../shared";
import type { StepProps } from "../shared";

const QUOTATION_MEAL_PLANS = MEAL_PLANS;

/** Category changes must not retain dependent hotel or rate state. */
// eslint-disable-next-line react-refresh/only-export-components
export const categoryChangePatch = (
  category: string,
  inclusions: string[],
): Partial<HotelOption> => ({
  category,
  label: category,
  inclusions,
  selections: [],
  rate_overrides: {},
  dynamic_allocations: {},
});

/** Explicit user confirmation is required before repairing a contradictory saved stay. */
// eslint-disable-next-line react-refresh/only-export-components
export const hotelBookingConfirmationPatch = () => ({
  no_hotel: false,
  accommodation_status: undefined,
});

/** The saved explicit allocation mode is the single accommodation-mode source. */
// eslint-disable-next-line react-refresh/only-export-components
export const isDynamicHotelMode = (draft: QuoteDraft) => isDynamicAccommodationMode(draft);

/** Display projection only; pricing continues to use each row's overnight flag. */
// eslint-disable-next-line react-refresh/only-export-components
export function accommodationScheduleRows(
  routing: QuoteDraft["routing"],
  option?: HotelOption,
) {
  return routing.map((day, index) => ({
    day,
    is_day_zero: day.is_day_zero || day.day === 0,
    is_departure: index === routing.length - 1 && !(day.is_day_zero || day.day === 0),
    is_booked_night: option
      ? isAccommodationNightForOption(option, day)
      : Boolean(day.overnight),
  }));
}

/** Day 0's From City is the arrival/stay city when no explicit city ID exists. */
// eslint-disable-next-line react-refresh/only-export-components
export function accommodationCityForDay(
  day: QuoteDraft["routing"][number],
  cities: ReturnType<typeof useDB>["cities"],
) {
  if (!(day.is_day_zero || day.day === 0)) return day;
  const from = day.from_city?.trim();
  if (from) {
    const fromCity = cities.find(
      (item) => item.id === from || item.name.trim().toLowerCase() === from.toLowerCase(),
    );
    if (fromCity) return { ...day, city_id: fromCity.id };
    return { ...day, city_id: "" };
  }
  return day;
}

export function Step15({ draft, set }: StepProps) {
  const d = useDB();
  const [activeOpt, setActiveOpt] = useState<OptionKey>(draft.hotel_options[0]?.key || "A");
  const [quickAdd, setQuickAdd] = useState<{ cityId: string; cityName: string } | null>(null);
  const paxForMix = Math.max(1, effectivePaxForPricing(draft));
  const exactTravellingPax = totalPax(draft);
  const canUseDynamic = canUseDynamicAccommodation(draft);

  // Global Mode Toggle (Standard vs Dynamic)
  // The persisted explicit mode is authoritative. Do not visually coerce a
  // legacy Dynamic draft into Standard merely because its current Pax setup
  // cannot create a new Dynamic allocation (for example, a Pax range).
  const isDynamicGlobal = isDynamicHotelMode(draft);
  const isSplitGroup = isDynamicGlobal && isSplitAccommodation(draft);
  const splitAllocation = splitAccommodationAllocation(draft);
  const setGlobalMode = (isDynamic: boolean) => {
    const bookedNights = draft.routing.filter((day) =>
      draft.hotel_options.some((option) => isAccommodationNightForOption(option, day)),
    );
    if (isDynamic) {
      if (!canUseDynamic) return;
      const days = bookedNights.map((r) => r.day);
      const mixes = { ...(draft.day_room_mix ?? {}) };
      days.forEach((dayNo) => {
        if (!mixes[dayNo]) mixes[dayNo] = defaultDayMix(paxForMix);
      });
      set({ allocation_mode: "dynamic", dynamic_days: days, day_room_mix: mixes });
    } else {
      // Switch to Standard: set a double-occupancy mix for all overnight days
      // so that the Per-Person Preview uses double rooms (no Quad).
      const doubles = Math.floor(paxForMix / 2);
      const single = paxForMix % 2;
      const doubleMix: DayRoomMix = { single, double: doubles, triple: 0, quad: 0 };
      const mixes: Record<number, DayRoomMix> = {};
      bookedNights.forEach((r) => {
        mixes[r.day] = { ...doubleMix };
      });
      set({ allocation_mode: "standard", dynamic_days: [], day_room_mix: mixes });
    }
  };

  const addOption = () => {
    const existing = draft.hotel_options.map((o) => o.key);
    const next = (["A", "B", "C", "D"] as OptionKey[]).find((k) => !existing.includes(k));
    if (!next) return;
    set({
      hotel_options: [
        ...draft.hotel_options,
        {
          key: next,
          label: "",
          category: "",
          selections: [],
          inclusions: [],
          exclusions: [],
          allocated_pax: isSplitGroup ? 0 : undefined,
        },
      ],
    });
    setActiveOpt(next);
  };

  const updateOption = (key: OptionKey, patch: Partial<HotelOption>) => {
    set({
      hotel_options: draft.hotel_options.map((o) => (o.key === key ? { ...o, ...patch } : o)),
    });
  };

  const activeOption =
    draft.hotel_options.find((o) => o.key === activeOpt) || draft.hotel_options[0];
  const activeCategory = activeOption?.category || "";
  // The selection table is the single day schedule. Regular overnight rows
  // retain their existing costing behaviour; Day 0 and the departure row are
  // displayed so their explicit exemption/hotel choices stay option-specific.
  const hotelTableRouting = activeOption
    ? draft.routing.map((day) => accommodationCityForDay(day, d.cities))
    : [];

  const applyCategory = (v: string) => {
    if (!activeOption) return;
    if (normalizeHotelLookupValue(activeOption.category) === normalizeHotelLookupValue(v)) return;
    const def = defaultsForCategory(v);
    // Category determines the eligible hotel directory.  Retaining a prior
    // selection, override, or dynamic allocation would price the new category
    // with the old hotel's data, so clear only this option atomically.
    updateOption(activeOption.key, categoryChangePatch(v, def.inclusions));
  };

  const copyFromOption = (sourceKey: OptionKey) => {
    if (!activeOption || sourceKey === activeOption.key) return;
    const source = draft.hotel_options.find((option) => option.key === sourceKey);
    if (!source) return;
    updateOption(activeOption.key, {
      category: source.category,
      label: source.label,
      selections: source.selections.map((selection) => ({ ...selection })),
      rate_overrides: source.rate_overrides
        ? Object.fromEntries(
            Object.entries(source.rate_overrides).map(([day, value]) => [day, { ...value }]),
          )
        : undefined,
      dynamic_allocations: source.dynamic_allocations
        ? Object.fromEntries(
            Object.entries(source.dynamic_allocations).map(([day, allocations]) => [
              day,
              allocations.map((allocation) => ({ ...allocation, id: crypto.randomUUID() })),
            ]),
          )
        : undefined,
      inclusions: [...(source.inclusions ?? [])],
    });
  };

  return (
    <div className="space-y-4">
      <Card className="hidden" aria-hidden="true">
        <div className="border-b bg-muted/30 px-3 py-2">
          <div className="text-sm font-semibold">Complete Itinerary Day Schedule</div>
          <p className="text-xs text-muted-foreground">
            Day 0 starts as No Hotel Required. Select Hotel to add a separate pre-tour night for
            this option; regular tour dates and other options stay unchanged.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-155 text-xs">
            <thead className="bg-muted/20 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Day</th>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-left">City</th>
                <th className="p-2 text-left">Stay Plan</th>
              </tr>
            </thead>
            <tbody>
              {accommodationScheduleRows(draft.routing, activeOption).map(
                ({ day, is_departure: isDeparture, is_booked_night: bookedNight }, index) => {
                  const isDayZero = day.is_day_zero || day.day === 0;
                  const stayDay = accommodationCityForDay(day, d.cities);
                  const resolvedCity = d.cities.find((item) => item.id === stayDay.city_id)?.name;
                  const city = isDayZero
                    ? resolvedCity || ""
                    : resolvedCity || day.to_city || (isDeparture ? draft.tour_end_city : "—");
                  const selection = hotelSelectionForDay(activeOption, stayDay, true);
                  const selectedStatus = selection?.accommodation_status;
                  const statusValue =
                    selection?.pre_tour_night && !selection.no_hotel
                      ? "__select_hotel__"
                      : selectedStatus === "own_arrangement"
                        ? "__own_arrangement__"
                        : "__no_hotel__";
                  return (
                    <tr key={`${day.day}-${index}`} className="border-t">
                      <td className="p-2 font-medium">
                        {isDeparture ? "Last Departure Day" : `Day ${day.day}`}
                      </td>
                      <td className="p-2">{day.date ? fmtDateShort(day.date) : "—"}</td>
                      <td className="p-2">
                        {city ? (
                          city
                        ) : isDayZero ? (
                          <Select
                            value=""
                            onValueChange={(cityId) => {
                              const cityName = d.cities.find((item) => item.id === cityId)?.name || "";
                              set({
                                routing: draft.routing.map((route) =>
                                  route.day === 0 || route.is_day_zero
                                    ? { ...route, city_id: cityId, from_city: cityName }
                                    : route,
                                ),
                              });
                            }}
                          >
                            <SelectTrigger className="h-8 w-44 text-xs">
                              <SelectValue placeholder="Choose arrival city" />
                            </SelectTrigger>
                            <SelectContent>
                              {d.cities.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-2">
                        {bookedNight && !isDayZero ? (
                          <span className="text-muted-foreground">
                            Overnight stay · configure hotel and room below
                          </span>
                        ) : (
                          <Select
                            value={statusValue}
                            onValueChange={(value) => {
                              const cityId = stayDay.city_id || day.to_city_id || day.to_city_ids?.[0] || "";
                              if (value === "__select_hotel__" && !cityId) return;
                              const selection = {
                                city_id: cityId,
                                routing_day: day.day,
                                hotel_id: "",
                                room_id: "",
                                meal_plan: "CP" as MealPlan,
                                no_hotel: value !== "__select_hotel__",
                                pre_tour_night: value === "__select_hotel__",
                                accommodation_status:
                                  value === "__own_arrangement__"
                                    ? ("own_arrangement" as const)
                                    : value === "__no_hotel__"
                                      ? ("no_hotel_required" as const)
                                      : undefined,
                              };
                              updateOption(activeOption.key, {
                                selections: [
                                  ...activeOption.selections.filter(
                                    (item) => item.routing_day !== day.day,
                                  ),
                                  selection,
                                ],
                              });
                            }}
                          >
                            <SelectTrigger className="h-8 w-52 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {isDayZero && (
                                <SelectItem value="__select_hotel__" disabled={!stayDay.city_id}>
                                  Select Hotel / Hotel Required
                                </SelectItem>
                              )}
                              <SelectItem value="__no_hotel__">No Hotel Required</SelectItem>
                              <SelectItem value="__own_arrangement__">Own Arrangement</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex gap-2 border-b">
        {draft.hotel_options.map((o) => (
          <button
            key={o.key}
            onClick={() => setActiveOpt(o.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
              activeOpt === o.key
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground",
            )}
          >
            Option {o.key} · {o.category || "Select Category"}
            {isSplitGroup && ` · ${o.allocated_pax || 0} Pax`}
          </button>
        ))}
        {draft.hotel_options.length < 4 && (
          <button onClick={addOption} className="px-3 py-2 text-sm text-primary">
            + Add Option
          </button>
        )}
      </div>

      {activeOption && (
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <Label className="text-xs">Hotel Category for this Option</Label>
              <Select value={activeCategory} onValueChange={applyCategory}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {WIZARD_HOTEL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {draft.hotel_options.length > 1 && (
              <div className="w-48">
                <Label className="text-xs">Copy from Option</Label>
                <Select onValueChange={(value) => copyFromOption(value as OptionKey)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Choose option" />
                  </SelectTrigger>
                  <SelectContent>
                    {draft.hotel_options
                      .filter((option) => option.key !== activeOption.key)
                      .map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          Option {option.key}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {draft.hotel_options.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const next = draft.hotel_options.filter((o) => o.key !== activeOpt);
                  set({ hotel_options: next });
                  setActiveOpt(next[0].key);
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" /> Remove option
              </Button>
            )}
          </div>

          {hotelTableRouting.length === 0 && (
            <p className="text-sm text-muted-foreground">Complete routing in Step 5 first.</p>
          )}

          {!activeCategory && hotelTableRouting.length > 0 && (
            <p className="text-sm text-amber-600">
              Select a hotel category above to load hotels for each city.
            </p>
          )}

          {activeCategory && hotelTableRouting.length > 0 && (
            <AccommodationSelectionTable
              draft={draft}
              set={set}
              option={activeOption}
              activeCategory={activeCategory}
              overnightRouting={hotelTableRouting}
              onUpdate={(patch) => updateOption(activeOption.key, patch)}
              onQuickAdd={(cityId, cityName) => setQuickAdd({ cityId, cityName })}
              isDynamicGlobal={isDynamicGlobal}
              canUseDynamic={canUseDynamic}
              exactTravellingPax={exactTravellingPax}
              setGlobalMode={setGlobalMode}
              paxForMix={effectiveAccommodationPax(draft, activeOption)}
              isSplitGroup={isSplitGroup}
              splitAllocation={splitAllocation}
            />
          )}

          {activeCategory &&
            hotelTableRouting.length > 0 &&
            activeOption.selections.some((s) => s.room_id) && (
              <>
                {isDynamicGlobal && optionUsesCustomAllocation(activeOption) && (
                  <OptionPerPersonPreview draft={draft} option={activeOption} />
                )}
              </>
            )}

          {activeCategory && (
            <OptionInclusionsEditor
              draft={draft}
              option={activeOption}
              onChange={(patch) => updateOption(activeOption.key, patch)}
            />
          )}
        </div>
      )}

      {isSplitGroup && (
        <AccommodationSplitSummary
          draft={draft}
          quotationPax={exactTravellingPax}
          allocation={splitAllocation}
        />
      )}

      {quickAdd && (
        <QuickAddHotelDialog
          open={!!quickAdd}
          onOpenChange={(v) => {
            if (!v) setQuickAdd(null);
          }}
          cityId={quickAdd.cityId}
          cityName={quickAdd.cityName}
          category={activeCategory}
          onCreated={(hotelId) => {
            const others = activeOption.selections.filter((s) => s.city_id !== quickAdd.cityId);
            const h = d.hotels.find((x) => x.id === hotelId);
            updateOption(activeOption.key, {
              selections: [
                ...others,
                {
                  city_id: quickAdd.cityId,
                  hotel_id: hotelId,
                  room_id: "",
                  meal_plan: "CP" as MealPlan,
                  is_fallback: !!h && h.hotel_category !== activeCategory,
                },
              ],
            });
            setQuickAdd(null);
          }}
        />
      )}
    </div>
  );
}

function AccommodationSplitSummary({
  draft,
  quotationPax,
  allocation,
}: {
  draft: QuoteDraft;
  quotationPax: number;
  allocation: ReturnType<typeof splitAccommodationAllocation>;
}) {
  const db = useDB();
  const options = draft.hotel_options
    .filter((option) => (option.allocated_pax ?? 0) > 0)
    .map((option) => {
      const base = dynamicAccommodationBreakdown(draft, option, db).total;
      const markup = base * hotelsMarkup(draft);
      const gst = (base + markup) * hotelsGst(draft);
      const final = base + markup + gst;
      return { option, final };
    });
  const combined = options.reduce((sum, item) => sum + item.final, 0);
  return (
    <Card className="overflow-hidden border-primary/20">
      <div className="border-b bg-primary/5 px-4 py-3">
        <h3 className="text-sm font-semibold">Accommodation Split Summary</h3>
        <p className="text-xs text-muted-foreground">Quotation Travellers: {quotationPax}</p>
      </div>
      <div className="divide-y">
        {options.map(({ option, final }) => (
          <div
            key={option.key}
            className="grid gap-2 p-3 text-xs sm:grid-cols-[1fr_100px_150px_150px]"
          >
            <span className="font-medium">
              Option {option.key} · {option.category || option.label || "Category pending"}
            </span>
            <span>{option.allocated_pax} Pax</span>
            <span className="text-right">Final Total: {inr(final)}</span>
            <span className="text-right">
              PP within group: {inr(final / Math.max(1, option.allocated_pax ?? 0))}
            </span>
          </div>
        ))}
      </div>
      <div className="grid gap-2 border-t bg-muted/20 p-4 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-muted-foreground">Allocated</div>
          <div className="font-semibold">
            {allocation.allocated} / {allocation.total} Pax
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Combined Accommodation Total</div>
          <div className="font-semibold">{inr(combined)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">
            Combined Accommodation Cost Per Quotation Pax
          </div>
          <div className="font-semibold text-primary">
            {inr(combined / Math.max(1, quotationPax))} PP
          </div>
        </div>
      </div>
    </Card>
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
  canUseDynamic,
  exactTravellingPax,
  setGlobalMode,
  paxForMix,
  isSplitGroup,
  splitAllocation,
}: {
  draft: QuoteDraft;
  set: (p: Partial<QuoteDraft>) => void;
  option: HotelOption;
  activeCategory: string;
  overnightRouting: typeof draft.routing;
  onUpdate: (patch: Partial<HotelOption>) => void;
  onQuickAdd: (cityId: string, cityName: string) => void;
  isDynamicGlobal: boolean;
  canUseDynamic: boolean;
  exactTravellingPax: number;
  setGlobalMode: (isDynamic: boolean) => void;
  paxForMix: number;
  isSplitGroup: boolean;
  splitAllocation: ReturnType<typeof splitAccommodationAllocation>;
}) {
  const d = useDB();
  const masterSync = useSyncExternalStore(
    subscribeMasterSync,
    getMasterSyncState,
    getMasterSyncState,
  );
  const user = useAuth();
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [showQuadPref, setShowQuad] = useState(false);
  const showLegacyDynamic: boolean = false;
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
    set({
      day_room_mix: { ...(draft.day_room_mix ?? {}), [dayNo]: { ...dayMixFor(dayNo), ...patch } },
    });
  };

  // Toggles for "All Single/Double/Triple/Quad" in Dynamic mode
  const applyDayPreset = (dayNo: number, kind: "single" | "double" | "triple" | "quad") => {
    if (kind === "single") setDayMix(dayNo, { single: paxForMix, double: 0, triple: 0, quad: 0 });
    if (kind === "double")
      setDayMix(dayNo, {
        single: paxForMix % 2,
        double: Math.floor(paxForMix / 2),
        triple: 0,
        quad: 0,
      });
    if (kind === "triple") {
      const triple = Math.floor(paxForMix / 3);
      const rem = paxForMix % 3;
      setDayMix(dayNo, { single: rem === 1 ? 1 : 0, double: rem === 2 ? 1 : 0, triple, quad: 0 });
    }
    if (kind === "quad") {
      const quad = Math.floor(paxForMix / 4);
      const rem = paxForMix % 4;
      setDayMix(dayNo, {
        single: rem === 1 ? 1 : 0,
        double: rem === 2 ? 1 : 0,
        triple: rem === 3 ? 1 : 0,
        quad,
      });
    }
  };
  const copyDayOneToAll = () => {
    const first = overnightRouting[0];
    if (!first) return;
    const base = dayMixFor(first.day);
    const next: Record<number, DayRoomMix> = { ...(draft.day_room_mix ?? {}) };
    overnightRouting.forEach((r) => {
      next[r.day] = { ...base };
    });
    set({ day_room_mix: next });
  };

  // Hotel filter logic
  const hotelHasQuad = (hotelId: string, dateISO: string) => {
    const roomIds = d.room_categories
      .filter((room) => room.hotel_id === hotelId)
      .map((room) => room.id);
    return roomIds.some((roomId) =>
      MEAL_PLANS.some((m) => {
        const plan = findRatePlan(d.rate_plans, roomId, m, dateISO, activeCategory);
        return !!plan && (plan.quad_rate ?? 0) > 0;
      }),
    );
  };

  // Build the rows
  const rows = overnightRouting.map((day) => {
    const hasStayDate = Boolean(day.date);
    const resolvedCity = resolveAccommodationCity(day, d.cities, d.destination_cities);
    const cityName = resolvedCity?.name || day.to_city?.trim() || "";
    const cityId = resolvedCity?.id || day.city_id;
    const selectionDay = cityId === day.city_id ? day : { ...day, city_id: cityId };
    const sel = isDynamicGlobal || day.is_day_zero || day.day === 0
      ? hotelSelectionForDay(option, day, true)
      : hotelSelectionForDay(option, day) ?? hotelSelectionForDay(option, selectionDay);

    const hotelsWithCategories = d.hotels.map((hotel) => {
      const roomIds = new Set(
        d.room_categories.filter((room) => room.hotel_id === hotel.id).map((room) => room.id),
      );
      return {
        ...hotel,
        hotel_categories: Array.from(
          new Set([
            hotel.hotel_category,
            ...d.rate_plans
              .filter((plan) => roomIds.has(plan.room_category_id))
              .map((plan) => plan.hotel_category)
              .filter((value): value is NonNullable<typeof value> => Boolean(value)),
          ]),
        ),
      };
    });
    const { inCategory: cityHotels } = hotelsForAccommodation(
      hotelsWithCategories,
      cityName,
      activeCategory,
      d.cities,
      d.destination_cities,
      cityId,
    );
    const availability = diagnoseHotelAvailability(
      d.hotels,
      d.room_categories,
      d.rate_plans,
      cityName,
      activeCategory,
      day.date,
      d.cities,
      d.destination_cities,
      cityId,
    );
    const noCategoryMatch = cityHotels.length === 0;
    // Never substitute a lower-ranked or another category: the selected
    // option category and the overnight city are both mandatory filters.
    let hotelPool = cityHotels;

    const needsQuad = showQuad || (isDynamicGlobal && (dayMixFor(day.day).quad ?? 0) > 0);
    const quadPool = hasStayDate ? hotelPool.filter((h) => hotelHasQuad(h.id, day.date)) : hotelPool;
    const noQuadHotel = needsQuad && quadPool.length === 0;
    if (needsQuad && quadPool.length > 0) hotelPool = quadPool;

    const rooms = sel ? d.room_categories.filter((r) => r.hotel_id === sel.hotel_id) : [];
    const meals = hasStayDate && sel?.room_id
      ? availableMealPlans(d.rate_plans, sel.room_id, day.date, activeCategory)
      : [];
    const selHotel = sel ? d.hotels.find((h) => h.id === sel.hotel_id) : null;
    const selectedAvailability = availability.details.find((hotel) => hotel.id === selHotel?.id);
    const baseRate =
      hasStayDate && sel && sel.room_id
        ? findRatePlan(d.rate_plans, sel.room_id, sel.meal_plan, day.date, activeCategory)
        : null;
    const dayOverride = overrides[day.day];
    const rate = selectedAvailability?.blackout ? null : applyRateOverride(baseRate, dayOverride);
    const isFallback = sel?.is_fallback || false;
    const pricingMessage = !hasStayDate
      ? "Stay date is not set. Hotel rates require review when dates are selected."
      : selectedAvailability
      ? selectedAvailability.roomCount === 0
        ? "Hotel available, but no room categories are linked."
        : selectedAvailability.blackout
          ? `Hotel available — selected date is blacked out (${fmtDateShort(day.date)}).`
          : selectedAvailability.applicableRateCount === 0
            ? `Hotel available — no applicable rate for selected date (${fmtDateShort(day.date)}).`
            : ""
      : cityHotels.length > 0 && availability.validForDate === 0
        ? `Hotels are available — no applicable rate for selected date (${fmtDateShort(day.date)}).`
        : "";

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
    let offSeasonText = "";
    let hasRate = false;

    if (rate) {
      const dbl = rate.double_rate_missing ? 0 : rate.double_rate;
      const sgl = rate.single_rate_missing ? 0 : rate.single_rate;
      const extra = rate.extra_bed_rate || 0;
      const quad = (rate.quad_rate ?? 0) > 0 ? (rate.quad_rate as number) : 0;
      const gst = gstRateFor;

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
      hasRate = true;
      offSeasonText =
        rate.season_label ||
        (rate.validity_start && rate.validity_end
          ? `Off Season (${fmtDateShort(rate.validity_start)} – ${fmtDateShort(rate.validity_end)})`
          : "—");
    }

    const setSel = (patch: Partial<typeof sel> & object) => {
      const others = option.selections.filter(
        (selection) => selection !== sel && selection.routing_day !== day.day,
      );
      const cur = sel || {
        city_id: cityId,
        routing_day: day.day,
        hotel_id: "",
        room_id: "",
        meal_plan: "CP" as MealPlan,
      };
      const merged = {
        ...cur,
        ...patch,
        city_id: cityId,
        routing_day: day.day,
        // Day 0 only becomes a priced stay after a hotel is explicitly chosen.
        ...(day.is_day_zero || day.day === 0
          ? { pre_tour_night: patch.no_hotel ? false : Boolean(patch.hotel_id || cur.hotel_id) }
          : {}),
      };
      if ("hotel_id" in patch) {
        const h = d.hotels.find((x) => x.id === merged.hotel_id);
        merged.is_fallback =
          !!h &&
          !hotelsWithCategories
            .find((candidate) => candidate.id === h.id)
            ?.hotel_categories.some(
              (category) => normalizeHotelLookupValue(category) === normalizeHotelLookupValue(activeCategory),
            );
      }
      onUpdate({ selections: [...others, merged] });
    };

    return {
      day: day.day,
      date: day.date,
      city: cityName,
      cityId,
      dayOverride,
      sel,
      hotelPool,
      rooms,
      meals,
      rate,
      selHotel,
      isFallback,
      noCategoryMatch,
      noQuadHotel,
      availability,
      masterSyncStatus: masterSync.status,
      pricingMessage,
      offSeasonText,
      hasRate,
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
      setSel,
      selectedHotelId: sel?.hotel_id || "",
      hotelChoiceValue:
        sel?.accommodation_status === "own_arrangement"
          ? "__own_arrangement__"
          : sel?.no_hotel
            ? "__no_hotel__"
            : sel?.hotel_id || ((day.is_day_zero || day.day === 0 || !day.overnight) ? "__no_hotel__" : ""),
      selectedRoomId: sel?.room_id || "",
      selectedMeal: sel?.meal_plan || "CP",
      hasHotelExemptionConflict: hasHotelExemptionConflict(sel),
    };
  });

  const ujjainDiagnostic = rows.find((row) => normalizeHotelLookupValue(row.city) === "ujjain");
  const ujjainDiagnosticSignature = ujjainDiagnostic
    ? `${activeCategory}|${JSON.stringify(ujjainDiagnostic.availability)}`
    : "";
  const lastUjjainDiagnostic = useRef("");
  useEffect(() => {
    if (
      !import.meta.env.DEV ||
      !ujjainDiagnostic ||
      lastUjjainDiagnostic.current === ujjainDiagnosticSignature
    )
      return;
    lastUjjainDiagnostic.current = ujjainDiagnosticSignature;
    const report = ujjainDiagnostic.availability;
    console.info(`[hotel-eligibility] Ujjain / ${activeCategory}`, {
      master_sync_status: ujjainDiagnostic.masterSyncStatus,
      master_hotel_count: d.hotels.length,
      matching_city_hotel_count: report.cityMatches,
      travel_date: ujjainDiagnostic.date,
      resolved_costing_destination: ujjainDiagnostic.city,
      matched_city_id: ujjainDiagnostic.cityId,
      total_hotels: report.totalHotels,
      ujjain_hotels: report.cityMatches,
      category_matches: report.categoryMatches,
      hotels_with_rooms: report.withRooms,
      hotels_with_rate_plans: report.withRatePlans,
      hotels_valid_for_travel_date: report.validForDate,
      final_dropdown_count: report.finalDropdownCount,
      exact_exclusions: report.details.map((hotel) => ({
        id: hotel.id,
        name: hotel.name,
        city_id: hotel.city_id,
        city_name: hotel.city_name,
        category: hotel.hotel_category,
        room_count: hotel.roomCount,
        rate_plan_count: hotel.rateCount,
        exclusion_reason: hotel.rejectionReason,
      })),
    });
  }, [activeCategory, d.hotels.length, ujjainDiagnostic, ujjainDiagnosticSignature]);

  // Dynamic Totals
  let globalTotalPrice = 0;
  let totalSgl = 0,
    totalDbl = 0,
    totalTrp = 0,
    totalQuad = 0;
  let totalSglNet = 0,
    totalDblNet = 0,
    totalTrpNet = 0,
    totalQuadNet = 0;
  rows.forEach((r) => {
    if (r.hasRate) {
      totalSgl += r.sglTotal;
      totalDbl += r.dblTotal;
      totalTrp += r.trpTotal;
      totalQuad += r.quadTotal;
      totalSglNet += r.sglNet;
      totalDblNet += r.dblNet;
      totalTrpNet += r.trpNet;
      totalQuadNet += r.quadNet;
    }
    if (isDynamicGlobal) {
      const currentMix = dayMixFor(r.day);
      const nightTotal =
        currentMix.single * r.sglTotal +
        currentMix.double * r.dblTotal +
        currentMix.triple * r.trpTotal +
        currentMix.quad * r.quadTotal;
      globalTotalPrice += nightTotal;
    }
  });
  const standardHasQuad = rows.some((row) => row.quadNet > 0);
  const supplierTotals = { sgl: totalSgl, dbl: totalDbl, trp: totalTrp, quad: totalQuad };
  const netTotals = { sgl: totalSglNet, dbl: totalDblNet, trp: totalTrpNet, quad: totalQuadNet };
  const commercialFor = (base: number) => {
    const markup = base * hotelsMarkup(draft);
    const gst = (base + markup) * hotelsGst(draft);
    return { markup, gst, final: base + markup + gst };
  };

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
              className={cn(
                "px-4 py-1.5 text-xs font-medium transition-colors",
                !isDynamicGlobal ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setGlobalMode(true)}
              disabled={!canUseDynamic}
              className={cn(
                "px-4 py-1.5 text-xs font-medium transition-colors",
                isDynamicGlobal ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                !canUseDynamic && "cursor-not-allowed opacity-50",
              )}
            >
              Dynamic
            </button>
          </div>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            {isDynamicGlobal ? "Control per-night room mixes." : "Pricing displayed per room type."}
          </span>
        </div>

        {isDynamicGlobal && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Accommodation Planning:
            </span>
            <div className="flex overflow-hidden rounded-md border bg-background">
              <button
                type="button"
                onClick={() => set({ accommodation_planning_mode: "whole_group" })}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium",
                  !isSplitGroup ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                Whole Group / Alternatives
              </button>
              <button
                type="button"
                disabled={!canUseDynamic}
                onClick={() => {
                  const hasAllocation = draft.hotel_options.some(
                    (item) => (item.allocated_pax ?? 0) > 0,
                  );
                  set({
                    accommodation_planning_mode: "split_group",
                    hotel_options: draft.hotel_options.map((item, index) => ({
                      ...item,
                      allocated_pax: hasAllocation
                        ? (item.allocated_pax ?? 0)
                        : index === 0
                          ? exactTravellingPax
                          : 0,
                    })),
                  });
                }}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium",
                  isSplitGroup ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                Split Group Across Options
              </button>
            </div>
            {isSplitGroup && (
              <label className="flex items-center gap-2 text-xs font-medium">
                Pax for Option {option.key}
                <NumericStepper
                  ariaLabel={`Pax for Option ${option.key}`}
                  min={0}
                  max={exactTravellingPax}
                  value={option.allocated_pax ?? 0}
                  onChange={(allocated_pax) => onUpdate({ allocated_pax })}
                  className="w-37.5"
                  inputClassName="px-1"
                />
              </label>
            )}
          </div>
        )}

        {/* Quad column is a Dynamic-mode concern only — Standard mode stays
            flat Single / Double / Triple with no room-mix logic. */}
        <div className={cn("flex items-center gap-2 ml-auto", !isDynamicGlobal && "hidden")}>
          <Checkbox
            id="showQuad"
            checked={showQuad}
            onCheckedChange={(checked) => setShowQuad(checked === true)}
          />
          <Label htmlFor="showQuad" className="text-xs cursor-pointer select-none">
            Show Quad column
          </Label>
        </div>
      </div>
      {isSplitGroup && (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-xs",
            splitAllocation.excess > 0
              ? "border-red-200 bg-red-50 text-red-800"
              : splitAllocation.remaining > 0
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800",
          )}
        >
          <div className="font-medium">
            Quotation Travellers: {exactTravellingPax} · This Hotel Option: {paxForMix} Pax
          </div>
          {splitAllocation.excess > 0
            ? `Accommodation allocation exceeds quotation travellers by ${splitAllocation.excess} pax.`
            : splitAllocation.remaining > 0
              ? `${splitAllocation.remaining} travellers remain to be allocated to another accommodation option. Allocated: ${splitAllocation.allocated} / ${splitAllocation.total}.`
              : `Accommodation split complete: ${splitAllocation.allocated} of ${splitAllocation.total} travellers allocated across hotel options.`}
        </div>
      )}
      {!canUseDynamic && paxRangeActive(draft) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Dynamic Mode requires exact travelling pax.
        </div>
      )}
      {!canUseDynamic && !paxRangeActive(draft) && draft.pax_mode === "exact" && exactTravellingPax <= 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Add exact travellers in Trip Basics to use Dynamic Mode.
        </div>
      )}

      {/* ============================================ */}
      {/* STANDARD MODE - HORIZONTAL TABLE             */}
      {/* ============================================ */}
      {!isDynamicGlobal && (
        <div className="space-y-4">
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
                    {standardHasQuad && <th className="text-right py-3 px-3">Quad</th>}
                    <th className="text-right py-3 px-3">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const isMissingHotel = r.noCategoryMatch && r.hotelPool.length === 0;
                    const mastersLoading =
                      r.masterSyncStatus === "idle" || r.masterSyncStatus === "loading";
                    const masterUnavailable = ["empty", "denied", "error"].includes(
                      r.masterSyncStatus,
                    );
                    return (
                      <tr
                        key={idx}
                        className="border-b border-[#E2E8F0] last:border-0 align-top hover:bg-muted/10"
                      >
                        <td className="py-3 px-3 font-medium text-[#0F172A]">{r.day}</td>
                        <td className="py-3 px-3 text-[#334155] whitespace-nowrap">
                          {fmtDateShort(r.date)}
                        </td>
                        <td className="py-3 px-3 text-[#334155]">{r.city}</td>
                        <td className="py-3 px-3 min-w-[180px]">
                          {isMissingHotel ? (
                            <div className="space-y-1 text-amber-600 text-xs">
                              <Select
                                value={
                                  r.sel?.accommodation_status === "own_arrangement"
                                    ? "__own_arrangement__"
                                    : r.sel?.no_hotel
                                      ? "__no_hotel__"
                                      : ""
                                }
                                onValueChange={(value) =>
                                  r.setSel({
                                    no_hotel: true,
                                    accommodation_status:
                                      value === "__own_arrangement__"
                                        ? "own_arrangement"
                                        : "no_hotel_required",
                                    hotel_id: "",
                                    room_id: "",
                                    meal_plan: "CP",
                                  })
                                }
                              >
                                <SelectTrigger
                                  className="h-8 w-full text-xs"
                                  disabled={mastersLoading || masterUnavailable}
                                >
                                  <SelectValue
                                    placeholder={mastersLoading ? "Loading hotels…" : "No Hotel"}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__no_hotel__">No Hotel Required</SelectItem>
                                  <SelectItem value="__own_arrangement__">
                                    Own Arrangement
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <div className="flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {mastersLoading ? (
                                  "Loading the latest Hotel Master…"
                                ) : masterUnavailable ? (
                                  `Hotel Master is ${r.masterSyncStatus}; matching hotels cannot be confirmed.`
                                ) : (
                                  <>
                                    No hotel found for {r.city} / {activeCategory}.{" "}
                                    <Button
                                      size="sm"
                                      variant="link"
                                      className="h-auto p-0 text-xs"
                                      onClick={() => onQuickAdd(r.cityId, r.city)}
                                    >
                                      Add
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          ) : (
                            <>
                              <Select
                                value={
                                  r.sel?.accommodation_status === "own_arrangement"
                                    ? "__own_arrangement__"
                                    : r.sel?.no_hotel
                                      ? "__no_hotel__"
                                      : r.selectedHotelId
                                }
                                onValueChange={(v) =>
                                  v === "__no_hotel__" || v === "__own_arrangement__"
                                    ? r.setSel({
                                        no_hotel: true,
                                        accommodation_status:
                                          v === "__own_arrangement__"
                                            ? "own_arrangement"
                                            : "no_hotel_required",
                                        hotel_id: "",
                                        room_id: "",
                                        meal_plan: "CP",
                                      })
                                    : r.setSel({
                                        no_hotel: false,
                                        accommodation_status: undefined,
                                        hotel_id: v,
                                        room_id: "",
                                      })
                                }
                              >
                                <SelectTrigger
                                  className="h-8 text-xs border-[#E2E8F0] w-full"
                                  data-testid={`hotel-selector-day-${r.day}`}
                                >
                                  <SelectValue placeholder="Select hotel…" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__no_hotel__">No Hotel Required</SelectItem>
                                  <SelectItem value="__own_arrangement__">
                                    Own Arrangement
                                  </SelectItem>
                                  {r.hotelPool.map((h) => (
                                    <SelectItem key={h.id} value={h.id}>
                                      {h.name}
                                      {r.noCategoryMatch ? ` (${h.hotel_category})` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {r.offSeasonText && (
                                <div className="text-[11px] text-[#64748B] mt-1 truncate">
                                  {r.offSeasonText}
                                </div>
                              )}
                              {r.isFallback && r.selHotel && (
                                <div className="text-[10px] text-amber-700 bg-amber-50 inline-block px-1.5 py-0.5 rounded mt-1">
                                  ⚠ {r.selHotel.hotel_category}
                                </div>
                              )}
                              <div className="text-[10px] text-muted-foreground mt-1">
                                {r.hotelPool.length} hotel{r.hotelPool.length !== 1 ? "s" : ""}{" "}
                                available
                              </div>
                              {r.pricingMessage && (
                                <div className="mt-1 text-[10px] text-amber-700">
                                  {r.pricingMessage}
                                </div>
                              )}
                            </>
                          )}
                        </td>
                        <td className="py-3 px-3 min-w-[140px]">
                          {r.sel?.no_hotel ? (
                            <span className="text-xs text-muted-foreground">â€”</span>
                          ) : r.sel?.hotel_id ? (
                            <Select
                              value={r.selectedRoomId}
                              onValueChange={(v) => r.setSel({ room_id: v })}
                              disabled={!r.sel?.hotel_id}
                            >
                              <SelectTrigger
                                className="h-8 text-xs border-[#E2E8F0] w-full"
                                data-testid={`room-selector-day-${r.day}`}
                              >
                                <SelectValue placeholder="Select room…" />
                              </SelectTrigger>
                              <SelectContent>
                                {r.rooms.map((room) => (
                                  <SelectItem key={room.id} value={room.id}>
                                    {room.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Select hotel first
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 min-w-[100px]">
                          {r.sel?.no_hotel ? (
                            <span className="text-xs text-muted-foreground">â€”</span>
                          ) : r.sel?.room_id ? (
                            <Select
                              value={r.selectedMeal}
                              onValueChange={(v) =>
                                r.setSel({
                                  meal_plan: v as HotelOption["selections"][number]["meal_plan"],
                                })
                              }
                              disabled={r.meals.length === 0}
                            >
                              <SelectTrigger
                                className="h-8 text-xs border-[#E2E8F0] w-full"
                                data-testid={`meal-plan-selector-day-${r.day}`}
                              >
                                <SelectValue placeholder={r.meals.length === 0 ? "—" : "Select…"} />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from(new Set(["EP", ...r.meals])).map((m) => (
                                  <SelectItem key={m} value={m}>
                                    {m}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        {r.hasRate ? (
                          <>
                            <td className="py-3 px-3 text-right text-[#0F172A] font-semibold">
                              {r.sglNet > 0 ? inr(r.sglTotal) : "Rate Not Available"}
                              {r.sglNet > 0 && (
                                <div className="text-[11px] text-[#64748B] font-normal">
                                  Net: {inr(r.sglNet)} + GST {gstRateFor(r.sglNet) * 100}%
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right text-[#0F172A] font-semibold">
                              {r.dblNet > 0 ? inr(r.dblTotal) : "Rate Not Available"}
                              {r.dblNet > 0 && (
                                <div className="text-[11px] text-[#64748B] font-normal">
                                  Net: {inr(r.dblNet)} + GST {gstRateFor(r.dblNet) * 100}%
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right text-[#0F172A] font-semibold">
                              {r.trpNet > 0 ? inr(r.trpTotal) : "Rate Not Available"}
                              {r.trpNet > 0 && (
                                <div className="text-[11px] text-[#64748B] font-normal">
                                  Net: {inr(r.trpNet)} + GST {gstRateFor(r.trpNet) * 100}%
                                </div>
                              )}
                            </td>
                            {standardHasQuad && (
                              <td className="py-3 px-3 text-right text-[#0F172A] font-semibold">
                                {r.quadNet > 0 ? inr(r.quadTotal) : "Rate Not Available"}
                                <div className="text-[11px] text-[#64748B] font-normal">
                                  {r.quadNet > 0 ? (
                                    <>
                                      Net: {inr(r.quadNet)} + GST {gstRateFor(r.quadNet) * 100}%
                                    </>
                                  ) : null}
                                </div>
                              </td>
                            )}
                          </>
                        ) : (
                          <>
                            <td className="py-3 px-3 text-right text-[#94A3B8] text-xs">—</td>
                            <td className="py-3 px-3 text-right text-[#94A3B8] text-xs">—</td>
                            <td className="py-3 px-3 text-right text-[#94A3B8] text-xs">—</td>
                            {standardHasQuad && (
                              <td className="py-3 px-3 text-right text-[#94A3B8] text-xs">
                                Rate Not Available
                              </td>
                            )}
                          </>
                        )}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1.5"
                            disabled={!r.sel?.hotel_id || !r.sel?.room_id || r.sel?.no_hotel}
                            onClick={() => setEditingDay(r.day)}
                          >
                            <Pencil className="h-3 w-3" />
                            {r.hasRate ? "Edit" : "Enter manual rate"}
                          </Button>
                          {r.dayOverride && Object.keys(r.dayOverride).length > 0 && (
                            <div className="text-[10px] text-amber-700 mt-1 uppercase tracking-wide">
                              Edited
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {rows.some((r) => r.hasRate) && (
                  <tfoot className="border-t-2 border-[#CBD5E1] bg-[#F8FAFC]">
                    {(
                      [
                        ["Total Net Rate", (key: "sgl" | "dbl" | "trp" | "quad") => netTotals[key]],
                        [
                          "Supplier GST",
                          (key: "sgl" | "dbl" | "trp" | "quad") =>
                            supplierTotals[key] - netTotals[key],
                        ],
                        [
                          "Markup",
                          (key: "sgl" | "dbl" | "trp" | "quad") =>
                            commercialFor(supplierTotals[key]).markup,
                        ],
                        [
                          "GST",
                          (key: "sgl" | "dbl" | "trp" | "quad") =>
                            commercialFor(supplierTotals[key]).gst,
                        ],
                        [
                          "Final Accommodation Total (Incl. GST)",
                          (key: "sgl" | "dbl" | "trp" | "quad") =>
                            commercialFor(supplierTotals[key]).final,
                        ],
                      ] as const
                    ).map(([label, valueFor], index) => (
                      <tr key={label} className={index === 4 ? "border-t font-bold" : ""}>
                        <td colSpan={6} className="px-3 py-2 text-right text-xs font-semibold">
                          {label}
                        </td>
                        {(["sgl", "dbl", "trp"] as const).map((key) => (
                          <td key={key} className="px-3 py-2 text-right tabular-nums">
                            {inr(valueFor(key))}
                          </td>
                        ))}
                        {standardHasQuad && (
                          <td className="px-3 py-2 text-right tabular-nums">
                            {inr(valueFor("quad"))}
                          </td>
                        )}
                        <td />
                      </tr>
                    ))}
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          <Card className="overflow-hidden">
            <div className="border-b px-4 py-3 text-sm font-semibold">
              Pax-wise Accommodation Costing — Option {option.key}
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[700px] text-xs">
                <thead className="sticky top-0 bg-muted/90 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Pax</th>
                    <th className="p-2 text-right">Single Occupancy (₹ PP)</th>
                    <th className="p-2 text-right">Double Occupancy (₹ PP)</th>
                    <th className="p-2 text-right">Triple Occupancy (₹ PP)</th>
                    {standardHasQuad && <th className="p-2 text-right">Quad Occupancy (₹ PP)</th>}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 40 }, (_, index) => index + 1).map((pax) => (
                    <tr key={pax} className="border-t">
                      <td className="p-2 font-medium">{pax}</td>
                      <td className="p-2 text-right">{inr(commercialFor(totalSgl).final)}</td>
                      <td className="p-2 text-right">{inr(commercialFor(totalDbl).final / 2)}</td>
                      <td className="p-2 text-right">{inr(commercialFor(totalTrp).final / 3)}</td>
                      {standardHasQuad && (
                        <td className="p-2 text-right">
                          {totalQuad > 0 ? inr(commercialFor(totalQuad).final / 4) : "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ============================================ */}
      {/* DYNAMIC MODE - VERTICAL CARD LAYOUT         */}
      {/* ============================================ */}
      {showLegacyDynamic && isDynamicGlobal && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={copyDayOneToAll}
              disabled={overnightRouting.length < 2}
            >
              Copy Day 1 to all
            </Button>
          </div>

          {rows.map((r) => {
            const mix = dayMixFor(r.day);
            const covered = dayMixCoversPax(mix);
            const isMissingHotel = r.noCategoryMatch && r.hotelPool.length === 0;

            // Calculate night total exactly
            let nightTotal = 0;
            const hasRate = r.hasRate;
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
                    <span className="text-xs text-muted-foreground ml-2 font-normal">
                      {fmtDateShort(r.date)}
                    </span>
                  </div>

                  <div className="flex-1 flex flex-wrap gap-2 min-w-[240px]">
                    <div className="flex-1 min-w-[120px]">
                      <Select
                        value={r.selectedHotelId}
                        onValueChange={(v) => r.setSel({ hotel_id: v, room_id: "" })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Hotel" />
                        </SelectTrigger>
                        <SelectContent>
                          {isMissingHotel ? (
                            <div
                              className="p-2 text-xs text-amber-600 flex items-center gap-2 cursor-pointer"
                              onClick={() => onQuickAdd(r.cityId, r.city)}
                            >
                              <Plus className="h-3 w-3" /> Add Hotel
                            </div>
                          ) : (
                            r.hotelPool.map((h) => (
                              <SelectItem key={h.id} value={h.id}>
                                {h.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {r.noQuadHotel && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-700">
                          <AlertCircle className="h-3 w-3" /> No contracted Quad rate; use
                          Single/Double/Triple.
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-[100px]">
                      <Select
                        value={r.selectedRoomId}
                        onValueChange={(v) => r.setSel({ room_id: v })}
                        disabled={!r.sel?.hotel_id}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Room" />
                        </SelectTrigger>
                        <SelectContent>
                          {r.rooms.map((rc) => (
                            <SelectItem key={rc.id} value={rc.id}>
                              {rc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-[80px]">
                      <Select
                        value={r.selectedMeal}
                        onValueChange={(v) =>
                          r.setSel({
                            meal_plan: v as HotelOption["selections"][number]["meal_plan"],
                          })
                        }
                        disabled={!r.sel?.room_id}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(new Set(["EP", ...r.meals])).map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "text-xs font-medium whitespace-nowrap",
                      covered === paxForMix ? "text-emerald-700" : "text-amber-700",
                    )}
                  >
                    {covered} / {paxForMix} pax covered
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2"
                    onClick={() => applyDayPreset(r.day, "single")}
                  >
                    All Single
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2"
                    onClick={() => applyDayPreset(r.day, "double")}
                  >
                    All Double
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2"
                    onClick={() => applyDayPreset(r.day, "triple")}
                  >
                    All Triple
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2"
                    onClick={() => applyDayPreset(r.day, "quad")}
                  >
                    All Quad
                  </Button>
                </div>

                {/* Room Mix Inputs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                  {(["single", "double", "triple", "quad"] as (keyof DayRoomMix)[]).map((k) => {
                    // Hide Quad input if toggle is off
                    if (k === "quad" && !showQuad) return null;

                    const currentVal = mix[k];
                    const capacity = { single: 1, double: 2, triple: 3, quad: 4 }[k];
                    const otherCovered = covered - currentVal * capacity;
                    const maxAllowed = Math.max(
                      0,
                      Math.floor((paxForMix - otherCovered) / capacity),
                    );
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
                        <Label className="text-[10px] uppercase text-muted-foreground">
                          {k} rooms
                        </Label>
                        <NumericStepper
                          ariaLabel={`${k} rooms on Day ${r.day}`}
                          min={0}
                          max={maxAllowed}
                          className="w-37.5"
                          inputClassName="px-1"
                          value={currentVal}
                          disabled={unavailable}
                          onChange={(value) =>
                            setDayMix(r.day, { [k]: value } as Partial<DayRoomMix>)
                          }
                        />
                        {hasRate && currentVal > 0 && (
                          <div className="text-[10px] font-medium text-primary text-right mt-0.5">
                            {rateHint}/night
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* === UPDATED: Detailed Night Breakdown Table === */}
                <div className="pt-3 border-t border-dashed border-muted-foreground/20">
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Night Breakdown
                  </div>
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
                      {hasRate &&
                        (() => {
                          const rows = [];
                          if (mix.single > 0 && r.sglTotal > 0) {
                            rows.push({
                              type: "Single",
                              count: mix.single,
                              net: r.sglNet,
                              gst: r.sglGst,
                              total: r.sglTotal,
                            });
                          }
                          if (mix.double > 0 && r.dblTotal > 0) {
                            rows.push({
                              type: "Double",
                              count: mix.double,
                              net: r.dblNet,
                              gst: r.dblGst,
                              total: r.dblTotal,
                            });
                          }
                          if (mix.triple > 0 && r.trpTotal > 0) {
                            rows.push({
                              type: "Triple",
                              count: mix.triple,
                              net: r.trpNet,
                              gst: r.trpGst,
                              total: r.trpTotal,
                            });
                          }
                          if (mix.quad > 0 && r.quadTotal > 0 && showQuad) {
                            rows.push({
                              type: "Quad",
                              count: mix.quad,
                              net: r.quadNet,
                              gst: r.quadGst,
                              total: r.quadTotal,
                            });
                          }
                          return rows.map((row, idx) => (
                            <tr key={idx} className="border-t border-muted-foreground/10">
                              <td className="py-1">{row.type}</td>
                              <td className="text-center py-1">{row.count}</td>
                              <td className="text-right py-1 tabular-nums">
                                {inr(row.net * row.count)}
                              </td>
                              <td className="text-right py-1 tabular-nums">
                                {inr(row.gst * row.count)}
                              </td>
                              <td className="text-right py-1 tabular-nums font-medium">
                                {inr(row.total * row.count)}
                              </td>
                            </tr>
                          ));
                        })()}
                      {hasRate && (
                        <tr className="border-t border-muted-foreground/20 font-semibold">
                          <td colSpan={4} className="text-right py-1">
                            Night Total
                          </td>
                          <td className="text-right py-1 text-primary">{inr(nightTotal)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {hasRate && (
                    <div className="mt-1 text-right text-[10px] text-muted-foreground">
                      GST is applied per room tariff slab before the night total.
                    </div>
                  )}
                  {!hasRate && <div className="text-xs text-muted-foreground">Rate not found</div>}
                </div>
              </Card>
            );
          })}

          {/* Dynamic grand total only — occupancy columns are not additive summaries. */}
          {rows.some((r) => r.hasRate) && (
            <div className="mt-0 flex items-center justify-end gap-5 rounded-b-lg border-t-2 border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3">
              <span className="text-sm font-semibold text-[#0F172A]">
                Accommodation total with room GST
              </span>
              <span className="text-lg font-bold text-primary">{inr(globalTotalPrice)}</span>
            </div>
          )}
        </div>
      )}

      {isDynamicGlobal && (
        <DynamicAccommodation
          draft={draft}
          option={option}
          rows={rows}
          pax={paxForMix}
          onUpdate={onUpdate}
        />
      )}

      {/* Edit Rates Dialog - Standard Mode Only */}
      <Dialog
        open={!!editRow}
        onOpenChange={(v) => {
          if (!v) setEditingDay(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {editRow && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Edit rates — Day {editRow.day} · {editRow.city}
                </DialogTitle>
                <DialogDescription>
                  Applies to this quotation only. The hotel's master rate stays unchanged.
                </DialogDescription>
              </DialogHeader>
              <DayRateFields
                showQuad={showQuad || editRow.noQuadHotel}
                base={{
                  sgl: editRow.sglNet,
                  dbl: editRow.dblNet,
                  trp: editRow.trpNet,
                  quad: editRow.quadNet,
                }}
                override={overrides[editRow.day] ?? {}}
                onChange={(field, value) => setOverride(editRow.day, field, value)}
                onReasonChange={(reason) => setOverrideReason(editRow.day, reason)}
              />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDayOverride(editRow.day, undefined)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset to master
                </Button>
                <Button
                  disabled={
                    ["sgl", "dbl", "trp", "quad"].some(
                      (key) =>
                        (overrides[editRow.day]?.[key as "sgl" | "dbl" | "trp" | "quad"] ?? 0) > 0,
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

type DynamicHotelRow = {
  day: number;
  date: string;
  city: string;
  rooms: ReturnType<typeof useDB>["room_categories"];
  meals: string[];
  selectedHotelId: string;
  hotelChoiceValue: string;
  selectedMeal: string;
  sel?: HotelOption["selections"][number];
  selHotel: ReturnType<typeof useDB>["hotels"][number] | null | undefined;
  hotelPool: ReturnType<typeof useDB>["hotels"];
  hasHotelExemptionConflict: boolean;
  setSel: (patch: Record<string, unknown>) => void;
};

const OCCUPANCY_CAPACITY: Record<DynamicOccupancy, number> = {
  single: 1,
  double: 2,
  triple: 3,
  quad: 4,
};

function DynamicAccommodation({
  draft,
  option,
  rows,
  pax,
  onUpdate,
}: {
  draft: QuoteDraft;
  option: HotelOption;
  rows: DynamicHotelRow[];
  pax: number;
  onUpdate: (patch: Partial<HotelOption>) => void;
}) {
  const db = useDB();
  const user = useAuth();
  const allocations = option.dynamic_allocations ?? {};
  const setDayAllocations = (day: number, next: DynamicRoomAllocation[]) =>
    onUpdate({ dynamic_allocations: { ...allocations, [day]: next } });
  const addAllocation = (day: number) =>
    setDayAllocations(day, [
      ...(allocations[day] ?? []),
      { id: crypto.randomUUID(), room_id: "", occupancy: "double", rooms: 1 },
    ]);
  const patchAllocation = (day: number, id: string, patch: Partial<DynamicRoomAllocation>) =>
    setDayAllocations(
      day,
      (allocations[day] ?? []).map((allocation) =>
        allocation.id === id ? { ...allocation, ...patch } : allocation,
      ),
    );

  const resolvedAllocation = (row: DynamicHotelRow, allocation: DynamicRoomAllocation) => {
    const plan = allocation.room_id
      ? findRatePlan(db.rate_plans, allocation.room_id, row.selectedMeal, row.date)
      : null;
    const masterNet = plan
      ? allocation.occupancy === "single"
        ? plan.single_rate
        : allocation.occupancy === "double"
          ? plan.double_rate
          : allocation.occupancy === "triple"
            ? plan.double_rate + (plan.extra_bed_rate || 0)
            : (plan.quad_rate ?? 0)
      : 0;
    const net = allocation.manual_net_rate ?? masterNet;
    const supplierGst = net > 0 ? net * gstRateFor(net) : 0;
    const inclusive = net + supplierGst;
    return {
      plan,
      masterNet,
      net,
      supplierGst,
      inclusive,
      total: inclusive * Math.max(0, allocation.rooms),
      capacity: OCCUPANCY_CAPACITY[allocation.occupancy] * Math.max(0, allocation.rooms),
    };
  };

  const nightSummaries = rows.map((row) => {
    const resolved = (allocations[row.day] ?? []).map((allocation) => ({
      allocation,
      pricing: resolvedAllocation(row, allocation),
    }));
    return {
      row,
      resolved,
      total: resolved.reduce((sum, item) => sum + item.pricing.total, 0),
      capacity: resolved.reduce((sum, item) => sum + item.pricing.capacity, 0),
    };
  });
  const base = nightSummaries.reduce((sum, night) => sum + night.total, 0);
  const markup = base * hotelsMarkup(draft);
  const gst = (base + markup) * hotelsGst(draft);
  const final = base + markup + gst;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[10px] font-semibold uppercase text-muted-foreground">Part 1</div>
        <h3 className="text-sm font-semibold">Night-wise Room Allocation &amp; Costing</h3>
      </div>
      {nightSummaries.map(({ row, resolved, total, capacity }) => (
        <Card key={row.day} className="overflow-hidden">
          <div className="grid gap-3 border-b bg-muted/20 p-4 md:grid-cols-[150px_1fr_1fr_130px]">
            <div>
              <div className="text-sm font-semibold">
                Day {row.day} · {fmtDateShort(row.date)}
              </div>
              <div className="text-xs text-muted-foreground">{row.city}</div>
            </div>
            <Select
              value={row.hotelChoiceValue}
              onValueChange={(value) =>
                value === "__no_hotel__" || value === "__own_arrangement__"
                  ? row.setSel({
                      no_hotel: true,
                      accommodation_status:
                        value === "__own_arrangement__" ? "own_arrangement" : "no_hotel_required",
                    })
                  : row.setSel({
                      hotel_id: value,
                      room_id: "",
                      ...hotelBookingConfirmationPatch(),
                    })
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select hotel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__no_hotel__">No Hotel Required</SelectItem>
                <SelectItem value="__own_arrangement__">Own Arrangement</SelectItem>
                {row.hotelPool.map((hotel) => (
                  <SelectItem key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={row.selectedMeal}
              onValueChange={(value) =>
                row.setSel({ meal_plan: value as HotelOption["selections"][number]["meal_plan"] })
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Meal plan" />
              </SelectTrigger>
              <SelectContent>
                {QUOTATION_MEAL_PLANS.map((meal) => (
                  <SelectItem key={meal} value={meal}>
                    {meal}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="rounded border bg-background px-3 py-2 text-right text-xs">
              <div>
                {capacity} / {pax} pax
              </div>
              <div className={capacity < pax ? "text-amber-700" : "text-emerald-700"}>
                {capacity < pax
                  ? `${pax - capacity} pending`
                  : capacity > pax
                    ? `${capacity - pax} unused capacity`
                    : "Allocation complete"}
              </div>
            </div>
          </div>
          {row.hasHotelExemptionConflict && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950 md:col-span-4">
              <div className="font-semibold">Hotel booking conflicts with Own Arrangement.</div>
              <p className="mt-1">
                This saved night has a hotel and room allocation, but is currently an explicit
                accommodation exemption. It remains zero-cost until you confirm the booking.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 border-amber-400 bg-white"
                onClick={() => row.setSel(hotelBookingConfirmationPatch())}
              >
                Confirm {row.selHotel?.name || "hotel"} booking
              </Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-xs">
              <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Room Category</th>
                  <th className="p-2 text-left">Occupancy</th>
                  <th className="p-2 text-right">Net Rate</th>
                  <th className="p-2 text-right">Supplier GST</th>
                  <th className="p-2 text-right">Rate Incl. GST</th>
                  <th className="p-2 text-center">Number of Rooms</th>
                  <th className="p-2 text-right">Total Cost Incl. GST</th>
                  <th className="p-2 text-center">Pax Capacity</th>
                  <th className="p-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map(({ allocation, pricing }) => (
                  <tr key={allocation.id} className="border-t">
                    <td className="p-2">
                      <Select
                        value={allocation.room_id}
                        onValueChange={(value) =>
                          patchAllocation(row.day, allocation.id, {
                            room_id: value,
                            manual_net_rate: undefined,
                            original_net_rate: undefined,
                            override_reason: undefined,
                            changed_by: undefined,
                            changed_at: undefined,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 min-w-40">
                          <SelectValue placeholder="Room category" />
                        </SelectTrigger>
                        <SelectContent>
                          {row.rooms.map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              {room.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Select
                        value={allocation.occupancy}
                        onValueChange={(value) =>
                          patchAllocation(row.day, allocation.id, {
                            occupancy: value as DynamicOccupancy,
                            manual_net_rate: undefined,
                            original_net_rate: undefined,
                            override_reason: undefined,
                            changed_by: undefined,
                            changed_at: undefined,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["single", "double", "triple", "quad"] as const).map((occupancy) => (
                            <SelectItem key={occupancy} value={occupancy}>
                              {occupancy[0].toUpperCase() + occupancy.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        className={cn(
                          "ml-auto h-8 w-28 text-right",
                          allocation.manual_net_rate != null && "border-amber-400 bg-amber-50",
                        )}
                        type="number"
                        min={0}
                        value={(allocation.manual_net_rate ?? pricing.masterNet) || ""}
                        placeholder={pricing.masterNet > 0 ? "" : "Rate Not Available"}
                        onChange={(event) => {
                          const value =
                            event.target.value === ""
                              ? undefined
                              : Number(event.target.value) || undefined;
                          const audit =
                            value == null
                              ? {
                                  manual_net_rate: undefined,
                                  original_net_rate: undefined,
                                  override_reason: undefined,
                                  changed_by: undefined,
                                  changed_at: undefined,
                                }
                              : {
                                  manual_net_rate: value,
                                  original_net_rate:
                                    allocation.original_net_rate ?? pricing.masterNet,
                                  changed_by: user?.name || "Unknown",
                                  changed_at: new Date().toISOString(),
                                };
                          patchAllocation(row.day, allocation.id, {
                            ...audit,
                          });
                        }}
                      />
                      {allocation.manual_net_rate != null && (
                        <div className="mt-1 space-y-1 text-[9px] text-amber-700">
                          <div>
                            Original {inr(allocation.original_net_rate ?? pricing.masterNet)} →
                            Revised {inr(allocation.manual_net_rate)}
                          </div>
                          <div>
                            Edited by {allocation.changed_by || "Unknown"}
                            {allocation.changed_at
                              ? ` · ${new Date(allocation.changed_at).toLocaleString()}`
                              : ""}
                          </div>
                          <Input
                            className="h-7 w-40 text-[10px]"
                            value={allocation.override_reason ?? ""}
                            placeholder="Override reason"
                            onChange={(event) =>
                              patchAllocation(row.day, allocation.id, {
                                override_reason: event.target.value,
                                changed_by: user?.name || "Unknown",
                                changed_at: new Date().toISOString(),
                              })
                            }
                          />
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {pricing.net > 0 ? inr(pricing.supplierGst) : "Rate Not Available"}
                    </td>
                    <td className="p-2 text-right">
                      {pricing.net > 0 ? inr(pricing.inclusive) : "—"}
                    </td>
                    <td className="p-2">
                      <NumericStepper
                        ariaLabel={`Number of rooms on Day ${row.day}`}
                        className="mx-auto w-37.5"
                        inputClassName="px-1"
                        min={1}
                        value={allocation.rooms}
                        onChange={(rooms) => patchAllocation(row.day, allocation.id, { rooms })}
                      />
                    </td>
                    <td className="p-2 text-right font-semibold">
                      {pricing.net > 0 ? inr(pricing.total) : "—"}
                    </td>
                    <td className="p-2 text-center">{pricing.capacity}</td>
                    <td className="p-2 text-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setDayAllocations(
                            row.day,
                            (allocations[row.day] ?? []).filter(
                              (item) => item.id !== allocation.id,
                            ),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t bg-muted/10 px-4 py-3">
            <Button size="sm" variant="outline" onClick={() => addAllocation(row.day)}>
              <Plus className="h-4 w-4" /> Add Room Combination
            </Button>
            <div className="text-sm font-semibold">Night Total (Incl. GST): {inr(total)}</div>
          </div>
        </Card>
      ))}
      <Card className="overflow-hidden">
        <div className="border-b px-4 py-3 text-sm font-semibold">
          All Nights Accommodation Costing
        </div>
        <table className="w-full text-sm">
          <tbody>
            {nightSummaries.map((night) => (
              <tr key={night.row.day} className="border-b">
                <td className="p-2 pl-4">Night {night.row.day}</td>
                <td className="p-2 pr-4 text-right">{inr(night.total)}</td>
              </tr>
            ))}
            <tr>
              <td className="p-2 pl-4">Total Accommodation Cost (Including Supplier GST)</td>
              <td className="p-2 pr-4 text-right">{inr(base)}</td>
            </tr>
            <tr>
              <td className="p-2 pl-4">Markup</td>
              <td className="p-2 pr-4 text-right">{inr(markup)}</td>
            </tr>
            <tr>
              <td className="p-2 pl-4">GST</td>
              <td className="p-2 pr-4 text-right">{inr(gst)}</td>
            </tr>
            <tr className="border-t font-bold">
              <td className="p-3 pl-4">Final Accommodation Total (Inclusive of GST)</td>
              <td className="p-3 pr-4 text-right">{inr(final)}</td>
            </tr>
          </tbody>
        </table>
      </Card>
      <div>
        <div className="text-[10px] font-semibold uppercase text-muted-foreground">Part 2</div>
        <h3 className="text-sm font-semibold">
          Rooming Preview &amp; Per Person Accommodation Cost
        </h3>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-xs">
            <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Day</th>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-left">Destination</th>
                <th className="p-2 text-left">Hotel</th>
                <th className="p-2 text-left">Room Allocation</th>
              </tr>
            </thead>
            <tbody>
              {nightSummaries.map(({ row, resolved }) => (
                <tr key={row.day} className="border-t align-top">
                  <td className="p-2">Day {row.day}</td>
                  <td className="p-2">{fmtDateShort(row.date)}</td>
                  <td className="p-2">{row.city}</td>
                  <td className="p-2">{row.selHotel?.name || "—"}</td>
                  <td className="p-2 space-y-1">
                    {resolved.map(({ allocation }) => (
                      <div key={allocation.id}>
                        {allocation.rooms} {allocation.occupancy} —{" "}
                        {db.room_categories.find((room) => room.id === allocation.room_id)?.name ||
                          "Room not selected"}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="text-sm font-semibold">Per Person Accommodation Cost (Dynamic Mode)</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">Final Accommodation Total</div>
            <div className="text-lg font-semibold">{inr(final)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total Travelling Pax</div>
            <div className="text-lg font-semibold">{pax}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Accommodation Cost Per Person</div>
            <div className="text-lg font-semibold text-primary">
              {inr(final / Math.max(1, pax))}
            </div>
          </div>
        </div>
      </Card>
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
                type="number"
                className="h-9"
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
              <Button
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={() => onChange(f.key, undefined)}
              >
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
// eslint-disable-next-line react-refresh/only-export-components
export function optionInclusionSummary(draft: QuoteDraft, option: HotelOption) {
  const stays = accommodationNightsForOption(draft.routing, option)
    .map((day) => hotelSelectionForDay(option, day, true))
    .filter((selection): selection is NonNullable<typeof selection> =>
      Boolean(selection && !selection.no_hotel && (selection.hotel_id || selection.room_id)),
    );
  const plans = stays.map((selection) => selection.meal_plan);
  return {
    nights: stays.length,
    breakfasts: plans.filter((plan) => plan !== "EP").length,
    lunches: plans.filter((plan) => plan === "AP").length,
    dinners: plans.filter((plan) => plan === "MAP" || plan === "AP").length,
    taxes:
      stays.length > 0 || (option.inclusions ?? []).some((item) => /tax/i.test(item))
        ? "Applicable"
        : "—",
  };
}

function OptionInclusionsEditor({
  draft,
  option,
  onChange,
}: {
  draft: QuoteDraft;
  option: HotelOption;
  onChange: (patch: Partial<HotelOption>) => void;
}) {
  const [newInc, setNewInc] = useState("");
  const [newExc, setNewExc] = useState("");
  const showLegacyExclusions: boolean = false;
  const inclusions = option.inclusions ?? [];
  const exclusions = option.exclusions ?? [];
  const summary = optionInclusionSummary(draft, option);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3">
        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4">
            <div className="text-sm font-semibold text-slate-900">
              Inclusions · Option {option.key}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Auto-derived from selected hotel, meal plan and package inclusions.
            </div>
          </div>
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ["Nights", summary.nights],
                ["Breakfasts", summary.breakfasts],
                ["Lunches", summary.lunches],
                ["Dinners", summary.dinners],
                ["Taxes", summary.taxes],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                  </div>
                  <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
                </div>
              ))}
            </div>

            {/* <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Package inclusions · {option.category || "Uncategorised"}
              </div>
              <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {inclusions.map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0"
                  >
                    <span className="flex min-w-0 items-center gap-2.5 text-sm text-slate-700">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span>{item}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove inclusion: ${item}`}
                      title="Remove inclusion"
                      onClick={() =>
                        onChange({ inclusions: inclusions.filter((_, itemIndex) => itemIndex !== index) })
                      }
                      className="rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
                {inclusions.length === 0 && (
                  <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No inclusions yet.
                  </li>
                )}
              </ul>
            </div> */}

            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-3">
              {/* <div className="mb-2 text-xs font-medium text-slate-600">Add inclusion</div> */}
              <div className="flex flex-col gap-2 sm:flex-row">
                {/* <Input
                  className="bg-white"
                  value={newInc}
                  onChange={(event) => setNewInc(event.target.value)}
                  placeholder="e.g. Welcome drink on arrival"
                /> */}
                {/* <Button
                  type="button"
                  className="sm:min-w-24"
                  onClick={() => {
                    const value = newInc.trim();
                    if (value) {
                      onChange({ inclusions: [...inclusions, value] });
                      setNewInc("");
                    }
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Add
                </Button> */}
              </div>
            </div>
          </div>
        </Card>
        {showLegacyExclusions && (
          <Card className="p-3">
            <div className="section-label mb-2">Exclusions · Option {option.key}</div>
            <ul className="space-y-1 mb-2">
              {exclusions.map((x, i) => (
                <li key={i} className="text-sm flex justify-between gap-2">
                  <span>✗ {x}</span>
                  <button
                    onClick={() => onChange({ exclusions: exclusions.filter((_, j) => j !== i) })}
                    className="text-destructive"
                  >
                    ×
                  </button>
                </li>
              ))}
              {exclusions.length === 0 && (
                <li className="text-xs text-muted-foreground">No exclusions yet.</li>
              )}
            </ul>
            <div className="flex gap-2">
              <Input
                value={newExc}
                onChange={(e) => setNewExc(e.target.value)}
                placeholder="Add exclusion"
              />
              <Button
                size="sm"
                onClick={() => {
                  const v = newExc.trim();
                  if (v) {
                    onChange({ exclusions: [...exclusions, v] });
                    setNewExc("");
                  }
                }}
              >
                Add
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Preview Components (Required by StepCosting)
// ------------------------------------------------------------
export function OptionDynamicPreview({
  draft,
  option,
}: {
  draft: QuoteDraft;
  option: HotelOption;
}) {
  const d = useDB();
  const res = useMemo(() => {
    const all = computeDynamicOption(draft, option, d);
    const dyn = new Set(draft.dynamic_days ?? []);
    const days = all.days.filter((x) => dyn.has(x.day));
    return {
      days,
      room_net: days.reduce((s, x) => s + x.net, 0),
      room_gst: days.reduce((s, x) => s + x.gst, 0),
    };
  }, [draft, option, d]);
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
              const parts =
                [
                  row.mix.single ? `${row.mix.single} Single` : "",
                  row.mix.double ? `${row.mix.double} Double` : "",
                  row.mix.triple ? `${row.mix.triple} Triple` : "",
                  row.mix.quad ? `${row.mix.quad} Quad` : "",
                ]
                  .filter(Boolean)
                  .join(" + ") || "—";
              return (
                <tr key={row.day} className="border-t">
                  <td className="py-1.5">Day {row.day}</td>
                  <td className="py-1.5 text-muted-foreground">{city}</td>
                  <td className="py-1.5">{parts}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {row.missing ? "—" : inr(row.net)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {row.missing ? "—" : inr(row.gst)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums font-medium">
                    {row.missing ? "No rate" : inr(row.net + row.gst)}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t font-semibold">
              <td className="py-1.5" colSpan={3}>
                Total (rooms only)
              </td>
              <td className="py-1.5 text-right tabular-nums">{inr(res.room_net)}</td>
              <td className="py-1.5 text-right tabular-nums">{inr(res.room_gst)}</td>
              <td className="py-1.5 text-right tabular-nums text-primary">
                {inr(res.room_net + res.room_gst)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function OptionPerPersonPreview({
  draft,
  option,
}: {
  draft: QuoteDraft;
  option: HotelOption;
}) {
  const d = useDB();
  const rows = useMemo(() => computePersonTotals(draft, option, d), [draft, option, d]);
  const nights = accommodationNightsForOption(draft.routing, option).length;
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
                <td className="text-right tabular-nums font-semibold text-primary">
                  {inr(r.room_total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
