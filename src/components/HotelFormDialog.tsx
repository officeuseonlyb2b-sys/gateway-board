import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { db, useDB, HOTEL_CATEGORIES, type Hotel, type HotelCategory } from "@/lib/mock-store";

interface Props {
  trigger?: React.ReactNode;
  hotel?: Hotel;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}

export function HotelFormDialog({ trigger, hotel, open: controlledOpen, onOpenChange }: Props) {
  const data = useDB();
  const [open, setOpen] = useState(false);
  const isOpen = controlledOpen ?? open;
  const setIsOpen = onOpenChange ?? setOpen;

  const [form, setForm] = useState(() => ({
    city_id: hotel?.city_id ?? data.cities[0]?.id ?? "",
    name: hotel?.name ?? "",
    hotel_category: (hotel?.hotel_category ?? "3 Star") as HotelCategory,
    contact_name: hotel?.contact_name ?? "",
    contact_phone: hotel?.contact_phone ?? "",
    email: hotel?.email ?? "",
    address: hotel?.address ?? "",
    has_wifi: hotel?.has_wifi ?? true,
    has_pool: hotel?.has_pool ?? false,
  }));
  const [newCity, setNewCity] = useState("");
  const [saving, setSaving] = useState(false);

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Hotel name is required.");
    if (!form.city_id) return toast.error("Please choose a city.");

    setSaving(true);
    await new Promise((r) => setTimeout(r, 250));
    if (hotel) {
      db.updateHotel(hotel.id, form);
      toast.success("Hotel updated.");
    } else {
      db.addHotel(form);
      toast.success("Hotel added.");
    }
    setSaving(false);
    setIsOpen(false);
  }

  function addCityInline() {
    const name = newCity.trim();
    if (!name) return;
    const exists = data.cities.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (exists) { update("city_id", exists.id); setNewCity(""); return; }
    const c = db.addCity(name);
    update("city_id", c.id);
    setNewCity("");
    toast.success(`Added city "${name}"`);
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{hotel ? "Edit Hotel" : "Add New Hotel"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Hotel Name</Label>
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Taj Chandela" />
            </div>

            <div className="space-y-2">
              <Label>City</Label>
              <Select value={form.city_id} onValueChange={(v) => update("city_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {data.cities.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2 pt-1">
                <Input
                  value={newCity} onChange={(e) => setNewCity(e.target.value)}
                  placeholder="Add new city…"
                  className="h-9 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCityInline(); } }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addCityInline}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Hotel Category</Label>
              <Select value={form.hotel_category} onValueChange={(v) => update("hotel_category", v as HotelCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOTEL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Contact Person</Label>
              <Input value={form.contact_name} onChange={(e) => update("contact_name", e.target.value)} placeholder="Full name" />
            </div>

            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <Input value={form.contact_phone} onChange={(e) => update("contact_phone", e.target.value)} placeholder="+91 …" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="reservations@hotel.com" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Address</Label>
              <Textarea rows={2} value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="Street, area, landmark" />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-sm font-medium">Wi-Fi</div>
                <div className="text-xs text-muted-foreground">Complimentary in-room</div>
              </div>
              <Switch checked={form.has_wifi} onCheckedChange={(v) => update("has_wifi", v)} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-sm font-medium">Swimming Pool</div>
                <div className="text-xs text-muted-foreground">Outdoor / indoor</div>
              </div>
              <Switch checked={form.has_pool} onCheckedChange={(v) => update("has_pool", v)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {hotel ? "Save changes" : "Add hotel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
