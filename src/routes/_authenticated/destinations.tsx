import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, MapPin, Route as RouteIcon } from "lucide-react";
import { toast } from "sonner";
import { db, useDB, type DestinationCity, type DestinationTour } from "@/lib/mock-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notify } from "@/lib/notify";
import { destinationsRemote } from "@/lib/destinations-remote";

export const Route = createFileRoute("/_authenticated/destinations")({
  head: () => ({ meta: [{ title: "Destinations — MP Tourism Hub" }] }),
  component: DestinationsPage,
});

function DestinationsPage() {
  const data = useDB();
  const cities = useMemo(
    () => [...data.destination_cities].sort((a, b) => a.name.localeCompare(b.name)),
    [data.destination_cities],
  );
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    if (!selectedId && cities.length) setSelectedId(cities[0].id);
    if (selectedId && !cities.find((c) => c.id === selectedId)) setSelectedId(cities[0]?.id ?? "");
  }, [cities, selectedId]);

  const tours = useMemo(
    () => data.destination_tours.filter((t) => t.city_id === selectedId).sort((a, b) => a.title.localeCompare(b.title)),
    [data.destination_tours, selectedId],
  );

  const [cityOpen, setCityOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<DestinationCity | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [editingTour, setEditingTour] = useState<DestinationTour | null>(null);

  const tourCount = (cityId: string) =>
    data.destination_tours.filter((t) => t.city_id === cityId).length;

  async function deleteCity(c: DestinationCity) {
    if (!confirm(`Delete "${c.name}"?\n\nThis will remove the city from Entrances and Guide.`)) return;
    try {
      await destinationsRemote.deleteCity(c.id);
      toast.success("City deleted.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function deleteTour(t: DestinationTour) {
    if (!confirm(`Delete "${t.title}"?\n\nThis will remove it from Entrances and Guide.`)) return;
    try {
      await destinationsRemote.deleteTour(t.id);
      toast.success("Tour deleted.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const selectedCity = cities.find((c) => c.id === selectedId);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Destinations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Master data for cities & tour titles. Used by Entrances and Guide modules.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* City panel */}
        <Card className="p-4 lg:col-span-1 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Cities</h3>
            <Button size="sm" variant="outline" onClick={() => { setEditingCity(null); setCityOpen(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add City
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
                        {tourCount(c.id)}
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

        {/* Tours panel */}
        <Card className="p-0 lg:col-span-3 overflow-hidden">
          {!selectedCity ? (
            <div className="p-12 text-center">
              <RouteIcon className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <div className="font-medium">Select or add a city to manage tours.</div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b">
                <div>
                  <div className="font-semibold">Tours in {selectedCity.name}</div>
                  <div className="text-xs text-muted-foreground">{tours.length} tour(s)</div>
                </div>
                <Button size="sm" onClick={() => { setEditingTour(null); setTourOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add Tour
                </Button>
              </div>
              {tours.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-sm text-muted-foreground mb-3">No tours for this city yet.</div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingTour(null); setTourOpen(true); }}>
                    <Plus className="h-4 w-4 mr-1.5" /> Add First Tour
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tour Title</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tours.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.title}</TableCell>
                        <TableCell className="text-muted-foreground text-xs max-w-xl">
                          {t.description || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingTour(t); setTourOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteTour(t)}>
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

      <CityDialog open={cityOpen} onOpenChange={setCityOpen} editing={editingCity} onSaved={(id) => setSelectedId(id)} />
      <TourDialog open={tourOpen} onOpenChange={setTourOpen} editing={editingTour} cityId={selectedId} />
    </div>
  );
}

function CityDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editing: DestinationCity | null; onSaved: (id: string) => void;
}) {
  const [name, setName] = useState("");
  useEffect(() => { if (open) setName(editing?.name ?? ""); }, [open, editing]);

  const [saving, setSaving] = useState(false);

  async function save() {
    const n = name.trim();
    if (!n) return toast.error("City name is required.");
    setSaving(true);
    try {
      if (editing) {
        await destinationsRemote.renameCity(editing.id, n);
        toast.success("City updated.");
        notify.info("Destination Updated", `${n} updated.`);
        onSaved(editing.id);
      } else {
        const exists = db.get().destination_cities.some((c) => c.name.toLowerCase() === n.toLowerCase());
        if (exists) {
          setSaving(false);
          return toast.error("City already exists.");
        }
        const id = await destinationsRemote.addCity(n);
        toast.success("City added.");
        notify.success("Destination Added", `${n} has been added.`);
        onSaved(id);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit City" : "Add City"}</DialogTitle>
          <DialogDescription className="sr-only">
            {editing ? "Rename this destination city." : "Add a destination city to the master list."}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label>City Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gwalior" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TourDialog({
  open, onOpenChange, editing, cityId,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editing: DestinationTour | null; cityId: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? "");
      setDescription(editing?.description ?? "");
    }
  }, [open, editing]);

  const [saving, setSaving] = useState(false);

  async function save() {
    if (!cityId) return toast.error("Select a city first.");
    const t = title.trim();
    if (!t) return toast.error("Tour title is required.");
    setSaving(true);
    try {
      if (editing) {
        await destinationsRemote.updateTour(editing.id, { title: t, description });
        toast.success("Tour updated.");
        notify.info("Tour Updated", `${t} updated across Entrances & Guide.`);
      } else {
        const exists = db
          .get()
          .destination_tours.some((x) => x.city_id === cityId && x.title.toLowerCase() === t.toLowerCase());
        if (exists) {
          setSaving(false);
          return toast.error("Tour already exists in this city.");
        }
        await destinationsRemote.addTour({ city_id: cityId, title: t, description });
        toast.success("Tour added.");
        notify.success("Tour Added", `${t} is now available in Entrances & Guide.`);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Tour" : "Add Tour"}</DialogTitle>
          <DialogDescription className="sr-only">
            {editing ? "Update this tour title or description." : "Add a tour title for the selected city."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tour Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AM HDCT, FDCT, PM Fort" />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
            This tour will automatically appear inside <strong>Entrances</strong> and <strong>Guide</strong> for the selected city.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
