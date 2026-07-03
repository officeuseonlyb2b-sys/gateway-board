import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Calculator, Printer, Save, RotateCcw, AlertTriangle, Plus, Trash2, X, ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  useDB, db, MEAL_PLANS, type MealPlan, type RatePlan,
} from "@/lib/mock-store";
import { useAuth } from "@/lib/auth-mock";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CategoryBadge } from "@/components/CategoryBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr, fmtDateShort, addDaysISO, todayISO } from "@/lib/format";
import { QuoteViewerDialog } from "@/components/QuoteViewerDialog";
import { nextQuoteNumber, saveQuote as persistQuote, type SavedQuote, type SavedAddons } from "@/lib/quotes-store";
import { buildAddonGroups } from "@/lib/addon-breakdown";


export const Route = createFileRoute("/_authenticated/costing")({
  head: () => ({ meta: [{ title: "Final Costing — MP Tourism Hub" }] }),
  component: CostingPage,
});

// ============================================================
// Types
// ============================================================
interface ItineraryDay {
  id: string;
  date: string;          // ISO
  city_id: string;
  hotel_id: string;
  room_id: string;
  meal_plan: MealPlan;
  add_lunch_pax: number;    // 0 = off
  add_dinner_pax: number;   // 0 = off
}

interface TravelLine { id: string; travel_id: string; days: number; vehicles: number; }
interface MiscLine { id: string; item_id: string; pax: number; days: number; }
interface GuideLine { id: string; guide_id: string; days: number; guides: number; }
interface EntranceLine { id: string; site_id: string; indian_pax: number; foreign_pax: number; }
interface ActivityLine { id: string; activity_id: string; pax: number; vehicles: number; }


interface DayOccupancyCosts {
  net: number;        // net rate before GST
  gstRate: number;    // 0.05 or 0.18
  gstAmt: number;
  gross: number;      // net + gst
  perPersonRate: number;
  available: boolean;
}
interface DayCosts {
  single: DayOccupancyCosts;
  double: DayOccupancyCosts;
  triple: DayOccupancyCosts;
  lunchTotal: number;
  dinnerTotal: number;
  ratePlan: RatePlan | null;
}
type OccKey = "single" | "double" | "triple";
const OCC_LABEL: Record<OccKey, string> = { single: "Single", double: "Double", triple: "Triple" };

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

// ============================================================
// GST slab
// ============================================================
function gstRateFor(perPersonRate: number): number {
  return perPersonRate <= 7500 ? 0.05 : 0.18;
}

function computeDay(
  day: ItineraryDay,
  ratePlans: RatePlan[],
): DayCosts {
  const t = +new Date(day.date);
  const rp = ratePlans.find(
    (p) => p.room_category_id === day.room_id && p.meal_plan === day.meal_plan &&
      +new Date(p.validity_start) <= t && +new Date(p.validity_end) >= t,
  ) ?? null;

  const zero = (): DayOccupancyCosts => ({
    net: 0, gstRate: 0, gstAmt: 0, gross: 0, perPersonRate: 0, available: false,
  });

  const build = (net: number, per: number): DayOccupancyCosts => {
    const gstRate = gstRateFor(per);
    const gstAmt = net * gstRate;
    return { net, gstRate, gstAmt, gross: net + gstAmt, perPersonRate: per, available: true };
  };

  if (!rp) {
    return {
      single: zero(), double: zero(), triple: zero(),
      lunchTotal: 0, dinnerTotal: 0, ratePlan: null,
    };
  }

  // GST slab is on the ROOM TARIFF (not per-person). Pass full room rate.
  const single = build(rp.single_rate, rp.single_rate);
  const double = build(rp.double_rate, rp.double_rate);
  const triNet = rp.double_rate + (rp.extra_bed_rate ?? 0);
  const triple = build(triNet, triNet);

  const lunchTotal = (rp.lunch_rate ?? 0) * (day.add_lunch_pax || 0);
  const dinnerTotal = (rp.dinner_rate ?? 0) * (day.add_dinner_pax || 0);

  return { single, double, triple, lunchTotal, dinnerTotal, ratePlan: rp };
}

