import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db, MEAL_PLANS, type RatePlan, type RoomCategory, type SupplementType } from "@/lib/mock-store";

export type CwbMode = "amount" | "rule";

// Preset season names + fixed month/day ranges. `year` is used to build a full
// ISO date for the currently-being-edited season; both fields remain editable.
export const SEASON_PRESETS = ["Summer", "Winter", "Wildlife", "Wildlife Buffer"] as const;
export type SeasonPreset = typeof SEASON_PRESETS[number];

export function seasonPresetRange(preset: SeasonPreset, year = new Date().getFullYear()): { from: string; to: string } {
  const iso = (y: number, m: number, d: number) =>
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  switch (preset) {
    case "Summer":         return { from: iso(year, 4, 1),  to: iso(year, 9, 30) };
    case "Winter":         return { from: iso(year, 10, 1), to: iso(year + 1, 3, 31) };
    case "Wildlife":       return { from: iso(year, 10, 1), to: iso(year + 1, 6, 30) };
    case "Wildlife Buffer": return { from: iso(year, 7, 1),  to: iso(year, 9, 30) };
  }
}

export interface SeasonBlock {
  season_label: string;
  validity_start: string;
  validity_end: string;
  cp_single: string; cp_double: string;
  map_single: string; map_double: string;
  ap_single: string; ap_double: string;
  has_quad: boolean;
  cp_quad: string; map_quad: string; ap_quad: string;
  extra_bed: string;
  cwb_mode: CwbMode;
  cwb_amount: string;
  cwb_rule: string;
  lunch: string; dinner: string; extra_breakfast: string;
  xmas: string; xmas_type: SupplementType;
  xmas_date_from: string; xmas_date_to: string;
  newyear: string; newyear_type: SupplementType;
  newyear_date_from: string; newyear_date_to: string;
  remarks: string;
}

export interface RoomBlock {
  id: string;
  name: string;
  seasons: SeasonBlock[];
}

export const emptySeason = (): SeasonBlock => ({
  season_label: "", validity_start: "", validity_end: "",
  cp_single: "", cp_double: "",
  map_single: "", map_double: "",
  ap_single: "", ap_double: "",
  has_quad: false, cp_quad: "", map_quad: "", ap_quad: "",
  extra_bed: "",
  cwb_mode: "amount", cwb_amount: "", cwb_rule: "",
  lunch: "", dinner: "", extra_breakfast: "",
  xmas: "", xmas_type: "per_person", xmas_date_from: "", xmas_date_to: "",
  newyear: "", newyear_type: "per_person", newyear_date_from: "", newyear_date_to: "",
  remarks: "",
});

export const rid = () => Math.random().toString(36).slice(2);

export const emptyRoom = (): RoomBlock => ({ id: rid(), name: "", seasons: [emptySeason()] });

const s = (v: unknown) => (v == null ? "" : String(v));

