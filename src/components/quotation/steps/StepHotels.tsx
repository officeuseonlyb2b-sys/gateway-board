// Extracted verbatim from src/routes/_authenticated/costing.tsx (Step 15 UI — Hotels).
import { useMemo, useState } from "react";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { inr, fmtDateShort } from "@/lib/format";
import { useDB, MEAL_PLANS, type MealPlan } from "@/lib/mock-store";
import {
  totalPax, gstRateFor, computePersonTotals,
  optionUsesCustomAllocation, normalizeAllocations, defaultAllocations,
  presetAllSingle, presetAllDouble, presetOneSingleRestDouble,
  personRoomTypeLabel,
} from "@/lib/wizard/calc";
import type { QuoteDraft, HotelOption, OptionKey, PersonAllocation, PersonRoomType } from "@/lib/wizard/types";
import { findRatePlan, availableMealPlans } from "@/lib/wizard/rate-lookup";
import { defaultsForCategory } from "@/lib/wizard/category-defaults";
import { QuickAddHotelDialog } from "@/components/QuickAddHotelDialog";
import type { StepProps } from "../shared";

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

          {activeCategory && overnightRouting.map((day, i) => {
            const cityName = d.cities.find((c) => c.id === day.city_id)?.name || day.to_city || "";
            const cityKey = cityName.trim().toLowerCase();
            const catKey = activeCategory.trim().toLowerCase();
            const sel = activeOption.selections.find((s) => s.city_id === day.city_id);
            const hotelCityName = (h: typeof d.hotels[number]) =>
              (d.cities.find((c) => c.id === h.city_id)?.name || "").trim().toLowerCase();
            const allCityHotels = cityKey
              ? d.hotels.filter((h) => hotelCityName(h) === cityKey)
              : [];
            const cityHotels = allCityHotels.filter(
              (h) => h.hotel_category.trim().toLowerCase() === catKey,
            );
            const noCategoryMatch = cityHotels.length === 0;
            const hotelPool = noCategoryMatch ? allCityHotels : cityHotels;
            const rooms = sel ? d.room_categories.filter((r) => r.hotel_id === sel.hotel_id) : [];
            const meals = sel?.room_id ? availableMealPlans(d.rate_plans, sel.room_id, day.date) : [];
            const rate = sel && sel.room_id ? findRate(sel.room_id, sel.meal_plan, day.date) : null;
            const selHotel = sel ? d.hotels.find((h) => h.id === sel.hotel_id) : null;

            const setSel = (patch: Partial<typeof sel> & object) => {
              const others = activeOption.selections.filter((s) => s.city_id !== day.city_id);
              const cur = sel || { city_id: day.city_id, hotel_id: "", room_id: "", meal_plan: "CP" as MealPlan };
              const merged = { ...cur, ...patch };
              // Recompute fallback flag whenever hotel changes
              if ("hotel_id" in patch) {
                const h = d.hotels.find((x) => x.id === merged.hotel_id);
                merged.is_fallback = !!h && h.hotel_category !== activeCategory;
              }
              updateOption(activeOption.key, { selections: [...others, merged] });
            };

            return (
              <Card key={i} className="p-3">
                <div className="text-sm font-semibold mb-2">Day {day.day} · {cityName} · {fmtDateShort(day.date)}</div>

                {noCategoryMatch && allCityHotels.length === 0 ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <div className="text-sm text-amber-800 mb-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" /> No hotels found in {cityName}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setQuickAdd({ cityId: day.city_id, cityName: cityName || "" })}>
                        <Plus className="h-3.5 w-3.5" /> Add Hotel for {cityName}
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href="/hotels" target="_blank" rel="noreferrer">Go to Hotels Module ↗</a>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {noCategoryMatch && (
                      <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 flex flex-wrap items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>No <b>{activeCategory}</b> hotels found in {cityName}. Select from available hotels below (showing all categories).</span>
                        <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => setQuickAdd({ cityId: day.city_id, cityName: cityName || "" })}>
                          <Plus className="h-3 w-3" /> Add New
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7" asChild>
                          <a href="/hotels" target="_blank" rel="noreferrer">Hotels ↗</a>
                        </Button>
                      </div>
                    )}
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <Label className="text-xs">Hotel</Label>
                        <Select value={sel?.hotel_id || ""} onValueChange={(v) => setSel({ hotel_id: v, room_id: "" })}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>
                            {hotelPool.map((h) => (
                              <SelectItem key={h.id} value={h.id}>
                                {h.name}{noCategoryMatch ? ` (${h.hotel_category})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Looking for {activeCategory} in {cityName || "—"} · {d.hotels.length} total, {cityHotels.length} matching ({allCityHotels.length} in city)
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Room</Label>
                        <Select value={sel?.room_id || ""} onValueChange={(v) => setSel({ room_id: v })} disabled={!sel?.hotel_id}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>
                            {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Meal Plan</Label>
                        <Select value={sel?.meal_plan || "CP"} onValueChange={(v) => setSel({ meal_plan: v as MealPlan })} disabled={!sel?.room_id || meals.length === 0}>
                          <SelectTrigger className="h-9"><SelectValue placeholder={meals.length === 0 ? "—" : "Select…"} /></SelectTrigger>
                          <SelectContent>
                            {(meals.length ? meals : MEAL_PLANS).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="text-xs pt-5 space-y-0.5">
                        {rate ? (
                          <span className="text-green-700">✓ {rate.season_label} · ₹{rate.double_rate}/dbl</span>
                        ) : sel?.room_id ? (
                          <span className="text-amber-600">⚠ No rate for these dates</span>
                        ) : null}
                        {sel?.is_fallback && selHotel && (
                          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[10px]">
                            ⚠ {selHotel.hotel_category} selected (differs from option)
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </Card>
            );
          })}

          {activeCategory && overnightRouting.length > 0 && activeOption.selections.some((s) => s.room_id) && (
            <>
              <PaxAllocator
                draft={draft}
                option={activeOption}
                onChange={(patch) => updateOption(activeOption.key, patch)}
              />
              <OptionCostPreview draft={draft} option={activeOption} />
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
            // auto-select the newly added hotel for this city day
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

// ------------------------------------------------------------
// Per-option Inclusions & Exclusions editor (Step 15).
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
// Live cost preview under each Option tab in Step 15.
// Read-only rooms-only (Net, GST, Net+GST) with per-day warnings.
// ------------------------------------------------------------
function OptionCostPreview({ draft, option }: { draft: QuoteDraft; option: HotelOption }) {
  const d = useDB();
  const [open, setOpen] = useState(true);
  const overnight = draft.routing.filter((r) => r.overnight && r.city_id);
  const gstFor = gstRateFor;

  let sglNet = 0, dblNet = 0, trpNet = 0;
  let sglGst = 0, dblGst = 0, trpGst = 0;
  const missingDays: { day: number; city: string }[] = [];

  overnight.forEach((day) => {
    const sel = option.selections.find((s) => s.city_id === day.city_id);
    const cityName = d.cities.find((c) => c.id === day.city_id)?.name || "—";
    if (!sel || !sel.room_id) return;
    const plan = findRatePlan(d.rate_plans, sel.room_id, sel.meal_plan, day.date);
    if (!plan) { missingDays.push({ day: day.day, city: cityName }); return; }
    const dbl = plan.double_rate;
    const sgl = plan.single_rate;
    const trp = dbl + plan.extra_bed_rate;
    sglNet += sgl; dblNet += dbl; trpNet += trp;
    sglGst += sgl * gstFor(sgl);
    dblGst += dbl * gstFor(dbl);
    trpGst += trp * gstFor(trp);
  });

  const sglTotal = sglNet + sglGst;
  const dblTotal = dblNet + dblGst;
  const trpTotal = trpNet + trpGst;

  return (
    <Card className="p-0 overflow-hidden border-primary/20" style={{ backgroundColor: "#F0F4F8" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
      >
        <div className="text-sm font-semibold text-primary">
          OPTION {option.key} · {option.category || "—"} — Cost Preview
        </div>
        <span className="text-xs text-primary/70">{open ? "▾ Collapse" : "▸ Expand"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left py-1.5 font-medium"></th>
                <th className="text-right py-1.5 font-medium">SGL</th>
                <th className="text-right py-1.5 font-medium">DBL</th>
                <th className="text-right py-1.5 font-medium">TRP</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1">Room Cost (Net)</td>
                <td className="text-right tabular-nums">{inr(sglNet)}</td>
                <td className="text-right tabular-nums">{inr(dblNet)}</td>
                <td className="text-right tabular-nums">{inr(trpNet)}</td>
              </tr>
              <tr>
                <td className="py-1">GST on Rooms</td>
                <td className="text-right tabular-nums">{inr(sglGst)}</td>
                <td className="text-right tabular-nums">{inr(dblGst)}</td>
                <td className="text-right tabular-nums">{inr(trpGst)}</td>
              </tr>
              <tr className="border-t font-semibold">
                <td className="py-1.5">Net with GST</td>
                <td className="text-right tabular-nums text-primary">{inr(sglTotal)}</td>
                <td className="text-right tabular-nums text-primary">{inr(dblTotal)}</td>
                <td className="text-right tabular-nums text-primary">{inr(trpTotal)}</td>
              </tr>
            </tbody>
          </table>
          {missingDays.length > 0 && (
            <div className="mt-3 space-y-1">
              {missingDays.map((m) => (
                <div key={m.day} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" /> Day {m.day} ({m.city}): No rate matched for selected dates
                </div>
              ))}
            </div>
          )}
          {option.selections.some((s) => s.is_fallback) && (
            <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Some hotels in this option belong to a different category than <b>{option.category}</b>.
            </div>
          )}
          <div className="mt-2 text-[11px] text-muted-foreground italic">
            Room costs only. Add-ons (transport, guide, activities) are applied in Step 16.
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================================
// Step 15 — Per-Person Room Allocation
// ============================================================
const PERSON_ROOM_TYPES: { value: PersonRoomType; label: string; shares: number }[] = [
  { value: "single", label: "Single Room", shares: 0 },
  { value: "double", label: "Double Sharing", shares: 1 },
  { value: "triple", label: "Triple Sharing", shares: 2 },
  { value: "extra_bed", label: "Extra Bed", shares: 0 },
  { value: "cwb", label: "Child With Bed", shares: 0 },
];

function PaxAllocator({
  draft, option, onChange,
}: {
  draft: QuoteDraft;
  option: HotelOption;
  onChange: (patch: Partial<HotelOption>) => void;
}) {
  const paxCount = Math.max(1, totalPax(draft));
  const enabled = !!option.use_custom_allocation;
  const allocs = normalizeAllocations(option.pax_allocations, paxCount);

  const setAllocs = (next: PersonAllocation[]) => onChange({ pax_allocations: next });

  const setRoomType = (person_id: number, type: PersonRoomType) => {
    // Clear existing sharing links when switching types
    const next = allocs.map((p) => {
      if (p.person_id === person_id) return { ...p, room_type: type, sharing_with: [] };
      // remove this person from other people's sharing_with, if this person moved out
      return { ...p, sharing_with: p.sharing_with.filter((id) => id !== person_id) };
    });
    setAllocs(next);
  };

  const togglePartner = (person_id: number, partner_id: number) => {
    const person = allocs.find((p) => p.person_id === person_id);
    if (!person) return;
    const maxShares = PERSON_ROOM_TYPES.find((r) => r.value === person.room_type)?.shares ?? 0;
    const has = person.sharing_with.includes(partner_id);
    let newList = has
      ? person.sharing_with.filter((id) => id !== partner_id)
      : [...person.sharing_with, partner_id];
    if (newList.length > maxShares) newList = newList.slice(-maxShares);

    // Mirror on partner: sync room_type + reciprocal sharing_with
    const next = allocs.map((p) => {
      if (p.person_id === person_id) return { ...p, sharing_with: newList };
      if (newList.includes(p.person_id)) {
        // ensure partner shares back and same type
        const withList = [person_id, ...newList.filter((id) => id !== p.person_id)];
        return { ...p, room_type: person.room_type, sharing_with: withList };
      }
      if (has && p.person_id === partner_id) {
        return { ...p, sharing_with: p.sharing_with.filter((id) => id !== person_id) };
      }
      return p;
    });
    setAllocs(next);
  };

  const setLabel = (person_id: number, label: string) => {
    setAllocs(allocs.map((p) => (p.person_id === person_id ? { ...p, label } : p)));
  };

  const applyPreset = (which: "single" | "double" | "one_rest") => {
    if (which === "single") setAllocs(presetAllSingle(paxCount));
    else if (which === "double") setAllocs(presetAllDouble(paxCount));
    else setAllocs(presetOneSingleRestDouble(paxCount));
  };

  return (
    <Card className="p-4 border-primary/20">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-primary">Per-Person Room Allocation</div>
          <div className="text-xs text-muted-foreground">
            Mix room types per traveller. Applies to Option {option.key} only.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Use custom allocation</span>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => {
              if (v && !option.pax_allocations?.length) {
                onChange({ use_custom_allocation: true, pax_allocations: defaultAllocations(paxCount) });
              } else {
                onChange({ use_custom_allocation: v });
              }
            }}
          />
        </div>
      </div>

      {enabled && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <Button size="sm" variant="outline" onClick={() => applyPreset("single")}>All Single</Button>
            <Button size="sm" variant="outline" onClick={() => applyPreset("double")}>All Double Sharing</Button>
            <Button size="sm" variant="outline" onClick={() => applyPreset("one_rest")}>1 Single + Rest Double</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left py-1.5 font-medium">Person</th>
                  <th className="text-left py-1.5 font-medium">Room Type</th>
                  <th className="text-left py-1.5 font-medium">Sharing With</th>
                </tr>
              </thead>
              <tbody>
                {allocs.map((p) => {
                  const rt = PERSON_ROOM_TYPES.find((r) => r.value === p.room_type)!;
                  const others = allocs.filter((o) => o.person_id !== p.person_id);
                  return (
                    <tr key={p.person_id} className="border-t">
                      <td className="py-1.5 pr-2 align-top">
                        <Input
                          className="h-8 text-sm"
                          value={p.label}
                          onChange={(e) => setLabel(p.person_id, e.target.value)}
                          placeholder={`Person ${p.person_id}`}
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <Select
                          value={p.room_type}
                          onValueChange={(v) => setRoomType(p.person_id, v as PersonRoomType)}
                        >
                          <SelectTrigger className="h-8 text-sm w-[180px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PERSON_ROOM_TYPES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1.5 align-top">
                        {rt.shares > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {others.map((o) => {
                              const active = p.sharing_with.includes(o.person_id);
                              return (
                                <button
                                  key={o.person_id}
                                  type="button"
                                  onClick={() => togglePartner(p.person_id, o.person_id)}
                                  className={`text-xs px-2 py-1 rounded border ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"}`}
                                >
                                  {o.label}
                                </button>
                              );
                            })}
                            {p.sharing_with.length < rt.shares && (
                              <span className="text-[11px] text-amber-700 self-center">
                                Choose {rt.shares - p.sharing_with.length} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------
// Live per-person cost preview (Step 15).
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



// ============================================================
// STEP 16 — Costing Variations
