import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Compass, MapPin } from "lucide-react";
import { toast } from "sonner";
import {
  db, useDB, type Activity, type ActivityDestination, type ActivityPricingType,
} from "@/lib/mock-store";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/format";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/activities")({
  head: () => ({ meta: [{ title: "Activity & Experience — MP Tourism Hub" }] }),
  component: ActivitiesPage,
});

const PRICING_LABEL: Record<ActivityPricingType, string> = {
  per_person: "Per Person",
  total_fixed: "Total Fixed",
  per_vehicle: "Per Vehicle",
};

function ActivitiesPage() {
  const data = useDB();
  const destinations = useMemo(
    () => [...data.activity_destinations].sort((a, b) => a.name.localeCompare(b.name)),
    [data.activity_destinations],
  );
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (!selectedId && destinations.length) setSelectedId(destinations[0].id);
    if (selectedId && !destinations.find((c) => c.id === selectedId)) setSelectedId(destinations[0]?.id ?? "");
  }, [destinations, selectedId]);

  const activities = useMemo(
    () => data.activities.filter((a) => a.destination_id === selectedId),
    [data.activities, selectedId],
  );

  const [destOpen, setDestOpen] = useState(false);
  const [editingDest, setEditingDest] = useState<ActivityDestination | null>(null);
  const [actOpen, setActOpen] = useState(false);
  const [editingAct, setEditingAct] = useState<Activity | null>(null);

  function actCount(id: string) { return data.activities.filter((a) => a.destination_id === id).length; }
  function deleteDest(d: ActivityDestination) {
    if (!confirm(`Delete "${d.name}" and all its activities?`)) return;
    db.deleteActivityDestination(d.id); toast.success("Destination deleted.");
  }
  function deleteAct(a: Activity) {
    if (!confirm(`Delete "${a.activity_name}"?`)) return;
    db.deleteActivity(a.id); toast.success("Activity deleted.");
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity &amp; Experience</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage destination-wise activities and experiences with pricing.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="p-4 lg:col-span-1 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Destinations</h3>
            <Button size="sm" variant="outline" onClick={() => { setEditingDest(null); setDestOpen(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
          {destinations.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <MapPin className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              No destinations yet.
            </div>
          ) : (
            <ul className="space-y-1">
              {destinations.map((d) => {
                const active = d.id === selectedId;
                return (
                  <li key={d.id}>
                    <button
                      onClick={() => setSelectedId(d.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors group",
                        active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      <Compass className="h-3.5 w-3.5" />
                      <span className="flex-1 text-left truncate">{d.name}</span>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px]", active && "bg-primary-foreground/20 text-primary-foreground")}
                      >
                        {actCount(d.id)}
                      </Badge>
                      <span
                        className="opacity-0 group-hover:opacity-100 flex gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span role="button" onClick={() => { setEditingDest(d); setDestOpen(true); }}>
                          <Pencil className="h-3 w-3" />
                        </span>
                        <span role="button" onClick={() => deleteDest(d)}>
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

        <Card className="p-0 lg:col-span-3 overflow-hidden">
          {!selectedId ? (
            <div className="p-12 text-center">
              <Compass className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <div className="font-medium">Select or add a destination to manage activities.</div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b">
                <div>
                  <div className="font-semibold">
                    Activities in {destinations.find((c) => c.id === selectedId)?.name}
                  </div>
                  <div className="text-xs text-muted-foreground">{activities.length} activity(s)</div>
                </div>
                <Button size="sm" onClick={() => { setEditingAct(null); setActOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add Activity
                </Button>
              </div>
              {activities.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-sm text-muted-foreground mb-3">No activities for this destination yet.</div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingAct(null); setActOpen(true); }}>
                    <Plus className="h-4 w-4 mr-1.5" /> Add First Activity
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Activity Name</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Pricing Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">
                          {a.activity_name}
                          {a.unit_label && <div className="text-[11px] text-muted-foreground">{a.unit_label}</div>}
                        </TableCell>
                        <TableCell className="tabular-nums">{inr(a.price)}</TableCell>
                        <TableCell>{PRICING_LABEL[a.pricing_type]}</TableCell>
                        <TableCell className="text-muted-foreground text-xs max-w-xs">{a.description || "—"}</TableCell>
                        <TableCell>
                          <Switch checked={a.is_active} onCheckedChange={(v) => db.updateActivity(a.id, { is_active: v })} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingAct(a); setActOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteAct(a)}>
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

      <DestDialog open={destOpen} onOpenChange={setDestOpen} editing={editingDest} />
      <ActDialog open={actOpen} onOpenChange={setActOpen} editing={editingAct} destId={selectedId} />
    </div>
  );
}

function DestDialog({
  open, onOpenChange, editing,
}: { open: boolean; onOpenChange: (v: boolean) => void; editing: ActivityDestination | null }) {
  const [name, setName] = useState("");
  useMemo(() => { if (open) setName(editing?.name ?? ""); }, [open, editing]);

  function save() {
    if (!name.trim()) return toast.error("Destination name is required.");
    if (editing) { db.updateActivityDestination(editing.id, name.trim()); toast.success("Updated."); notify.info("Destination Updated", `${name.trim()} updated.`); }
    else { db.addActivityDestination(name.trim()); toast.success("Added."); notify.success("Destination Added", `${name.trim()} added to activity destinations.`); }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit Destination" : "Add Destination"}</DialogTitle></DialogHeader>
        <div>
          <Label>Destination Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kanha" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActDialog({
  open, onOpenChange, editing, destId,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editing: Activity | null; destId: string;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState(0);
  const [type, setType] = useState<ActivityPricingType>("per_person");
  const [unitLabel, setUnitLabel] = useState("");
  const [active, setActive] = useState(true);

  useMemo(() => {
    if (open) {
      setName(editing?.activity_name ?? "");
      setDesc(editing?.description ?? "");
      setPrice(editing?.price ?? 0);
      setType(editing?.pricing_type ?? "per_person");
      setUnitLabel(editing?.unit_label ?? "");
      setActive(editing?.is_active ?? true);
    }
  }, [open, editing]);

  function save() {
    if (!destId) return toast.error("Select a destination first.");
    if (!name.trim()) return toast.error("Activity name is required.");
    const payload = {
      destination_id: destId, activity_name: name.trim(), description: desc,
      pricing_type: type, price, unit_label: unitLabel || PRICING_LABEL[type],
      is_active: active,
    };
    if (editing) { db.updateActivity(editing.id, payload); toast.success("Activity updated."); }
    else { db.addActivity(payload); toast.success("Activity added."); }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit Activity" : "Add Activity"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Activity Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jungle Safari" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Price (₹)</Label>
              <Input type="number" min={0} value={price} onChange={(e) => setPrice(+e.target.value || 0)} />
            </div>
            <div>
              <Label>Pricing Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ActivityPricingType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_person">Per Person</SelectItem>
                  <SelectItem value="total_fixed">Total Fixed</SelectItem>
                  <SelectItem value="per_vehicle">Per Vehicle</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Unit Label</Label>
            <Input value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder="e.g. Jungle Safari Total" />
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
