import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db, MEAL_PLANS, type HotelCategory, type SupplementType } from "@/lib/mock-store";
import { addNotification } from "@/lib/notifications-store";

type CwbMode = "amount" | "rule";

interface SeasonBlock {
  season_label: string;
  validity_start: string;
  validity_end: string;
  cp_single: string; cp_double: string;
  map_single: string; map_double: string;
  ap_single: string; ap_double: string;
  extra_bed: string;
  cwb_mode: CwbMode;
  cwb_amount: string;
  cwb_rule: string;
  lunch: string; dinner: string; extra_breakfast: string;
  xmas: string; xmas_type: SupplementType;
  newyear: string; newyear_type: SupplementType;
  remarks: string;
}

interface RoomBlock {
  id: string;
  name: string;
  seasons: SeasonBlock[];
}

const emptySeason = (): SeasonBlock => ({
  season_label: "", validity_start: "", validity_end: "",
  cp_single: "", cp_double: "",
  map_single: "", map_double: "",
  ap_single: "", ap_double: "",
  extra_bed: "",
  cwb_mode: "amount", cwb_amount: "", cwb_rule: "",
  lunch: "", dinner: "", extra_breakfast: "",
  xmas: "", xmas_type: "per_person",
  newyear: "", newyear_type: "per_person",
  remarks: "",
});