// ============================================================
// Component
// ============================================================
function CostingPage() {
  const data = useDB();
  const user = useAuth();

  // --- itinerary ---
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [markupPct, setMarkupPct] = useState<number>(10);
  const [markupGstPct] = useState<number>(5);
  const [includedOcc, setIncludedOcc] = useState<Record<OccKey, boolean>>({
    single: true, double: true, triple: false,
  });

  // --- add-ons ---
  const [travels, setTravels] = useState<TravelLine[]>([]);
  const [miscs, setMiscs] = useState<MiscLine[]>([]);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const [entrances, setEntrances] = useState<EntranceLine[]>([]);
  const [activities, setActivities] = useState<ActivityLine[]>([]);

  // pax counts feeding misc "per_person" & default add-on quantities
  const [totalPax, setTotalPax] = useState<number>(2);

  // ---------------- helpers ----------------
  function addDay() {
    const last = days[days.length - 1];
    const date = last ? addDaysISO(last.date, 1) : todayISO();
    setDays((prev) => [...prev, {
      id: uid(),
      date,
      city_id: last?.city_id ?? "",
      hotel_id: last?.hotel_id ?? "",
      room_id: last?.room_id ?? "",
      meal_plan: last?.meal_plan ?? "CP",
      add_lunch_pax: 0, add_dinner_pax: 0,
    }]);
  }
  function patchDay(id: string, patch: Partial<ItineraryDay>) {
    setDays((prev) => prev.map((d) => d.id === id ? { ...d, ...patch } : d));
  }
  function removeDay(id: string) {
    setDays((prev) => prev.filter((d) => d.id !== id));
  }

  function reset() {
    setDays([]); setTravels([]); setMiscs([]); setGuides([]); setEntrances([]); setActivities([]);
    setMarkupPct(10); setIncludedOcc({ single: true, double: true, triple: false });
    setTotalPax(2);
    toast.success("Reset.");
  }

  // ---------------- per-day computation ----------------
  const dayCosts = useMemo(
    () => days.map((d) => ({ day: d, costs: computeDay(d, data.rate_plans) })),
    [days, data.rate_plans],
  );

  const nights = days.length;

  // ---------------- room totals per occupancy ----------------
  const roomTotals = useMemo(() => {
    const initial = { single: 0, double: 0, triple: 0 };
    const netWithGst = { ...initial };
    const netOnly = { ...initial };
    const gstOnly = { ...initial };
    let lunchTotal = 0, dinnerTotal = 0;
    dayCosts.forEach(({ costs }) => {
      (["single", "double", "triple"] as OccKey[]).forEach((k) => {
        netWithGst[k] += costs[k].gross;
        netOnly[k] += costs[k].net;
        gstOnly[k] += costs[k].gstAmt;
      });
      lunchTotal += costs.lunchTotal;
      dinnerTotal += costs.dinnerTotal;
    });
    return { netWithGst, netOnly, gstOnly, lunchTotal, dinnerTotal };
  }, [dayCosts]);

  // ---------------- add-on totals ----------------
  const addonBreakdown = useMemo(() => {
    const travelTotal = travels.reduce((s, t) => {
      const opt = data.travel_options.find((x) => x.id === t.travel_id);
      if (!opt) return s;
      return s + opt.rate_per_day * (t.days || 0) * Math.max(1, t.vehicles || 1);
    }, 0);
    const miscTotal = miscs.reduce((s, m) => {
      const item = data.miscellaneous_items.find((x) => x.id === m.item_id);
      if (!item) return s;
      if (item.unit === "per_person") return s + item.rate * (m.pax || 0) * Math.max(1, m.days || 1);
      if (item.unit === "per_day") return s + item.rate * (m.days || 0);
      return s + item.rate;
    }, 0);
    const guideTotal = guides.reduce((s, g) => {
      const gd = data.guides.find((x) => x.id === g.guide_id);
      if (!gd) return s;
      return s + gd.rate_per_day * (g.days || 0) * Math.max(1, g.guides || 1);
    }, 0);
    const entranceTotal = entrances.reduce((s, e) => {
      const site = data.entrance_sites.find((x) => x.id === e.site_id);
      if (!site) return s;
      return s + site.indian_rate * (e.indian_pax || 0) + site.foreigner_rate * (e.foreign_pax || 0);
    }, 0);
    const activityTotal = activities.reduce((s, a) => {
      const act = data.activities.find((x) => x.id === a.activity_id);
      if (!act) return s;
      if (act.pricing_type === "per_person") return s + act.price * Math.max(1, a.pax || 1);
      if (act.pricing_type === "per_vehicle") return s + act.price * Math.max(1, a.vehicles || 1);
      return s + act.price; // total_fixed
    }, 0);
    return {
      travelTotal, miscTotal, guideTotal, entranceTotal, activityTotal,
      total: travelTotal + miscTotal + guideTotal + entranceTotal + activityTotal,
    };
  }, [travels, miscs, guides, entrances, activities, data]);

  // ---------------- final totals per occupancy ----------------
  // Markup = (Net+GST + Add-Ons) × markup%
  // Sub-Total-before-GST = Net+GST + Add-Ons + Markup
  // Final GST 5% = Sub-Total-before-GST × 5%
  // GRAND TOTAL = Sub-Total-before-GST + Final GST 5%
  const finalTotals = useMemo(() => {
    const out: Record<OccKey, {
      netWithGst: number; addons: number; subTotal: number;
      markup: number; markupGst: number; grand: number;
    }> = { single: {} as any, double: {} as any, triple: {} as any };
    (["single", "double", "triple"] as OccKey[]).forEach((k) => {
      const netWithGst = roomTotals.netWithGst[k];
      const addons = addonBreakdown.total;
      const base = netWithGst + addons;
      const markup = base * (markupPct / 100);
      const subTotal = base + markup;
      const markupGst = subTotal * (markupGstPct / 100); // Final GST on combined total
      out[k] = {
        netWithGst, addons, subTotal, markup, markupGst,
        grand: subTotal + markupGst,
      };
    });
    return out;
  }, [roomTotals, markupPct, markupGstPct, addonBreakdown.total]);


  // ---------------- meal counts for inclusions ----------------
  const mealCounts = useMemo(() => {
    let breakfast = 0, lunch = 0, dinner = 0;
    days.forEach((d) => {
      const mp = d.meal_plan;
      if (mp === "CP" || mp === "MAP" || mp === "AP") breakfast += 1;
      if (mp === "MAP") { if (d.add_lunch_pax > 0) lunch += 1; else dinner += 1; }
      if (mp === "AP") { lunch += 1; dinner += 1; }
      if (d.add_lunch_pax > 0 && mp !== "AP" && mp !== "MAP") lunch += 1;
      if (d.add_dinner_pax > 0 && mp !== "AP") dinner += 1;
    });
    return { breakfast, lunch, dinner };
  }, [days]);

  // ---------------- viewer state ----------------
  const [viewingQuote, setViewingQuote] = useState<SavedQuote | null>(null);

  // Build the full SavedQuote object from current state.
  function buildSavedQuote(): SavedQuote | null {
    if (!days.length) { toast.error("Add at least one day."); return null; }
    const cityNames = Array.from(new Set(days.map((d) => {
      const c = data.cities.find((x) => x.id === d.city_id); return c?.name;
    }).filter(Boolean) as string[]));
    const tourTitle = cityNames.length ? `${cityNames.join(" - ")} Tour` : "Tour";

    const itinerary = dayCosts.map(({ day, costs }, idx) => {
      const city = data.cities.find((c) => c.id === day.city_id);
      const hotel = data.hotels.find((h) => h.id === day.hotel_id);
      const room = data.room_categories.find((r) => r.id === day.room_id);
      const rp = costs.ratePlan;
      return {
        day_number: idx + 1,
        date: day.date,
        city: city?.name ?? "—",
        hotel_name: hotel?.name ?? "—",
        hotel_category: hotel?.hotel_category ?? "",
        room_category: room?.name ?? "—",
        meal_plan: day.meal_plan,
        season_label: rp?.season_label ?? "—",
        validity_start: rp?.validity_start ?? "",
        validity_end: rp?.validity_end ?? "",
        rates: {
          sgl_net: costs.single.net, sgl_gst_rate: Math.round(costs.single.gstRate * 100),
          sgl_gst_amt: costs.single.gstAmt, sgl_total: costs.single.gross,
          dbl_net: costs.double.net, dbl_gst_rate: Math.round(costs.double.gstRate * 100),
          dbl_gst_amt: costs.double.gstAmt, dbl_total: costs.double.gross,
          trp_net: costs.triple.net, trp_gst_rate: Math.round(costs.triple.gstRate * 100),
          trp_gst_amt: costs.triple.gstAmt, trp_total: costs.triple.gross,
        },
        lunch_rate: rp?.lunch_rate ?? 0,
        dinner_rate: rp?.dinner_rate ?? 0,
      };
    });

    const addons = {
      travels: travels.map((t) => {
        const opt = data.travel_options.find((x) => x.id === t.travel_id);
        return {
          name: opt?.vehicle_type ?? "—", days: t.days, vehicles: t.vehicles,
          rate_per_day: opt?.rate_per_day ?? 0,
          total: (opt?.rate_per_day ?? 0) * (t.days || 0) * Math.max(1, t.vehicles || 1),
        };
      }),
      miscellaneous: miscs.map((m) => {
        const it = data.miscellaneous_items.find((x) => x.id === m.item_id);
        const total = !it ? 0
          : it.unit === "per_person" ? it.rate * (m.pax || 0) * Math.max(1, m.days || 1)
          : it.unit === "per_day" ? it.rate * (m.days || 0)
          : it.rate;
        return { name: it?.name ?? "—", pax: m.pax, rate: it?.rate ?? 0, unit: it?.unit ?? "fixed", total };
      }),
      guide: guides.map((g) => {
        const gd = data.guides.find((x) => x.id === g.guide_id);
        return {
          name: gd?.name ?? "—", type: gd?.guide_type ?? "",
          days: g.days, count: g.guides, rate_per_day: gd?.rate_per_day ?? 0,
          total: (gd?.rate_per_day ?? 0) * (g.days || 0) * Math.max(1, g.guides || 1),
        };
      }),
      entrances: entrances.map((e) => {
        const site = data.entrance_sites.find((x) => x.id === e.site_id);
        const city = data.entrance_cities.find((c) => c.id === site?.city_id);
        return {
          site_name: site?.site_name ?? "—", city: city?.name ?? "",
          indian_pax: e.indian_pax, indian_rate: site?.indian_rate ?? 0,
          foreigner_pax: e.foreign_pax, foreigner_rate: site?.foreigner_rate ?? 0,
          total: (site?.indian_rate ?? 0) * (e.indian_pax || 0) + (site?.foreigner_rate ?? 0) * (e.foreign_pax || 0),
        };
      }),
      activities: activities.map((a) => {
        const act = data.activities.find((x) => x.id === a.activity_id);
        const dest = data.activity_destinations.find((d) => d.id === act?.destination_id);
        const total = !act ? 0
          : act.pricing_type === "per_person" ? act.price * Math.max(1, a.pax || 1)
          : act.pricing_type === "per_vehicle" ? act.price * Math.max(1, a.vehicles || 1)
          : act.price;
        const qty = !act ? 0 : act.pricing_type === "per_vehicle" ? a.vehicles : a.pax;
        return {
          name: act?.activity_name ?? "—", destination: dest?.name ?? "",
          pricing_type: act?.pricing_type ?? "total_fixed",
          qty, rate: act?.price ?? 0, total,
        };
      }),
      addons_total: addonBreakdown.total,
    };

    const lastDay = days[days.length - 1];
    const q: SavedQuote = {
      id: uid(),
      quote_number: nextQuoteNumber(),
      saved_at: new Date().toISOString(),
      saved_by: user?.name ?? "—",
      tour_title: tourTitle,
      cities: cityNames,
      total_nights: days.length,
      travel_start: days[0].date,
      travel_end: addDaysISO(lastDay.date, 1),
      itinerary,
      addons,
      inclusions: {
        accommodation_nights: days.length,
        breakfast_count: mealCounts.breakfast,
        lunch_count: mealCounts.lunch,
        dinner_count: mealCounts.dinner,
        travels_included: addonBreakdown.travelTotal > 0,
        guide_included: addonBreakdown.guideTotal > 0,
      },
      markup_percent: markupPct,
      totals: {
        room_net_sgl: roomTotals.netOnly.single, room_net_dbl: roomTotals.netOnly.double, room_net_trp: roomTotals.netOnly.triple,
        gst_rooms_sgl: roomTotals.gstOnly.single, gst_rooms_dbl: roomTotals.gstOnly.double, gst_rooms_trp: roomTotals.gstOnly.triple,
        addons_total: addonBreakdown.total,
        markup_sgl: finalTotals.single.markup, markup_dbl: finalTotals.double.markup, markup_trp: finalTotals.triple.markup,
        gst_markup_sgl: finalTotals.single.markupGst, gst_markup_dbl: finalTotals.double.markupGst, gst_markup_trp: finalTotals.triple.markupGst,
        grand_sgl: finalTotals.single.grand, grand_dbl: finalTotals.double.grand, grand_trp: finalTotals.triple.grand,
      },
      include_sgl: includedOcc.single, include_dbl: includedOcc.double, include_trp: includedOcc.triple,
    };
    return q;
  }

  // Save Quote — persist to storage (both full + summary).
  function saveQuote() {
    const q = buildSavedQuote();
    if (!q) return;
    persistQuote(q);
    // Also add lightweight summary for existing Recent Quotes list.
    const firstDay = days[0];
    const hotel = data.hotels.find((h) => h.id === firstDay.hotel_id);
    const room = data.room_categories.find((r) => r.id === firstDay.room_id);
    const city = data.cities.find((c) => c.id === firstDay.city_id);
    const anyOcc = (["single", "double", "triple"] as OccKey[]).find((k) => includedOcc[k]) ?? "double";
    db.addQuote({
      hotel_id: firstDay.hotel_id, room_category_id: firstDay.room_id, rate_plan_id: null,
      check_in: firstDay.date, check_out: q.travel_end,
      nights: days.length, meal_plan: firstDay.meal_plan,
      num_rooms: 1, num_adults: totalPax, extra_beds: 0, cwb_count: 0,
      include_lunch: days.some((d) => d.add_lunch_pax > 0),
      include_dinner: days.some((d) => d.add_dinner_pax > 0),
      include_extra_breakfast: false,
      xmas_applied: false, newyear_applied: false,
      subtotal: finalTotals[anyOcc].netWithGst, gst_rate: 0, gst_amount: 0,
      grand_total: finalTotals[anyOcc].grand,
      generated_by: user?.id ?? "anon", generated_by_name: user?.name ?? "—",
      hotel_name_snapshot: hotel?.name ?? "—",
      room_name_snapshot: room?.name ?? "—",
      city_name_snapshot: city?.name ?? "—",
    });
    toast.success(`Quote ${q.quote_number} saved.`);
    return q;
  }

  // Generate Quote — save + open preview modal.
  function generateQuote() {
    const q = saveQuote();
    if (q) setViewingQuote(q);
  }


  const recentQuotes = useMemo(
    () => [...data.quotes].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 5),
    [data.quotes],
  );

  const hasAnyMissing = dayCosts.some(({ costs }) => !costs.ratePlan && dayCosts.length > 0);

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="p-6 lg:p-8 max-w-[1700px] mx-auto">
      <div className="print:hidden mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calculator className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Final Costing</h1>
            <p className="text-sm text-muted-foreground">Multi-day, multi-city tour costing with automatic GST, markup, and add-ons.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset}><RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset</Button>
          <Button variant="outline" size="sm" onClick={generateQuote} disabled={!days.length}><Printer className="h-3.5 w-3.5 mr-1.5" /> Generate Quote</Button>
          <Button size="sm" onClick={saveQuote} disabled={!days.length}><Save className="h-3.5 w-3.5 mr-1.5" /> Save Quote</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 print:block">
        {/* ============= LEFT: Itinerary + Add-Ons ============= */}
        <div className="xl:col-span-2 space-y-6">
          {/* Itinerary */}
          <Card className="p-5 print:shadow-none print:border-0" id="quote-print">
            <div className="hidden print:block mb-4 pb-3 border-b-2 border-primary">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gold flex items-center justify-center">
                  <span className="font-bold text-gold-foreground">MP</span>
                </div>
                <div>
                  <div className="font-bold text-lg">MP Tourism Operations Hub</div>
                  <div className="text-xs text-muted-foreground">Tour Cost Estimate</div>
                </div>
                <div className="ml-auto text-xs text-muted-foreground">
                  Generated {fmtDateShort(new Date().toISOString())}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Itinerary</h2>
              <Button size="sm" onClick={addDay} className="print:hidden">
                <Plus className="h-4 w-4 mr-1.5" /> Add Day
              </Button>
            </div>

            {days.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground border border-dashed rounded-md">
                <Calculator className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                Start by adding your first day.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-[11px] uppercase text-muted-foreground border-b">
                      <th className="text-left py-2 pr-2">#</th>
                      <th className="text-left py-2 pr-2">Date</th>
                      <th className="text-left py-2 pr-2">City</th>
                      <th className="text-left py-2 pr-2">Hotel</th>
                      <th className="text-left py-2 pr-2">Room</th>
                      <th className="text-left py-2 pr-2">Meal</th>
                      <th className="text-right py-2 pr-2">SGL</th>
                      <th className="text-right py-2 pr-2">DBL</th>
                      <th className="text-right py-2 pr-2">TRP</th>
                      <th className="print:hidden w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayCosts.map(({ day, costs }, idx) => {
                      const hotelsInCity = data.hotels.filter((h) => !day.city_id || h.city_id === day.city_id);
                      const rooms = data.room_categories.filter((r) => r.hotel_id === day.hotel_id);
                      const hotel = data.hotels.find((h) => h.id === day.hotel_id);
                      const missing = !costs.ratePlan && !!day.room_id;
                      return (
                        <>
                          <tr key={day.id} className={missing ? "bg-amber-50" : ""}>
                            <td className="py-2 pr-2 align-top text-muted-foreground text-xs">{idx + 1}</td>
                            <td className="py-2 pr-2 align-top">
                              <Input type="date" value={day.date}
                                onChange={(e) => patchDay(day.id, { date: e.target.value })}
                                className="h-8 print:border-0 print:p-0 print:h-auto" />
                            </td>
                            <td className="py-2 pr-2 align-top min-w-[130px]">
                              <Select
                                value={day.city_id}
                                onValueChange={(v) => patchDay(day.id, { city_id: v, hotel_id: "", room_id: "" })}
                              >
                                <SelectTrigger className="h-8 print:border-0 print:p-0"><SelectValue placeholder="City" /></SelectTrigger>
                                <SelectContent>
                                  {data.cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-2 pr-2 align-top min-w-[150px]">
                              <Select
                                value={day.hotel_id}
                                onValueChange={(v) => patchDay(day.id, { hotel_id: v, room_id: "" })}
                                disabled={!day.city_id}
                              >
                                <SelectTrigger className="h-8"><SelectValue placeholder="Hotel" /></SelectTrigger>
                                <SelectContent>
                                  {hotelsInCity.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              {hotel && (
                                <div className="mt-1"><CategoryBadge category={hotel.hotel_category} /></div>
                              )}
                            </td>
                            <td className="py-2 pr-2 align-top min-w-[130px]">
                              <Select
                                value={day.room_id}
                                onValueChange={(v) => patchDay(day.id, { room_id: v })}
                                disabled={!day.hotel_id}
                              >
                                <SelectTrigger className="h-8"><SelectValue placeholder="Room" /></SelectTrigger>
                                <SelectContent>
                                  {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <Select
                                value={day.meal_plan}
                                onValueChange={(v) => patchDay(day.id, { meal_plan: v as MealPlan })}
                              >
                                <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {MEAL_PLANS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-2 pr-2 align-top text-right tabular-nums font-medium">
                              {costs.single.available ? inr(costs.single.gross) : "—"}
                            </td>
                            <td className="py-2 pr-2 align-top text-right tabular-nums font-medium">
                              {costs.double.available ? inr(costs.double.gross) : "—"}
                            </td>
                            <td className="py-2 pr-2 align-top text-right tabular-nums font-medium">
                              {costs.triple.available ? inr(costs.triple.gross) : "—"}
                            </td>
                            <td className="align-top print:hidden">
                              <Button variant="ghost" size="icon" onClick={() => removeDay(day.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                          {costs.ratePlan && (
                            <>
                              <tr className="text-[11px] text-muted-foreground">
                                <td></td>
                                <td colSpan={5} className="pl-1">Net Rate</td>
                                <td className="text-right tabular-nums">{inr(costs.single.net)}</td>
                                <td className="text-right tabular-nums">{inr(costs.double.net)}</td>
                                <td className="text-right tabular-nums">{inr(costs.triple.net)}</td>
                                <td className="print:hidden"></td>
                              </tr>
                              <tr className="text-[11px] text-muted-foreground border-b">
                                <td></td>
                                <td colSpan={5} className="pl-1">GST</td>
                                <td className="text-right tabular-nums">
                                  {inr(costs.single.gstAmt)} <span className="opacity-60">({(costs.single.gstRate * 100).toFixed(0)}%)</span>
                                </td>
                                <td className="text-right tabular-nums">
                                  {inr(costs.double.gstAmt)} <span className="opacity-60">({(costs.double.gstRate * 100).toFixed(0)}%)</span>
                                </td>
                                <td className="text-right tabular-nums">
                                  {inr(costs.triple.gstAmt)} <span className="opacity-60">({(costs.triple.gstRate * 100).toFixed(0)}%)</span>
                                </td>
                                <td className="print:hidden"></td>
                              </tr>
                            </>
                          )}
                          {missing && (
                            <tr className="text-xs">
                              <td></td>
                              <td colSpan={9} className="py-1 text-amber-800 flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                No rate matched for selected dates — please check validity.
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}

                    {/* Totals rows (Excel style) */}
                    {dayCosts.length > 0 && (
                      <>
                        <tr className="bg-emerald-100 text-emerald-900 font-semibold">
                          <td colSpan={6} className="py-2 pl-2">Net rate with GST</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{inr(roomTotals.netWithGst.single)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{inr(roomTotals.netWithGst.double)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{inr(roomTotals.netWithGst.triple)}</td>
                          <td className="print:hidden"></td>
                        </tr>
                        {addonBreakdown.total > 0 && (
                          <tr className="bg-emerald-50 text-emerald-900">
                            <td colSpan={6} className="py-2 pl-2">+ Add-Ons (flat)</td>
                            <td className="py-2 pr-2 text-right tabular-nums">{inr(addonBreakdown.total)}</td>
                            <td className="py-2 pr-2 text-right tabular-nums">{inr(addonBreakdown.total)}</td>
                            <td className="py-2 pr-2 text-right tabular-nums">{inr(addonBreakdown.total)}</td>
                            <td className="print:hidden"></td>
                          </tr>
                        )}
                        <tr className="bg-orange-100 text-orange-900">
                          <td colSpan={6} className="py-2 pl-2 flex items-center gap-2">
                            <span>Mark up (on Room+GST+Add-Ons)</span>
                            <Input
                              type="number" min={0} max={100} value={markupPct}
                              onChange={(e) => setMarkupPct(Math.max(0, +e.target.value || 0))}
                              className="h-6 w-16 print:border-0 print:p-0 print:h-auto print:w-auto"
                            />
                            <span>%</span>
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">{inr(finalTotals.single.markup)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{inr(finalTotals.double.markup)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{inr(finalTotals.triple.markup)}</td>
                          <td className="print:hidden"></td>
                        </tr>
                        <tr className="bg-red-100 text-red-900">
                          <td colSpan={6} className="py-2 pl-2">GST 5% (on markup)</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{inr(finalTotals.single.markupGst)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{inr(finalTotals.double.markupGst)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{inr(finalTotals.triple.markupGst)}</td>
                          <td className="print:hidden"></td>
                        </tr>
                        <tr className="bg-red-200 text-red-900 font-bold">
                          <td colSpan={6} className="py-2 pl-2">TOTAL</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{inr(finalTotals.single.grand)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{inr(finalTotals.double.grand)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{inr(finalTotals.triple.grand)}</td>
                          <td className="print:hidden"></td>
                        </tr>

                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Occupancy boxes */}
            {dayCosts.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
                {(["single", "double", "triple"] as OccKey[]).map((k) => {
                  const included = includedOcc[k];
                  return (
                    <button
                      key={k}
                      onClick={() => setIncludedOcc((p) => ({ ...p, [k]: !p[k] }))}
                      className={
                        "rounded-lg p-4 text-left border-2 transition-all " +
                        (included
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-muted/30 opacity-60 hover:opacity-100")
                      }
                    >
                      <div className="text-xs uppercase font-semibold text-muted-foreground">
                        {OCC_LABEL[k]} {k === "double" || k === "triple" ? "Sharing" : "Occupancy"}
                      </div>
                      <div className="text-2xl font-bold tabular-nums text-primary mt-1">
                        {inr(finalTotals[k].grand)}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {included ? "Included in quote" : "Click to include"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Add-ons */}
          <Card className="p-5 print:hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Add-Ons</h2>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Pax</Label>
                <Input type="number" min={1} value={totalPax}
                  onChange={(e) => setTotalPax(Math.max(1, +e.target.value || 1))} className="h-8 w-20" />
              </div>
            </div>

            {/* Travels */}
            <AddonSection
              title="Travels"
              onAdd={() => {
                const first = data.travel_options.find((v) => v.is_active);
                if (!first) return toast.error("No travel options — add some in Travels first.");
                setTravels((p) => [...p, { id: uid(), travel_id: first.id, days: Math.max(1, nights), vehicles: 1 }]);
              }}
            >
              {travels.map((t) => {
                const opt = data.travel_options.find((x) => x.id === t.travel_id);
                const line = opt ? opt.rate_per_day * (t.days || 0) * Math.max(1, t.vehicles || 1) : 0;
                return (
                  <div key={t.id} className="grid grid-cols-[1fr_80px_80px_100px_36px] gap-2 items-center">
                    <Select value={t.travel_id} onValueChange={(v) =>
                      setTravels((p) => p.map((x) => x.id === t.id ? { ...x, travel_id: v } : x))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {data.travel_options.filter((x) => x.is_active).map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.vehicle_type} · {inr(v.rate_per_day)}/day</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" min={0} value={t.days} placeholder="Days" onChange={(e) =>
                      setTravels((p) => p.map((x) => x.id === t.id ? { ...x, days: +e.target.value || 0 } : x))} />
                    <Input type="number" min={1} value={t.vehicles} placeholder="Veh" onChange={(e) =>
                      setTravels((p) => p.map((x) => x.id === t.id ? { ...x, vehicles: +e.target.value || 1 } : x))} />
                    <div className="text-right tabular-nums text-sm font-medium">{inr(line)}</div>
                    <Button variant="ghost" size="icon" onClick={() => setTravels((p) => p.filter((x) => x.id !== t.id))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </AddonSection>


            <Separator className="my-3" />

            {/* Miscellaneous */}
            <AddonSection
              title="Miscellaneous"
              onAdd={() => {
                const first = data.miscellaneous_items.find((m) => m.is_active);
                if (!first) return toast.error("No miscellaneous items — add some first.");
                setMiscs((p) => [...p, { id: uid(), item_id: first.id, pax: totalPax, days: Math.max(1, nights) }]);
              }}
            >
              {miscs.map((m) => {
                const item = data.miscellaneous_items.find((x) => x.id === m.item_id);
                const line =
                  item
                    ? item.unit === "per_person"
                      ? item.rate * (m.pax || 0) * Math.max(1, m.days || 1)
                      : item.unit === "per_day"
                        ? item.rate * (m.days || 0)
                        : item.rate
                    : 0;
                return (
                  <div key={m.id} className="grid grid-cols-[1fr_80px_80px_100px_36px] gap-2 items-center">
                    <Select value={m.item_id} onValueChange={(v) =>
                      setMiscs((p) => p.map((x) => x.id === m.id ? { ...x, item_id: v } : x))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {data.miscellaneous_items.filter((x) => x.is_active).map((mi) => (
                          <SelectItem key={mi.id} value={mi.id}>{mi.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" min={0} value={m.pax} placeholder="pax" onChange={(e) =>
                      setMiscs((p) => p.map((x) => x.id === m.id ? { ...x, pax: +e.target.value || 0 } : x))} />
                    <Input type="number" min={0} value={m.days} placeholder="days" onChange={(e) =>
                      setMiscs((p) => p.map((x) => x.id === m.id ? { ...x, days: +e.target.value || 0 } : x))} />
                    <div className="text-right tabular-nums text-sm font-medium">{inr(line)}</div>
                    <Button variant="ghost" size="icon" onClick={() => setMiscs((p) => p.filter((x) => x.id !== m.id))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </AddonSection>

            <Separator className="my-3" />

            {/* Guide */}
            <AddonSection
              title="Guide"
              onAdd={() => {
                const first = data.guides.find((g) => g.is_active);
                if (!first) return toast.error("No guides — add some in Guide first.");
                setGuides((p) => [...p, { id: uid(), guide_id: first.id, days: Math.max(1, nights), guides: 1 }]);
              }}
            >
              {guides.map((g) => {
                const gd = data.guides.find((x) => x.id === g.guide_id);
                const line = gd ? gd.rate_per_day * (g.days || 0) * Math.max(1, g.guides || 1) : 0;
                return (
                  <div key={g.id} className="grid grid-cols-[1fr_80px_80px_100px_36px] gap-2 items-center">
                    <Select value={g.guide_id} onValueChange={(v) =>
                      setGuides((p) => p.map((x) => x.id === g.id ? { ...x, guide_id: v } : x))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {data.guides.filter((x) => x.is_active).map((gg) => (
                          <SelectItem key={gg.id} value={gg.id}>{gg.name} · {gg.guide_type} · {inr(gg.rate_per_day)}/day</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" min={0} value={g.days} placeholder="Days" onChange={(e) =>
                      setGuides((p) => p.map((x) => x.id === g.id ? { ...x, days: +e.target.value || 0 } : x))} />
                    <Input type="number" min={1} value={g.guides} placeholder="Guides" onChange={(e) =>
                      setGuides((p) => p.map((x) => x.id === g.id ? { ...x, guides: +e.target.value || 1 } : x))} />
                    <div className="text-right tabular-nums text-sm font-medium">{inr(line)}</div>
                    <Button variant="ghost" size="icon" onClick={() => setGuides((p) => p.filter((x) => x.id !== g.id))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </AddonSection>


            <Separator className="my-3" />

            {/* Entrances */}
            <AddonSection
              title="Entrances"
              onAdd={() => {
                const first = data.entrance_sites.find((s) => s.is_active);
                if (!first) return toast.error("No entrance sites — add some first.");
                setEntrances((p) => [...p, { id: uid(), site_id: first.id, indian_pax: totalPax, foreign_pax: 0 }]);
              }}
            >
              {entrances.map((e) => {
                const site = data.entrance_sites.find((x) => x.id === e.site_id);
                const line = site
                  ? site.indian_rate * (e.indian_pax || 0) + site.foreigner_rate * (e.foreign_pax || 0)
                  : 0;
                return (
                  <div key={e.id} className="grid grid-cols-[1fr_80px_80px_100px_36px] gap-2 items-center">
                    <Select value={e.site_id} onValueChange={(v) =>
                      setEntrances((p) => p.map((x) => x.id === e.id ? { ...x, site_id: v } : x))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {data.entrance_sites.filter((s) => s.is_active).map((s) => {
                          const city = data.entrance_cities.find((c) => c.id === s.city_id);
                          return <SelectItem key={s.id} value={s.id}>{s.site_name} · {city?.name}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                    <Input type="number" min={0} value={e.indian_pax} placeholder="IND" onChange={(ev) =>
                      setEntrances((p) => p.map((x) => x.id === e.id ? { ...x, indian_pax: +ev.target.value || 0 } : x))} />
                    <Input type="number" min={0} value={e.foreign_pax} placeholder="FRN" onChange={(ev) =>
                      setEntrances((p) => p.map((x) => x.id === e.id ? { ...x, foreign_pax: +ev.target.value || 0 } : x))} />
                    <div className="text-right tabular-nums text-sm font-medium">{inr(line)}</div>
                    <Button variant="ghost" size="icon" onClick={() => setEntrances((p) => p.filter((x) => x.id !== e.id))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </AddonSection>

            <Separator className="my-3" />

            {/* Activities */}
            <AddonSection
              title="Activity & Experience"
              onAdd={() => {
                const first = data.activities.find((a) => a.is_active);
                if (!first) return toast.error("No activities — add some first.");
                setActivities((p) => [...p, { id: uid(), activity_id: first.id, pax: totalPax, vehicles: 1 }]);
              }}
            >
              {activities.map((a) => {
                const act = data.activities.find((x) => x.id === a.activity_id);
                const line = !act ? 0
                  : act.pricing_type === "per_person" ? act.price * Math.max(1, a.pax || 1)
                  : act.pricing_type === "per_vehicle" ? act.price * Math.max(1, a.vehicles || 1)
                  : act.price;
                return (
                  <div key={a.id} className="grid grid-cols-[1fr_100px_100px_36px] gap-2 items-center">
                    <Select value={a.activity_id} onValueChange={(v) =>
                      setActivities((p) => p.map((x) => x.id === a.id ? { ...x, activity_id: v } : x))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {data.activities.filter((x) => x.is_active).map((x) => {
                          const dest = data.activity_destinations.find((d) => d.id === x.destination_id);
                          return <SelectItem key={x.id} value={x.id}>{x.activity_name} · {dest?.name} · {x.pricing_type}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                    {act?.pricing_type === "per_person" ? (
                      <Input type="number" min={1} value={a.pax} placeholder="Pax" onChange={(e) =>
                        setActivities((p) => p.map((x) => x.id === a.id ? { ...x, pax: +e.target.value || 0 } : x))} />
                    ) : act?.pricing_type === "per_vehicle" ? (
                      <Input type="number" min={1} value={a.vehicles} placeholder="Veh" onChange={(e) =>
                        setActivities((p) => p.map((x) => x.id === a.id ? { ...x, vehicles: +e.target.value || 0 } : x))} />
                    ) : (
                      <div className="text-xs text-muted-foreground text-center py-2">Fixed</div>
                    )}
                    <div className="text-right tabular-nums text-sm font-medium">{inr(line)}</div>
                    <Button variant="ghost" size="icon" onClick={() => setActivities((p) => p.filter((x) => x.id !== a.id))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </AddonSection>


            <div className="mt-4 pt-3 border-t flex items-center justify-between text-sm font-semibold">
              <span>Add-Ons Total</span>
              <span className="tabular-nums">{inr(addonBreakdown.total)}</span>
            </div>
          </Card>

          {/* Recent Quotes */}
          <Card className="p-5 print:hidden">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Recent Quotes</h2>
            {recentQuotes.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">No quotes saved yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2">Hotel</th>
                    <th className="text-left py-2">City</th>
                    <th className="text-left py-2">Dates</th>
                    <th className="text-right py-2">Grand Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recentQuotes.map((q) => (
                    <tr key={q.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{q.hotel_name_snapshot}</td>
                      <td className="py-2 text-muted-foreground">{q.city_name_snapshot}</td>
                      <td className="py-2 text-muted-foreground">{fmtDateShort(q.check_in)} → {fmtDateShort(q.check_out)}</td>
                      <td className="py-2 text-right tabular-nums font-semibold">{inr(q.grand_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {/* ============= RIGHT: Sticky Summary ============= */}
        <div className="xl:col-span-1 print:hidden">
          <div className="xl:sticky xl:top-6 space-y-4">
            <Card className="p-5">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Inclusions</h2>
              <ul className="space-y-1.5 text-sm">
                <li className="flex justify-between"><span>Accommodation</span><span className="font-medium">{nights} Night{nights !== 1 ? "s" : ""}</span></li>
                <li className="flex justify-between text-muted-foreground text-xs">
                  <span>Meals</span>
                  <span>
                    B/F: {mealCounts.breakfast} · Lunch: {mealCounts.lunch} · Dinner: {mealCounts.dinner}
                  </span>
                </li>
                {addonBreakdown.travelTotal > 0 && <li className="flex justify-between text-xs"><span>Travels</span><span className="tabular-nums">{inr(addonBreakdown.travelTotal)}</span></li>}
                {addonBreakdown.miscTotal > 0 && <li className="flex justify-between text-xs"><span>Miscellaneous</span><span className="tabular-nums">{inr(addonBreakdown.miscTotal)}</span></li>}
                {addonBreakdown.guideTotal > 0 && <li className="flex justify-between text-xs"><span>Guide</span><span className="tabular-nums">{inr(addonBreakdown.guideTotal)}</span></li>}
                {addonBreakdown.entranceTotal > 0 && <li className="flex justify-between text-xs"><span>Entrances</span><span className="tabular-nums">{inr(addonBreakdown.entranceTotal)}</span></li>}
                {addonBreakdown.activityTotal > 0 && <li className="flex justify-between text-xs"><span>Activities</span><span className="tabular-nums">{inr(addonBreakdown.activityTotal)}</span></li>}
              </ul>
            </Card>

            <Card className="p-5">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Cost Summary</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase text-muted-foreground border-b">
                    <th className="text-left py-1.5"></th>
                    <th className="text-right py-1.5">SGL</th>
                    <th className="text-right py-1.5">DBL</th>
                    <th className="text-right py-1.5">TRP</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  <SumRow label="Room (Net)" values={[roomTotals.netOnly.single, roomTotals.netOnly.double, roomTotals.netOnly.triple]} />
                  <SumRow label="GST on rooms" values={[roomTotals.gstOnly.single, roomTotals.gstOnly.double, roomTotals.gstOnly.triple]} />
                  <SumRow label="Add-Ons" values={[addonBreakdown.total, addonBreakdown.total, addonBreakdown.total]} />
                  <SumRow label={`Markup ${markupPct}%`} values={[finalTotals.single.markup, finalTotals.double.markup, finalTotals.triple.markup]} />
                  <SumRow label="GST on markup 5%" values={[finalTotals.single.markupGst, finalTotals.double.markupGst, finalTotals.triple.markupGst]} />

                  <tr className="bg-gold/20 font-bold">
                    <td className="py-2 pl-1">GRAND TOTAL</td>
                    <td className="py-2 pr-1 text-right">{inr(finalTotals.single.grand)}</td>
                    <td className="py-2 pr-1 text-right">{inr(finalTotals.double.grand)}</td>
                    <td className="py-2 pr-1 text-right">{inr(finalTotals.triple.grand)}</td>
                  </tr>
                </tbody>
              </table>
              {hasAnyMissing && (
                <div className="mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Some days have no matching rate plan — totals may be incomplete.
                </div>
              )}
              <div className="mt-3 text-[11px] text-muted-foreground text-center">
                Valid for 7 days · Subject to availability · Rates inclusive of GST
              </div>
            </Card>
          </div>
        </div>
      </div>

      <QuoteViewerDialog quote={viewingQuote} open={!!viewingQuote} onClose={() => setViewingQuote(null)} />
    </div>
  );
}


function SumRow({ label, values }: { label: string; values: [number, number, number] }) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-1.5 pl-1 text-muted-foreground">{label}</td>
      <td className="py-1.5 pr-1 text-right">{inr(values[0])}</td>
      <td className="py-1.5 pr-1 text-right">{inr(values[1])}</td>
      <td className="py-1.5 pr-1 text-right">{inr(values[2])}</td>
    </tr>
  );
}

function AddonSection({
  title, onAdd, children,
}: { title: React.ReactNode; onAdd: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{title}</div>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
