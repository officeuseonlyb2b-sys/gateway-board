// Room Allocation step — runs BEFORE hotel selection.
// Two modes:
//   Standard — room-first allocation: create rooms, assign travellers to them.
//   Dynamic  — per-day room mix (Single / Double / Triple / Quad), flexible per day.
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
import { useState, useMemo } from "react";

export const PERSON_ROOM_TYPES: { value: PersonRoomType; label: string; shares: number }[] = [
  { value: "single", label: "Single Room", shares: 0 },
  { value: "double", label: "Double Sharing", shares: 1 },
  { value: "triple", label: "Triple Sharing", shares: 2 },
  { value: "quad", label: "Quad Sharing", shares: 3 },
  { value: "extra_bed", label: "Extra Bed", shares: 0 },
  { value: "cwb", label: "Child With Bed", shares: 0 },
];

// ---------- Helper functions for room-based allocation ----------
type Room = {
  id: string;               // stable identifier (sorted person ids joined by '-')
  roomType: PersonRoomType;
  personIds: number[];
};

function roomsFromAllocs(allocs: PersonAllocation[]): Room[] {
  const personMap = new Map(allocs.map(p => [p.person_id, p]));
  const visited = new Set<number>();
  const rooms: Room[] = [];

  for (const p of allocs) {
    if (visited.has(p.person_id)) continue;
    // BFS to find all persons connected via sharing_with
    const queue = [p.person_id];
    const groupIds = new Set<number>();
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      groupIds.add(id);
      const person = personMap.get(id);
      if (person) {
        for (const shareId of person.sharing_with) {
          if (!visited.has(shareId) && !groupIds.has(shareId)) {
            queue.push(shareId);
          }
        }
      }
    }
    const sortedIds = Array.from(groupIds).sort((a, b) => a - b);
    const firstPerson = allocs.find(p => p.person_id === sortedIds[0])!;
    rooms.push({
      id: sortedIds.join('-'),
      roomType: firstPerson.room_type,
      personIds: sortedIds,
    });
  }
  return rooms;
}

function allocsFromRooms(rooms: Room[], paxCount: number, currentAllocs: PersonAllocation[]): PersonAllocation[] {
  const labelMap = new Map(currentAllocs.map(p => [p.person_id, p.label]));
  const allocs: PersonAllocation[] = [];
  for (let i = 1; i <= paxCount; i++) {
    allocs.push({
      person_id: i,
      room_type: 'single', // will be overwritten if assigned to a room
      sharing_with: [],
      label: labelMap.get(i) || `Person ${i}`,
    });
  }
  for (const room of rooms) {
    const ids = room.personIds;
    for (const id of ids) {
      const alloc = allocs.find(a => a.person_id === id);
      if (alloc) {
        alloc.room_type = room.roomType;
        alloc.sharing_with = ids.filter(other => other !== id);
      }
    }
  }
  return allocs;
}

// Get max occupancy for a room type
function maxOccupancy(roomType: PersonRoomType): number {
  const found = PERSON_ROOM_TYPES.find(r => r.value === roomType);
  return found ? found.shares + 1 : 1;
}

