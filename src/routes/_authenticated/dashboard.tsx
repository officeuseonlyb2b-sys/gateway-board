import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Hotel, MapPin, Layers, CalendarRange, ArrowUpRight } from "lucide-react";
import { useDB, HOTEL_CATEGORIES } from "@/lib/mock-store";
import { CategoryBadge } from "@/components/CategoryBadge";
import { Card } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — MP Tourism Hub" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const data = useDB();

  const stats = useMemo(() => {
    const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
    const updatedThisMonth = data.hotels.filter((h) => new Date(h.updated_at) >= monthAgo).length;
    return {
      hotels: data.hotels.length,
      cities: new Set(data.hotels.map((h) => h.city_id)).size,
      ratePlans: data.rate_plans.length,
      updatedThisMonth,
    };
  }, [data]);

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

  const COLORS = ["oklch(0.45 0.08 195)", "oklch(0.55 0.1 195)", "oklch(0.62 0.12 200)", "oklch(0.78 0.13 80)", "oklch(0.85 0.13 75)", "oklch(0.65 0.15 30)", "oklch(0.55 0.18 25)", "oklch(0.55 0.1 160)", "oklch(0.5 0.15 280)"];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of your hotel portfolio and rate operations.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Hotel} label="Total Hotels" value={stats.hotels} tint="teal" />
        <StatCard icon={MapPin} label="Cities Covered" value={stats.cities} tint="blue" />
        <StatCard icon={Layers} label="Active Rate Plans" value={stats.ratePlans} tint="gold" />
        <StatCard icon={CalendarRange} label="Updated This Month" value={stats.updatedThisMonth} tint="green" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Recently Updated Hotels</h2>
              <p className="text-xs text-muted-foreground">Latest rate or hotel detail changes.</p>
            </div>
            <Link to="/hotels" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="font-medium py-2 pr-4">Hotel</th>
                  <th className="font-medium py-2 pr-4">City</th>
                  <th className="font-medium py-2 pr-4">Category</th>
                  <th className="font-medium py-2 pr-4">Plans</th>
                  <th className="font-medium py-2 pr-4">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recent.map((h) => (
                  <tr key={h.id} className="hover:bg-muted/40 transition-colors">
                    <td className="py-3 pr-4 font-medium">
                      <Link to="/hotels/$id" params={{ id: h.id }} className="hover:text-primary">{h.name}</Link>
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

        <Card className="p-6">
          <div className="mb-4">
            <h2 className="font-semibold">Hotels by Category</h2>
            <p className="text-xs text-muted-foreground">Distribution across star ratings.</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 0, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="oklch(0.92 0.01 220)" vertical={false} />
                <XAxis dataKey="category" fontSize={11} tickLine={false} axisLine={false} interval={0} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "oklch(0.95 0.01 220)" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ""}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, tint,
}: { icon: typeof Hotel; label: string; value: number; tint: "teal" | "gold" | "green" | "blue" }) {
  const tints: Record<string, string> = {
    teal: "bg-teal/10 text-teal",
    gold: "bg-gold/15 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-sky-50 text-sky-700",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
          <div className="text-3xl font-bold mt-2 tabular-nums">{value}</div>
        </div>
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${tints[tint]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
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