const rid = () => Math.random().toString(36).slice(2);

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
  const [rooms, setRooms] = useState<RoomBlock[]>([
    { id: rid(), name: "", seasons: [emptySeason()] },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setName(""); setContactName(""); setPhone(""); setEmail("");
    setWifi(true); setPool(false); setAddress("");
    setRooms([{ id: rid(), name: "", seasons: [emptySeason()] }]);
    setErrors({});
  };

  const close = () => { reset(); onOpenChange(false); };

  const setRoom = (idx: number, patch: Partial<RoomBlock>) => {
    setRooms((rs) => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };
  const setSeason = (rIdx: number, sIdx: number, patch: Partial<SeasonBlock>) => {
    setRooms((rs) => rs.map((r, i) => i !== rIdx ? r : {
      ...r, seasons: r.seasons.map((s, j) => j === sIdx ? { ...s, ...patch } : s),
    }));
  };

  const addRoom = () => setRooms((rs) => [...rs, { id: rid(), name: "", seasons: [emptySeason()] }]);
  const removeRoom = (idx: number) => setRooms((rs) => rs.filter((_, i) => i !== idx));
  const addSeason = (rIdx: number) => setRooms((rs) => rs.map((r, i) => i !== rIdx ? r : { ...r, seasons: [...r.seasons, emptySeason()] }));
  const removeSeason = (rIdx: number, sIdx: number) => setRooms((rs) => rs.map((r, i) => i !== rIdx ? r : { ...r, seasons: r.seasons.filter((_, j) => j !== sIdx) }));

  const save = () => {
    const err: Record<string, string> = {};
    if (!name.trim()) err.name = "Hotel name is required";
    if (rooms.length === 0) err.rooms = "Add at least one room category";
    rooms.forEach((r, ri) => {
      if (!r.name.trim()) err[`room_${ri}_name`] = "Room name required";
      if (r.seasons.length === 0) err[`room_${ri}_seasons`] = "Add at least one season";
      r.seasons.forEach((s, si) => {
        if (!s.validity_start) err[`s_${ri}_${si}_start`] = "From date required";
        if (!s.validity_end) err[`s_${ri}_${si}_end`] = "To date required";
        if (!s.cp_double.trim()) err[`s_${ri}_${si}_cp_double`] = "CP Double rate required";
      });
    });
    if (Object.keys(err).length) {
      setErrors(err);
      toast.error("Please fill required fields");
      return;
    }

    const num = (v: string) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    const numOrNull = (v: string) => {
      const t = v.trim();
      if (!t) return null;
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : null;
    };

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

    rooms.forEach((r) => {
      const room = db.addRoom(hotel.id, r.name.trim());
      const plans = r.seasons.flatMap((s) => {
        const single = { CP: num(s.cp_single), MAP: num(s.map_single), AP: num(s.ap_single) };
        const dbl = { CP: num(s.cp_double), MAP: num(s.map_double), AP: num(s.ap_double) };
        return MEAL_PLANS.map((mp) => ({
          room_category_id: room.id,
          validity_start: s.validity_start,
          validity_end: s.validity_end,
          season_label: s.season_label.trim() || "Season",
          meal_plan: mp,
          double_rate: dbl[mp],
          single_rate: single[mp],
          extra_bed_rate: num(s.extra_bed),
          cwb_rate: s.cwb_mode === "amount" ? numOrNull(s.cwb_amount) : null,
          cwb_rule_text: s.cwb_mode === "rule" ? (s.cwb_rule.trim() || null) : null,
          lunch_rate: numOrNull(s.lunch),
          dinner_rate: numOrNull(s.dinner),
          extra_breakfast_rate: numOrNull(s.extra_breakfast),
          xmas_supplement: numOrNull(s.xmas),
          xmas_supplement_type: s.xmas_type,
          newyear_supplement: numOrNull(s.newyear),
          newyear_supplement_type: s.newyear_type,
          remarks: s.remarks.trim() || null,
        }));
      });
      db.addRatePlans(plans);
    });

    toast.success(`${hotel.name} added successfully`);
    addNotification("success", "Hotel Added", `${hotel.name} in ${cityName} added from quotation wizard.`);
    onCreated?.(hotel.id);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { /* prevent backdrop close */ if (!v) return; onOpenChange(v); }}>
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
          {/* Section 1: Hotel Details */}
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

          {/* Section 2: Room Categories */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Room Categories & Rates</h3>
              <p className="text-xs text-muted-foreground">Add at least one room type with rates</p>
            </div>

            {rooms.map((room, ri) => (
              <div key={room.id} className="rounded-xl bg-muted/40 p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <Label className="text-xs">Room Category Name *</Label>
                    <Input
                      value={room.name}
                      onChange={(e) => setRoom(ri, { name: e.target.value })}
                      placeholder="e.g. Deluxe Room"
                    />
                    {errors[`room_${ri}_name`] && (
                      <p className="text-xs text-destructive mt-1">{errors[`room_${ri}_name`]}</p>
                    )}
                  </div>
                  {rooms.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeRoom(ri)} className="text-destructive">
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                </div>

                {room.seasons.map((s, si) => (
                  <div key={si} className="rounded-lg bg-background border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold">Season {si + 1}</h4>
                      {room.seasons.length > 1 && (
                        <button onClick={() => removeSeason(ri, si)} className="text-xs text-destructive hover:underline">
                          Remove season
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Season Label</Label>
                        <Input value={s.season_label} onChange={(e) => setSeason(ri, si, { season_label: e.target.value })} placeholder="Peak Season" />
                      </div>
                      <div>
                        <Label className="text-xs">Validity From *</Label>
                        <Input type="date" value={s.validity_start} onChange={(e) => setSeason(ri, si, { validity_start: e.target.value })} />
                        {errors[`s_${ri}_${si}_start`] && <p className="text-xs text-destructive mt-1">{errors[`s_${ri}_${si}_start`]}</p>}
                      </div>
                      <div>
                        <Label className="text-xs">Validity To *</Label>
                        <Input type="date" value={s.validity_end} onChange={(e) => setSeason(ri, si, { validity_end: e.target.value })} />
                        {errors[`s_${ri}_${si}_end`] && <p className="text-xs text-destructive mt-1">{errors[`s_${ri}_${si}_end`]}</p>}
                      </div>
                    </div>

                    {/* Rates */}
                    <div className="space-y-2">
                      <div className="text-xs font-medium">Rates for this season</div>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div />
                        <div className="text-center font-semibold">CP</div>
                        <div className="text-center font-semibold">MAP</div>
                        <div className="text-center font-semibold">AP</div>

                        <div className="flex items-center">Single (SGL)</div>
                        <Input value={s.cp_single} onChange={(e) => setSeason(ri, si, { cp_single: e.target.value })} placeholder="₹" />
                        <Input value={s.map_single} onChange={(e) => setSeason(ri, si, { map_single: e.target.value })} placeholder="₹" />
                        <Input value={s.ap_single} onChange={(e) => setSeason(ri, si, { ap_single: e.target.value })} placeholder="₹" />

                        <div className="flex items-center">Double (DBL) *</div>
                        <Input value={s.cp_double} onChange={(e) => setSeason(ri, si, { cp_double: e.target.value })} placeholder="₹" />
                        <Input value={s.map_double} onChange={(e) => setSeason(ri, si, { map_double: e.target.value })} placeholder="₹" />
                        <Input value={s.ap_double} onChange={(e) => setSeason(ri, si, { ap_double: e.target.value })} placeholder="₹" />
                      </div>
                      {errors[`s_${ri}_${si}_cp_double`] && (
                        <p className="text-xs text-destructive">{errors[`s_${ri}_${si}_cp_double`]}</p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Extra Bed Rate</Label>
                          <Input value={s.extra_bed} onChange={(e) => setSeason(ri, si, { extra_bed: e.target.value })} placeholder="₹" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">CWB (Child With Bed)</Label>
                            <div className="flex gap-1 text-[10px]">
                              <button
                                onClick={() => setSeason(ri, si, { cwb_mode: "amount" })}
                                className={`px-2 py-0.5 rounded ${s.cwb_mode === "amount" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                              >Fixed</button>
                              <button
                                onClick={() => setSeason(ri, si, { cwb_mode: "rule" })}
                                className={`px-2 py-0.5 rounded ${s.cwb_mode === "rule" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                              >Rule</button>
                            </div>
                          </div>
                          {s.cwb_mode === "amount" ? (
                            <Input value={s.cwb_amount} onChange={(e) => setSeason(ri, si, { cwb_amount: e.target.value })} placeholder="₹" />
                          ) : (
                            <Input value={s.cwb_rule} onChange={(e) => setSeason(ri, si, { cwb_rule: e.target.value })} placeholder="06-12Y/₹500" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Extra meals */}
                    <div>
                      <div className="text-xs font-medium mb-1">Extra Meal Charges (optional)</div>
                      <div className="grid grid-cols-3 gap-2">
                        <div><Label className="text-xs">Lunch / person</Label><Input value={s.lunch} onChange={(e) => setSeason(ri, si, { lunch: e.target.value })} /></div>
                        <div><Label className="text-xs">Dinner / person</Label><Input value={s.dinner} onChange={(e) => setSeason(ri, si, { dinner: e.target.value })} /></div>
                        <div><Label className="text-xs">Extra Breakfast / person</Label><Input value={s.extra_breakfast} onChange={(e) => setSeason(ri, si, { extra_breakfast: e.target.value })} /></div>
                      </div>
                    </div>

                    {/* Festive */}
                    <div>
                      <div className="text-xs font-medium mb-1">Festive Supplements (optional)</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">X'mas</Label>
                          <div className="flex gap-2">
                            <Input value={s.xmas} onChange={(e) => setSeason(ri, si, { xmas: e.target.value })} placeholder="₹" />
                            <Select value={s.xmas_type} onValueChange={(v) => setSeason(ri, si, { xmas_type: v as SupplementType })}>
                              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="fixed">Fixed</SelectItem>
                                <SelectItem value="per_person">Per Person</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">New Year</Label>
                          <div className="flex gap-2">
                            <Input value={s.newyear} onChange={(e) => setSeason(ri, si, { newyear: e.target.value })} placeholder="₹" />
                            <Select value={s.newyear_type} onValueChange={(v) => setSeason(ri, si, { newyear_type: v as SupplementType })}>
                              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="fixed">Fixed</SelectItem>
                                <SelectItem value="per_person">Per Person</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Remarks</Label>
                      <Textarea rows={2} value={s.remarks} onChange={(e) => setSeason(ri, si, { remarks: e.target.value })} placeholder="Blackout dates, notes…" />
                    </div>
                  </div>
                ))}

                <Button variant="outline" size="sm" onClick={() => addSeason(ri)}>
                  <Plus className="h-3.5 w-3.5" /> Add Another Season
                </Button>
              </div>
            ))}

            <Button variant="outline" size="sm" onClick={addRoom}>
              <Plus className="h-3.5 w-3.5" /> Add Another Room Category
            </Button>
          </section>
        </div>

        <DialogFooter className="p-4 border-t sticky bottom-0 bg-background">
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={save}>Save Hotel & Return to Quotation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