// ----------------------------------------------------------------

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

  // ---------- Room-based UI state ----------
  const [selectedUnassigned, setSelectedUnassigned] = useState<Set<number>>(new Set());
  const [newRoomType, setNewRoomType] = useState<PersonRoomType>('double');

  // Derived rooms and unassigned persons
  const rooms = useMemo(() => roomsFromAllocs(allocs), [allocs]);
  const assignedIds = useMemo(() => new Set(rooms.flatMap(r => r.personIds)), [rooms]);
  const unassigned = useMemo(() => allocs.filter(p => !assignedIds.has(p.person_id)), [allocs, assignedIds]);

  // Helper to update allocs from a modified rooms array
  const updateRooms = (newRooms: Room[]) => {
    const newAllocs = allocsFromRooms(newRooms, paxCount, allocs);
    setAllocs(newAllocs);
  };

  // ---------- Room actions ----------
  const changeRoomType = (roomId: string, newType: PersonRoomType) => {
    const newRooms = rooms.map(r => {
      if (r.id !== roomId) return r;
      const cap = maxOccupancy(newType);
      // If current occupancy exceeds new capacity, truncate (move extra to unassigned)
      let personIds = r.personIds;
      if (personIds.length > cap) {
        personIds = personIds.slice(0, cap);
      }
      return { ...r, roomType: newType, personIds };
    });
    updateRooms(newRooms);
  };

  const removePersonFromRoom = (personId: number) => {
    const newRooms = rooms
      .map(r => ({
        ...r,
        personIds: r.personIds.filter(id => id !== personId),
      }))
      .filter(r => r.personIds.length > 0); // remove empty rooms
    updateRooms(newRooms);
  };

  const deleteRoom = (roomId: string) => {
    const newRooms = rooms.filter(r => r.id !== roomId);
    updateRooms(newRooms);
  };

  const addPersonToRoom = (roomId: string, personId: number) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    const cap = maxOccupancy(room.roomType);
    if (room.personIds.length >= cap) return; // capacity full

    const newRooms = rooms.map(r =>
      r.id === roomId ? { ...r, personIds: [...r.personIds, personId] } : r
    );
    updateRooms(newRooms);
  };

  const createRoom = () => {
    if (selectedUnassigned.size === 0) return;
    const ids = Array.from(selectedUnassigned).sort((a, b) => a - b);
    const newRoom: Room = {
      id: ids.join('-'), // stable id
      roomType: newRoomType,
      personIds: ids,
    };
    const newRooms = [...rooms, newRoom];
    updateRooms(newRooms);
    setSelectedUnassigned(new Set());
  };

  const toggleUnassignedSelection = (personId: number) => {
    const newSet = new Set(selectedUnassigned);
    if (newSet.has(personId)) newSet.delete(personId);
    else newSet.add(personId);
    setSelectedUnassigned(newSet);
  };

  // Presets (still set allocs directly; rooms will be recomputed)
  const applyPreset = (which: "single" | "double" | "one_rest" | "standard") => {
    let newAllocs: PersonAllocation[];
    if (which === "single") newAllocs = presetAllSingle(paxCount);
    else if (which === "double") newAllocs = presetAllDouble(paxCount);
    else if (which === "standard") newAllocs = presetStandardPattern(paxCount);
    else newAllocs = presetOneSingleRestDouble(paxCount);
    setAllocs(newAllocs);
    setSelectedUnassigned(new Set()); // clear selection
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
          ? "Standard — create rooms and assign travellers. Rooms are shown first."
          : "Dynamic — set a different Single / Double / Triple / Quad mix for every night of the trip."}
      </p>

      {mode === "standard" ? (
        <Card className="p-4 border-primary/20">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-primary">Room‑First Allocation</div>
              <div className="text-xs text-muted-foreground">Create rooms, assign travellers to them.</div>
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

              <div className="space-y-4">
                {/* Rooms list */}
                {rooms.map((room) => {
                  const cap = maxOccupancy(room.roomType);
                  const occupancy = room.personIds.length;
                  const canAdd = occupancy < cap;
                  const availableUnassigned = unassigned.filter(p => !room.personIds.includes(p.person_id));

                  return (
                    <div key={room.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Select
                            value={room.roomType}
                            onValueChange={(v) => changeRoomType(room.id, v as PersonRoomType)}
                          >
                            <SelectTrigger className="h-8 w-[180px] text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PERSON_ROOM_TYPES.map((r) => (
                                <SelectItem key={r.value} value={r.value}>
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-xs text-muted-foreground">
                            {occupancy} / {cap} occupants
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-destructive"
                          onClick={() => deleteRoom(room.id)}
                          disabled={rooms.length === 1} // keep at least one room
                        >
                          Delete Room
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {room.personIds.map((id) => {
                          const person = allocs.find(p => p.person_id === id);
                          return (
                            <div
                              key={id}
                              className="flex items-center gap-1 bg-muted/50 rounded-full px-3 py-1 text-sm"
                            >
                              <span>{person?.label || `Person ${id}`}</span>
                              <button
                                type="button"
                                onClick={() => removePersonFromRoom(id)}
                                className="text-muted-foreground hover:text-destructive"
                                title="Remove from this room (becomes unassigned)"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Add person to this room */}
                      {availableUnassigned.length > 0 && canAdd && (
                        <div className="flex items-center gap-2">
                          <Select
                            onValueChange={(val) => {
                              const pid = parseInt(val, 10);
                              if (!isNaN(pid)) addPersonToRoom(room.id, pid);
                            }}
                            value=""
                          >
                            <SelectTrigger className="h-8 text-sm w-[200px]">
                              <SelectValue placeholder="Add person to room" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableUnassigned.map(p => (
                                <SelectItem key={p.person_id} value={String(p.person_id)}>
                                  {p.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-xs text-muted-foreground">
                            {canAdd ? `(room can take ${cap - occupancy} more)` : 'full'}
                          </span>
                        </div>
                      )}
                      {!canAdd && occupancy >= cap && (
                        <div className="text-xs text-amber-700">Room is full – remove someone first to add another</div>
                      )}
                      {/* If there are no unassigned but room has space, it means all persons are assigned elsewhere.
                          To move someone here, remove them from their current room first. */}
                      {availableUnassigned.length === 0 && canAdd && unassigned.length === 0 && (
                        <div className="text-xs text-muted-foreground">
                          All travellers are assigned – remove someone from another room to add here.
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Unassigned persons and room creation */}
                {unassigned.length > 0 && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="text-sm font-medium">Unassigned Travellers</div>
                    <div className="flex flex-wrap gap-2">
                      {unassigned.map((p) => (
                        <button
                          key={p.person_id}
                          type="button"
                          onClick={() => toggleUnassignedSelection(p.person_id)}
                          className={cn(
                            "px-3 py-1 rounded-full text-sm border",
                            selectedUnassigned.has(p.person_id)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-border"
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <Select value={newRoomType} onValueChange={(v) => setNewRoomType(v as PersonRoomType)}>
                        <SelectTrigger className="h-8 w-[180px] text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PERSON_ROOM_TYPES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={createRoom}
                        disabled={selectedUnassigned.size === 0}
                      >
                        Create Room ({selectedUnassigned.size} selected)
                      </Button>
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div className="text-sm text-muted-foreground">
                  {assignedIds.size} / {paxCount} travellers assigned to rooms.
                  {unassigned.length > 0 && (
                    <span className="text-amber-700 ml-2">
                      {unassigned.length} unassigned – create a room or assign them to existing rooms.
                    </span>
                  )}
                </div>
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