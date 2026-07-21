import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Pencil, UserCheck, MapPin, ArrowRight, Search, X, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  db, useDB, GUIDE_LANGUAGES, DEFAULT_GUIDE_LANGUAGES, guidePrimaryLanguage, guideConfiguredLanguages,
  type DestinationCity, type DestinationTour, type Guide, type GuideLanguage, type GuideLanguageRate,
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

function emptyRate(): GuideLanguageRate {
  return { rate_1_to_5: 0, rate_6_to_14: 0, rate_15_plus: 0 };
}

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

  // Dynamic list of languages configured across all guides.
  const availableLanguages = useMemo(() => {
    const s = new Set<GuideLanguage>(DEFAULT_GUIDE_LANGUAGES);
    data.guides.forEach((g) => guideConfiguredLanguages(g).forEach((l) => s.add(l)));
    return GUIDE_LANGUAGES.filter((l) => s.has(l));
  }, [data.guides]);

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
        const langs = r.guide ? guideConfiguredLanguages(r.guide) : [];
        return langs.includes(languageFilter as GuideLanguage);
      });
  }, [data.destination_tours, data.guides, selectedId, search, languageFilter]);

  const [editRow, setEditRow] = useState<Row | null>(null);
  const [viewRow, setViewRow] = useState<Row | null>(null);

  const tourCount = (cityId: string) =>
    data.destination_tours.filter((t) => t.city_id === cityId).length;

  const selectedCity = cities.find((c) => c.id === selectedId);

  function displayRates(g: Guide | undefined) {
    if (!g) return { lang: null as GuideLanguage | null, r5: 0, r14: 0, r15: 0 };
    const primary = guidePrimaryLanguage(g);
    if (primary && g.language_rates?.[primary]) {
      const r = g.language_rates[primary]!;
      return { lang: primary, r5: r.rate_1_to_5, r14: r.rate_6_to_14, r15: r.rate_15_plus };
    }
    return { lang: null, r5: g.rate_1_to_5 ?? 0, r14: g.rate_6_to_14 ?? 0, r15: g.rate_15_plus ?? 0 };
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Guides</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage language-wise guide rates by tour. Tour titles are managed inside{" "}
          <Link to="/destinations" className="text-primary underline underline-offset-2">Destinations</Link>.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
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
                    {availableLanguages.map((l) => (
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
                      <TableHead>Languages</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const g = r.guide;
                      const langs = g ? guideConfiguredLanguages(g) : [];
                      const disp = displayRates(g);
                      return (
                        <TableRow key={r.tour.id}>
                          <TableCell className="font-medium">
                            {r.tour.title}
                            {disp.lang && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                Showing {disp.lang} rates
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="tabular-nums">{disp.r5 ? inr(disp.r5) : "—"}</TableCell>
                          <TableCell className="tabular-nums">{disp.r14 ? inr(disp.r14) : "—"}</TableCell>
                          <TableCell className="tabular-nums">{disp.r15 ? inr(disp.r15) : "—"}</TableCell>
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
                            <Button variant="ghost" size="icon" onClick={() => setViewRow(r)} title="View">
                              <Search className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setEditRow(r)} title="Edit">
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
      <GuideViewDialog row={viewRow} onOpenChange={(v) => !v && setViewRow(null)} />
    </div>
  );
}

function GuidePricingDialog({
  row, onOpenChange,
}: { row: Row | null; onOpenChange: (v: boolean) => void }) {
  const open = !!row;
  const [rates, setRates] = useState<Partial<Record<GuideLanguage, GuideLanguageRate>>>({});
  const [active, setActive] = useState(true);
  const [addLangOpen, setAddLangOpen] = useState(false);
  const [pendingLang, setPendingLang] = useState<GuideLanguage | "">("");

  useEffect(() => {
    if (row) {
      const existing = row.guide?.language_rates ?? {};
      // Ensure defaults exist
      const seeded: Partial<Record<GuideLanguage, GuideLanguageRate>> = {
        Hindi: existing.Hindi ?? {
          rate_1_to_5: row.guide?.rate_1_to_5 ?? 0,
          rate_6_to_14: row.guide?.rate_6_to_14 ?? 0,
          rate_15_plus: row.guide?.rate_15_plus ?? 0,
        },
        English: existing.English ?? emptyRate(),
        ...existing,
      };
      setRates(seeded);
      setActive(row.guide?.is_active ?? true);
      setPendingLang("");
      setAddLangOpen(false);
    }
  }, [row]);

  const configuredLangs = Object.keys(rates) as GuideLanguage[];
  const addable = GUIDE_LANGUAGES.filter((l) => !configuredLangs.includes(l));

  function updateRate(lang: GuideLanguage, patch: Partial<GuideLanguageRate>) {
    setRates((prev) => ({
      ...prev,
      [lang]: { ...(prev[lang] ?? emptyRate()), ...patch },
    }));
  }

  function addLanguage() {
    if (!pendingLang) return;
    if (rates[pendingLang]) return;
    setRates((prev) => ({ ...prev, [pendingLang]: emptyRate() }));
    setPendingLang("");
    setAddLangOpen(false);
  }

  function removeLanguage(l: GuideLanguage) {
    if (DEFAULT_GUIDE_LANGUAGES.includes(l)) return;
    setRates((prev) => {
      const next = { ...prev };
      delete next[l];
      return next;
    });
  }

  function save() {
    if (!row) return;
    // Also mirror English (or Hindi fallback) into legacy top-level rates
    // so wizard calculations that reference rate_1_to_5 etc. keep working.
    const primary = rates.English ?? rates.Hindi;
    db.upsertGuidePricingForTour(row.tour.id, {
      language_rates: rates,
      languages: configuredLangs,
      rate_1_to_5: primary?.rate_1_to_5 ?? 0,
      rate_6_to_14: primary?.rate_6_to_14 ?? 0,
      rate_15_plus: primary?.rate_15_plus ?? 0,
      rate_per_day: primary?.rate_6_to_14 ?? 0,
      is_active: active,
    });
    toast.success("Guide updated.");
    notify.info("Guide Updated", `${row.tour.title} rates updated.`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Guide — {row?.tour.title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
            Tour title is managed in Destinations. Configure separate pricing for each language.
          </div>

          {configuredLangs.map((lang) => {
            const r = rates[lang] ?? emptyRate();
            const isDefault = DEFAULT_GUIDE_LANGUAGES.includes(lang);
            return (
              <div key={lang} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {lang}
                    {isDefault && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                  </div>
                  {!isDefault && (
                    <Button variant="ghost" size="icon" onClick={() => removeLanguage(lang)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Rate 1-5 Pax (₹)</Label>
                    <Input type="number" min={0} value={r.rate_1_to_5}
                      onChange={(e) => updateRate(lang, { rate_1_to_5: +e.target.value || 0 })} />
                  </div>
                  <div>
                    <Label className="text-xs">Rate 6-14 Pax (₹)</Label>
                    <Input type="number" min={0} value={r.rate_6_to_14}
                      onChange={(e) => updateRate(lang, { rate_6_to_14: +e.target.value || 0 })} />
                  </div>
                  <div>
                    <Label className="text-xs">Rate 15+ Pax (₹)</Label>
                    <Input type="number" min={0} value={r.rate_15_plus}
                      onChange={(e) => updateRate(lang, { rate_15_plus: +e.target.value || 0 })} />
                  </div>
                </div>
              </div>
            );
          })}

          {addable.length > 0 && (
            <div>
              {!addLangOpen ? (
                <Button variant="outline" size="sm" onClick={() => setAddLangOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Language
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Select value={pendingLang} onValueChange={(v) => setPendingLang(v as GuideLanguage)}>
                    <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Select language" /></SelectTrigger>
                    <SelectContent>
                      {addable.map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={addLanguage} disabled={!pendingLang}>Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAddLangOpen(false); setPendingLang(""); }}>Cancel</Button>
                </div>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm pt-2 border-t">
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

function GuideViewDialog({
  row, onOpenChange,
}: { row: Row | null; onOpenChange: (v: boolean) => void }) {
  const open = !!row;
  const g = row?.guide;
  const langs = g ? guideConfiguredLanguages(g) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Guide — {row?.tour.title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {langs.length === 0 && (
            <div className="text-sm text-muted-foreground">No language pricing configured yet.</div>
          )}
          {langs.map((lang) => {
            const r = g?.language_rates?.[lang];
            if (!r) return null;
            return (
              <div key={lang} className="border rounded-md p-3">
                <div className="font-medium mb-2">{lang}</div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-[11px] text-muted-foreground">1-5 Pax</div>
                    <div className="tabular-nums font-medium">{inr(r.rate_1_to_5)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">6-14 Pax</div>
                    <div className="tabular-nums font-medium">{inr(r.rate_6_to_14)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">15+ Pax</div>
                    <div className="tabular-nums font-medium">{inr(r.rate_15_plus)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
