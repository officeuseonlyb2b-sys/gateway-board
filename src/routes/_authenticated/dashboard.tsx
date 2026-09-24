import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Hotel,
  MapPin,
  Layers,
  Landmark,
  Compass,
  FileText,
  ArrowUpRight,
  Plus,
  Calculator,
  Search,
  Upload,
  Eye,
  Printer,
  Download,
} from "lucide-react";
import { useDB, HOTEL_CATEGORIES, type HotelCategory } from "@/lib/mock-store";
import { useSavedQuotes } from "@/lib/quotes-store";
import { Card } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — MP Tourism Hub" }] }),
  component: DashboardPage,
});

const CATEGORY_BADGE: Record<HotelCategory, string> = {
  "3 Star": "border-slate-300 text-slate-700",
  "3 Star Deluxe": "border-slate-400 text-slate-700",
  "4 Star": "border-sky-400 text-sky-700",
  "4 Star Superior": "border-sky-500 text-sky-700",
  "5 Star": "border-accent text-accent",
  "5 Star Deluxe": "border-accent text-accent",
  "5 Star Luxury": "border-accent text-accent",
  Heritage: "border-purple-400 text-purple-700",
  "Excellent Budget": "border-emerald-400 text-emerald-700",
};

function DashboardPage() {
  const data = useDB();
  const quotes = useSavedQuotes();

  const stats = useMemo(() => {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    const updatedThisMonth = data.hotels.filter((h) => new Date(h.updated_at) >= monthAgo).length;
    return {
      hotels: data.hotels.length,
      cities: new Set(data.hotels.map((h) => h.city_id)).size,
      ratePlans: data.rate_plans.length,
      updatedThisMonth,
      entrances: data.entrance_sites.length,
      activities: data.activities.length,
      savedQuotes: quotes.length,
    };
  }, [data, quotes]);

  const recent = useMemo(() => {
    return [...data.hotels]
      .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
      .slice(0, 6)
      .map((h) => ({
        ...h,
        city: data.cities.find((c) => c.id === h.city_id)?.name ?? "—",
        planCount: data.room_categories
          .filter((r) => r.hotel_id === h.id)
          .flatMap((r) => data.rate_plans.filter((p) => p.room_category_id === r.id)).length,
      }));
  }, [data]);

  const chartData = useMemo(() => {
    return HOTEL_CATEGORIES.map((cat) => ({
      category: cat.replace("Star", "★").replace("Excellent ", ""),
      full: cat,
      count: data.hotels.filter((h) => h.hotel_category === cat).length,
    })).filter((d) => d.count > 0);
  }, [data]);

  const coverage = useMemo(() => {
    return data.hotels
      .map((h) => {
        const rooms = data.room_categories.filter((r) => r.hotel_id === h.id);
        const seasons = new Set<string>();
        rooms.forEach((r) => {
          data.rate_plans
            .filter((p) => p.room_category_id === r.id)
            .forEach((p) => seasons.add(`${p.validity_start}_${p.validity_end}`));
        });
        return { id: h.id, name: h.name, seasons: seasons.size, target: 4 };
      })
      .slice(0, 6);
  }, [data]);

  const recentQuotes = useMemo(() => quotes.slice(0, 5), [quotes]);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-3">
          Overview of your hotel portfolio and rate operations.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          icon={Hotel}
          label="Total Hotels"
          value={stats.hotels}
          trend={stats.updatedThisMonth > 0 ? `+${stats.updatedThisMonth} this month` : undefined}
        />
        <StatCard icon={MapPin} label="Cities" value={stats.cities} />
        <StatCard icon={Layers} label="Rate Plans" value={stats.ratePlans} />
        <StatCard icon={Landmark} label="Entrances" value={stats.entrances} />
        <StatCard icon={Compass} label="Activities" value={stats.activities} />
        <StatCard icon={FileText} label="Recent Quotes" value={stats.savedQuotes} active />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Card className="xl:col-span-3 p-6 card-elevated border-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="section-label">Recently Updated Hotels</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Latest rate or hotel detail changes.
              </p>
            </div>
            <Link
              to="/hotels"
              className="text-xs text-accent font-semibold hover:underline flex items-center gap-1"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left section-label border-b border-border">
                  <th className="py-3 pl-3 pr-4 font-semibold">Hotel</th>
                  <th className="py-3 pr-4 font-semibold">City</th>
                  <th className="py-3 pr-4 font-semibold">Category</th>
                  <th className="py-3 pr-4 font-semibold">Plans</th>
                  <th className="py-3 pr-4 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((h) => (
                  <tr
                    key={h.id}
                    className="border-b border-border transition-colors hover:bg-[#F9FAFB]"
                  >
                    <td className="py-3 pl-3 pr-4 font-medium text-primary">
                      <Link to="/hotels/$id" params={{ id: h.id }} className="hover:text-accent">
                        {h.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{h.city}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${CATEGORY_BADGE[h.hotel_category]}`}
                      >
                        {h.hotel_category}
                      </span>
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-primary">{h.planCount}</td>
                    <td className="py-3 pr-4 text-muted-foreground text-xs">
                      {relativeTime(h.updated_at)}
                    </td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                      No hotels yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="xl:col-span-2 p-6 card-elevated border-0">
          <div className="mb-4">
            <h2 className="section-label">Hotels by Category</h2>
            <p className="text-xs text-muted-foreground mt-1">Distribution across star ratings.</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#E5E7EB" vertical={false} />
                <XAxis
                  dataKey="category"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(201,168,76,0.08)" }}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ""}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#1A4A6B">
                  {chartData.map((_, i) => (
                    <Cell key={i} fill="#1A4A6B" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-6 card-elevated border-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="section-label">Rate Plan Coverage</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Seasons covered per hotel (target: 4).
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {coverage.map((c) => {
              const pct = Math.min(100, (c.seasons / c.target) * 100);
              const incomplete = c.seasons < c.target;
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <Link
                      to="/hotels/$id"
                      params={{ id: c.id }}
                      className="font-medium text-primary hover:text-accent truncate flex items-center gap-2"
                    >
                      {incomplete && <span className="h-1.5 w-1.5 rounded-full bg-danger" />}
                      {c.name}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {c.seasons}/{c.target}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#F3F4F6] overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {coverage.length === 0 && (
              <div className="text-sm text-muted-foreground">No hotels yet.</div>
            )}
          </div>
        </Card>

        <Card className="p-6 card-elevated border-0">
          <div className="mb-4">
            <h2 className="section-label">Quick Actions</h2>
            <p className="text-xs text-muted-foreground mt-1">Jump to common tasks.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <QuickAction to="/hotels" icon={Plus} label="Add New Hotel" variant="accent" />
            <QuickAction to="/costing" icon={Calculator} label="Generate Quote" variant="primary" />
            <QuickAction to="/reports" icon={Search} label="View Reports" />
            <QuickAction to="/settings" icon={Upload} label="Import from Excel" />
          </div>
        </Card>
      </div>

      <Card className="p-6 card-elevated border-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="section-label">Recent Quotes</h2>
            <p className="text-xs text-muted-foreground mt-1">Latest quotes generated.</p>
          </div>
          <Link
            to="/quotes"
            className="text-xs text-accent font-semibold hover:underline flex items-center gap-1"
          >
            View all <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left section-label border-b border-border">
                <th className="py-3 pl-3 pr-4 font-semibold">Quote No</th>
                <th className="py-3 pr-4 font-semibold">Tour Route</th>
                <th className="py-3 pr-4 font-semibold">Nights</th>
                <th className="py-3 pr-4 font-semibold text-right">Total (DBL)</th>
                <th className="py-3 pr-4 font-semibold">Date</th>
                <th className="py-3 pr-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentQuotes.map((q) => (
                <tr key={q.id} className="border-b border-border hover:bg-[#F9FAFB]">
                  <td className="py-3 pl-3 pr-4 font-mono text-xs">
                    <Link to="/quotes" className="hover:text-accent font-semibold text-primary">
                      {q.quote_number}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-primary">{q.cities.join(" → ") || q.tour_title}</td>
                  <td className="py-3 pr-4 tabular-nums">{q.total_nights}</td>
                  <td className="py-3 pr-4 text-right tabular-nums font-semibold text-primary">
                    ₹{q.totals.grand_dbl.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground text-xs">
                    {new Date(q.saved_at).toLocaleDateString("en-IN")}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <div className="inline-flex gap-1">
                      <Link
                        to="/quotes"
                        className="h-7 w-7 rounded-md hover:bg-[#F3F4F6] inline-flex items-center justify-center text-muted-foreground hover:text-primary"
                        title="View"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                      <Link
                        to="/quotes"
                        className="h-7 w-7 rounded-md hover:bg-[#F3F4F6] inline-flex items-center justify-center text-muted-foreground hover:text-primary"
                        title="Print"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Link>
                      <Link
                        to="/quotes"
                        className="h-7 w-7 rounded-md hover:bg-[#F3F4F6] inline-flex items-center justify-center text-muted-foreground hover:text-primary"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {recentQuotes.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                    No saved quotes yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  active,
}: {
  icon: typeof Hotel;
  label: string;
  value: number;
  trend?: string;
  active?: boolean;
}) {
  return (
    <Card
      className={`p-5 card-elevated border-0 rounded-xl bg-card ${active ? "border-l-4 border-l-accent" : ""}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="h-9 w-9 rounded-full bg-[#F3F4F6] flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <div className="text-[38px] font-bold tabular-nums text-primary leading-none">{value}</div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="section-label">{label}</div>
        {trend && <div className="text-[10px] text-success font-medium">{trend}</div>}
      </div>
    </Card>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
  variant,
}: {
  to: string;
  icon: typeof Plus;
  label: string;
  variant?: "primary" | "accent";
}) {
  const cls =
    variant === "accent"
      ? "bg-accent text-accent-foreground hover:opacity-90"
      : variant === "primary"
        ? "bg-primary text-primary-foreground hover:opacity-90"
        : "bg-white border border-border text-primary hover:border-accent hover:text-accent";
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${cls}`}
    >
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function relativeTime(iso: string) {
  const diff = Date.now() - +new Date(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
