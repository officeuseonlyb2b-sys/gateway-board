import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { db, useDB, type MiscellaneousItem, type MiscUnit } from "@/lib/mock-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/miscellaneous")({
  head: () => ({ meta: [{ title: "Miscellaneous — MP Tourism Hub" }] }),
  component: MiscPage,
});

const UNIT_LABELS: Record<MiscUnit, string> = {
  per_person: "Per Person",
  per_day: "Per Day",
  fixed: "Fixed",
};

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
            <div className="text-sm text-muted-foreground mt-1 mb-4">Add your first add-on item to include in tour packages.</div>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1.5" /> Add Item</Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">{it.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-md">{it.description || "—"}</TableCell>
                  <TableCell className="tabular-nums">{inr(it.rate)}</TableCell>
                  <TableCell>{UNIT_LABELS[it.unit]}</TableCell>
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
  const [unit, setUnit] = useState<MiscUnit>("per_person");
  const [active, setActive] = useState(true);

  useMemo(() => {
    if (open) {
      setName(editing?.name ?? "");
      setDescription(editing?.description ?? "");
      setRate(editing?.rate ?? 0);
      setUnit(editing?.unit ?? "per_person");
      setActive(editing?.is_active ?? true);
    }
  }, [open, editing]);

  function save() {
    if (!name.trim()) return toast.error("Item name is required.");
    if (editing) {
      db.updateMisc(editing.id, { name: name.trim(), description, rate, unit, is_active: active });
      toast.success("Item updated.");
    } else {
      db.addMisc({ name: name.trim(), description, rate, unit, is_active: active });
      toast.success("Item added.");
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Rate (₹)</Label>
              <Input type="number" min={0} value={rate} onChange={(e) => setRate(+e.target.value || 0)} />
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as MiscUnit)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_person">Per Person</SelectItem>
                  <SelectItem value="per_day">Per Day</SelectItem>
                  <SelectItem value="fixed">Fixed</SelectItem>
                </SelectContent>
              </Select>
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
