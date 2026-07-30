// Room Allocation step — runs BEFORE hotel selection.
// Two modes:
//   Standard — repeating 1 Single / 2 Double / 3 Triple pattern (per-person table)
//   Dynamic  — per-day room mix (Single / Double / Triple / Quad), flexible per day
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDB } from "@/lib/mock-store";
import {
  effectivePaxForPricing, normalizeAllocations, defaultAllocations,
  presetAllSingle, presetAllDouble, presetOneSingleRestDouble, presetStandardPattern,
  defaultDayMix, dayMixCoversPax,
} from "@/lib/wizard/calc";
import type { PersonAllocation, PersonRoomType, DayRoomMix, AllocationMode } from "@/lib/wizard/types";
import type { StepProps } from "../shared";

export const PERSON_ROOM_TYPES: { value: PersonRoomType; label: string; shares: number }[] = [
  { value: "single", label: "Single Room", shares: 0 },
  { value: "double", label: "Double Sharing", shares: 1 },
  { value: "triple", label: "Triple Sharing", shares: 2 },
  { value: "quad", label: "Quad Sharing", shares: 3 },
  { value: "extra_bed", label: "Extra Bed", shares: 0 },
  { value: "cwb", label: "Child With Bed", shares: 0 },
];

export function StepAllocation({ draft, set }: StepProps) {
  const d = useDB();
  const paxCount = Math.max(1, effectivePaxForPricing(draft));
  const mode: AllocationMode = draft.allocation_mode ?? "standard";
  const overnight = draft.routing.filter((r) => r.overnight);

  // Standard mode state lives on Option A and is mirrored to every option so
  // downstream previews (Step Hotels / Costing / Final) keep working unchanged.
  const optA = draft.hotel_options[0];
  const enabled = !!optA?.use_custom_allocation;
  const allocs = normalizeAllocations(optA?.pax_allocations, paxCount);

  const writeAll = (patch: { use_custom_allocation?: boolean; pax_allocations?: PersonAllocation[] }) => {
    set({ hotel_options: draft.hotel_options.map((o) => ({ ...o, ...patch })) });
  };
  const setAllocs = (next: PersonAllocation[]) => writeAll({ pax_allocations: next });

  const setRoomType = (person_id: number, type: PersonRoomType) => {
    setAllocs(allocs.map((p) => {
      if (p.person_id === person_id) return { ...p, room_type: type, sharing_with: [] };
      return { ...p, sharing_with: p.sharing_with.filter((id) => id !== person_id) };
    }));
  };

  const togglePartner = (person_id: number, partner_id: number) => {
    const person = allocs.find((p) => p.person_id === person_id);
    if (!person) return;
    const maxShares = PERSON_ROOM_TYPES.find((r) => r.value === person.room_type)?.shares ?? 0;
    const has = person.sharing_with.includes(partner_id);
    let newList = has
      ? person.sharing_with.filter((id) => id !== partner_id)
      : [...person.sharing_with, partner_id];
    if (newList.length > maxShares) newList = newList.slice(-maxShares);
    setAllocs(allocs.map((p) => {
      if (p.person_id === person_id) return { ...p, sharing_with: newList };
      if (newList.includes(p.person_id)) {
        const withList = [person_id, ...newList.filter((id) => id !== p.person_id)];
        return { ...p, room_type: person.room_type, sharing_with: withList };
      }
      if (has && p.person_id === partner_id) {
        return { ...p, sharing_with: p.sharing_with.filter((id) => id !== person_id) };
      }
      return p;
    }));
  };

  const setLabel = (person_id: number, label: string) =>
    setAllocs(allocs.map((p) => (p.person_id === person_id ? { ...p, label } : p)));

  const applyPreset = (which: "single" | "double" | "one_rest" | "standard") => {
    if (which === "single") setAllocs(presetAllSingle(paxCount));
    else if (which === "double") setAllocs(presetAllDouble(paxCount));
    else if (which === "standard") setAllocs(presetStandardPattern(paxCount));
    else setAllocs(presetOneSingleRestDouble(paxCount));
  };

  // ---- dynamic mode helpers ----
  const mixFor = (dayNo: number): DayRoomMix => draft.day_room_mix?.[dayNo] ?? defaultDayMix(paxCount);
  const setMix = (dayNo: number, patch: Partial<DayRoomMix>) => {
    const current = mixFor(dayNo);
    set({ day_room_mix: { ...(draft.day_room_mix ?? {}), [dayNo]: { ...current, ...patch } } });
  };
  const applyDayPreset = (dayNo: number, kind: "single" | "double" | "triple" | "quad") => {
    if (kind === "single") setMix(dayNo, { single: paxCount, double: 0, triple: 0, quad: 0 });
    if (kind === "double") setMix(dayNo, { single: paxCount % 2, double: Math.floor(paxCount / 2), triple: 0, quad: 0 });
    if (kind === "triple") {
      const triple = Math.floor(paxCount / 3);
      const rem = paxCount % 3;
      setMix(dayNo, { single: rem === 1 ? 1 : 0, double: rem === 2 ? 1 : 0, triple, quad: 0 });
    }
    if (kind === "quad") {
      const quad = Math.floor(paxCount / 4);
      const rem = paxCount % 4;
      setMix(dayNo, { single: rem === 1 ? 1 : 0, double: rem === 2 ? 1 : 0, triple: rem === 3 ? 1 : 0, quad });
    }
  };
  const copyDayOneToAll = () => {
    const first = overnight[0];
    if (!first) return;
    const base = mixFor(first.day);
    const next: Record<number, DayRoomMix> = { ...(draft.day_room_mix ?? {}) };
    overnight.forEach((r) => { next[r.day] = { ...base }; });
    set({ day_room_mix: next });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Per-Person Room Allocation</h2>
        <p className="text-sm text-muted-foreground">
          Decide the room mix before picking hotels. {paxCount} traveller{paxCount === 1 ? "" : "s"}.
        </p>
      </div>

      <div className="flex gap-2">
        {(["standard", "dynamic"] as AllocationMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => set({ allocation_mode: m })}
            className={cn(
              "px-4 py-2 rounded-lg border-2 text-sm font-medium capitalize",
              mode === m ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground",
            )}
          >
            {m} mode
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === "standard"
          ? "Standard — rooms follow a repeating 1 Single, 2 Double, 3 Triple pattern; adjust any person below."
          : "Dynamic — set a different Single / Double / Triple / Quad mix for every night of the trip."}
      </p>

      {mode === "standard" ? (
        <Card className="p-4 border-primary/20">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-primary">Per-Person Room Allocation</div>
              <div className="text-xs text-muted-foreground">Applies to all accommodation options.</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Use custom allocation</span>
              <Switch
                checked={enabled}
                onCheckedChange={(v) => {
                  if (v && !optA?.pax_allocations?.length) {
                    writeAll({ use_custom_allocation: true, pax_allocations: presetStandardPattern(paxCount) });
                  } else {
                    writeAll({ use_custom_allocation: v, pax_allocations: optA?.pax_allocations ?? defaultAllocations(paxCount) });
                  }
                }}
              />
            </div>
          </div>

          {enabled && (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                <Button size="sm" variant="outline" onClick={() => applyPreset("standard")}>Standard Pattern (1S / 2D / 3T)</Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset("single")}>All Single</Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset("double")}>All Double Sharing</Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset("one_rest")}>1 Single + Rest Double</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left py-1.5 font-medium">Person</th>
                      <th className="text-left py-1.5 font-medium">Room Type</th>
                      <th className="text-left py-1.5 font-medium">Sharing With</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocs.map((p) => {
                      const rt = PERSON_ROOM_TYPES.find((r) => r.value === p.room_type)!;
                      const others = allocs.filter((o) => o.person_id !== p.person_id);
                      return (
                        <tr key={p.person_id} className="border-t">
                          <td className="py-1.5 pr-2 align-top">
                            <Input
                              className="h-8 text-sm"
                              value={p.label}
                              onChange={(e) => setLabel(p.person_id, e.target.value)}
                              placeholder={`Person ${p.person_id}`}
                            />
                          </td>
                          <td className="py-1.5 pr-2 align-top">
                            <Select value={p.room_type} onValueChange={(v) => setRoomType(p.person_id, v as PersonRoomType)}>
                              <SelectTrigger className="h-8 text-sm w-[180px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {PERSON_ROOM_TYPES.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-1.5 align-top">
                            {rt.shares > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {others.map((o) => {
                                  const active = p.sharing_with.includes(o.person_id);
                                  return (
                                    <button
                                      key={o.person_id}
                                      type="button"
                                      onClick={() => togglePartner(p.person_id, o.person_id)}
                                      className={cn(
                                        "text-xs px-2 py-1 rounded border",
                                        active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border",
                                      )}
                                    >
                                      {o.label}
                                    </button>
                                  );
                                })}
                                {p.sharing_with.length < rt.shares && (
                                  <span className="text-[11px] text-amber-700 self-center">
                                    Choose {rt.shares - p.sharing_with.length} more
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      ) : (
        <Card className="p-4 border-primary/20 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-primary">Day-by-Day Room Mix</div>
              <div className="text-xs text-muted-foreground">Each night can use a different mix. Quad rates are used when the hotel has them.</div>
            </div>
            <Button size="sm" variant="outline" onClick={copyDayOneToAll} disabled={overnight.length < 2}>
              Copy Day 1 to all
            </Button>
          </div>

          {overnight.length === 0 && (
            <p className="text-sm text-muted-foreground">Generate the routing first — no overnight days yet.</p>
          )}

          {overnight.map((r) => {
            const mix = mixFor(r.day);
            const covered = dayMixCoversPax(mix);
            const cityName = d.cities.find((c) => c.id === r.city_id)?.name || "—";
            return (
              <div key={r.day} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    Day {r.day} · {cityName}
                    {r.date ? <span className="text-xs text-muted-foreground ml-2">{r.date}</span> : null}
                  </div>
                  <div className={cn("text-xs", covered === paxCount ? "text-emerald-700" : "text-amber-700")}>
                    {covered} / {paxCount} pax covered
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => applyDayPreset(r.day, "single")}>All Single</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => applyDayPreset(r.day, "double")}>All Double</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => applyDayPreset(r.day, "triple")}>All Triple</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => applyDayPreset(r.day, "quad")}>All Quad</Button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(["single", "double", "triple", "quad"] as (keyof DayRoomMix)[]).map((k) => (
                    <div key={k}>
                      <Label className="text-xs capitalize">{k} rooms</Label>
                      <Input
                        type="number"
                        min={0}
                        className="h-8"
                        value={mix[k]}
                        onChange={(e) => setMix(r.day, { [k]: Math.max(0, parseInt(e.target.value) || 0) } as Partial<DayRoomMix>)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
