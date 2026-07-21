import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, UserCheck, MapPin } from "lucide-react";
import { toast } from "sonner";
import { db, useDB, type Guide } from "@/lib/mock-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr } from "@/lib/format";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/guide")({
  head: () => ({ meta: [{ title: "Guides — MP Tourism Hub" }] }),
  component: GuidePage,
});

const guideCity = (g: Guide) => g.city ?? g.destination ?? "";

function GuidePage() {
  const data = useDB();

  // Union of persisted guide_cities and any city present on guide records.
  const cities = useMemo(() => {
    const set = new Set<string>(data.guide_cities ?? []);
    data.guides.forEach((g) => { const c = guideCity(g); if (c) set.add(c); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data.guide_cities, data.guides]);

  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    if (!selected && cities.length) setSelected(cities[0]);
    if (selected && !cities.includes(selected)) setSelected(cities[0] ?? "");
  }, [cities, selected]);

  const guidesForCity = useMemo(
    () => data.guides.filter((g) => guideCity(g) === selected).sort((a, b) => (a.tour_program ?? a.name).localeCompare(b.tour_program ?? b.name)),
    [data.guides, selected],
  );
  const count = (city: string) => data.guides.filter((g) => guideCity(g) === city).length;

  const [cityOpen, setCityOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [editingGuide, setEditingGuide] = useState<Guide | null>(null);

  function delCity(c: string) {
    if (!confirm(`Delete "${c}" and all its guides?`)) return;
    db.deleteGuideCity(c); toast.success("City deleted.");
  }
  function delGuide(g: Guide) {
    if (!confirm(`Delete "${g.tour_program ?? g.name}"?`)) return;
    db.deleteGuide(g.id); toast.success("Guide deleted.");
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Guides</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage guide tours and pax-tier rates by city.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* City panel */}
        <Card className="p-4 lg:col-span-1 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Cities</h3>
            <Button size="sm" variant="outline" onClick={() => { setEditingCity(null); setCityOpen(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
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
                const active = c === selected;
                return (
                  <li key={c}>
                    <button
                      onClick={() => setSelected(c)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors group",
                        active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="flex-1 text-left truncate">{c}</span>
                      <Badge variant="secondary" className={cn("text-[10px]", active && "bg-primary-foreground/20 text-primary-foreground")}>
                        {count(c)}
                      </Badge>
                      <span className="opacity-0 group-hover:opacity-100 flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <span role="button" className={cn("p-0.5 rounded hover:bg-black/10", active && "hover:bg-white/20")} onClick={() => { setEditingCity(c); setCityOpen(true); }}>
                          <Pencil className="h-3 w-3" />
                        </span>
                        <span role="button" className={cn("p-0.5 rounded hover:bg-black/10", active && "hover:bg-white/20")} onClick={() => delCity(c)}>
                          <Trash2 className="h-3 w-3" />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Guides panel */}
        <Card className="p-0 lg:col-span-3 overflow-hidden">
          {!selected ? (
            <div className="p-12 text-center">
              <UserCheck className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <div className="font-medium">Select or add a city to manage guides.</div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b">
                <div>
                  <div className="font-semibold">Guides in {selected}</div>
                  <div className="text-xs text-muted-foreground">{guidesForCity.length} tour(s)</div>
                </div>
                <Button size="sm" onClick={() => { setEditingGuide(null); setGuideOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add Guide
                </Button>
              </div>
              {guidesForCity.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-sm text-muted-foreground mb-3">No guides for this city yet.</div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingGuide(null); setGuideOpen(true); }}>
                    <Plus className="h-4 w-4 mr-1.5" /> Add First Guide
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>City Tour</TableHead>
                      <TableHead>1-5 Pax</TableHead>
                      <TableHead>6-14 Pax</TableHead>
                      <TableHead>15+ Pax</TableHead>
                      <TableHead>Escort</TableHead>
                      <TableHead>Indian Entry</TableHead>
                      <TableHead>Inbound Entry</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {guidesForCity.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="font-medium">{g.tour_program ?? g.name}</TableCell>
                        <TableCell className="tabular-nums">{g.rate_1_to_5 != null ? inr(g.rate_1_to_5) : "—"}</TableCell>
                        <TableCell className="tabular-nums">{g.rate_6_to_14 != null ? inr(g.rate_6_to_14) : "—"}</TableCell>
                        <TableCell className="tabular-nums">{g.rate_15_plus != null ? inr(g.rate_15_plus) : "—"}</TableCell>
                        <TableCell className="tabular-nums">{g.escort_rate != null ? inr(g.escort_rate) : "—"}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{g.indian_entry != null ? inr(g.indian_entry) : "NA"}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{g.inbound_entry != null ? inr(g.inbound_entry) : "NA"}</TableCell>
                        <TableCell>
                          <Switch checked={g.is_active} onCheckedChange={(v) => db.updateGuide(g.id, { is_active: v })} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingGuide(g); setGuideOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => delGuide(g)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </Card>
      </div>

      <CityDialog open={cityOpen} onOpenChange={setCityOpen} editing={editingCity} onSaved={(name) => setSelected(name)} />
      <GuideDialog open={guideOpen} onOpenChange={setGuideOpen} editing={editingGuide} city={selected} />
    </div>
  );
}

function CityDialog({
  open, onOpenChange, editing, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; editing: string | null; onSaved: (name: string) => void }) {
  const [name, setName] = useState("");
  useEffect(() => { if (open) setName(editing ?? ""); }, [open, editing]);

  function save() {
    const n = name.trim();
    if (!n) return toast.error("City name is required.");
    if (editing) { db.renameGuideCity(editing, n); toast.success("City updated."); }
    else { db.addGuideCity(n); toast.success("City added."); notify.success("Guide City Added", `${n} added.`); }
    onSaved(n);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit City" : "Add City"}</DialogTitle></DialogHeader>
        <div>
          <Label>City Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gwalior" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type NumOrNA = number | "NA";
const parseOpt = (v: NumOrNA): number | undefined => v === "NA" ? undefined : v;

function GuideDialog({
  open, onOpenChange, editing, city,
}: { open: boolean; onOpenChange: (v: boolean) => void; editing: Guide | null; city: string }) {
  const [tour, setTour] = useState("");
  const [r5, setR5] = useState(0);
  const [r14, setR14] = useState(0);
  const [r15, setR15] = useState(0);
  const [escort, setEscort] = useState(5000);
  const [indian, setIndian] = useState<NumOrNA>("NA");
  const [inbound, setInbound] = useState<NumOrNA>("NA");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (open) {
      setTour(editing?.tour_program ?? "");
      setR5(editing?.rate_1_to_5 ?? 0);
      setR14(editing?.rate_6_to_14 ?? 0);
      setR15(editing?.rate_15_plus ?? 0);
      setEscort(editing?.escort_rate ?? 5000);
      setIndian(editing?.indian_entry != null ? editing.indian_entry : "NA");
      setInbound(editing?.inbound_entry != null ? editing.inbound_entry : "NA");
      setActive(editing?.is_active ?? true);
    }
  }, [open, editing]);

  function save() {
    if (!city) return toast.error("Select a city first.");
    if (!tour.trim()) return toast.error("City tour name is required.");
    const payload: Partial<Guide> = {
      name: `${city} — ${tour.trim()}`,
      guide_type: "English Guide - Local",
      destination: city,
      city,
      tour_program: tour.trim(),
      rate_1_to_5: r5, rate_6_to_14: r14, rate_15_plus: r15,
      rate_per_day: r14,
      escort_rate: escort,
      indian_entry: parseOpt(indian),
      inbound_entry: parseOpt(inbound),
      is_active: active,
      description: editing?.description ?? "",
    };
    if (editing) { db.updateGuide(editing.id, payload); toast.success("Guide updated."); }
    else { db.addGuide(payload as Omit<Guide, "id" | "created_at">); toast.success("Guide added."); notify.success("Guide Added", `${payload.name}`); }
    onOpenChange(false);
  }

  const naField = (label: string, val: NumOrNA, setVal: (v: NumOrNA) => void) => (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number" min={0}
          value={val === "NA" ? "" : val}
          placeholder="NA"
          onChange={(e) => setVal(e.target.value === "" ? "NA" : (+e.target.value || 0))}
          disabled={val === "NA"}
        />
        <label className="flex items-center gap-1 text-[11px] whitespace-nowrap">
          <input type="checkbox" checked={val === "NA"} onChange={(e) => setVal(e.target.checked ? "NA" : 0)} />
          NA
        </label>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Edit Guide" : "Add Guide"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>City</Label>
              <Input value={city} disabled />
            </div>
            <div>
              <Label>City Tour Name</Label>
              <Input value={tour} onChange={(e) => setTour(e.target.value)} placeholder="e.g. HDCT + Aarti" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Rate 1-5 Pax (₹)</Label><Input type="number" min={0} value={r5} onChange={(e) => setR5(+e.target.value || 0)} /></div>
            <div><Label>Rate 6-14 Pax (₹)</Label><Input type="number" min={0} value={r14} onChange={(e) => setR14(+e.target.value || 0)} /></div>
            <div><Label>Rate 15+ Pax (₹)</Label><Input type="number" min={0} value={r15} onChange={(e) => setR15(+e.target.value || 0)} /></div>
          </div>
          <div>
            <Label>Escort Rate / day (₹)</Label>
            <Input type="number" min={0} value={escort} onChange={(e) => setEscort(+e.target.value || 0)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {naField("Indian Entry (₹)", indian, setIndian)}
            {naField("Inbound Entry (₹)", inbound, setInbound)}
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
