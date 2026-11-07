import { useState, useRef, useEffect } from "react";
import { Plus, Loader2, Trash2 } from "lucide-react";
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
import {
  db,
  useDB,
  HOTEL_CATEGORIES,
  HOTEL_TYPES,
  UNVERIFIED_BROCHURE_RATE_PRICING_BASIS,
  type BrochureHotelRatePricingBasis,
  type Hotel,
  type HotelCategory,
  type HotelType,
  type BlackoutRange,
} from "@/lib/mock-store";
import { notify } from "@/lib/notify";
import {
  getBrochureHotelRates,
  saveBrochureHotelRates,
  validateBrochureHotelRatePeriods,
  type BrochureHotelRateDraft,
} from "@/lib/brochure-hotel-rates";
import {
  HotelRatesEditor,
  emptyRoom,
  hydrateRoomsFromDb,
  persistRoomsForHotel,
  validateRooms,
  type RoomBlock,
} from "@/components/HotelRatesEditor";

interface Props {
  trigger?: React.ReactNode;
  hotel?: Hotel;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}

export type BrochureRateForm = Omit<BrochureHotelRateDraft, "hotel_id" | "single" | "double" | "triple" | "extra_bed" | "child"> & {
  single: string;
  double: string;
  triple: string;
  extra_bed: string;
  child: string;
};

const BROCHURE_PRICE_BASIS_CHOICES: Record<
  keyof BrochureHotelRatePricingBasis,
  Array<{ value: string; label: string }>
> = {
  single: [
    { value: "per_room", label: "Per room" },
    { value: "per_person", label: "Per person" },
  ],
  double: [
    { value: "per_room", label: "Per room" },
    { value: "per_person", label: "Per person" },
  ],
  triple: [
    { value: "per_room", label: "Per room" },
    { value: "per_person", label: "Per person" },
  ],
  extra_bed: [
    { value: "per_add_on", label: "Per extra bed" },
    { value: "per_person", label: "Per person" },
  ],
  child: [
    { value: "per_child", label: "Per child" },
    { value: "per_person", label: "Per person" },
  ],
};

const emptyBrochureRate = (): BrochureRateForm => ({
  id: crypto.randomUUID(),
  rate_basis: "per_night",
  pricing_basis: { ...UNVERIFIED_BROCHURE_RATE_PRICING_BASIS },
  validity_from: "",
  validity_to: "",
  single: "",
  double: "",
  triple: "",
  extra_bed: "",
  child: "",
});

export const brochureRateFormFromHotel = (hotelId?: string): BrochureRateForm[] => {
  if (!hotelId) return [emptyBrochureRate()];
  const rates = getBrochureHotelRates(hotelId).map(({ updated_at: _updatedAt, hotel_id: _hotelId, ...rate }) => ({
    ...rate,
    rate_basis: rate.rate_basis ?? "full_programme",
    pricing_basis: rate.pricing_basis ?? { ...UNVERIFIED_BROCHURE_RATE_PRICING_BASIS },
    single: String(rate.single),
    double: String(rate.double),
    triple: String(rate.triple),
    extra_bed: String(rate.extra_bed),
    child: String(rate.child),
  }));
  return rates.length ? rates : [emptyBrochureRate()];
};

