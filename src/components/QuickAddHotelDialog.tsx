import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { db, type HotelCategory } from "@/lib/mock-store";
import { addNotification } from "@/lib/notifications-store";
import {
  HotelRatesEditor,
  emptyRoom,
  persistRoomsForHotel,
  validateRooms,
  type RoomBlock,
} from "@/components/HotelRatesEditor";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cityId: string;
  cityName: string;
  category: string;
  onCreated?: (hotelId: string) => void;
}

export function QuickAddHotelDialog({ open, onOpenChange, cityId, cityName, category, onCreated }: Props) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [wifi, setWifi] = useState(true);
  const [pool, setPool] = useState(false);
  const [address, setAddress] = useState("");
  const [rooms, setRooms] = useState<RoomBlock[]>([emptyRoom()]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setName(""); setContactName(""); setPhone(""); setEmail("");
    setWifi(true); setPool(false); setAddress("");
    setRooms([emptyRoom()]);
    setErrors({});
  };

  const close = () => { reset(); onOpenChange(false); };

  const save = () => {
    const err: Record<string, string> = {};
    if (!name.trim()) err.name = "Hotel name is required";
    Object.assign(err, validateRooms(rooms));
    if (Object.keys(err).length) {
      setErrors(err);
      toast.error("Please fill required fields");
      return;
    }

    const hotel = db.addHotel({
      city_id: cityId,
      name: name.trim(),
      hotel_category: category as HotelCategory,
      contact_name: contactName.trim(),
      contact_phone: phone.trim(),
      email: email.trim(),
      has_wifi: wifi,
      has_pool: pool,
      address: address.trim(),
    });

    persistRoomsForHotel(hotel.id, rooms);

    toast.success(`${hotel.name} added successfully`);
    addNotification({ kind: "success", category: "hotel_added", title: "Hotel Added", message: `${hotel.name} in ${cityName} added from quotation wizard.` });
    onCreated?.(hotel.id);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) return; onOpenChange(v); }}>
      <DialogContent
        className="max-w-[780px] max-h-[90vh] overflow-y-auto p-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="p-5 pb-3 border-b sticky top-0 bg-background z-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Add New Hotel — {cityName}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">Hotel will be saved and available immediately</p>
            </div>
            <button onClick={close} className="text-muted-foreground hover:text-foreground" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Hotel Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Hotel Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grand Palace" />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
              </div>
              <div>
                <Label className="text-xs">City</Label>
                <Input value={cityName} readOnly className="bg-muted" />
              </div>
              <div>
                <Label className="text-xs">Hotel Category</Label>
                <Input value={category} readOnly className="bg-muted" />
              </div>
              <div>
                <Label className="text-xs">Contact Person</Label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Contact Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Contact Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={wifi} onCheckedChange={setWifi} id="qh-wifi" />
                <Label htmlFor="qh-wifi" className="text-xs">WiFi</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={pool} onCheckedChange={setPool} id="qh-pool" />
                <Label htmlFor="qh-pool" className="text-xs">Pool</Label>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Address</Label>
                <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
              </div>
            </div>
          </section>

          <div className="border-t" />

          <HotelRatesEditor rooms={rooms} setRooms={setRooms} errors={errors} cityName={cityName} />
        </div>

        <DialogFooter className="p-4 border-t sticky bottom-0 bg-background">
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={save}>Save Hotel &amp; Return to Quotation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
