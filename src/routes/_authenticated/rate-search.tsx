import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Wifi, Waves } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDB, MEAL_PLANS } from "@/lib/mock-store";
import { CategoryBadge } from "@/components/CategoryBadge";

export const Route = createFileRoute("/_authenticated/rate-search")({
  head: () => ({ meta: [{ title: "Rate Search — MP Tourism Hub" }] }),
  component: RateSearchPage,
});

function RateSearchPage() {
  const data = useDB();
  const [cityId, setCityId] = useState<string>("all");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const results = useMemo(() => {
    const target = new Date(date);
    return data.hotels
      .filter((h) => cityId === "all" || h.city_id === cityId)
      .map((h) => {
        const rooms = data.room_categories.filter((r) => r.hotel_id === h.id);
        const offers = rooms.flatMap((r) => {
          const plans = data.rate_plans.filter(
            (p) => p.room_category_id === r.id &&
              new Date(p.validity_start) <= target && new Date(p.validity_end) >= target,
          );
          if (plans.length === 0) return [];
          const rates: Record<string, number | null> = { CP: null, MAP: null, AP: null };
          MEAL_PLANS.forEach((mp) => {
            const p = plans.find((x) => x.meal_plan === mp);
            if (p) rates[mp] = p.double_rate;
          });
          return [{ room: r.name, rates, plans }];
        });
        return { hotel: h, city: data.cities.find((c) => c.id === h.city_id)?.name ?? "", offers };
      })
      .filter((r) => r.offers.length > 0)
      .sort((a, b) => (a.offers[0].rates.CP ?? 9e9) - (b.offers[0].rates.CP ?? 9e9));
  }, [data, cityId, date]);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rate Search</h1>
        <p className="text-sm text-muted-foreground mt-1">Find applicable rates by city and check-in date.</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground">City</label>
            <Select value={cityId} onValueChange={setCityId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cities</SelectItem>
                {data.cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Check-in date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[180px]" />
          </div>
          <Button><Search className="h-4 w-4 mr-2" /> Search</Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {results.map(({ hotel, city, offers }) => (
          <Card key={hotel.id} className="p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link to="/hotels/$id" params={{ id: hotel.id }} className="font-semibold hover:text-primary">{hotel.name}</Link>
                <div className="text-xs text-muted-foreground mt-0.5">{city}</div>
              </div>
              <CategoryBadge category={hotel.hotel_category} />
            </div>
            <div className="flex items-center gap-3 mt-2 text-muted-foreground">
              {hotel.has_wifi && <Wifi className="h-4 w-4 text-teal" />}
              {hotel.has_pool && <Waves className="h-4 w-4 text-sky-600" />}
            </div>
            <div className="mt-4 space-y-3">
              {offers.map((o, i) => (
                <div key={i} className="rounded-md border border-border p-3">
                  <div className="text-sm font-medium mb-2">{o.room}</div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {MEAL_PLANS.map((mp) => (
                      <div key={mp} className="rounded bg-muted/50 py-1.5">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{mp}</div>
                        <div className="text-sm font-semibold tabular-nums">
                          {o.rates[mp] ? `₹${o.rates[mp]!.toLocaleString()}` : "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Link to="/hotels/$id" params={{ id: hotel.id }} className="text-xs text-primary font-medium hover:underline mt-3 inline-block">
              View full details →
            </Link>
          </Card>
        ))}
        {results.length === 0 && (
          <Card className="p-12 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
            No rates found for the selected city and date.
          </Card>
        )}
      </div>
    </div>
  );
}
