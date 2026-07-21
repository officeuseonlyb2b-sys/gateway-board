import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Landmark, MapPin, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { db, useDB, type DestinationCity, type DestinationTour, type EntranceSite } from "@/lib/mock-store";
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

type Row = {
  tour: DestinationTour;
  site: EntranceSite | undefined;
};

function EntrancesPage() {
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

  const rows: Row[] = useMemo(() => {
    const tours = data.destination_tours
      .filter((t) => t.city_id === selectedId)
      .sort((a, b) => a.title.localeCompare(b.title));
    return tours.map((tour) => ({
      tour,
      site: data.entrance_sites.find((s) => s.tour_id === tour.id),
    }));
  }, [data.destination_tours, data.entrance_sites, selectedId]);

  const [cityOpen, setCityOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<DestinationCity | null>(null);
  const [editRow, setEditRow] = useState<Row | null>(null);

  const tourCount = (cityId: string) =>
    data.destination_tours.filter((t) => t.city_id === cityId).length;

  const selectedCity = cities.find((c) => c.id === selectedId);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Entrances</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage entrance / monument charges by destination. Tour titles are managed inside{" "}
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

        {/* Rows panel */}
        <Card className="p-0 lg:col-span-3 overflow-hidden">
          {!selectedCity ? (
            <div className="p-12 text-center">
              <Landmark className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <div className="font-medium">Select or add a city.</div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b">
                <div>
                  <div className="font-semibold">Entrance Fees in {selectedCity.name}</div>
                  <div className="text-xs text-muted-foreground">{rows.length} tour(s)</div>
                </div>
              </div>
              {rows.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <div className="text-sm text-muted-foreground">
                    No tours defined for this city. Add tour titles in Destinations.
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/destinations">
                      Go to Destinations <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tour Title</TableHead>
                      <TableHead>Indian (₹/pp)</TableHead>
                      <TableHead>Foreigner (₹/pp)</TableHead>
                      <TableHead>Student (₹/pp)</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-16 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.tour.id}>
                        <TableCell className="font-medium">{r.tour.title}</TableCell>
                        <TableCell className="tabular-nums">{r.site?.indian_rate ? inr(r.site.indian_rate) : "—"}</TableCell>
                        <TableCell className="tabular-nums">{r.site?.foreigner_rate ? inr(r.site.foreigner_rate) : "—"}</TableCell>
                        <TableCell className="tabular-nums">{r.site?.student_rate ? inr(r.site.student_rate) : "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-xs max-w-xs">{r.site?.notes || "—"}</TableCell>
                        <TableCell>
                          <Switch
                            checked={r.site?.is_active ?? true}
                            onCheckedChange={(v) => db.upsertEntrancePricingForTour(r.tour.id, { is_active: v })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => setEditRow(r)}>
                            <Pencil className="h-4 w-4" />
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
      <PriceDialog row={editRow} onOpenChange={(v) => !v && setEditRow(null)} />
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

  function save() {
    const n = name.trim();
    if (!n) return toast.error("City name is required.");
    if (editing) {
      db.renameDestinationCity(editing.id, n);
      toast.success("City updated.");
      onSaved(editing.id);
    } else {
      const c = db.addDestinationCity(n);
      if (!c) return toast.error("City already exists.");
      toast.success("City added.");
      notify.success("Destination Added", `${n} has been added.`);
      onSaved(c.id);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit City" : "Add City"}</DialogTitle></DialogHeader>
        <div>
          <Label>City Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gwalior" />
          <p className="text-xs text-muted-foreground mt-2">Cities are shared with Guide and Destinations.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PriceDialog({
  row, onOpenChange,
}: { row: Row | null; onOpenChange: (v: boolean) => void }) {
  const open = !!row;
  const [indianRate, setIndianRate] = useState<number>(0);
  const [foreignerRate, setForeignerRate] = useState<number>(0);
  const [studentRate, setStudentRate] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (row) {
      setIndianRate(row.site?.indian_rate ?? 0);
      setForeignerRate(row.site?.foreigner_rate ?? 0);
      setStudentRate(row.site?.student_rate ?? 0);
      setNotes(row.site?.notes ?? "");
      setActive(row.site?.is_active ?? true);
    }
  }, [row]);

  function save() {
    if (!row) return;
    db.upsertEntrancePricingForTour(row.tour.id, {
      indian_rate: indianRate,
      foreigner_rate: foreignerRate,
      student_rate: studentRate,
      notes,
      is_active: active,
    });
    toast.success("Entrance updated.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Entrance — {row?.tour.title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
            Tour title is managed in Destinations and cannot be changed here.
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Indian (₹/pp)</Label>
              <Input type="number" min={0} value={indianRate} onChange={(e) => setIndianRate(+e.target.value || 0)} />
            </div>
            <div>
              <Label>Foreigner (₹/pp)</Label>
              <Input type="number" min={0} value={foreignerRate} onChange={(e) => setForeignerRate(+e.target.value || 0)} />
            </div>
            <div>
              <Label>Student (₹/pp)</Label>
              <Input type="number" min={0} value={studentRate} onChange={(e) => setStudentRate(+e.target.value || 0)} />
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