export function HotelFormDialog({ trigger, hotel, open: controlledOpen, onOpenChange }: Props) {
  const data = useDB();
  const [open, setOpen] = useState(false);
  const isOpen = controlledOpen ?? open;
  const setIsOpen = onOpenChange ?? setOpen;

  const [form, setForm] = useState(() => ({
    city_id: hotel?.city_id ?? data.cities[0]?.id ?? "",
    name: hotel?.name ?? "",
    hotel_category: (hotel?.hotel_category ?? "3 Star") as HotelCategory,
    hotel_type: (hotel?.hotel_type ?? "") as HotelType | "",   // optional, may be empty
    contact_name: hotel?.contact_name ?? "",
    contact_phone: hotel?.contact_phone ?? "",
    email: hotel?.email ?? "",
    address: hotel?.address ?? "",
    has_wifi: hotel?.has_wifi ?? true,
    has_pool: hotel?.has_pool ?? false,
  }));
  const [blackouts, setBlackouts] = useState<BlackoutRange[]>(hotel?.blackout_ranges ?? []);
  const rid = () => Math.random().toString(36).slice(2);
  const [newCity, setNewCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const roomsEdited = useRef(false);
  const brochureRatesEdited = useRef(false);
  const [brochureRates, setBrochureRates] = useState<BrochureRateForm[]>(() => brochureRateFormFromHotel(hotel?.id));
  const [rooms, setRooms] = useState<RoomBlock[]>(() => {
    if (!hotel) return [emptyRoom()];
    const hotelRooms = data.room_categories.filter((r) => r.hotel_id === hotel.id);
    const plans = data.rate_plans.filter((p) => hotelRooms.some((r) => r.id === p.room_category_id));
    const hydrated = hydrateRoomsFromDb(hotelRooms, plans);
    return hydrated.length ? hydrated : [emptyRoom()];
  });

  useEffect(() => {
    if (!isOpen) {
      roomsEdited.current = false;
      brochureRatesEdited.current = false;
      return;
    }

    const hotelId = hotel?.id;
    if (!roomsEdited.current) {
      const hotelRooms = data.room_categories.filter((room) => room.hotel_id === hotelId);
      const plans = data.rate_plans.filter((plan) => hotelRooms.some((room) => room.id === plan.room_category_id));
      const hydrated = hydrateRoomsFromDb(hotelRooms, plans);
      setRooms(hydrated.length ? hydrated : [emptyRoom()]);
    }
    if (!brochureRatesEdited.current) setBrochureRates(brochureRateFormFromHotel(hotelId));
  }, [isOpen, hotel?.id, data.room_categories, data.rate_plans, data.brochure_hotel_rates]);

  function updateRooms(updater: (current: RoomBlock[]) => RoomBlock[]) {
    roomsEdited.current = true;
    setRooms(updater);
  }

  function updateBrochureRates(updater: (current: BrochureRateForm[]) => BrochureRateForm[]) {
    brochureRatesEdited.current = true;
    setBrochureRates(updater);
  }

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Hotel name is required.");
    if (!form.city_id) return toast.error("Please choose a city.");
    // ⚠️ Hotel type validation removed – now optional
    // if (!form.hotel_type) return toast.error("Please choose a hotel type.");

    const roomErrors = validateRooms(rooms);
    if (Object.keys(roomErrors).length) {
      setErrors(roomErrors);
      toast.error("Please fill required fields in Room Categories & Rates.");
      return;
    }
    setErrors({});

    const activeBrochureRates = brochureRates.filter((rate) =>
      [rate.validity_from, rate.validity_to, rate.single, rate.double, rate.triple, rate.extra_bed, rate.child]
        .some((value) => value.trim() !== ""),
    );
    if (activeBrochureRates.some((rate) =>
      !rate.validity_from || !rate.validity_to ||
      [rate.single, rate.double, rate.triple, rate.extra_bed, rate.child]
        .some((value) => value.trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0),
    )) {
      return toast.error("Complete both validity dates and all five non-negative Brochure amounts for each period.");
    }
    const brochurePeriodError = validateBrochureHotelRatePeriods(activeBrochureRates);
    if (brochurePeriodError) return toast.error(brochurePeriodError);

    setSaving(true);
    await new Promise((r) => setTimeout(r, 250));
    const cityName = data.cities.find((c) => c.id === form.city_id)?.name ?? "";
    const cleanBlackouts = blackouts.filter((b) => b.from && b.to);
    const payload = {
      ...form,
      hotel_type: form.hotel_type as HotelType,   // still cast to HotelType – if empty string it will be sent as ''
      blackout_ranges: cleanBlackouts,
    };
    let hotelId: string;
    if (hotel) {
      db.updateHotel(hotel.id, payload);
      hotelId = hotel.id;
    } else {
      const created = db.addHotel(payload);
      hotelId = created.id;
    }

    persistRoomsForHotel(hotelId, rooms);
    try {
      saveBrochureHotelRates(
        hotelId,
        activeBrochureRates.map((rate) => ({
          id: rate.id,
          rate_basis: rate.rate_basis,
          pricing_basis: rate.pricing_basis,
          validity_from: rate.validity_from,
          validity_to: rate.validity_to,
          single: Number(rate.single),
          double: Number(rate.double),
          triple: Number(rate.triple),
          extra_bed: Number(rate.extra_bed),
          child: Number(rate.child),
        })),
      );
    } catch (error) {
      setSaving(false);
      toast.error(error instanceof Error ? error.message : "Unable to save Brochure rates.");
      return;
    }

    if (hotel) {
      toast.success("Hotel updated.");
      notify.info("Hotel Updated", `${form.name} details have been updated.`);
    } else {
      toast.success("Hotel added.");
      notify.success(
        "Hotel Added",
        `${form.name}${cityName ? ` in ${cityName}` : ""} has been added successfully.`,
        "/hotels",
        "hotel_added",
      );
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

            {/* Hotel Type – now optional, no red star */}
            <div className="space-y-2">
              <Label>Hotel Type</Label>
              <Select
                value={form.hotel_type}
                onValueChange={(v) => update("hotel_type", v as HotelType | "")}
              >
                <SelectTrigger><SelectValue placeholder="Select type (optional)" /></SelectTrigger>
                <SelectContent>
                  {HOTEL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
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

          <div className="border-t pt-4">
            <HotelRatesEditor
              rooms={rooms}
              setRooms={updateRooms}
              errors={errors}
              cityName={data.cities.find((c) => c.id === form.city_id)?.name}
            />

          </div>

          <div className="border-t pt-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Brochure Rates (Approximate)</h3>
              <p className="text-xs text-muted-foreground">
                Hotel-specific estimates used only for Brochure costing. Regular supplier rates remain unchanged.
              </p>
            </div>
            {brochureRates.map((rate, index) => (
              <div key={rate.id} className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Validity Period {index + 1}</h4>
                  {brochureRates.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => updateBrochureRates((rates) => rates.filter((item) => item.id !== rate.id))}
                      aria-label={`Remove validity period ${index + 1}`}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> Remove
                    </Button>
                  )}
                </div>
                <div className="max-w-xs">
                  <Label className="text-xs">Rate Basis</Label>
                  <Select
                    value={rate.rate_basis}
                    onValueChange={(value: "per_night" | "full_programme") =>
                      updateBrochureRates((rates) => rates.map((item) =>
                        item.id === rate.id ? { ...item, rate_basis: value } : item,
                      ))
                    }
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_night">Per Night</SelectItem>
                      <SelectItem value="full_programme">Full Programme (Legacy)</SelectItem>
                    </SelectContent>
                  </Select>
                  {rate.rate_basis === "full_programme" && (
                    <p className="mt-1 text-xs text-amber-700">
                      This legacy amount is not used for day-wise costing. Convert only after confirming the nightly amount.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {([[
                    "validity_from",
                    "Validity From",
                  ], ["validity_to", "Validity To"]] as const).map(([field, label]) => (
                    <div key={field}>
                      <Label className="text-xs">{label}</Label>
                      <Input
                        className="mt-1"
                        type="date"
                        value={rate[field]}
                        onChange={(event) => updateBrochureRates((rates) => rates.map((item) =>
                          item.id === rate.id ? { ...item, [field]: event.target.value } : item,
                        ))}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Select the basis actually stated by the Hotel Master source. Existing records default to Unverified and cannot be costed until confirmed.
                </p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  {([[
                    "single",
                    "Single (SGL)",
                  ], ["double", "Double (DBL)"], ["triple", "Triple (TRP)"], ["extra_bed", "Extra Bed"], ["child", "Child"]] as const).map(([field, label]) => (
                    <div key={field}>
                      <Label className="text-xs">{label}</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="INR"
                        value={rate[field]}
                        onChange={(event) => updateBrochureRates((rates) => rates.map((item) =>
                          item.id === rate.id ? { ...item, [field]: event.target.value } : item,
                        ))}
                      />
                      <Select
                        value={rate.pricing_basis[field]}
                        onValueChange={(value) => updateBrochureRates((rates) => rates.map((item) =>
                          item.id === rate.id
                            ? {
                                ...item,
                                pricing_basis: {
                                  ...item.pricing_basis,
                                  [field]: value,
                                } as BrochureHotelRatePricingBasis,
                              }
                            : item,
                        ))}
                      >
                        <SelectTrigger className="mt-1 h-8 text-[10px]">
                          <SelectValue placeholder="Confirm basis" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unverified">Unverified</SelectItem>
                          {BROCHURE_PRICE_BASIS_CHOICES[field].map((choice) => (
                            <SelectItem key={choice.value} value={choice.value}>
                              {choice.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => updateBrochureRates((rates) => [...rates, emptyBrochureRate()])}
            >
              <Plus className="mr-1 h-4 w-4" /> Add Another Validity
            </Button>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Blackout Dates</h3>
              <p className="text-xs text-muted-foreground">
                Block-out ranges applied across all seasons for this hotel. Add one or more From → To ranges.
              </p>
            </div>
            <div className="space-y-2">
              {blackouts.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No blackout ranges added yet.</p>
              )}
              {blackouts.map((b, idx) => (
                <div key={b.id} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
                  <div className="space-y-1">
                    <Label className="text-xs">From</Label>
                    <Input
                      type="date"
                      value={b.from}
                      onChange={(e) =>
                        setBlackouts((arr) =>
                          arr.map((x, i) => (i === idx ? { ...x, from: e.target.value } : x)),
                        )
                      }
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">To</Label>
                    <Input
                      type="date"
                      value={b.to}
                      onChange={(e) =>
                        setBlackouts((arr) =>
                          arr.map((x, i) => (i === idx ? { ...x, to: e.target.value } : x)),
                        )
                      }
                      className="h-9"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive ml-auto"
                    onClick={() => setBlackouts((arr) => arr.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBlackouts((arr) => [...arr, { id: rid(), from: "", to: "" }])}
            >
              <Plus className="h-4 w-4" /> Add Blackout Range
            </Button>
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
