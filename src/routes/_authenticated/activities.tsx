import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Compass, MapPin } from "lucide-react";
import { toast } from "sonner";
import {
  db, useDB,
  type Activity, type ActivitySlab, type ActivitySlabPricing,
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

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function ActivitiesPage() {
  const data = useDB();
  // Cities come from Destinations master (shared).
  const destinations = useMemo(
    () => [...data.destination_cities].sort((a, b) => a.name.localeCompare(b.name)),
    [data.destination_cities],
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

  const [actOpen, setActOpen] = useState(false);
  const [editingAct, setEditingAct] = useState<Activity | null>(null);

  function actCount(id: string) { return data.activities.filter((a) => a.destination_id === id).length; }
  function deleteAct(a: Activity) {
    if (!confirm(`Delete "${a.activity_name}"?`)) return;
    db.deleteActivity(a.id); toast.success("Activity deleted.");
  }

  function slabsSummary(a: Activity): string {
    if (a.pricing_slabs && a.pricing_slabs.length > 0) {
      return a.pricing_slabs
        .slice()
        .sort((x, y) => x.from_pax - y.from_pax)
        .map((s) => `${s.from_pax}-${s.to_pax}: ${inr(s.price)}`)
        .join(" · ");
    }
    return a.price ? inr(a.price) : "—";
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity &amp; Experience</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage destination-wise activities with pax-range slab pricing. Cities are shared from{" "}
          <Link to="/destinations" className="text-primary underline underline-offset-2">Destinations</Link>.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="p-4 lg:col-span-1 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Destinations</h3>
            <Button asChild size="sm" variant="outline">
              <Link to="/destinations">Manage</Link>
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
                        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
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
              <div className="font-medium">Add a destination in the Destinations module to manage activities.</div>
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
                      <TableHead>Pricing Type</TableHead>
                      <TableHead>Slabs</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.activity_name}</TableCell>
                        <TableCell className="text-xs">
                          {a.slab_pricing_type === "total" ? "Slab" : "Per Person"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{slabsSummary(a)}</TableCell>

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

      <ActDialog open={actOpen} onOpenChange={setActOpen} editing={editingAct} destId={selectedId} />
    </div>
  );
}

function newSlab(): ActivitySlab {
  return { id: uid(), from_pax: 1, to_pax: 5, price: 0 };
}

function ActDialog({
  open, onOpenChange, editing, destId,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editing: Activity | null; destId: string;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  // Two clean modes: "per_person" (flat price × pax) and "slab" (pax-range table).
  const [pricingType, setPricingType] = useState<ActivitySlabPricing>("per_person");
  const [flatPrice, setFlatPrice] = useState(0);
  const [slabs, setSlabs] = useState<ActivitySlab[]>([]);
  const [active, setActive] = useState(true);
  const isSlab = pricingType !== "per_person";

  useEffect(() => {
    if (!open) return;
    setName(editing?.activity_name ?? "");
    setDesc(editing?.description ?? "");
    const hadSlabs = !!(editing?.pricing_slabs && editing.pricing_slabs.length > 0);
    setPricingType(hadSlabs ? "slab" : "per_person");
    setFlatPrice(editing && !hadSlabs ? editing.price ?? 0 : 0);
    setSlabs(
      hadSlabs ? editing!.pricing_slabs!.map((s) => ({ ...s })) : [newSlab()],
    );
    setActive(editing?.is_active ?? true);
  }, [open, editing]);

  function updateSlab(id: string, patch: Partial<ActivitySlab>) {
    setSlabs((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function addSlab() {
    setSlabs((prev) => {
      const last = [...prev].sort((a, b) => a.to_pax - b.to_pax).pop();
      const from = last ? last.to_pax + 1 : 1;
      return [...prev, { id: uid(), from_pax: from, to_pax: from + 4, price: 0 }];
    });
  }
  function removeSlab(id: string) {
    setSlabs((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
  }

  function validate(): string | null {
    if (!name.trim()) return "Activity name is required.";
    if (!isSlab) {
      if (flatPrice < 0) return "Price per person cannot be negative.";
      return null;
    }
    if (slabs.length === 0) return "At least one pricing slab is required.";
    for (const s of slabs) {
      if (s.from_pax < 1) return "From Pax must be at least 1.";
      if (s.to_pax < s.from_pax) return "To Pax must be greater than or equal to From Pax.";
    }
    // overlap check
    const sorted = [...slabs].sort((a, b) => a.from_pax - b.from_pax);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].from_pax <= sorted[i - 1].to_pax) {
        return `Slabs overlap between ${sorted[i - 1].from_pax}-${sorted[i - 1].to_pax} and ${sorted[i].from_pax}-${sorted[i].to_pax}.`;
      }
    }
    return null;
  }

  function save() {
    if (!destId) return toast.error("Select a destination first.");
    const err = validate();
    if (err) return toast.error(err);
    const sorted = [...slabs].sort((a, b) => a.from_pax - b.from_pax);
    const displayPrice = isSlab ? (sorted[0]?.price ?? 0) : flatPrice;
    const payload = {
      destination_id: destId,
      activity_name: name.trim(),
      description: desc,
      pricing_type: "per_person" as const,
      price: displayPrice,
      unit_label: "Per Person",
      is_active: active,
      slab_pricing_type: (isSlab ? "slab" : "per_person") as ActivitySlabPricing,
      pricing_slabs: isSlab ? sorted : [],
    };
    const destName = db.get().destination_cities.find((d) => d.id === destId)?.name ?? "";
    if (editing) {
      db.updateActivity(editing.id, payload);
      toast.success("Activity updated.");
      notify.info("Activity Updated", `${name.trim()} updated.`);
    } else {
      db.addActivity(payload);
      toast.success("Activity added.");
      notify.success("Activity Added", `${name.trim()}${destName ? ` in ${destName}` : ""} has been added.`);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
          <div>
            <Label>Pricing Type</Label>
            <Select value={pricingType} onValueChange={(v) => setPricingType(v as ActivitySlabPricing)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="per_person">Per Person</SelectItem>
                <SelectItem value="total">Slab (Total)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              {pricingType === "per_person"
                ? "Price per person × actual pax. Slab determines the per-person rate."
                : "Fixed TOTAL for the whole group in the matching pax slab."}
            </p>
          </div>


          <div className="border rounded-md p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm">Pricing Slabs</div>
              <Button size="sm" variant="outline" onClick={addSlab}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Slab
              </Button>
            </div>
            <div className="space-y-2">
              {slabs.map((s, i) => (
                <div key={s.id} className="grid grid-cols-[auto,1fr,1fr,1fr,auto] gap-2 items-end">
                  <div className="text-xs text-muted-foreground pb-2 w-14">Slab {i + 1}</div>
                  <div>
                    <Label className="text-[11px]">From Pax</Label>
                    <Input type="number" min={1} value={s.from_pax}
                      onChange={(e) => updateSlab(s.id, { from_pax: +e.target.value || 1 })} />
                  </div>
                  <div>
                    <Label className="text-[11px]">To Pax</Label>
                    <Input type="number" min={1} value={s.to_pax}
                      onChange={(e) => updateSlab(s.id, { to_pax: +e.target.value || 1 })} />
                  </div>
                  <div>
                    <Label className="text-[11px]">{pricingType === "per_person" ? "Price Per Person (₹)" : "Total Price (₹)"}</Label>
                    <Input type="number" min={0} value={s.price}
                      onChange={(e) => updateSlab(s.id, { price: +e.target.value || 0 })} />
                  </div>

                  <Button variant="ghost" size="icon"
                    onClick={() => removeSlab(s.id)}
                    disabled={slabs.length <= 1}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Ranges cannot overlap. Example: 1–5, 6–20, 21–50.
            </p>
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
