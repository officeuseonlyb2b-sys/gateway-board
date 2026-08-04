// Room Allocation step — runs BEFORE hotel selection.
// Day-by-day room mix only (Single / Double / Triple / Quad per night).
// "Standard mode" was removed; every quotation uses the dynamic day mix.
// Additionally lets the admin pick Hotel / Room / Meal Plan per day early —
// this writes into the same hotel_options[].selections used by Accommodation.
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDB, MEAL_PLANS, type MealPlan } from "@/lib/mock-store";
import { findRatePlan, availableMealPlans } from "@/lib/wizard/rate-lookup";
import { effectivePaxForPricing, defaultDayMix, dayMixCoversPax, computeDynamicOption } from "@/lib/wizard/calc";
import { inr } from "@/lib/format";
import type { DayRoomMix, PersonRoomType, HotelOption, OptionKey } from "@/lib/wizard/types";
import type { StepProps } from "../shared";


export const PERSON_ROOM_TYPES: { value: PersonRoomType; label: string; shares: number }[] = [
  { value: "single", label: "Single Room", shares: 0 },
  { value: "double", label: "Double Sharing", shares: 1 },
  { value: "triple", label: "Triple Sharing", shares: 2 },
  { value: "quad", label: "Quad Sharing", shares: 3 },
  { value: "extra_bed", label: "Extra Bed", shares: 0 },
  { value: "cwb", label: "Child With Bed", shares: 0 },
];