// Hydrate rooms + rate plans (from DB) into editor state, grouping rate plans
// per (room, validity_start, validity_end, season_label) into one SeasonBlock.
export function hydrateRoomsFromDb(rooms: RoomCategory[], plans: RatePlan[]): RoomBlock[] {
  return rooms.map((r) => {
    const roomPlans = plans.filter((p) => p.room_category_id === r.id);
    const groups = new Map<string, RatePlan[]>();
    for (const p of roomPlans) {
      const key = `${p.validity_start}|${p.validity_end}|${p.season_label}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    const seasons: SeasonBlock[] = [];
    for (const grp of groups.values()) {
      const cp = grp.find((p) => p.meal_plan === "CP");
      const map = grp.find((p) => p.meal_plan === "MAP");
      const ap = grp.find((p) => p.meal_plan === "AP");
      const base = grp[0];
      seasons.push({
        season_label: base.season_label ?? "",
        validity_start: base.validity_start,
        validity_end: base.validity_end,
        cp_single: s(cp?.single_rate), cp_double: s(cp?.double_rate),
        map_single: s(map?.single_rate), map_double: s(map?.double_rate),
        ap_single: s(ap?.single_rate), ap_double: s(ap?.double_rate),
        has_quad: !!(cp?.quad_rate || map?.quad_rate || ap?.quad_rate),
        cp_quad: s(cp?.quad_rate ?? ""), map_quad: s(map?.quad_rate ?? ""), ap_quad: s(ap?.quad_rate ?? ""),
        extra_bed: s(base.extra_bed_rate),
        cwb_mode: base.cwb_rule_text ? "rule" : "amount",
        cwb_amount: s(base.cwb_rate ?? ""),
        cwb_rule: base.cwb_rule_text ?? "",
        lunch: s(base.lunch_rate ?? ""),
        dinner: s(base.dinner_rate ?? ""),
        extra_breakfast: s(base.extra_breakfast_rate ?? ""),
        xmas: s(base.xmas_supplement ?? ""),
        xmas_type: base.xmas_supplement_type ?? "per_person",
        xmas_date_from: base.xmas_date_from ?? "",
        xmas_date_to: base.xmas_date_to ?? "",
        newyear: s(base.newyear_supplement ?? ""),
        newyear_type: base.newyear_supplement_type ?? "per_person",
        newyear_date_from: base.newyear_date_from ?? "",
        newyear_date_to: base.newyear_date_to ?? "",
        remarks: base.remarks ?? "",
      });
    }
    return { id: r.id, name: r.name, seasons: seasons.length ? seasons : [emptySeason()] };
  });
}

// Persist rooms+seasons for a hotel: wipes previous rooms/plans then re-creates.
export function persistRoomsForHotel(hotelId: string, rooms: RoomBlock[]) {
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

  const existing = db.get().room_categories.filter((r) => r.hotel_id === hotelId);
  for (const r of existing) db.deleteRoom(r.id);

  for (const r of rooms) {
    const room = db.addRoom(hotelId, r.name.trim());
    const plans = r.seasons.flatMap((sn) => {
      const single = { CP: num(sn.cp_single), MAP: num(sn.map_single), AP: num(sn.ap_single) };
      const dbl = { CP: num(sn.cp_double), MAP: num(sn.map_double), AP: num(sn.ap_double) };
      const quad = { CP: numOrNull(sn.cp_quad), MAP: numOrNull(sn.map_quad), AP: numOrNull(sn.ap_quad) };
      return MEAL_PLANS.map((mp) => ({
        room_category_id: room.id,
        validity_start: sn.validity_start,
        validity_end: sn.validity_end,
        season_label: sn.season_label.trim() || "Season",
        meal_plan: mp,
        double_rate: dbl[mp],
        single_rate: single[mp],
        quad_rate: sn.has_quad ? quad[mp] : null,
        extra_bed_rate: num(sn.extra_bed),
        cwb_rate: sn.cwb_mode === "amount" ? numOrNull(sn.cwb_amount) : null,
        cwb_rule_text: sn.cwb_mode === "rule" ? (sn.cwb_rule.trim() || null) : null,
        lunch_rate: numOrNull(sn.lunch),
        dinner_rate: numOrNull(sn.dinner),
        extra_breakfast_rate: numOrNull(sn.extra_breakfast),
        xmas_supplement: numOrNull(sn.xmas),
        xmas_supplement_type: sn.xmas_type,
        xmas_date_from: sn.xmas_date_from || null,
        xmas_date_to: sn.xmas_date_to || null,
        newyear_supplement: numOrNull(sn.newyear),
        newyear_supplement_type: sn.newyear_type,
        newyear_date_from: sn.newyear_date_from || null,
        newyear_date_to: sn.newyear_date_to || null,
        remarks: sn.remarks.trim() || null,
      }));
    });
    db.addRatePlans(plans);
  }
}

export function validateRooms(rooms: RoomBlock[]): Record<string, string> {
  const err: Record<string, string> = {};
  if (rooms.length === 0) err.rooms = "Add at least one room category";
  rooms.forEach((r, ri) => {
    if (!r.name.trim()) err[`room_${ri}_name`] = "Room name required";
    if (r.seasons.length === 0) err[`room_${ri}_seasons`] = "Add at least one season";
    r.seasons.forEach((sn, si) => {
      if (!sn.validity_start) err[`s_${ri}_${si}_start`] = "From date required";
      if (!sn.validity_end) err[`s_${ri}_${si}_end`] = "To date required";
      if (!sn.cp_double.trim()) err[`s_${ri}_${si}_cp_double`] = "CP Double rate required";
    });
  });
  return err;
}

interface Props {
  rooms: RoomBlock[];
  setRooms: (updater: (r: RoomBlock[]) => RoomBlock[]) => void;
  errors: Record<string, string>;
  /** Hotel's city name — restricts the linkable restaurants (Meals module). */
  cityName?: string;
}

export function HotelRatesEditor({ rooms, setRooms, errors, cityName }: Props) {
  const data = useDB();
  const linkableRestaurants = (data.restaurants ?? []).filter(
    (r) => r.is_active !== false &&
      (!cityName || (r.city_name || "").trim().toLowerCase() === cityName.trim().toLowerCase()),
  );

  const setRoom = (idx: number, patch: Partial<RoomBlock>) =>
    setRooms((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const setSeason = (rIdx: number, sIdx: number, patch: Partial<SeasonBlock>) =>
    setRooms((rs) =>
      rs.map((r, i) => (i !== rIdx ? r : { ...r, seasons: r.seasons.map((sn, j) => (j === sIdx ? { ...sn, ...patch } : sn)) })),
    );
  const addRoom = () => setRooms((rs) => [...rs, emptyRoom()]);
  const removeRoom = (idx: number) => setRooms((rs) => rs.filter((_, i) => i !== idx));
  const addSeason = (rIdx: number) =>
    setRooms((rs) => rs.map((r, i) => (i !== rIdx ? r : { ...r, seasons: [...r.seasons, emptySeason()] })));
  const removeSeason = (rIdx: number, sIdx: number) =>
    setRooms((rs) => rs.map((r, i) => (i !== rIdx ? r : { ...r, seasons: r.seasons.filter((_, j) => j !== sIdx) })));

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Room Categories &amp; Rates</h3>
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
              <Button variant="ghost" size="sm" onClick={() => removeRoom(ri)} className="text-destructive" type="button">
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            )}
          </div>

          {room.seasons.map((sn, si) => (
            <div key={si} className="rounded-lg bg-background border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold">Season {si + 1}</h4>
                {room.seasons.length > 1 && (
                  <button type="button" onClick={() => removeSeason(ri, si)} className="text-xs text-destructive hover:underline">
                    Remove season
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Season Label</Label>
                  <Select
                    value={SEASON_PRESETS.includes(sn.season_label as SeasonPreset) ? sn.season_label : ""}
                    onValueChange={(v) => {
                      const preset = v as SeasonPreset;
                      const range = seasonPresetRange(preset);
                      setSeason(ri, si, {
                        season_label: preset,
                        validity_start: range.from,
                        validity_end: range.to,
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select season" /></SelectTrigger>
                    <SelectContent>
                      {SEASON_PRESETS.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Validity From *</Label>
                  <Input type="date" value={sn.validity_start} onChange={(e) => setSeason(ri, si, { validity_start: e.target.value })} />
                  {errors[`s_${ri}_${si}_start`] && <p className="text-xs text-destructive mt-1">{errors[`s_${ri}_${si}_start`]}</p>}
                </div>
                <div>
                  <Label className="text-xs">Validity To *</Label>
                  <Input type="date" value={sn.validity_end} onChange={(e) => setSeason(ri, si, { validity_end: e.target.value })} />
                  {errors[`s_${ri}_${si}_end`] && <p className="text-xs text-destructive mt-1">{errors[`s_${ri}_${si}_end`]}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium">Rates for this season</div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div />
                  <div className="text-center font-semibold">CP</div>
                  <div className="text-center font-semibold">MAP</div>
                  <div className="text-center font-semibold">AP</div>

                  <div className="flex items-center">Single (SGL)</div>
                  <Input value={sn.cp_single} onChange={(e) => setSeason(ri, si, { cp_single: e.target.value })} placeholder="₹" />
                  <Input value={sn.map_single} onChange={(e) => setSeason(ri, si, { map_single: e.target.value })} placeholder="₹" />
                  <Input value={sn.ap_single} onChange={(e) => setSeason(ri, si, { ap_single: e.target.value })} placeholder="₹" />

                  <div className="flex items-center">Double (DBL) *</div>
                  <Input value={sn.cp_double} onChange={(e) => setSeason(ri, si, { cp_double: e.target.value })} placeholder="₹" />
                  <Input value={sn.map_double} onChange={(e) => setSeason(ri, si, { map_double: e.target.value })} placeholder="₹" />
                  <Input value={sn.ap_double} onChange={(e) => setSeason(ri, si, { ap_double: e.target.value })} placeholder="₹" />

                  <div className="flex items-center text-muted-foreground">Triple (TRP)</div>
                  <div className="col-span-3 flex items-center text-[11px] text-muted-foreground">
                    Auto-calculated as Double + Extra Bed rate.
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-md border border-border p-2">
                  <div>
                    <div className="text-xs font-medium">Quad (QUAD)</div>
                    <div className="text-[11px] text-muted-foreground">Enable to enter a 4-sharing room rate</div>
                  </div>
                  <Switch
                    checked={sn.has_quad}
                    onCheckedChange={(v) => setSeason(ri, si, { has_quad: v })}
                  />
                </div>

                {sn.has_quad && (
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="flex items-center">Quad (QUAD)</div>
                    <Input value={sn.cp_quad} onChange={(e) => setSeason(ri, si, { cp_quad: e.target.value })} placeholder="₹ CP" />
                    <Input value={sn.map_quad} onChange={(e) => setSeason(ri, si, { map_quad: e.target.value })} placeholder="₹ MAP" />
                    <Input value={sn.ap_quad} onChange={(e) => setSeason(ri, si, { ap_quad: e.target.value })} placeholder="₹ AP" />
                  </div>
                )}
                {errors[`s_${ri}_${si}_cp_double`] && (
                  <p className="text-xs text-destructive">{errors[`s_${ri}_${si}_cp_double`]}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Extra Bed Rate</Label>
                    <Input value={sn.extra_bed} onChange={(e) => setSeason(ri, si, { extra_bed: e.target.value })} placeholder="₹" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">CWB (Child With Bed)</Label>
                      <div className="flex gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setSeason(ri, si, { cwb_mode: "amount" })}
                          className={`px-2 py-0.5 rounded ${sn.cwb_mode === "amount" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                        >Fixed</button>
                        <button
                          type="button"
                          onClick={() => setSeason(ri, si, { cwb_mode: "rule" })}
                          className={`px-2 py-0.5 rounded ${sn.cwb_mode === "rule" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                        >Rule</button>
                      </div>
                    </div>
                    {sn.cwb_mode === "amount" ? (
                      <Input value={sn.cwb_amount} onChange={(e) => setSeason(ri, si, { cwb_amount: e.target.value })} placeholder="₹" />
                    ) : (
                      <Input value={sn.cwb_rule} onChange={(e) => setSeason(ri, si, { cwb_rule: e.target.value })} placeholder="06-12Y/₹500" />
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium mb-1">Extra Meal Charges (optional)</div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label className="text-xs">Lunch / person</Label><Input value={sn.lunch} onChange={(e) => setSeason(ri, si, { lunch: e.target.value })} /></div>
                  <div><Label className="text-xs">Dinner / person</Label><Input value={sn.dinner} onChange={(e) => setSeason(ri, si, { dinner: e.target.value })} /></div>
                  <div><Label className="text-xs">Extra Breakfast / person</Label><Input value={sn.extra_breakfast} onChange={(e) => setSeason(ri, si, { extra_breakfast: e.target.value })} /></div>
                </div>
              </div>

              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Festive Supplements (optional)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-background border p-2 space-y-2">
                    <div className="text-xs font-medium">X'mas</div>
                    <div className="flex gap-2">
                      <Input value={sn.xmas} onChange={(e) => setSeason(ri, si, { xmas: e.target.value })} placeholder="₹" />
                      <Select value={sn.xmas_type} onValueChange={(v) => setSeason(ri, si, { xmas_type: v as SupplementType })}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Per Room</SelectItem>
                          <SelectItem value="per_person">Per Person</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Applies From</Label>
                        <Input type="date" value={sn.xmas_date_from} onChange={(e) => setSeason(ri, si, { xmas_date_from: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Applies To</Label>
                        <Input type="date" value={sn.xmas_date_to} onChange={(e) => setSeason(ri, si, { xmas_date_to: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md bg-background border p-2 space-y-2">
                    <div className="text-xs font-medium">New Year</div>
                    <div className="flex gap-2">
                      <Input value={sn.newyear} onChange={(e) => setSeason(ri, si, { newyear: e.target.value })} placeholder="₹" />
                      <Select value={sn.newyear_type} onValueChange={(v) => setSeason(ri, si, { newyear_type: v as SupplementType })}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Per Room</SelectItem>
                          <SelectItem value="per_person">Per Person</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Applies From</Label>
                        <Input type="date" value={sn.newyear_date_from} onChange={(e) => setSeason(ri, si, { newyear_date_from: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Applies To</Label>
                        <Input type="date" value={sn.newyear_date_to} onChange={(e) => setSeason(ri, si, { newyear_date_to: e.target.value })} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border bg-background p-3 space-y-2">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Remarks</div>
                <Textarea rows={2} value={sn.remarks} onChange={(e) => setSeason(ri, si, { remarks: e.target.value })} placeholder="Notes about this season…" />
              </div>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={() => addSeason(ri)} type="button">
            <Plus className="h-3.5 w-3.5" /> Add Another Season
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addRoom} type="button">
        <Plus className="h-3.5 w-3.5" /> Add Another Room Category
      </Button>
    </section>
  );
}
