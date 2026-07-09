import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Landmark, MapPin } from "lucide-react";
import { toast } from "sonner";
import { db, useDB, type EntranceCity, type EntranceSite } from "@/lib/mock-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr } from "@/lib/format";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/entrances")({
  head: () => ({ meta: [{ title: "Entrances — MP Tourism Hub" }] }),
  component: EntrancesPage,
});

function EntrancesPage() {
  const data = useDB();
  const cities = useMemo(
    () => [...data.entrance_cities].sort((a, b) => a.name.localeCompare(b.name)),
    [data.entrance_cities],
  );
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    if (!selectedId && cities.length) setSelectedId(cities[0].id);
    if (selectedId && !cities.find((c) => c.id === selectedId)) setSelectedId(cities[0]?.id ?? "");
  }, [cities, selectedId]);

  const sites = useMemo(
    () => data.entrance_sites.filter((s) => s.city_id === selectedId),
    [data.entrance_sites, selectedId],
  );

  const [cityOpen, setCityOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<EntranceCity | null>(null);
  const [siteOpen, setSiteOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<EntranceSite | null>(null);

  function siteCount(cityId: string) {
    return data.entrance_sites.filter((s) => s.city_id === cityId).length;
  }

  function deleteCity(c: EntranceCity) {
    if (!confirm(`Delete "${c.name}" and all its sites?`)) return;
    db.deleteEntranceCity(c.id); toast.success("City deleted.");
  }
  function deleteSite(s: EntranceSite) {
    if (!confirm(`Delete "${s.site_name}"?`)) return;
    db.deleteEntranceSite(s.id); toast.success("Site deleted.");
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Entrances</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage entrance / monument charges by destination.</p>
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
                const active = c.id === selectedId;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors group",
                        active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="flex-1 text-left truncate">{c.name}</span>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px]", active && "bg-primary-foreground/20 text-primary-foreground")}
                      >
                        {siteCount(c.id)}
                      </Badge>
                      <span
                        className="opacity-0 group-hover:opacity-100 flex gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span
                          role="button"
                          className={cn("p-0.5 rounded hover:bg-black/10", active && "hover:bg-white/20")}
                          onClick={() => { setEditingCity(c); setCityOpen(true); }}
                        >
                          <Pencil className="h-3 w-3" />
                        </span>
                        <span
                          role="button"
                          className={cn("p-0.5 rounded hover:bg-black/10", active && "hover:bg-white/20")}
                          onClick={() => deleteCity(c)}
                        >
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

        {/* Sites panel */}
        <Card className="p-0 lg:col-span-3 overflow-hidden">
          {!selectedId ? (
            <div className="p-12 text-center">
              <Landmark className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <div className="font-medium">Select or add a city to manage sites.</div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b">
                <div>
                  <div className="font-semibold">
                    Sites in {cities.find((c) => c.id === selectedId)?.name}
                  </div>
                  <div className="text-xs text-muted-foreground">{sites.length} site(s)</div>
                </div>
                <Button size="sm" onClick={() => { setEditingSite(null); setSiteOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add Site
                </Button>
              </div>
              {sites.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-sm text-muted-foreground mb-3">No sites for this city yet.</div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingSite(null); setSiteOpen(true); }}>
                    <Plus className="h-4 w-4 mr-1.5" /> Add First Site
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site Name</TableHead>
                      <TableHead>Indian Rate (₹/pp)</TableHead>
                      <TableHead>Foreigner Rate (₹/pp)</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sites.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.site_name}</TableCell>
                        <TableCell className="tabular-nums">{inr(s.indian_rate)}</TableCell>
                        <TableCell className="tabular-nums">{inr(s.foreigner_rate)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs max-w-xs">{s.notes || "—"}</TableCell>
                        <TableCell>
                          <Switch checked={s.is_active} onCheckedChange={(v) => db.updateEntranceSite(s.id, { is_active: v })} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingSite(s); setSiteOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteSite(s)}>
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

      <CityDialog open={cityOpen} onOpenChange={setCityOpen} editing={editingCity} />
      <SiteDialog
        open={siteOpen}
        onOpenChange={setSiteOpen}
        editing={editingSite}
        cityId={selectedId}
      />
    </div>
  );
}

function CityDialog({
  open, onOpenChange, editing,
}: { open: boolean; onOpenChange: (v: boolean) => void; editing: EntranceCity | null }) {
  const [name, setName] = useState("");
  useMemo(() => { if (open) setName(editing?.name ?? ""); }, [open, editing]);

  function save() {
    if (!name.trim()) return toast.error("City name is required.");
    if (editing) { db.updateEntranceCity(editing.id, name.trim()); toast.success("City updated."); notify.info("City Updated", `${name.trim()} entrance city updated.`); }
    else { db.addEntranceCity(name.trim()); toast.success("City added."); notify.success("City Added", `${name.trim()} has been added to entrance cities.`); }
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

function SiteDialog({
  open, onOpenChange, editing, cityId,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editing: EntranceSite | null; cityId: string;
}) {
  const [name, setName] = useState("");
  const [indianRate, setIndianRate] = useState(0);
  const [foreignerRate, setForeignerRate] = useState(0);
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  useMemo(() => {
    if (open) {
      setName(editing?.site_name ?? "");
      setIndianRate(editing?.indian_rate ?? 0);
      setForeignerRate(editing?.foreigner_rate ?? 0);
      setNotes(editing?.notes ?? "");
      setActive(editing?.is_active ?? true);
    }
  }, [open, editing]);

  function save() {
    if (!cityId) return toast.error("Select a city first.");
    if (!name.trim()) return toast.error("Site name is required.");
    const payload = {
      city_id: cityId, site_name: name.trim(),
      indian_rate: indianRate, foreigner_rate: foreignerRate,
      notes, is_active: active,
    };
    const cityName = db.get().entrance_cities.find((c) => c.id === cityId)?.name ?? "";
    if (editing) { db.updateEntranceSite(editing.id, payload); toast.success("Site updated."); notify.info("Entrance Updated", `${name.trim()} details updated.`); }
    else { db.addEntranceSite(payload); toast.success("Site added."); notify.success("Entrance Added", `${name.trim()}${cityName ? ` in ${cityName}` : ""} has been added.`); }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit Site" : "Add Site"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Site Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gwalior Fort" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Indian Rate / person (₹)</Label>
              <Input type="number" min={0} value={indianRate} onChange={(e) => setIndianRate(+e.target.value || 0)} />
            </div>
            <div>
              <Label>Foreigner Rate / person (₹)</Label>
              <Input type="number" min={0} value={foreignerRate} onChange={(e) => setForeignerRate(+e.target.value || 0)} />
            </div>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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
