import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Wifi, Waves, Phone, Mail, Copy, Pencil, Calendar, Layers, Hotel as HotelIcon, Clock } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CategoryBadge } from "@/components/CategoryBadge";
import { useDB, type Hotel } from "@/lib/mock-store";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function HotelAnalytics({ hotel, city, onEdit }: { hotel: Hotel; city: string; onEdit: () => void }) {
  const data = useDB();
  const rooms = useMemo(() => data.room_categories.filter((r) => r.hotel_id === hotel.id), [data, hotel.id]);
  const plans = useMemo(
    () => data.rate_plans.filter((p) => rooms.some((r) => r.id === p.room_category_id)),
    [data, rooms],
  );

  const seasonKeys = useMemo(() => {
    const set = new Set<string>();
    plans.forEach((p) => set.add(`${p.validity_start}_${p.validity_end}`));
    return Array.from(set);
  }, [plans]);

  const monthCoverage = useMemo(() => {
    const covered = new Array(12).fill(false) as boolean[];
    plans.forEach((p) => {
      const s = new Date(p.validity_start);
      const e = new Date(p.validity_end);
      let cur = new Date(s.getFullYear(), s.getMonth(), 1);
      const end = new Date(e.getFullYear(), e.getMonth(), 1);
      while (cur <= end) {
        covered[cur.getMonth()] = true;
        cur.setMonth(cur.getMonth() + 1);
      }
    });
    return covered;
  }, [plans]);

  // Rate overview: room × season, showing CP/MAP/AP double + single
  const rateRows = useMemo(() => {
    const rows: Array<{
      roomName: string;
      season: string;
      validity: string;
      cpSgl: number; cpDbl: number;
      mapSgl: number; mapDbl: number;
      apSgl: number; apDbl: number;
    }> = [];
    rooms.forEach((r) => {
      const rPlans = plans.filter((p) => p.room_category_id === r.id);
      const groups = new Map<string, typeof rPlans>();
      rPlans.forEach((p) => {
        const key = `${p.validity_start}|${p.validity_end}|${p.season_label}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
      });
      groups.forEach((g) => {
        const cp = g.find((x) => x.meal_plan === "CP");
        const mp = g.find((x) => x.meal_plan === "MAP");
        const ap = g.find((x) => x.meal_plan === "AP");
        rows.push({
          roomName: r.name,
          season: g[0].season_label,
          validity: `${fmtDate(g[0].validity_start)} – ${fmtDate(g[0].validity_end)}`,
          cpSgl: cp?.single_rate ?? 0, cpDbl: cp?.double_rate ?? 0,
          mapSgl: mp?.single_rate ?? 0, mapDbl: mp?.double_rate ?? 0,
          apSgl: ap?.single_rate ?? 0, apDbl: ap?.double_rate ?? 0,
        });
      });
    });
    return rows;
  }, [rooms, plans]);

  const remarks = useMemo(
    () => Array.from(new Set(plans.map((p) => p.remarks).filter(Boolean))) as string[],
    [plans],
  );

  const copy = (val: string, label: string) => {
    if (!val) return;
    navigator.clipboard?.writeText(val);
    toast.success(`${label} copied`);
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Hero banner */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 lg:p-8 text-white"
        style={{ background: "linear-gradient(135deg, #0F2D48 0%, #1B4F72 55%, #2E86C1 100%)" }}
      >
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />
        <div className="absolute -left-10 -bottom-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3 min-w-0">
            <h1 className="text-[28px] leading-tight font-bold tracking-tight">{hotel.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge category={hotel.hotel_category} className="ring-white/30" />
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/15 ring-1 ring-white/25">
                📍 {city}
              </span>
              {hotel.has_wifi && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-400/25 ring-1 ring-emerald-300/40">
                  <Wifi className="h-3 w-3" /> Wi-Fi
                </span>
              )}
              {hotel.has_pool && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-400/25 ring-1 ring-sky-300/40">
                  <Waves className="h-3 w-3" /> Pool
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-white/85">
              <button onClick={() => copy(hotel.contact_phone, "Phone")} className="inline-flex items-center gap-1.5 hover:text-white">
                <Phone className="h-4 w-4" /> {hotel.contact_phone || "—"}
              </button>
              <button onClick={() => copy(hotel.email, "Email")} className="inline-flex items-center gap-1.5 hover:text-white">
                <Mail className="h-4 w-4" /> {hotel.email || "—"}
              </button>
              <span className="text-white/70">Contact: <span className="text-white">{hotel.contact_name || "—"}</span></span>
            </div>
          </div>
          <Button onClick={onEdit} className="bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg">
            <Pencil className="h-4 w-4 mr-2" /> Edit Hotel
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat icon={HotelIcon} label="Room Types" value={rooms.length} tint="primary" />
        <MiniStat icon={Layers} label="Total Rate Plans" value={plans.length} tint="accent" />
        <MiniStat icon={Calendar} label="Season Coverage" value={`${seasonKeys.length}`} tint="success" />
        <MiniStat icon={Clock} label="Last Updated" value={relativeTime(hotel.updated_at)} tint="info" />
      </div>

      {/* Rate overview */}
      <Card className="p-6 card-elevated border-0">
        <div className="mb-4">
          <h2 className="font-semibold text-primary">Rate Overview</h2>
          <p className="text-xs text-muted-foreground">All rooms × seasons. Red = 18% GST zone (&gt; ₹7,500). Green = 5% GST.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-primary bg-secondary/60">
                <th className="font-semibold py-2.5 px-3 rounded-l">Room</th>
                <th className="font-semibold py-2.5 px-3">Season</th>
                <th className="font-semibold py-2.5 px-3">Validity</th>
                <th className="font-semibold py-2.5 px-3 text-right">CP-SGL</th>
                <th className="font-semibold py-2.5 px-3 text-right">CP-DBL</th>
                <th className="font-semibold py-2.5 px-3 text-right">MAP-SGL</th>
                <th className="font-semibold py-2.5 px-3 text-right">MAP-DBL</th>
                <th className="font-semibold py-2.5 px-3 text-right">AP-SGL</th>
                <th className="font-semibold py-2.5 px-3 text-right rounded-r">AP-DBL</th>
              </tr>
            </thead>
            <tbody>
              {rateRows.map((r, i) => (
                <tr key={i} className={i % 2 ? "bg-[#FAFBFC]" : ""}>
                  <td className="py-2 px-3 font-medium">{r.roomName}</td>
                  <td className="py-2 px-3 text-muted-foreground">{r.season}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">{r.validity}</td>
                  <RateCell v={r.cpSgl} /><RateCell v={r.cpDbl} />
                  <RateCell v={r.mapSgl} /><RateCell v={r.mapDbl} />
                  <RateCell v={r.apSgl} /><RateCell v={r.apDbl} />
                </tr>
              ))}
              {rateRows.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-muted-foreground text-sm">No rate plans yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Season calendar */}
      <Card className="p-6 card-elevated border-0">
        <div className="mb-4">
          <h2 className="font-semibold text-primary">Season Calendar</h2>
          <p className="text-xs text-muted-foreground">Months covered by at least one rate plan.</p>
        </div>
        <div className="grid grid-cols-12 gap-2">
          {MONTHS.map((m, i) => (
            <div
              key={m}
              className={`text-center py-3 rounded-md text-xs font-semibold ring-1 ${
                monthCoverage[i]
                  ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
                  : "bg-slate-100 text-slate-400 ring-slate-200"
              }`}
              title={monthCoverage[i] ? "Covered" : "No rate plan"}
            >
              {m}
            </div>
          ))}
        </div>
      </Card>

      {/* Contact & notes */}
      <Card className="p-6 card-elevated border-0">
        <h2 className="font-semibold text-primary mb-3">Contact & Notes</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <button onClick={() => copy(hotel.contact_phone, "Phone")} className="flex items-center gap-2 rounded-lg border border-border p-3 hover:border-accent hover:bg-accent/5 transition text-left">
            <Phone className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Phone</div>
              <div className="font-medium truncate">{hotel.contact_phone || "—"}</div>
            </div>
            <Copy className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
          </button>
          <button onClick={() => copy(hotel.email, "Email")} className="flex items-center gap-2 rounded-lg border border-border p-3 hover:border-accent hover:bg-accent/5 transition text-left">
            <Mail className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Email</div>
              <div className="font-medium truncate">{hotel.email || "—"}</div>
            </div>
            <Copy className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
          </button>
          <div className="flex items-center gap-2 rounded-lg border border-border p-3">
            <div className="h-4 w-4 rounded-full bg-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Contact</div>
              <div className="font-medium truncate">{hotel.contact_name || "—"}</div>
            </div>
          </div>
        </div>
        {remarks.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Remarks from rate plans</div>
            {remarks.map((r, i) => (
              <div key={i} className="text-sm bg-amber-50 border-l-4 border-accent px-3 py-2 rounded">
                {r}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function RateCell({ v }: { v: number }) {
  if (!v) return <td className="py-2 px-3 text-right text-muted-foreground">—</td>;
  const high = v > 7500;
  const cls = high ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800";
  const gst = high ? "18%" : "5%";
  return (
    <td className="py-2 px-3 text-right">
      <span className={`inline-block px-2 py-0.5 rounded tabular-nums font-medium ${cls}`} title={`GST: ${gst}`}>
        ₹{v.toLocaleString("en-IN")}
      </span>
    </td>
  );
}

function MiniStat({ icon: Icon, label, value, tint }: { icon: typeof Layers; label: string; value: number | string; tint: "primary" | "accent" | "success" | "info" }) {
  const tints: Record<string, { bar: string; iconBg: string; iconColor: string }> = {
    primary: { bar: "border-l-primary", iconBg: "bg-primary/10", iconColor: "text-primary" },
    accent: { bar: "border-l-accent", iconBg: "bg-accent/10", iconColor: "text-accent" },
    success: { bar: "border-l-emerald-500", iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
    info: { bar: "border-l-sky-500", iconBg: "bg-sky-50", iconColor: "text-sky-600" },
  };
  const t = tints[tint];
  return (
    <Card className={`p-4 card-elevated border-0 border-l-4 ${t.bar}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">{label}</div>
          <div className="text-2xl font-bold mt-1.5 text-primary tabular-nums leading-none truncate">{value}</div>
        </div>
        <div className={`h-9 w-9 rounded-full flex items-center justify-center ${t.iconBg} ${t.iconColor} shrink-0`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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
