import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { db, useDB, type Restaurant } from "@/lib/mock-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

export const Route = createFileRoute("/_authenticated/meals")({
  head: () => ({
    meta: [
      { title: "Meals & Restaurants — MP Tourism Hub" },
      { name: "description", content: "Manage restaurants per destination city with per-person meal pricing for quotations." },
      { property: "og:title", content: "Meals & Restaurants — MP Tourism Hub" },
      { property: "og:description", content: "Restaurant master with per-person meal pricing linked to destination cities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MealsPage,
});

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Any"];

function MealsPage() {
  const data = useDB();
  const [q, setQ] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Restaurant | null>(null);

  const cities = useMemo(
    () => [...data.destination_cities].sort((a, b) => a.name.localeCompare(b.name)),
    [data.destination_cities],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.restaurants
      .filter((r) => (cityFilter === "all" ? true : r.city_id === cityFilter))
      .filter((r) => !needle || r.name.toLowerCase().includes(needle) || (r.city_name || "").toLowerCase().includes(needle))
      .sort((a, b) => (a.city_name || "").localeCompare(b.city_name || "") || a.name.localeCompare(b.name));
  }, [data.restaurants, q, cityFilter]);

  function onDelete(r: Restaurant) {
    if (!confirm(`Delete "${r.name}"?`)) return;
    db.deleteRestaurant(r.id);
    toast.success("Restaurant deleted.");
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meals (Restaurants)</h1>
          <p className="text-sm text-muted-foreground">
            Restaurants per destination city with per-person pricing. Used for extra meals in hotels and outside-hotel meals in quotations.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Restaurant
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search restaurant or city…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All cities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cities</SelectItem>
            {cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Restaurant</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Meal Type</TableHead>
              <TableHead className="text-right">Price / person</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  <UtensilsCrossed className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  No restaurants yet. Add one to make it available in Hotels and quotations.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.city_name}</TableCell>
                <TableCell>{r.meal_type || "Any"}</TableCell>
                <TableCell className="text-right">{inr(r.price_per_person)}</TableCell>
                <TableCell>{r.is_active === false ? "Inactive" : "Active"}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(r)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <RestaurantDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        cities={cities}
      />
    </div>
  );
}

function RestaurantDialog({
  open, onOpenChange, editing, cities,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Restaurant | null;
  cities: { id: string; name: string }[];
}) {
  const [name, setName] = useState("");
  const [cityId, setCityId] = useState("");
  const [price, setPrice] = useState("");
  const [mealType, setMealType] = useState("Any");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [seeded, setSeeded] = useState<string | null>(null);

  // Sync form when the dialog opens for a different record.
  const formKey = `${open}-${editing?.id ?? "new"}`;
  if (seeded !== formKey) {
    setSeeded(formKey);
    setName(editing?.name ?? "");
    setCityId(editing?.city_id ?? "");
    setPrice(editing ? String(editing.price_per_person) : "");
    setMealType(editing?.meal_type ?? "Any");
    setNotes(editing?.notes ?? "");
    setActive(editing?.is_active !== false);
  }

  const save = () => {
    if (!name.trim()) { toast.error("Restaurant name is required."); return; }
    if (!cityId) { toast.error("Select a city."); return; }
    const p = parseFloat(price) || 0;
    if (editing) {
      db.updateRestaurant(editing.id, {
        name: name.trim(), city_id: cityId, price_per_person: p,
        meal_type: mealType, notes, is_active: active,
      });
      toast.success("Restaurant updated.");
    } else {
      db.addRestaurant({
        name: name.trim(), city_id: cityId, price_per_person: p,
        meal_type: mealType, notes, is_active: active,
      });
      toast.success("Restaurant added.");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Restaurant" : "Add Restaurant"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Restaurant Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Under the Mango Tree" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">City (from Destinations)</Label>
              <Select value={cityId} onValueChange={setCityId}>
                <SelectTrigger><SelectValue placeholder="Select city…" /></SelectTrigger>
                <SelectContent>
                  {cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Price per person (₹)</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Meal Type</Label>
              <Select value={mealType} onValueChange={setMealType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label className="text-xs">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>{editing ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
