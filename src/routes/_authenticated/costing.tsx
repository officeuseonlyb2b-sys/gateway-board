import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calculator, Printer, Save, RotateCcw, AlertTriangle, CheckCircle2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useDB, MEAL_PLANS, type MealPlan, type RatePlan } from "@/lib/mock-store";
import { quoteService } from "@/services/api";
import { useAuth } from "@/lib/auth-mock";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CategoryBadge } from "@/components/CategoryBadge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { inr, fmtDateShort, nightsBetween, todayISO, addDaysISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/costing")({
  head: () => ({ meta: [{ title: "Final Costing — MP Tourism Hub" }] }),
  component: CostingPage,
});

type Occupancy = "double" | "single";

function overlaps(startISO: string, endISO: string, month: number, day: number): boolean {
  if (!startISO || !endISO) return false;
  const s = new Date(startISO); const e = new Date(endISO);
  for (let y = s.getFullYear(); y <= e.getFullYear(); y++) {
    const d = new Date(Date.UTC(y, month - 1, day));
    if (+d >= +s && +d < +e) return true;
  }
  return false;
}

function CostingPage() {
  const data = useDB();
  const user = useAuth();

  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(addDaysISO(todayISO(), 2));
  const [cityId, setCityId] = useState<string>("");
  const [hotelId, setHotelId] = useState<string>("");
  const [roomId, setRoomId] = useState<string>("");
  const [meal, setMeal] = useState<MealPlan>("CP");
  const [numRooms, setNumRooms] = useState(1);
  const [occupancy, setOccupancy] = useState<Occupancy>("double");
  const [extraBeds, setExtraBeds] = useState(0);
  const [cwbCount, setCwbCount] = useState(0);
  const [adults, setAdults] = useState(2);
  const [addLunch, setAddLunch] = useState(false); const [lunchPax, setLunchPax] = useState(2);
  const [addDinner, setAddDinner] = useState(false); const [dinnerPax, setDinnerPax] = useState(2);
  const [addBkf, setAddBkf] = useState(false); const [bkfPax, setBkfPax] = useState(2);
  const [applyXmas, setApplyXmas] = useState(true);
  const [applyNy, setApplyNy] = useState(true);

  const nights = nightsBetween(checkIn, checkOut);

  const hotelsInCity = useMemo(
    () => data.hotels.filter((h) => !cityId || h.city_id === cityId),
    [data.hotels, cityId],
  );
  const hotel = useMemo(() => data.hotels.find((h) => h.id === hotelId), [data.hotels, hotelId]);
  const rooms = useMemo(
    () => data.room_categories.filter((r) => r.hotel_id === hotelId),
    [data.room_categories, hotelId],
  );

  // Auto rate lookup
  const ratePlan: RatePlan | null = useMemo(() => {
    if (!roomId || !checkIn) return null;
    const t = +new Date(checkIn);
    const matches = data.rate_plans.filter(
      (p) => p.room_category_id === roomId && p.meal_plan === meal &&
        +new Date(p.validity_start) <= t && +new Date(p.validity_end) >= t,
    );
    return matches[0] ?? null;
  }, [data.rate_plans, roomId, checkIn, meal]);

  const xmasEligible = ratePlan && overlaps(checkIn, checkOut, 12, 25);
  const nyEligible = ratePlan && overlaps(checkIn, checkOut, 12, 31);

  const breakdown = useMemo(() => {
    if (!ratePlan || nights <= 0 || numRooms <= 0) return null;
    const roomRate = occupancy === "double" ? ratePlan.double_rate : ratePlan.single_rate;
    const roomCost = roomRate * numRooms * nights;
    const extraBedCost = (ratePlan.extra_bed_rate ?? 0) * extraBeds * nights;
    const cwbCost = (ratePlan.cwb_rate ?? 0) * cwbCount * nights;

    const lunchCost = addLunch && ratePlan.lunch_rate ? ratePlan.lunch_rate * lunchPax * nights : 0;
    const dinnerCost = addDinner && ratePlan.dinner_rate ? ratePlan.dinner_rate * dinnerPax * nights : 0;
    const bkfCost = addBkf && ratePlan.extra_breakfast_rate ? ratePlan.extra_breakfast_rate * bkfPax * nights : 0;

    const xmasAmt = xmasEligible && applyXmas && ratePlan.xmas_supplement
      ? (ratePlan.xmas_supplement_type === "per_person"
          ? ratePlan.xmas_supplement * adults
          : ratePlan.xmas_supplement)
      : 0;
    const nyAmt = nyEligible && applyNy && ratePlan.newyear_supplement
      ? (ratePlan.newyear_supplement_type === "per_person"
          ? ratePlan.newyear_supplement * adults
          : ratePlan.newyear_supplement)
      : 0;

    const subtotal = roomCost + extraBedCost + cwbCost + lunchCost + dinnerCost + bkfCost + xmasAmt + nyAmt;
    // GST slab
    const gstRate = roomRate <= 7500 ? 0.05 : 0.18;
    const gstBase = roomCost + extraBedCost + cwbCost; // only room cost per spec
    const gstAmount = gstBase * gstRate;
    const grandTotal = subtotal + gstAmount;

    return {
      roomRate, roomCost, extraBedCost, cwbCost,
      lunchCost, dinnerCost, bkfCost, xmasAmt, nyAmt,
      subtotal, gstRate, gstAmount, grandTotal, gstBase,
    };
  }, [ratePlan, nights, numRooms, occupancy, extraBeds, cwbCount, addLunch, lunchPax, addDinner, dinnerPax, addBkf, bkfPax, xmasEligible, applyXmas, nyEligible, applyNy, adults]);

  function reset() {
    setCityId(""); setHotelId(""); setRoomId("");
    setMeal("CP"); setNumRooms(1); setOccupancy("double");
    setExtraBeds(0); setCwbCount(0); setAdults(2);
    setAddLunch(false); setAddDinner(false); setAddBkf(false);
    setApplyXmas(true); setApplyNy(true);
    setCheckIn(todayISO()); setCheckOut(addDaysISO(todayISO(), 2));
    toast.success("Reset.");
  }

  async function saveQuote() {
    if (!breakdown || !ratePlan || !hotel) return toast.error("Complete the selection first.");
    const room = rooms.find((r) => r.id === roomId)!;
    const city = data.cities.find((c) => c.id === hotel.city_id)!;
    await quoteService.create({
      hotel_id: hotel.id, room_category_id: roomId, rate_plan_id: ratePlan.id,
      check_in: checkIn, check_out: checkOut, nights, meal_plan: meal,
      num_rooms: numRooms, num_adults: adults, extra_beds: extraBeds, cwb_count: cwbCount,
      include_lunch: addLunch, include_dinner: addDinner, include_extra_breakfast: addBkf,
      xmas_applied: !!xmasEligible && applyXmas, newyear_applied: !!nyEligible && applyNy,
      subtotal: breakdown.subtotal, gst_rate: breakdown.gstRate, gst_amount: breakdown.gstAmount,
      grand_total: breakdown.grandTotal,
      generated_by: user?.id ?? "anon", generated_by_name: user?.name ?? "—",
      hotel_name_snapshot: hotel.name, room_name_snapshot: room.name, city_name_snapshot: city.name,
    });
    toast.success("Quote saved.");
  }

  function printQuote() { window.print(); }

  const recentQuotes = useMemo(
    () => [...data.quotes].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 5),
    [data.quotes],
  );

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="print:hidden">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calculator className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Final Costing</h1>
            <p className="text-sm text-muted-foreground">Build itemized quotes with automatic GST and festive supplements.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 print:block">
        {/* Selection panel */}
        <Card className="p-6 xl:col-span-2 space-y-5 print:hidden">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            <span className="h-5 w-5 rounded bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">1</span>
            Selection
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Check-in Date"><Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></Field>
            <Field label="Check-out Date"><Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></Field>
          </div>
          <div className="text-xs text-muted-foreground -mt-2">{nights} night{nights === 1 ? "" : "s"}</div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="City">
              <Select value={cityId} onValueChange={(v) => { setCityId(v); setHotelId(""); setRoomId(""); }}>
                <SelectTrigger><SelectValue placeholder="Choose city" /></SelectTrigger>
                <SelectContent>
                  {data.cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Hotel">
              <Select value={hotelId} onValueChange={(v) => { setHotelId(v); setRoomId(""); }} disabled={!cityId && hotelsInCity.length === 0}>
                <SelectTrigger><SelectValue placeholder="Choose hotel" /></SelectTrigger>
                <SelectContent>
                  {hotelsInCity.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {hotel && (
            <div className="flex items-center gap-2 -mt-2 text-xs text-muted-foreground">
              <span>Category:</span> <CategoryBadge category={hotel.hotel_category} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Room Category">
              <Select value={roomId} onValueChange={setRoomId} disabled={!hotelId}>
                <SelectTrigger><SelectValue placeholder="Choose room" /></SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Meal Plan">
              <Select value={meal} onValueChange={(v) => setMeal(v as MealPlan)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MEAL_PLANS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          {/* Rate match indicator */}
          {roomId && (
            <div className={`rounded-md border p-3 text-xs ${ratePlan ? "border-emerald-200 bg-emerald-50/60 text-emerald-800" : "border-amber-200 bg-amber-50/60 text-amber-800"}`}>
              {ratePlan ? (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    Rate matched: <strong>{ratePlan.season_label}</strong>{" "}
                    <span className="opacity-80">({fmtDateShort(ratePlan.validity_start)} → {fmtDateShort(ratePlan.validity_end)})</span>
                    <div className="mt-0.5 opacity-80">Double {inr(ratePlan.double_rate)} · Single {inr(ratePlan.single_rate)} · Extra bed {inr(ratePlan.extra_bed_rate)}</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>No rate plan available for {meal} on {fmtDateShort(checkIn)}. Try a different meal plan or date.</div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Number of Rooms"><Input type="number" min={1} value={numRooms} onChange={(e) => setNumRooms(Math.max(1, +e.target.value || 1))} /></Field>
            <Field label="Occupancy per Room">
              <Select value={occupancy} onValueChange={(v) => setOccupancy(v as Occupancy)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="double">Double</SelectItem>
                  <SelectItem value="single">Single</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Adults (total)"><Input type="number" min={0} value={adults} onChange={(e) => setAdults(Math.max(0, +e.target.value || 0))} /></Field>
            <Field label="Extra Beds"><Input type="number" min={0} value={extraBeds} onChange={(e) => setExtraBeds(Math.max(0, +e.target.value || 0))} /></Field>
            <Field label="CWB (Child w/ Bed)"><Input type="number" min={0} value={cwbCount} onChange={(e) => setCwbCount(Math.max(0, +e.target.value || 0))} /></Field>
          </div>

          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Additional Meals</div>
            <MealAdd label="Include Lunch" enabled={addLunch} setEnabled={setAddLunch} pax={lunchPax} setPax={setLunchPax} />
            <MealAdd label="Include Dinner" enabled={addDinner} setEnabled={setAddDinner} pax={dinnerPax} setPax={setDinnerPax} />
            <MealAdd label="Include Extra Breakfast" enabled={addBkf} setEnabled={setAddBkf} pax={bkfPax} setPax={setBkfPax} />
            {(meal === "AP" || meal === "MAP") && (addLunch || addDinner) && (
              <p className="text-[11px] text-muted-foreground italic pt-1">Note: Some meals are already included in {meal} plan.</p>
            )}
          </div>

          {(xmasEligible || nyEligible) && (
            <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-800 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Festive Supplements Detected
              </div>
              {xmasEligible && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={applyXmas} onCheckedChange={(v) => setApplyXmas(!!v)} />
                  Apply X'mas supplement ({inr(ratePlan!.xmas_supplement ?? 0)} {ratePlan!.xmas_supplement_type === "per_person" ? "per person" : "fixed"})
                </label>
              )}
              {nyEligible && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={applyNy} onCheckedChange={(v) => setApplyNy(!!v)} />
                  Apply N'Year supplement ({inr(ratePlan!.newyear_supplement ?? 0)} {ratePlan!.newyear_supplement_type === "per_person" ? "per person" : "fixed"})
                </label>
              )}
            </div>
          )}
        </Card>

        {/* Breakdown panel */}
        <div className="xl:col-span-3 space-y-4 print:col-span-full">
          <Card className="p-6 print:shadow-none print:border-0" id="quote-print">
            <div className="hidden print:block mb-6 pb-4 border-b-2 border-primary">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-gold flex items-center justify-center">
                  <span className="font-bold text-gold-foreground">MP</span>
                </div>
                <div>
                  <div className="font-bold text-lg">MP Tourism</div>
                  <div className="text-xs text-muted-foreground">Operations Hub — Costing Quote</div>
                </div>
                <div className="ml-auto text-xs text-muted-foreground">Generated {fmtDateShort(new Date().toISOString())}</div>
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 mb-4 print:hidden">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                <span className="h-5 w-5 rounded bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">2</span>
                Cost Breakdown
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={reset}><RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset</Button>
                <Button variant="outline" size="sm" onClick={printQuote} disabled={!breakdown}><Printer className="h-3.5 w-3.5 mr-1.5" /> Generate Quote</Button>
                <Button size="sm" onClick={saveQuote} disabled={!breakdown}><Save className="h-3.5 w-3.5 mr-1.5" /> Save Quote</Button>
              </div>
            </div>

            {!hotel || !ratePlan || !breakdown ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <Calculator className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                Complete the selection panel to see the cost breakdown.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md bg-muted/40 p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><div className="text-xs text-muted-foreground">Hotel</div><div className="font-semibold">{hotel.name}</div></div>
                  <div><div className="text-xs text-muted-foreground">City</div><div className="font-semibold">{data.cities.find((c) => c.id === hotel.city_id)?.name}</div></div>
                  <div><div className="text-xs text-muted-foreground">Check-in / out</div><div className="font-semibold">{fmtDateShort(checkIn)} → {fmtDateShort(checkOut)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Nights / Rooms / Plan</div><div className="font-semibold">{nights} · {numRooms} · {meal}</div></div>
                </div>

                <Section title="Room Cost">
                  <Line label={`Base Room (${occupancy === "double" ? "Double" : "Single"}) ${inr(breakdown.roomRate)} × ${numRooms} × ${nights} nights`} amount={breakdown.roomCost} />
                  {extraBeds > 0 && <Line label={`Extra Bed ${inr(ratePlan.extra_bed_rate ?? 0)} × ${extraBeds} × ${nights}`} amount={breakdown.extraBedCost} />}
                  {cwbCount > 0 && (
                    ratePlan.cwb_rate
                      ? <Line label={`CWB ${inr(ratePlan.cwb_rate)} × ${cwbCount} × ${nights}`} amount={breakdown.cwbCost} />
                      : <Line label={`CWB (rule): ${ratePlan.cwb_rule_text ?? "—"}`} amount={0} muted />
                  )}
                </Section>

                {(breakdown.lunchCost || breakdown.dinnerCost || breakdown.bkfCost) ? (
                  <Section title="Additional Meals">
                    {(meal === "AP" || meal === "MAP") && (
                      <div className="text-xs italic text-muted-foreground pb-1">Note: primary meals already included in {meal}.</div>
                    )}
                    {breakdown.lunchCost > 0 && <Line label={`Lunch ${inr(ratePlan.lunch_rate!)} × ${lunchPax} × ${nights}`} amount={breakdown.lunchCost} />}
                    {breakdown.dinnerCost > 0 && <Line label={`Dinner ${inr(ratePlan.dinner_rate!)} × ${dinnerPax} × ${nights}`} amount={breakdown.dinnerCost} />}
                    {breakdown.bkfCost > 0 && <Line label={`Extra Breakfast ${inr(ratePlan.extra_breakfast_rate!)} × ${bkfPax} × ${nights}`} amount={breakdown.bkfCost} />}
                  </Section>
                ) : null}

                {(breakdown.xmasAmt || breakdown.nyAmt) ? (
                  <Section title="Festive Supplements">
                    {breakdown.xmasAmt > 0 && <Line label={`X'mas Supplement (${ratePlan.xmas_supplement_type === "per_person" ? `${inr(ratePlan.xmas_supplement!)} × ${adults} pax` : "fixed"})`} amount={breakdown.xmasAmt} />}
                    {breakdown.nyAmt > 0 && <Line label={`N'Year Supplement (${ratePlan.newyear_supplement_type === "per_person" ? `${inr(ratePlan.newyear_supplement!)} × ${adults} pax` : "fixed"})`} amount={breakdown.nyAmt} />}
                  </Section>
                ) : null}

                <div className="flex justify-between items-center pt-3 border-t border-border text-sm">
                  <span className="font-semibold">Sub-Total (before GST)</span>
                  <span className="font-semibold tabular-nums">{inr(breakdown.subtotal)}</span>
                </div>

                <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">GST @ {(breakdown.gstRate * 100).toFixed(0)}%</div>
                      <div className="text-xs text-muted-foreground">Room rate {inr(breakdown.roomRate)}/night → {breakdown.gstRate === 0.05 ? "5% (≤ ₹7,500)" : "18% (> ₹7,500)"} applied on room cost {inr(breakdown.gstBase)}</div>
                    </div>
                    <div className="tabular-nums font-semibold">{inr(breakdown.gstAmount)}</div>
                  </div>
                </div>

                <div className="rounded-lg bg-primary text-primary-foreground p-5 flex items-center justify-between">
                  <div className="font-bold text-lg">GRAND TOTAL</div>
                  <div className="font-bold text-2xl tabular-nums text-gold">{inr(breakdown.grandTotal)}</div>
                </div>

                <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                  Rates valid as per <strong>{ratePlan.season_label}</strong> · {fmtDateShort(ratePlan.validity_start)} → {fmtDateShort(ratePlan.validity_end)}.
                  {ratePlan.remarks && <span> · Remarks: {ratePlan.remarks}</span>}
                </div>
                <div className="hidden print:block text-center text-xs text-muted-foreground pt-4 border-t border-border mt-4">
                  MP Tourism Operations Hub · Internal use only
                </div>
              </div>
            )}
          </Card>

          {/* Recent quotes */}
          <Card className="p-5 print:hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm">Recent Quotes</div>
              <Badge variant="secondary" className="text-[10px]">Last 5</Badge>
            </div>
            {recentQuotes.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No quotes saved yet.</div>
            ) : (
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                      <th className="font-medium py-2 pr-3">Hotel</th>
                      <th className="font-medium py-2 pr-3">Dates</th>
                      <th className="font-medium py-2 pr-3">Rooms · Plan</th>
                      <th className="font-medium py-2 pr-3 text-right">Total</th>
                      <th className="font-medium py-2 pr-3">By</th>
                      <th className="font-medium py-2 pr-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentQuotes.map((q) => (
                      <tr key={q.id} className="hover:bg-muted/40">
                        <td className="py-2 pr-3">
                          <div className="font-medium">{q.hotel_name_snapshot}</div>
                          <div className="text-xs text-muted-foreground">{q.city_name_snapshot} · {q.room_name_snapshot}</div>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDateShort(q.check_in)} → {fmtDateShort(q.check_out)}</td>
                        <td className="py-2 pr-3 text-xs">{q.num_rooms} rm · {q.meal_plan}</td>
                        <td className="py-2 pr-3 text-right font-semibold tabular-nums">{inr(q.grand_total)}</td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{q.generated_by_name}</td>
                        <td className="py-2 pr-3">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={async () => { await quoteService.remove(q.id); toast.success("Quote removed."); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function MealAdd({ label, enabled, setEnabled, pax, setPax }:
  { label: string; enabled: boolean; setEnabled: (v: boolean) => void; pax: number; setPax: (n: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-sm flex-1">
        <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(!!v)} /> {label}
      </label>
      {enabled && (
        <Input
          type="number" min={1} value={pax}
          onChange={(e) => setPax(Math.max(1, +e.target.value || 1))}
          className="w-20 h-8"
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-1">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Line({ label, amount, muted }: { label: string; amount: number; muted?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${muted ? "text-muted-foreground italic" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{inr(amount)}</span>
    </div>
  );
}
