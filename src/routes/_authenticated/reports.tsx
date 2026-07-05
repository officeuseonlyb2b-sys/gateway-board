import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Download, Printer, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDB, HOTEL_CATEGORIES, MEAL_PLANS, type HotelCategory, type MealPlan } from "@/lib/mock-store";
import { useSavedQuotes } from "@/lib/quotes-store";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — MP Tourism Hub" }] }),
  component: ReportsPage,
});

type TabKey = "rates" | "quotes" | "analysis" | "addons";

function ReportsPage() {
  const [tab, setTab] = useState<TabKey>("rates");
  const generatedAt = useMemo(() => new Date().toLocaleString("en-IN"), [tab]);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="text-sm text-muted-foreground mt-3">Analytics, exports and business insights across your operations.</p>
        </div>
        <div className="text-xs text-muted-foreground">Generated: {generatedAt}</div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        <TabBtn active={tab === "rates"} onClick={() => setTab("rates")}>Hotel Rate Report</TabBtn>
        <TabBtn active={tab === "quotes"} onClick={() => setTab("quotes")}>Quotes Summary</TabBtn>
        <TabBtn active={tab === "analysis"} onClick={() => setTab("analysis")}>Rate Analysis</TabBtn>
        <TabBtn active={tab === "addons"} onClick={() => setTab("addons")}>Add-Ons & Extras</TabBtn>
      </div>

      {tab === "rates" && <HotelRateReport />}
      {tab === "quotes" && <QuotesSummaryReport />}
      {tab === "analysis" && <RateAnalysisReport />}
      {tab === "addons" && <AddonsReport />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
        active ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}

/* ─────────── TAB 1: HOTEL RATE REPORT ─────────── */

function HotelRateReport() {
  const data = useDB();
  const [cityFilter, setCityFilter] = useState<string[]>([]);
  const [catFilter, setCatFilter] = useState<HotelCategory[]>([]);
  const [mealFilter, setMealFilter] = useState<MealPlan[]>([...MEAL_PLANS]);
  const [sortKey, setSortKey] = useState<string>("hotel");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const rows = useMemo(() => {
    const cities = new Map(data.cities.map((c) => [c.id, c.name]));
    const hotelsById = new Map(data.hotels.map((h) => [h.id, h]));
    const roomsById = new Map(data.room_categories.map((r) => [r.id, r]));
    const out: any[] = [];
    data.hotels.forEach((h) => {
      const cityName = cities.get(h.city_id) ?? "—";
      if (cityFilter.length && !cityFilter.includes(cityName)) return;
      if (catFilter.length && !catFilter.includes(h.hotel_category)) return;
      const rooms = data.room_categories.filter((r) => r.hotel_id === h.id);
      rooms.forEach((r) => {
        const plans = data.rate_plans.filter((p) => p.room_category_id === r.id);
        const grouped = new Map<string, any>();
        plans.forEach((p) => {
          const key = `${p.validity_start}|${p.validity_end}|${p.season_label}`;
          if (!grouped.has(key)) grouped.set(key, { season: p.season_label, validity: `${fmt(p.validity_start)}–${fmt(p.validity_end)}` });
          const g = grouped.get(key)!;
          if (mealFilter.includes(p.meal_plan)) {
            g[`${p.meal_plan}_sgl`] = p.single_rate;
            g[`${p.meal_plan}_dbl`] = p.double_rate;
          }
        });
        grouped.forEach((g) => {
          out.push({
            city: cityName, hotel: h.name, category: h.hotel_category, room: r.name,
            wifi: h.has_wifi, pool: h.has_pool,
            ...g,
          });
        });
      });
    });
    void hotelsById; void roomsById;
    return out;
  }, [data, cityFilter, catFilter, mealFilter]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [rows, sortKey, sortDir]);

  const averages = useMemo(() => {
    const keys = ["CP_sgl", "CP_dbl", "MAP_sgl", "MAP_dbl", "AP_sgl", "AP_dbl"];
    const avg: Record<string, number> = {};
    keys.forEach((k) => {
      const vals = rows.map((r) => r[k]).filter((v): v is number => typeof v === "number" && v > 0);
      avg[k] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    });
    return avg;
  }, [rows]);

  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const exportExcel = () => {
    const flat = sorted.map((r) => ({
      City: r.city, Hotel: r.hotel, Category: r.category, Room: r.room,
      Season: r.season, Validity: r.validity,
      "CP-SGL": r.CP_sgl ?? "", "CP-DBL": r.CP_dbl ?? "",
      "MAP-SGL": r.MAP_sgl ?? "", "MAP-DBL": r.MAP_dbl ?? "",
      "AP-SGL": r.AP_sgl ?? "", "AP-DBL": r.AP_dbl ?? "",
      WiFi: r.wifi ? "Yes" : "No", Pool: r.pool ? "Yes" : "No",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), "Hotel Rates");
    XLSX.writeFile(wb, `hotel-rate-report-${Date.now()}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <Card className="p-5 card-elevated border-0">
        <div className="flex items-center gap-2 mb-3 section-label"><Filter className="h-3.5 w-3.5" /> Filters</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MultiSelect label="City" options={data.cities.map((c) => c.name)} value={cityFilter} onChange={setCityFilter} />
          <MultiSelect label="Hotel Category" options={HOTEL_CATEGORIES} value={catFilter} onChange={(v) => setCatFilter(v as HotelCategory[])} />
          <div>
            <div className="section-label mb-2">Meal Plans</div>
            <div className="flex gap-2 flex-wrap">
              {MEAL_PLANS.map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border cursor-pointer hover:border-accent">
                  <input
                    type="checkbox"
                    checked={mealFilter.includes(m)}
                    onChange={() => setMealFilter((cur) => cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m])}
                    className="accent-[color:var(--accent)]"
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4 justify-end">
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" /> Print</Button>
          <Button onClick={exportExcel} className="bg-accent hover:bg-accent/90 text-accent-foreground"><Download className="h-4 w-4 mr-1.5" /> Export Excel</Button>
        </div>
      </Card>

      <Card className="p-6 card-elevated border-0">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-label">Hotel Rate Report</h2>
          <span className="text-xs text-muted-foreground">{sorted.length} rows</span>
        </div>
        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-border text-left section-label">
                {[
                  ["city", "City"], ["hotel", "Hotel"], ["category", "Category"], ["room", "Room"],
                  ["season", "Season"], ["validity", "Validity"],
                  ["CP_sgl", "CP-SGL"], ["CP_dbl", "CP-DBL"],
                  ["MAP_sgl", "MAP-SGL"], ["MAP_dbl", "MAP-DBL"],
                  ["AP_sgl", "AP-SGL"], ["AP_dbl", "AP-DBL"],
                ].map(([k, l]) => (
                  <th key={k} className="py-2.5 px-2 font-semibold cursor-pointer whitespace-nowrap" onClick={() => toggleSort(k)}>
                    {l}{sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                ))}
                <th className="py-2.5 px-2 font-semibold">WiFi</th>
                <th className="py-2.5 px-2 font-semibold">Pool</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i} className="border-b border-border hover:bg-[#F9FAFB]">
                  <td className="py-2 px-2 text-muted-foreground">{r.city}</td>
                  <td className="py-2 px-2 font-medium text-primary">{r.hotel}</td>
                  <td className="py-2 px-2 text-xs">{r.category}</td>
                  <td className="py-2 px-2">{r.room}</td>
                  <td className="py-2 px-2 text-muted-foreground">{r.season}</td>
                  <td className="py-2 px-2 text-xs text-muted-foreground">{r.validity}</td>
                  <RateCell v={r.CP_sgl} /><RateCell v={r.CP_dbl} />
                  <RateCell v={r.MAP_sgl} /><RateCell v={r.MAP_dbl} />
                  <RateCell v={r.AP_sgl} /><RateCell v={r.AP_dbl} />
                  <td className="py-2 px-2 text-center text-xs">{r.wifi ? "✓" : "—"}</td>
                  <td className="py-2 px-2 text-center text-xs">{r.pool ? "✓" : "—"}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={14} className="py-8 text-center text-muted-foreground text-sm">No data matches filters.</td></tr>
              )}
            </tbody>
            {sorted.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-[#F9FAFB] font-semibold">
                  <td colSpan={6} className="py-2.5 px-2 text-right section-label">Averages</td>
                  <td className="py-2 px-2 tabular-nums">{averages.CP_sgl ? `₹${averages.CP_sgl.toLocaleString("en-IN")}` : "—"}</td>
                  <td className="py-2 px-2 tabular-nums">{averages.CP_dbl ? `₹${averages.CP_dbl.toLocaleString("en-IN")}` : "—"}</td>
                  <td className="py-2 px-2 tabular-nums">{averages.MAP_sgl ? `₹${averages.MAP_sgl.toLocaleString("en-IN")}` : "—"}</td>
                  <td className="py-2 px-2 tabular-nums">{averages.MAP_dbl ? `₹${averages.MAP_dbl.toLocaleString("en-IN")}` : "—"}</td>
                  <td className="py-2 px-2 tabular-nums">{averages.AP_sgl ? `₹${averages.AP_sgl.toLocaleString("en-IN")}` : "—"}</td>
                  <td className="py-2 px-2 tabular-nums">{averages.AP_dbl ? `₹${averages.AP_dbl.toLocaleString("en-IN")}` : "—"}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}

function RateCell({ v }: { v?: number }) {
  if (!v) return <td className="py-2 px-2 text-muted-foreground">—</td>;
  const high = v > 7500;
  const cls = high ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800";
  return (
    <td className="py-2 px-2">
      <div className={`inline-block px-2 py-0.5 rounded tabular-nums font-medium ${cls}`}>
        ₹{v.toLocaleString("en-IN")}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{high ? "18% GST" : "5% GST"}</div>
    </td>
  );
}

function MultiSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <div className="section-label mb-2">{label}</div>
      <div className="max-h-32 overflow-y-auto border border-border rounded-md p-2 space-y-1 bg-white">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-[#F9FAFB] px-1.5 py-0.5 rounded">
            <input
              type="checkbox"
              checked={value.includes(o)}
              onChange={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}
              className="accent-[color:var(--accent)]"
            />
            <span className="truncate">{o}</span>
          </label>
        ))}
        {options.length === 0 && <div className="text-xs text-muted-foreground p-1">No options</div>}
      </div>
      {value.length > 0 && (
        <button onClick={() => onChange([])} className="text-[11px] text-accent mt-1 hover:underline">Clear ({value.length})</button>
      )}
    </div>
  );
}

/* ─────────── TAB 2: QUOTES SUMMARY ─────────── */

function QuotesSummaryReport() {
  const quotes = useSavedQuotes();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");

  const filtered = useMemo(() => {
    return quotes.filter((q) => {
      if (from && q.saved_at < from) return false;
      if (to && q.saved_at > to + "T23:59:59") return false;
      const t = q.totals.grand_dbl;
      if (minTotal && t < +minTotal) return false;
      if (maxTotal && t > +maxTotal) return false;
      return true;
    });
  }, [quotes, from, to, minTotal, maxTotal]);

  const summary = useMemo(() => {
    const totalValue = filtered.reduce((s, q) => s + q.totals.grand_dbl, 0);
    const avgNights = filtered.length ? Math.round(filtered.reduce((s, q) => s + q.total_nights, 0) / filtered.length) : 0;
    const cityCount = new Map<string, number>();
    filtered.forEach((q) => q.cities.forEach((c) => cityCount.set(c, (cityCount.get(c) || 0) + 1)));
    const mostCity = [...cityCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    return { count: filtered.length, totalValue, avgNights, mostCity };
  }, [filtered]);

  const byCity = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((q) => q.cities.forEach((c) => m.set(c, (m.get(c) || 0) + 1)));
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered]);

  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((q) => {
      const d = new Date(q.saved_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      m.set(key, (m.get(key) || 0) + 1);
    });
    return [...m.entries()].sort().map(([month, count]) => ({ month, count }));
  }, [filtered]);

  const exportExcel = () => {
    const flat = filtered.map((q) => ({
      "Quote No": q.quote_number, "Tour Route": q.cities.join(" → "),
      "Nights": q.total_nights, "SGL Total": q.totals.grand_sgl, "DBL Total": q.totals.grand_dbl, "TRP Total": q.totals.grand_trp,
      "Saved By": q.saved_by, "Date": new Date(q.saved_at).toLocaleDateString("en-IN"),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), "Quotes Summary");
    XLSX.writeFile(wb, `quotes-summary-${Date.now()}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <Card className="p-5 card-elevated border-0">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <FilterInput label="From Date" type="date" value={from} onChange={setFrom} />
          <FilterInput label="To Date" type="date" value={to} onChange={setTo} />
          <FilterInput label="Min Total (₹)" type="number" value={minTotal} onChange={setMinTotal} />
          <FilterInput label="Max Total (₹)" type="number" value={maxTotal} onChange={setMaxTotal} />
        </div>
        <div className="flex gap-2 mt-4 justify-end">
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" /> Print</Button>
          <Button onClick={exportExcel} className="bg-accent hover:bg-accent/90 text-accent-foreground"><Download className="h-4 w-4 mr-1.5" /> Export Excel</Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryStat label="Total Quotes" value={summary.count.toString()} />
        <SummaryStat label="Total Value (DBL)" value={`₹${summary.totalValue.toLocaleString("en-IN")}`} />
        <SummaryStat label="Avg Nights" value={summary.avgNights.toString()} />
        <SummaryStat label="Most Quoted City" value={summary.mostCity} />
      </div>

      <Card className="p-6 card-elevated border-0">
        <h2 className="section-label mb-4">Quotes</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border section-label">
                <th className="py-2.5 px-2 font-semibold">Quote No</th>
                <th className="py-2.5 px-2 font-semibold">Tour Route</th>
                <th className="py-2.5 px-2 font-semibold">Dates</th>
                <th className="py-2.5 px-2 font-semibold text-right">Nights</th>
                <th className="py-2.5 px-2 font-semibold text-right">SGL</th>
                <th className="py-2.5 px-2 font-semibold text-right">DBL</th>
                <th className="py-2.5 px-2 font-semibold text-right">TRP</th>
                <th className="py-2.5 px-2 font-semibold">Saved By</th>
                <th className="py-2.5 px-2 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => (
                <tr key={q.id} className="border-b border-border hover:bg-[#F9FAFB]">
                  <td className="py-2 px-2 font-mono text-xs text-primary font-semibold">{q.quote_number}</td>
                  <td className="py-2 px-2">{q.cities.join(" → ")}</td>
                  <td className="py-2 px-2 text-xs text-muted-foreground">{fmt(q.travel_start)} – {fmt(q.travel_end)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{q.total_nights}</td>
                  <td className="py-2 px-2 text-right tabular-nums">₹{q.totals.grand_sgl.toLocaleString("en-IN")}</td>
                  <td className="py-2 px-2 text-right tabular-nums font-semibold text-primary">₹{q.totals.grand_dbl.toLocaleString("en-IN")}</td>
                  <td className="py-2 px-2 text-right tabular-nums">₹{q.totals.grand_trp.toLocaleString("en-IN")}</td>
                  <td className="py-2 px-2 text-xs">{q.saved_by}</td>
                  <td className="py-2 px-2 text-xs text-muted-foreground">{new Date(q.saved_at).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-muted-foreground text-sm">No quotes match filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-6 card-elevated border-0">
          <h2 className="section-label mb-4">Quotes by City</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={byCity}>
                <CartesianGrid stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="#1A4A6B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6 card-elevated border-0">
          <h2 className="section-label mb-4">Quotes by Month</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={byMonth}>
                <CartesianGrid stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="#C9A84C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ─────────── TAB 3: RATE ANALYSIS ─────────── */

function RateAnalysisReport() {
  const data = useDB();

  const gstDist = useMemo(() => {
    let low = 0, high = 0;
    data.rate_plans.forEach((p) => {
      const rate = Math.max(p.single_rate, p.double_rate);
      if (rate > 7500) high++; else low++;
    });
    return [
      { name: "5% GST (≤ ₹7,500)", value: low, color: "#059669" },
      { name: "18% GST (> ₹7,500)", value: high, color: "#DC2626" },
    ];
  }, [data]);

  const byCategory = useMemo(() => {
    return HOTEL_CATEGORIES.map((c) => ({
      category: c, count: data.hotels.filter((h) => h.hotel_category === c).length,
    })).filter((x) => x.count > 0);
  }, [data]);

  const byCityAvg = useMemo(() => {
    const cityMap = new Map(data.cities.map((c) => [c.id, c.name]));
    const cityRates = new Map<string, number[]>();
    data.hotels.forEach((h) => {
      const rooms = data.room_categories.filter((r) => r.hotel_id === h.id);
      rooms.forEach((r) => {
        data.rate_plans.filter((p) => p.room_category_id === r.id).forEach((p) => {
          const key = cityMap.get(h.city_id) ?? "—";
          if (!cityRates.has(key)) cityRates.set(key, []);
          if (p.double_rate > 0) cityRates.get(key)!.push(p.double_rate);
        });
      });
    });
    return [...cityRates.entries()]
      .map(([name, rates]) => ({ name, avg: Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) }))
      .sort((a, b) => b.avg - a.avg);
  }, [data]);

  const seasonMatrix = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const rows = data.hotels.map((h) => {
      const covered = new Array(12).fill(false) as boolean[];
      const rooms = data.room_categories.filter((r) => r.hotel_id === h.id);
      rooms.forEach((r) => {
        data.rate_plans.filter((p) => p.room_category_id === r.id).forEach((p) => {
          const s = new Date(p.validity_start); const e = new Date(p.validity_end);
          let cur = new Date(s.getFullYear(), s.getMonth(), 1);
          const end = new Date(e.getFullYear(), e.getMonth(), 1);
          while (cur <= end) { covered[cur.getMonth()] = true; cur.setMonth(cur.getMonth() + 1); }
        });
      });
      return { name: h.name, covered };
    });
    return { months, rows };
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 card-elevated border-0">
          <h2 className="section-label mb-4">Rate Distribution (GST Zones)</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={gstDist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>
                  {gstDist.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6 card-elevated border-0">
          <h2 className="section-label mb-4">Hotels by Category</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={byCategory} layout="vertical">
                <CartesianGrid stroke="#E5E7EB" horizontal={false} />
                <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis dataKey="category" type="category" fontSize={11} tickLine={false} axisLine={false} width={110} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="#C9A84C" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-6 card-elevated border-0">
        <h2 className="section-label mb-4">Average DBL Rate by City</h2>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={byCityAvg}>
              <CartesianGrid stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
              <Bar dataKey="avg" fill="#1A4A6B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-6 card-elevated border-0">
        <h2 className="section-label mb-4">Season Coverage Heatmap</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left py-2 pr-4 section-label">Hotel</th>
                {seasonMatrix.months.map((m) => <th key={m} className="py-2 px-1 section-label text-center">{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {seasonMatrix.rows.map((r) => (
                <tr key={r.name} className="border-b border-border">
                  <td className="py-1.5 pr-4 font-medium text-primary whitespace-nowrap">{r.name}</td>
                  {r.covered.map((c, i) => (
                    <td key={i} className="py-1 px-1">
                      <div className={`h-6 rounded ${c ? "bg-emerald-500" : "bg-[#F3F4F6]"}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ─────────── TAB 4: ADD-ONS ─────────── */

function AddonsReport() {
  const data = useDB();

  const exportSheet = (name: string, rows: any[]) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
    XLSX.writeFile(wb, `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <AddonSection
        title="Miscellaneous Items"
        onExport={() => exportSheet("Miscellaneous", data.miscellaneous_items.map((m) => ({
          Name: m.name, Description: m.description, Rate: m.rate, Unit: m.unit, Active: m.is_active,
        })))}
        columns={["Name", "Description", "Rate", "Unit", "Status"]}
        rows={data.miscellaneous_items.map((m) => [m.name, m.description, `₹${m.rate.toLocaleString("en-IN")}`, m.unit, m.is_active ? "Active" : "Inactive"])}
      />
      <AddonSection
        title="Guides"
        onExport={() => exportSheet("Guides", data.guides.map((g) => ({
          Name: g.name, Type: g.guide_type, Destination: g.destination, "Rate/Day": g.rate_per_day, Active: g.is_active,
        })))}
        columns={["Name", "Type", "Destination", "Rate/Day", "Status"]}
        rows={data.guides.map((g) => [g.name, g.guide_type, g.destination, `₹${g.rate_per_day.toLocaleString("en-IN")}`, g.is_active ? "Active" : "Inactive"])}
      />
      <AddonSection
        title="Travel Options"
        onExport={() => exportSheet("Travels", data.travel_options.map((t) => ({
          Vehicle: t.vehicle_type, Description: t.description, Capacity: t.capacity_persons, "Rate/Day": t.rate_per_day, "Rate/Km": t.rate_per_km,
        })))}
        columns={["Vehicle", "Description", "Capacity", "Rate/Day", "Rate/Km"]}
        rows={data.travel_options.map((t) => [t.vehicle_type, t.description, `${t.capacity_persons} pax`, `₹${t.rate_per_day.toLocaleString("en-IN")}`, `₹${t.rate_per_km}`])}
      />
      <AddonSection
        title="Entrance Sites"
        onExport={() => exportSheet("Entrances", data.entrance_sites.map((e) => ({
          Site: e.site_name, City: data.entrance_cities.find((c) => c.id === e.city_id)?.name ?? "—",
          "Indian Rate": e.indian_rate, "Foreigner Rate": e.foreigner_rate,
        })))}
        columns={["Site", "City", "Indian Rate", "Foreigner Rate"]}
        rows={data.entrance_sites.map((e) => [
          e.site_name,
          data.entrance_cities.find((c) => c.id === e.city_id)?.name ?? "—",
          `₹${e.indian_rate.toLocaleString("en-IN")}`,
          `₹${e.foreigner_rate.toLocaleString("en-IN")}`,
        ])}
      />
      <AddonSection
        title="Activities"
        onExport={() => exportSheet("Activities", data.activities.map((a) => ({
          Name: a.activity_name, Destination: data.activity_destinations.find((d) => d.id === a.destination_id)?.name ?? "—",
          Pricing: a.pricing_type, Price: a.price,
        })))}
        columns={["Activity", "Destination", "Pricing Type", "Price"]}
        rows={data.activities.map((a) => [
          a.activity_name,
          data.activity_destinations.find((d) => d.id === a.destination_id)?.name ?? "—",
          a.pricing_type,
          `₹${a.price.toLocaleString("en-IN")}`,
        ])}
      />
    </div>
  );
}

function AddonSection({ title, columns, rows, onExport }: { title: string; columns: string[]; rows: (string | number)[][]; onExport: () => void }) {
  return (
    <Card className="p-6 card-elevated border-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-label">{title}</h2>
        <Button size="sm" variant="outline" onClick={onExport}><Download className="h-3.5 w-3.5 mr-1.5" /> Export</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left section-label">
              {columns.map((c) => <th key={c} className="py-2.5 px-2 font-semibold">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border hover:bg-[#F9FAFB]">
                {r.map((cell, j) => <td key={j} className="py-2 px-2">{cell}</td>)}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={columns.length} className="py-6 text-center text-muted-foreground text-sm">No entries.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ─────────── shared ─────────── */

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5 card-elevated border-0 rounded-xl">
      <div className="text-2xl font-bold text-primary tabular-nums leading-tight truncate">{value}</div>
      <div className="section-label mt-2">{label}</div>
    </Card>
  );
}

function FilterInput({ label, type, value, onChange }: { label: string; type: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="section-label mb-2">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-md border border-border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
      />
    </div>
  );
}

function fmt(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
