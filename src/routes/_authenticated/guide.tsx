import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Pencil, UserCheck, MapPin, ArrowRight, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  db, useDB, GUIDE_LANGUAGES,
  type DestinationCity, type DestinationTour, type Guide, type GuideLanguage,
} from "@/lib/mock-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/format";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/guide")({
  head: () => ({ meta: [{ title: "Guides — MP Tourism Hub" }] }),
  component: GuidePage,
});

type Row = {
  tour: DestinationTour;
  guide: Guide | undefined;
};

function GuidePage() {
  const data = useDB();
  const cities = useMemo(
    () => [...data.destination_cities].sort((a, b) => a.name.localeCompare(b.name)),
    [data.destination_cities],
  );
  const [selectedId, setSelectedId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState<string>("all");

  useEffect(() => {
    if (!selectedId && cities.length) setSelectedId(cities[0].id);
    if (selectedId && !cities.find((c) => c.id === selectedId)) setSelectedId(cities[0]?.id ?? "");
  }, [cities, selectedId]);

  const rows: Row[] = useMemo(() => {
    const tours = data.destination_tours
      .filter((t) => t.city_id === selectedId)
      .sort((a, b) => a.title.localeCompare(b.title));
    const q = search.trim().toLowerCase();
    return tours
      .map<Row>((tour) => ({ tour, guide: data.guides.find((g) => g.tour_id === tour.id) }))
      .filter((r) => !q || r.tour.title.toLowerCase().includes(q))
      .filter((r) => {
        if (languageFilter === "all") return true;
        const langs = r.guide?.languages ?? [];
        return langs.includes(languageFilter as GuideLanguage);
      });
  }, [data.destination_tours, data.guides, selectedId, search, languageFilter]);

  const [editRow, setEditRow] = useState<Row | null>(null);

  const tourCount = (cityId: string) =>
    data.destination_tours.filter((t) => t.city_id === cityId).length;

  const selectedCity = cities.find((c) => c.id === selectedId);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Guides</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage guide rates & languages by tour. Tour titles are managed inside{" "}
          <Link to="/destinations" className="text-primary underline underline-offset-2">Destinations</Link>.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* City panel */}
        <Card className="p-4 lg:col-span-1 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Cities</h3>
            <Button asChild size="sm" variant="outline">
              <Link to="/destinations">Manage</Link>
            </Button>
          </div>
          {cities.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <MapPin className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              No cities yet.
            </div>
          ) : (
            <ul className="space-y-1">
              {cities.map((c) => {
                const active = c.id === selectedId;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                        active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="flex-1 text-left truncate">{c.name}</span>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px]", active && "bg-primary-foreground/20 text-primary-foreground")}
                      >
                        {tourCount(c.id)}
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Guides panel */}
        <Card className="p-0 lg:col-span-3 overflow-hidden">
          {!selectedCity ? (
            <div className="p-12 text-center">
              <UserCheck className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <div className="font-medium">Select or add a city.</div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b">
                <div className="flex-1 min-w-[240px]">
                  <div className="font-semibold">Guides in {selectedCity.name}</div>
                  <div className="text-xs text-muted-foreground">{rows.length} tour(s)</div>
                </div>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search tour title…"
                    className="pl-8 h-9 w-56"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Select value={languageFilter} onValueChange={setLanguageFilter}>
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Languages</SelectItem>
                    {GUIDE_LANGUAGES.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {rows.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {search || languageFilter !== "all"
                      ? "No guides match your filters."
                      : "No tours defined for this city. Add tour titles in Destinations."}
                  </div>
                  {!(search || languageFilter !== "all") && (
                    <Button asChild variant="outline" size="sm">
                      <Link to="/destinations">
                        Go to Destinations <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                      </Link>
                    </Button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tour Title</TableHead>
                      <TableHead>1-5 Pax</TableHead>
                      <TableHead>6-14 Pax</TableHead>
                      <TableHead>15+ Pax</TableHead>
                      <TableHead>Language</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-16 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const g = r.guide;
                      const langs = g?.languages ?? [];
                      return (
                        <TableRow key={r.tour.id}>
                          <TableCell className="font-medium">{r.tour.title}</TableCell>
                          <TableCell className="tabular-nums">{g?.rate_1_to_5 ? inr(g.rate_1_to_5) : "—"}</TableCell>
                          <TableCell className="tabular-nums">{g?.rate_6_to_14 ? inr(g.rate_6_to_14) : "—"}</TableCell>
                          <TableCell className="tabular-nums">{g?.rate_15_plus ? inr(g.rate_15_plus) : "—"}</TableCell>
                          <TableCell>
                            {langs.length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {langs.map((l) => (
                                  <Badge key={l} variant="secondary" className="text-[10px]">{l}</Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={g?.is_active ?? true}
                              onCheckedChange={(v) => db.upsertGuidePricingForTour(r.tour.id, { is_active: v })}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => setEditRow(r)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </Card>
      </div>

      <GuidePricingDialog row={editRow} onOpenChange={(v) => !v && setEditRow(null)} />
    </div>
  );
}

function GuidePricingDialog({
  row, onOpenChange,
}: { row: Row | null; onOpenChange: (v: boolean) => void }) {
  const open = !!row;
  const [r5, setR5] = useState(0);
  const [r14, setR14] = useState(0);
  const [r15, setR15] = useState(0);
  const [languages, setLanguages] = useState<GuideLanguage[]>([]);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (row) {
      setR5(row.guide?.rate_1_to_5 ?? 0);
      setR14(row.guide?.rate_6_to_14 ?? 0);
      setR15(row.guide?.rate_15_plus ?? 0);
      setLanguages(row.guide?.languages ?? []);
      setActive(row.guide?.is_active ?? true);
    }
  }, [row]);

  const toggleLang = (l: GuideLanguage) =>
    setLanguages((prev) => prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]);

  function save() {
    if (!row) return;
    db.upsertGuidePricingForTour(row.tour.id, {
      rate_1_to_5: r5,
      rate_6_to_14: r14,
      rate_15_plus: r15,
      rate_per_day: r14,
      languages,
      is_active: active,
    });
    toast.success("Guide updated.");
    notify.info("Guide Updated", `${row.tour.title} rates updated.`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit Guide — {row?.tour.title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
            Tour title is managed in Destinations and cannot be changed here.
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Rate 1-5 Pax (₹)</Label><Input type="number" min={0} value={r5} onChange={(e) => setR5(+e.target.value || 0)} /></div>
            <div><Label>Rate 6-14 Pax (₹)</Label><Input type="number" min={0} value={r14} onChange={(e) => setR14(+e.target.value || 0)} /></div>
            <div><Label>Rate 15+ Pax (₹)</Label><Input type="number" min={0} value={r15} onChange={(e) => setR15(+e.target.value || 0)} /></div>
          </div>
          <div>
            <Label>Language (multi-select)</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {GUIDE_LANGUAGES.map((l) => {
                const selected = languages.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => toggleLang(l)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border",
                    )}
                  >
                    {selected ? "✓ " : ""}{l}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={setActive} /> Active
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
