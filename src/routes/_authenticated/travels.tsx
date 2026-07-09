import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Plane } from "lucide-react";
import { toast } from "sonner";
import { db, useDB, type TravelOption } from "@/lib/mock-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr } from "@/lib/format";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/travels")({
  head: () => ({ meta: [{ title: "Travels — MP Tourism Hub" }] }),
  component: TravelsPage,
});

function TravelsPage() {
  const data = useDB();
  const items = useMemo(() => [...data.travel_options].sort((a, b) => a.vehicle_type.localeCompare(b.vehicle_type)), [data.travel_options]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TravelOption | null>(null);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Travels</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage transport options and rates.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1.5" /> Add Vehicle</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-12 text-center">
            <Plane className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <div className="font-medium">No vehicles yet</div>
            <div className="text-sm text-muted-foreground mt-1 mb-4">Add your first vehicle to include in tour packages.</div>
            <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1.5" /> Add Vehicle</Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Rate / Day</TableHead>
                <TableHead>Rate / KM</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.vehicle_type}</TableCell>
                  <TableCell className="text-muted-foreground max-w-sm">{v.description || "—"}</TableCell>
                  <TableCell className="tabular-nums">{v.capacity_persons} pax</TableCell>
                  <TableCell className="tabular-nums">{inr(v.rate_per_day)}</TableCell>
                  <TableCell className="tabular-nums">{inr(v.rate_per_km)}</TableCell>
                  <TableCell>
                    <Switch checked={v.is_active} onCheckedChange={(c) => db.updateTravel(v.id, { is_active: c })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(v); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete "${v.vehicle_type}"?`)) { db.deleteTravel(v.id); toast.success("Vehicle deleted."); } }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <TravelDialog open={open} onOpenChange={setOpen} editing={editing} />
    </div>
  );
}

function TravelDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing: TravelOption | null }) {
  const [vehicleType, setVehicleType] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState<number>(4);
  const [ratePerDay, setRatePerDay] = useState<number>(0);
  const [ratePerKm, setRatePerKm] = useState<number>(0);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (open) {
      setVehicleType(editing?.vehicle_type ?? "");
      setDescription(editing?.description ?? "");
      setCapacity(editing?.capacity_persons ?? 4);
      setRatePerDay(editing?.rate_per_day ?? 0);
      setRatePerKm(editing?.rate_per_km ?? 0);
      setActive(editing?.is_active ?? true);
    }
  }, [open, editing]);

  function save() {
    if (!vehicleType.trim()) return toast.error("Vehicle type is required.");
    const payload = { vehicle_type: vehicleType.trim(), description, capacity_persons: capacity, rate_per_day: ratePerDay, rate_per_km: ratePerKm, is_active: active };
    if (editing) { db.updateTravel(editing.id, payload); toast.success("Vehicle updated."); }
    else { db.addTravel(payload); toast.success("Vehicle added."); }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Vehicle Type</Label><Input value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} placeholder="e.g. AC Sedan" /></div>
          <div><Label>Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Capacity (pax)</Label><Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(+e.target.value || 1)} /></div>
            <div><Label>Rate / Day (₹)</Label><Input type="number" min={0} value={ratePerDay} onChange={(e) => setRatePerDay(+e.target.value || 0)} /></div>
            <div><Label>Rate / KM (₹)</Label><Input type="number" min={0} value={ratePerKm} onChange={(e) => setRatePerKm(+e.target.value || 0)} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={active} onCheckedChange={setActive} /> Active</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