export function StepAllocation({ draft, set }: StepProps) {
  const d = useDB();
  const paxCount = Math.max(1, effectivePaxForPricing(draft));
  const overnight = draft.routing.filter((r) => r.overnight);

  // Standard mode no longer exists — normalise any legacy draft.
  useEffect(() => {
    if (draft.allocation_mode !== "dynamic") set({ allocation_mode: "dynamic" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.allocation_mode]);

  const mixFor = (dayNo: number): DayRoomMix => draft.day_room_mix?.[dayNo] ?? defaultDayMix(paxCount);
  const setMix = (dayNo: number, patch: Partial<DayRoomMix>) => {
    const current = mixFor(dayNo);
    set({ day_room_mix: { ...(draft.day_room_mix ?? {}), [dayNo]: { ...current, ...patch } } });
  };
  const applyDayPreset = (dayNo: number, kind: "single" | "double" | "triple" | "quad") => {
    if (kind === "single") setMix(dayNo, { single: paxCount, double: 0, triple: 0, quad: 0 });
    if (kind === "double") setMix(dayNo, { single: paxCount % 2, double: Math.floor(paxCount / 2), triple: 0, quad: 0 });
    if (kind === "triple") {
      const triple = Math.floor(paxCount / 3);
      const rem = paxCount % 3;
      setMix(dayNo, { single: rem === 1 ? 1 : 0, double: rem === 2 ? 1 : 0, triple, quad: 0 });
    }
    if (kind === "quad") {
      const quad = Math.floor(paxCount / 4);
      const rem = paxCount % 4;
      setMix(dayNo, { single: rem === 1 ? 1 : 0, double: rem === 2 ? 1 : 0, triple: rem === 3 ? 1 : 0, quad });
    }
  };
  const copyDayOneToAll = () => {
    const first = overnight[0];
    if (!first) return;
    const base = mixFor(first.day);
    const next: Record<number, DayRoomMix> = { ...(draft.day_room_mix ?? {}) };
    overnight.forEach((r) => { next[r.day] = { ...base }; });
    set({ day_room_mix: next });
  };

  // ---- Early Hotel / Room / Meal selection (same data as Accommodation step) ----
  const options = draft.hotel_options ?? [];
  const [optKey, setOptKey] = useState<OptionKey>(options[0]?.key ?? "A");
  const activeOption = options.find((o) => o.key === optKey) ?? options[0];
  const updateOption = (patch: Partial<HotelOption>) => {
    if (!activeOption) return;
    set({ hotel_options: options.map((o) => (o.key === activeOption.key ? { ...o, ...patch } : o)) });
  };
  const selFor = (cityId: string) => activeOption?.selections.find((s) => s.city_id === cityId);
  const setSel = (cityId: string, patch: Partial<{ hotel_id: string; room_id: string; meal_plan: MealPlan }>) => {
    if (!activeOption) return;
    const others = activeOption.selections.filter((s) => s.city_id !== cityId);
    const cur = selFor(cityId) ?? { city_id: cityId, hotel_id: "", room_id: "", meal_plan: "CP" as MealPlan };
    const merged = { ...cur, ...patch };
    if ("hotel_id" in patch) {
      const h = d.hotels.find((x) => x.id === merged.hotel_id);
      merged.is_fallback = !!h && !!activeOption.category && h.hotel_category !== activeOption.category;
    }
    updateOption({ selections: [...others, merged] });
  };
  const hotelHasQuad = (hotelId: string, dateISO: string) => {
    const roomIds = d.room_categories.filter((room) => room.hotel_id === hotelId).map((room) => room.id);
    return roomIds.some((roomId) =>
      MEAL_PLANS.some((m) => {
        const plan = findRatePlan(d.rate_plans, roomId, m, dateISO);
        return !!plan && (plan.quad_rate ?? 0) > 0;
      }),
    );
  };
  const hotelsForDay = (cityId: string, dateISO: string, mix: DayRoomMix) => {
    const cityKey = (d.cities.find((c) => c.id === cityId)?.name || "").trim().toLowerCase();
    const inCity = d.hotels.filter(
      (h) => (d.cities.find((c) => c.id === h.city_id)?.name || "").trim().toLowerCase() === cityKey,
    );
    const cat = (activeOption?.category || "").trim().toLowerCase();
    let pool = cat ? inCity.filter((h) => h.hotel_category.trim().toLowerCase() === cat) : inCity;
    if (pool.length === 0) pool = inCity;
    if ((mix.quad ?? 0) > 0) {
      const quadPool = pool.filter((h) => hotelHasQuad(h.id, dateISO));
      if (quadPool.length > 0) return { pool: quadPool, noQuad: false };
      return { pool: [], noQuad: true };
    }
    return { pool, noQuad: false };
  };


  // Live room pricing for the current option (same maths as Accommodation Options).
  const pricing = useMemo(
    () => (activeOption ? computeDynamicOption(draft, activeOption, d) : { days: [], room_net: 0, room_gst: 0 }),
    [draft, activeOption, d],
  );
  const priceByDay = new Map(pricing.days.map((row) => [row.day, row]));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Room Allocation</h2>
        <p className="text-sm text-muted-foreground">
          Set the room mix for every night before picking hotels. {paxCount} traveller{paxCount === 1 ? "" : "s"}.
        </p>
      </div>

      {options.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Hotel selection applies to:</span>
          {options.map((o) => (
            <Button
              key={o.key}
              size="sm"
              variant={o.key === activeOption?.key ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setOptKey(o.key)}
            >
              Option {o.key}{o.category ? ` · ${o.category}` : ""}
            </Button>
          ))}
        </div>
      )}

      <Card className="p-4 border-primary/20 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-primary">Day-by-Day Room Mix</div>
            <div className="text-xs text-muted-foreground">
              Each night can use a different mix. Hotels in the next step are filtered to those offering every room type you allocate here.
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={copyDayOneToAll} disabled={overnight.length < 2}>
            Copy Day 1 to all
          </Button>
        </div>

        {overnight.length === 0 && (
          <p className="text-sm text-muted-foreground">Generate the routing first — no overnight days yet.</p>
        )}

        {overnight.map((r) => {
          const mix = mixFor(r.day);
          const covered = dayMixCoversPax(mix);
          const cityName = d.cities.find((c) => c.id === r.city_id)?.name || "—";
          const sel = selFor(r.city_id);
          const { pool, noQuad } = hotelsForDay(r.city_id, r.date, mix);
          
          // Calculate room types and meal options
          const rooms = sel?.hotel_id ? d.room_categories.filter((rc) => rc.hotel_id === sel.hotel_id) : [];
          const meals = sel?.room_id ? availableMealPlans(d.rate_plans, sel.room_id, r.date) : [];
          const plan = sel?.room_id && sel?.meal_plan ? findRatePlan(d.rate_plans, sel.room_id, sel.meal_plan, r.date) : null;
          
          return (
            <div key={r.day} className="rounded-lg border p-4 space-y-3">
              {/* Day Header + Selects RIGHT NEXT TO the Title */}
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="text-sm font-semibold whitespace-nowrap flex items-center gap-2">
                  Day {r.day} · {cityName}
                  {r.date ? <span className="text-xs text-muted-foreground font-normal">{r.date}</span> : null}
                </div>
                
                {/* Selects Group (Inline with Title) */}
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[200px]">
                  <div className="flex-1 min-w-[120px]">
                    <Select value={sel?.hotel_id || ""} onValueChange={(v) => setSel(r.city_id, { hotel_id: v, room_id: "" })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Hotel" /></SelectTrigger>
                      <SelectContent>
                        {pool.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <Select value={sel?.room_id || ""} onValueChange={(v) => setSel(r.city_id, { room_id: v })} disabled={!sel?.hotel_id}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Room" /></SelectTrigger>
                      <SelectContent>
                        {rooms.map((rc) => <SelectItem key={rc.id} value={rc.id}>{rc.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[100px]">
                    <Select value={sel?.meal_plan || "CP"} onValueChange={(v) => setSel(r.city_id, { meal_plan: v as MealPlan })} disabled={!sel?.room_id}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(meals.length > 0 ? meals : MEAL_PLANS).map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className={cn("text-xs font-medium ml-auto whitespace-nowrap", covered === paxCount ? "text-emerald-700" : "text-amber-700")}>
                  {covered} / {paxCount} pax covered
                </div>
              </div>
              
              {noQuad && (
                <p className="text-xs text-amber-700 -mt-1">
                  No hotel in {cityName} offers a Quad room for this date. You can complete this night with Dynamic Costing in Accommodation Options.
                </p>
              )}

              {/* Quick Presets */}
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => applyDayPreset(r.day, "single")}>All Single</Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => applyDayPreset(r.day, "double")}>All Double</Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => applyDayPreset(r.day, "triple")}>All Triple</Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => applyDayPreset(r.day, "quad")}>All Quad</Button>
              </div>

              {/* Room Inputs WITH PRICE UNDERNEATH */}
              <div className="grid grid-cols-4 gap-2">
                {(["single", "double", "triple", "quad"] as (keyof DayRoomMix)[]).map((k) => (
                  <div key={k} className="flex flex-col gap-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">{k} rooms</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 text-xs"
                      value={mix[k]}
                      onChange={(e) => setMix(r.day, { [k]: Math.max(0, parseInt(e.target.value) || 0) } as Partial<DayRoomMix>)}
                    />
                    {/* Price shown exactly underneath the room type input */}
                    {plan && (
                      <div className="text-[10px] text-right font-medium text-primary mt-0.5">
                        {(() => {
                          const roomRateKey = `${k}_rate` as keyof typeof plan;
                          const rateVal = plan[roomRateKey];
                          if (typeof rateVal === 'number' && rateVal > 0) {
                            return `₹${rateVal}/night`;
                          }
                          return <span className="text-muted-foreground text-[9px]">—</span>;
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Day Subtotals */}
              {(() => {
                const price = priceByDay.get(r.day);
                if (!price) return null;
                return (
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-dashed border-muted-foreground/20">
                    <span className="text-muted-foreground">Subtotal for this night</span>
                    <span className="font-semibold text-primary">
                      {price.missing
                        ? "Rate not found"
                        : `${inr(price.net + price.gst)} (net ${inr(price.net)} + GST ${inr(price.gst)})`}
                    </span>
                  </div>
                );
              })()}
            </div>
          );
        })}
        
        {/* Grand Total Footer */}
        {overnight.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border-t-2 border-primary/30 bg-primary/5 px-3 py-2.5 mt-2">
            <span className="text-sm font-semibold">Total room cost (all nights)</span>
            <span className="text-sm font-bold text-primary">
              {inr(pricing.room_net + pricing.room_gst)}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                net {inr(pricing.room_net)} + GST {inr(pricing.room_gst)}
              </span>
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}