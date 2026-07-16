import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Plus, Pencil, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { db, useDB, type Guide, type GuideType } from "@/lib/mock-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr } from "@/lib/format";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/guide")({
  head: () => ({ meta: [{ title: "Guides — MP Tourism Hub" }] }),
  component: GuidePage,
});

const TYPES: GuideType[] = ["Hindi Guide - Local", "English Guide - Local", "Tour Escort"];
const TYPE_COLORS: Record<GuideType, string> = {
  "Hindi Guide - Local": "bg-blue-100 text-blue-800",
  "English Guide - Local": "bg-emerald-100 text-emerald-800",
  "Tour Escort": "bg-amber-100 text-amber-800",
};

function GuidePage() {
  const data = useDB();
  const items = useMemo(() => [...data.guides].sort((a, b) => a.name.localeCompare(b.name)), [data.guides]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Guide | null>(null);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Guides</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage guide types and daily rates.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1.5" /> Add Guide</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-12 text-center">
            <UserCheck className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <div className="font-medium">No guides yet</div>
            <div className="text-sm text-muted-foreground mt-1 mb-4">Add your first guide to include in tour packages.</div>
            <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1.5" /> Add Guide</Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Rate / Day</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell><Badge className={TYPE_COLORS[g.guide_type]} variant="secondary">{g.guide_type}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{g.destination || "—"}</TableCell>
                  <TableCell className="tabular-nums">{inr(g.rate_per_day)}</TableCell>
                  <TableCell>
                    <Switch checked={g.is_active} onCheckedChange={(v) => db.updateGuide(g.id, { is_active: v })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(g); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete "${g.name}"?`)) { db.deleteGuide(g.id); toast.success("Guide deleted."); } }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <GuideDialog open={open} onOpenChange={setOpen} editing={editing} />
    </div>
  );
}

function GuideDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Guide | null }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<GuideType>("Local");
  const [destination, setDestination] = useState("");
  const [rate, setRate] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setType(editing?.guide_type ?? "Local");
      setDestination(editing?.destination ?? "");
      setRate(editing?.rate_per_day ?? 0);
      setDescription(editing?.description ?? "");
      setActive(editing?.is_active ?? true);
    }
  }, [open, editing]);

  function save() {
    if (!name.trim()) return toast.error("Name is required.");
    if (editing) {
      db.updateGuide(editing.id, { name: name.trim(), guide_type: type, destination, rate_per_day: rate, description, is_active: active });
      toast.success("Guide updated.");
      notify.info("Guide Updated", `${name.trim()} details updated.`);
    } else {
      db.addGuide({ name: name.trim(), guide_type: type, destination, rate_per_day: rate, description, is_active: active });
      toast.success("Guide added.");
      notify.success("Guide Added", `${name.trim()} (${type}) has been added.`);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit Guide" : "Add Guide"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Guide Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as GuideType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Destination</Label><Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Kanha/Bandhavgarh" /></div>
          </div>
          <div><Label>Rate Per Day (₹)</Label><Input type="number" min={0} value={rate} onChange={(e) => setRate(+e.target.value || 0)} /></div>
          <div><Label>Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
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
