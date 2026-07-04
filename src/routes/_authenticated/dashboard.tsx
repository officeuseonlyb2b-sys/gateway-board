import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Hotel, MapPin, Layers, Landmark, Compass, FileText,
  ArrowUpRight, Plus, Calculator, Search, Upload, TrendingUp,
} from "lucide-react";
import { useDB, HOTEL_CATEGORIES } from "@/lib/mock-store";
import { useSavedQuotes } from "@/lib/quotes-store";
import { CategoryBadge } from "@/components/CategoryBadge";
import { Card } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — MP Tourism Hub" }] }),
  component: DashboardPage,
});

const CHART_COLORS = ["#1B4F72", "#2E86C1", "#E67E22", "#F39C12", "#27AE60", "#8E44AD", "#16A085", "#C0392B", "#7F8C8D"];

function DashboardPage() {
  const data = useDB();
  const quotes = useSavedQuotes();

  const stats = useMemo(() => {
    const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
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
    return data.hotels.map((h) => {
      const rooms = data.room_categories.filter((r) => r.hotel_id === h.id);
      const seasons = new Set<string>();
      rooms.forEach((r) => {
        data.rate_plans
          .filter((p) => p.room_category_id === r.id)
          .forEach((p) => seasons.add(`${p.validity_start}_${p.validity_end}`));
      });
      return { id: h.id, name: h.name, seasons: seasons.size, target: 4 };
    }).slice(0, 6);
  }, [data]);

  const recentQuotes = useMemo(() => quotes.slice(0, 3), [quotes]);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-primary">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of your hotel portfolio and rate operations.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard icon={Hotel} label="Total Hotels" value={stats.hotels} trend={`↑ +${stats.updatedThisMonth} this mo`} tint="primary" />
        <StatCard icon={MapPin} label="Cities Covered" value={stats.cities} tint="info" />
        <StatCard icon={Layers} label="Rate Plans" value={stats.ratePlans} tint="accent" />
        <StatCard icon={Landmark} label="Entrance Sites" value={stats.entrances} tint="info" />
        <StatCard icon={Compass} label="Activities" value={stats.activities} tint="success" />
        <StatCard icon={FileText} label="Saved Quotes" value={stats.savedQuotes} tint="accent" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Card className="xl:col-span-3 p-6 card-elevated border-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-primary">Recently Updated Hotels</h2>
              <p className="text-xs text-muted-foreground">Latest rate or hotel detail changes.</p>
            </div>
            <Link to="/hotels" className="text-xs text-accent font-semibold hover:underline flex items-center gap-1">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-primary bg-secondary/60">
                  <th className="font-semibold py-2.5 pl-3 pr-4 rounded-l">Hotel</th>
                  <th className="font-semibold py-2.5 pr-4">City</th>
                  <th className="font-semibold py-2.5 pr-4">Category</th>
                  <th className="font-semibold py-2.5 pr-4">Plans</th>
                  <th className="font-semibold py-2.5 pr-4 rounded-r">Updated</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((h, i) => (
                  <tr key={h.id} className={`transition-colors hover:bg-accent/5 ${i % 2 ? "bg-[#FAFBFC]" : ""}`}>
                    <td className="py-3 pl-3 pr-4 font-medium">
                      <Link to="/hotels/$id" params={{ id: h.id }} className="hover:text-accent">{h.name}</Link>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{h.city}</td>
                    <td className="py-3 pr-4"><CategoryBadge category={h.hotel_category} /></td>
                    <td className="py-3 pr-4 tabular-nums">{h.planCount}</td>
                    <td className="py-3 pr-4 text-muted-foreground text-xs">{relativeTime(h.updated_at)}</td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">No hotels yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="xl:col-span-2 p-6 card-elevated border-0">
          <div className="mb-4">
            <h2 className="font-semibold text-primary">Hotels by Category</h2>
            <p className="text-xs text-muted-foreground">Distribution across star ratings.</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  {CHART_COLORS.map((c, i) => (
                    <linearGradient key={i} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={c} stopOpacity={0.55} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="category" fontSize={11} tickLine={false} axisLine={false} interval={0} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(230,126,34,0.08)" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ""}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={`url(#grad-${i % CHART_COLORS.length})`} />)}
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
              <h2 className="font-semibold text-primary">Rate Plan Coverage</h2>
              <p className="text-xs text-muted-foreground">Seasons covered per hotel (target: 4).</p>
            </div>
            <TrendingUp className="h-4 w-4 text-accent" />
          </div>
          <div className="space-y-3">
            {coverage.map((c) => {
              const pct = Math.min(100, (c.seasons / c.target) * 100);
              const color = c.seasons >= 4 ? "bg-emerald-500" : c.seasons >= 2 ? "bg-accent" : "bg-red-500";
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <Link to="/hotels/$id" params={{ id: c.id }} className="font-medium hover:text-accent truncate">{c.name}</Link>
                    <span className="text-xs text-muted-foreground tabular-nums">{c.seasons}/{c.target}</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {coverage.length === 0 && <div className="text-sm text-muted-foreground">No hotels yet.</div>}
          </div>
        </Card>

        <Card className="p-6 card-elevated border-0">
          <div className="mb-4">
            <h2 className="font-semibold text-primary">Quick Actions</h2>
            <p className="text-xs text-muted-foreground">Jump to common tasks.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <QuickAction to="/hotels" icon={Plus} label="Add New Hotel" primary />
            <QuickAction to="/costing" icon={Calculator} label="Generate Quote" navy />
            <QuickAction to="/settings" icon={Upload} label="Import from Excel" />
            <QuickAction to="/costing" icon={Search} label="Rate Search" />
          </div>
        </Card>
      </div>

      <Card className="p-6 card-elevated border-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-primary">Recent Saved Quotes</h2>
            <p className="text-xs text-muted-foreground">Last 3 quotes saved.</p>
          </div>
          <Link to="/quotes" className="text-xs text-accent font-semibold hover:underline flex items-center gap-1">
            View all <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-primary bg-secondary/60">
                <th className="font-semibold py-2.5 pl-3 pr-4 rounded-l">Quote No</th>
                <th className="font-semibold py-2.5 pr-4">Tour Route</th>
                <th className="font-semibold py-2.5 pr-4">Nights</th>
                <th className="font-semibold py-2.5 pr-4 text-right">Grand Total (DBL)</th>
                <th className="font-semibold py-2.5 pr-4 rounded-r">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentQuotes.map((q, i) => (
                <tr key={q.id} className={`hover:bg-accent/5 ${i % 2 ? "bg-[#FAFBFC]" : ""}`}>
                  <td className="py-3 pl-3 pr-4 font-mono text-xs">
                    <Link to="/quotes" className="hover:text-accent font-semibold">{q.quote_number}</Link>
                  </td>
                  <td className="py-3 pr-4">{q.cities.join(" → ") || q.tour_title}</td>
                  <td className="py-3 pr-4 tabular-nums">{q.total_nights}</td>
                  <td className="py-3 pr-4 text-right tabular-nums font-semibold">₹{q.totals.grand_dbl.toLocaleString("en-IN")}</td>
                  <td className="py-3 pr-4 text-muted-foreground text-xs">{new Date(q.saved_at).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
              {recentQuotes.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">No saved quotes yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, trend, tint,
}: { icon: typeof Hotel; label: string; value: number; trend?: string; tint: "primary" | "accent" | "success" | "info" }) {
  const tints: Record<string, { bar: string; iconBg: string; iconColor: string }> = {
    primary: { bar: "bg-primary", iconBg: "bg-primary/10", iconColor: "text-primary" },
    accent: { bar: "bg-accent", iconBg: "bg-accent/10", iconColor: "text-accent" },
    success: { bar: "bg-emerald-500", iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
    info: { bar: "bg-sky-500", iconBg: "bg-sky-50", iconColor: "text-sky-600" },
  };
  const t = tints[tint];
  return (
    <Card className={`p-5 card-elevated border-0 border-l-4 ${t.bar} rounded-xl`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">{label}</div>
          <div className="text-4xl font-bold mt-2 tabular-nums text-primary leading-none">{value}</div>
          {trend && <div className="text-[11px] text-emerald-600 font-medium mt-2">{trend}</div>}
        </div>
        <div className={`h-11 w-11 rounded-full flex items-center justify-center ${t.iconBg} ${t.iconColor} shrink-0`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function QuickAction({
  to, icon: Icon, label, primary, navy,
}: { to: string; icon: typeof Plus; label: string; primary?: boolean; navy?: boolean }) {
  const cls = primary
    ? "bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm"
    : navy
    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
    : "bg-white border-2 border-primary/20 text-primary hover:border-accent hover:text-accent";
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
