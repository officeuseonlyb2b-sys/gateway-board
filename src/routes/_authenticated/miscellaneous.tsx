import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ShoppingBag, X } from "lucide-react";
import { toast } from "sonner";
import {
  db, useDB,
  type MiscellaneousItem, type MiscUnit, type MiscPricingType, type MiscPriceRange,
} from "@/lib/mock-store";
import { notify } from "@/lib/notify";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  RadioGroup, RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/miscellaneous")({
  head: () => ({ meta: [{ title: "Miscellaneous — MP Tourism Hub" }] }),
  component: MiscPage,
});

const TYPE_LABEL: Record<MiscPricingType, string> = {
  per_person: "Per Person",
  per_day: "Per Day (legacy)",
  fixed: "Fixed (legacy)",
  slab: "Slab (Range)",
};

// Normalize legacy per_day/fixed → per_person for display + editing.
function itemType(it: MiscellaneousItem): MiscPricingType {
  const t = (it.pricing_type ?? it.unit) as MiscPricingType;
  return t === "slab" ? "slab" : t === "per_person" ? "per_person" : "per_person";
}


function rateSummary(it: MiscellaneousItem): string {
  const t = itemType(it);
  if (t === "slab") {
    const ranges = it.price_ranges ?? [];
    if (!ranges.length) return "—";
    const per = it.slab_is_per_person ? " · per pp" : " · total";
    return `${ranges.length} slab${ranges.length === 1 ? "" : "s"}${per}`;
  }
  return inr(it.rate);
}

function MiscPage() {
  const data = useDB();
  const items = useMemo(
    () => [...data.miscellaneous_items].sort((a, b) => a.name.localeCompare(b.name)),
    [data.miscellaneous_items],
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MiscellaneousItem | null>(null);

  function openNew() { setEditing(null); setOpen(true); }
  function openEdit(it: MiscellaneousItem) { setEditing(it); setOpen(true); }
  function onDelete(it: MiscellaneousItem) {
    if (!confirm(`Delete "${it.name}"?`)) return;
    db.deleteMisc(it.id); toast.success("Item deleted.");
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Miscellaneous</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage add-on items for tour packages.</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1.5" /> Add Item</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <div className="font-medium">No miscellaneous items yet</div>
            <div className="text-sm text-muted-foreground mt-1 mb-4">Add your first add-on item.</div>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1.5" /> Add Item</Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Pricing Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">{it.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-md">{it.description || "—"}</TableCell>
                  <TableCell className="tabular-nums">{rateSummary(it)}</TableCell>
                  <TableCell>{TYPE_LABEL[itemType(it)]}</TableCell>
                  <TableCell>
                    <Switch checked={it.is_active} onCheckedChange={(v) => db.updateMisc(it.id, { is_active: v })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(it)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(it)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <MiscDialog open={open} onOpenChange={setOpen} editing={editing} />
    </div>
  );
}

function MiscDialog({
  open, onOpenChange, editing,
}: { open: boolean; onOpenChange: (v: boolean) => void; editing: MiscellaneousItem | null }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rate, setRate] = useState<number>(0);
  const [type, setType] = useState<MiscPricingType>("per_person");
  const [ranges, setRanges] = useState<MiscPriceRange[]>([]);
  const [slabPerPerson, setSlabPerPerson] = useState(false);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setRate(editing?.rate ?? 0);
    setType((editing?.pricing_type ?? editing?.unit ?? "per_person") as MiscPricingType);
    setRanges(editing?.price_ranges ?? [
      { from_pax: 1, to_pax: 6, price: 0 },
      { from_pax: 7, to_pax: 20, price: 0 },
    ]);
    setSlabPerPerson(editing?.slab_is_per_person ?? false);
    setActive(editing?.is_active ?? true);
  }, [open, editing]);

  function updateRange(i: number, patch: Partial<MiscPriceRange>) {
    setRanges((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function addRange() {
    const last = ranges[ranges.length - 1];
    const nextFrom = last ? last.to_pax + 1 : 1;
    setRanges([...ranges, { from_pax: nextFrom, to_pax: nextFrom + 5, price: 0 }]);
  }
  function removeRange(i: number) {
    setRanges((prev) => prev.filter((_, idx) => idx !== i));
  }

  function save() {
    if (!name.trim()) return toast.error("Item name is required.");
    const isSlab = type === "slab";
    const unit: MiscUnit = isSlab ? "fixed" : "per_person";
    const payload = {
      name: name.trim(),
      description,
      rate: isSlab ? (ranges[0]?.price ?? 0) : rate,
      unit,
      pricing_type: (isSlab ? "slab" : "per_person") as MiscPricingType,
      price_ranges: isSlab ? ranges : [],
      slab_is_per_person: false,
      is_active: active,
    };

    if (editing) {
      db.updateMisc(editing.id, payload);
      toast.success("Item updated.");
      notify.info("Item Updated", `${name.trim()} has been updated.`);
    } else {
      db.addMisc(payload);
      toast.success("Item added.");
      notify.success("Item Added", `${name.trim()} has been added.`);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Item" : "Add Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Item Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Basic Amenities Kit" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div>
            <Label>Pricing Type</Label>
            <RadioGroup value={type === "slab" ? "slab" : "per_person"} onValueChange={(v) => setType(v as MiscPricingType)} className="grid grid-cols-2 gap-2 mt-1">
              {(["per_person", "slab"] as MiscPricingType[]).map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm border rounded-md p-2 cursor-pointer">
                  <RadioGroupItem value={t} /> {TYPE_LABEL[t]}
                </label>
              ))}
            </RadioGroup>
            <p className="text-[11px] text-muted-foreground mt-1">
              {type === "slab"
                ? "Set a price for each pax range. Rate can be per-person or total for the group."
                : "Price applies per person × pax count. Use slabs to vary price by group size."}
            </p>
          </div>

          {type !== "slab" ? (
            <div>
              <Label>Price Per Person (₹)</Label>
              <Input type="number" min={0} value={rate}
                onChange={(e) => setRate(+e.target.value || 0)} />
              <p className="text-[11px] text-muted-foreground mt-1">
                One flat price per person × actual pax. No slabs.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Pax-Range Slabs</Label>
                <Button size="sm" variant="outline" onClick={addRange}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Slab
                </Button>
              </div>
              <div className="border rounded-md divide-y">
                <div className="grid grid-cols-[1fr_1fr_2fr_auto] gap-2 px-3 py-2 bg-muted/50 text-[10px] uppercase text-muted-foreground">
                  <div>From Pax</div><div>To Pax</div><div>Price Per Person (₹)</div><div></div>
                </div>
                {ranges.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_2fr_auto] gap-2 px-3 py-2 items-center">
                    <Input type="number" min={1} value={r.from_pax} onChange={(e) => updateRange(i, { from_pax: +e.target.value || 1 })} className="h-8" />
                    <Input type="number" min={1} value={r.to_pax} onChange={(e) => updateRange(i, { to_pax: +e.target.value || 1 })} className="h-8" />
                    <Input type="number" min={0} value={r.price} onChange={(e) => updateRange(i, { price: +e.target.value || 0 })} className="h-8" />
                    <Button size="icon" variant="ghost" onClick={() => removeRange(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                The slab matching total pax is applied, then multiplied by pax count.
              </p>
            </div>
          )}


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
