## Goal

Add an **optional** "Per-Person Room Allocation" mode to each hotel option (A/B/C/D) in the New Quotation wizard. When enabled, each pax picks a room type (Single / Double sharing / Triple sharing / Extra Bed / CWB) with a sharing partner, and Steps 15–17 plus the exported quote show a per-person cost breakdown. When disabled (default), the existing SGL/DBL/TRP display and calculations are unchanged.

Agents module already exists (`src/routes/_authenticated/agents.tsx` + Step 2 integration), so Change 8 is a no-op — I'll verify only.

## Data model (`src/lib/wizard/types.ts`)

Add per-option allocation to `HotelOption`:

```ts
export type PersonRoomType = "single" | "double" | "triple" | "extra_bed" | "cwb";

export interface PersonAllocation {
  person_id: number;         // 1-based, stable
  label: string;             // editable, default "Person N"
  room_type: PersonRoomType;
  sharing_with: number[];    // other person_ids in the same room
}

export interface HotelOption {
  // ...existing...
  use_custom_allocation?: boolean;
  pax_allocations?: PersonAllocation[];
}
```

`emptyDraft()` unchanged (flag defaults to falsy = existing behaviour).

## Calculation helpers (`src/lib/wizard/calc.ts`)

Add pure helpers, do not touch `computeOption`:

- `computePersonRoomCostForDay(person, allocations, plan)` returns `{ net, gst }` using:
  - single → `sgl_rate`, GST slab on `sgl_rate`
  - double → `dbl_rate / 2`, GST slab on `dbl_rate`
  - triple → `(dbl_rate + extra_bed_rate) / 3`, slab on `(dbl_rate + extra_bed_rate)`
  - extra_bed → `extra_bed_rate`, slab on `extra_bed_rate`
  - cwb → `cwb_rate` (fallback 0), slab on `cwb_rate`
- `computePersonTotals(draft, opt, d)` → array of `{ person_id, label, room_type, room_net, room_gst, room_total, shared_addons, markup, gst5, grand_total }`. Shared add-ons = `computeAddonsTotal(draft) / totalPax(draft)`. Markup = `(room_total + shared_addons) * markup%`. GST5 on markup only, per spec Change 4.
- `optionUsesCustomAllocation(opt)` guard.

## Step 15 UI (`src/routes/_authenticated/costing.tsx`)

Per option card, above the day-wise hotel rows:

- Switch: **"Use custom room allocation"** (bound to `opt.use_custom_allocation`).
- When ON, render `<PaxAllocator>`:
  - Header: "Room allocation for N persons" (N = `totalPax(draft)`).
  - Presets row: `All Single`, `All Double Sharing`, `Mixed: 1 Single + Rest Double`.
  - One row per person: editable name input, `room_type` select, `sharing_with` select filtered to pax not already paired (except self / current partner). Auto-mirror pairing both ways; keep read-only on the mirror.
  - Auto-init `pax_allocations` from pax count when switch flips ON; auto-resize when pax count changes while ON.
- Below allocator, extend the existing **Cost Preview** box: when custom mode is ON, replace the SGL/DBL/TRP mini-summary with the per-person block described in Change 3 (nights × rate + GST per person, then combined total). Default mode preview is untouched.

Helper `PaxAllocator` and preset functions live in the same file (matching the file's current pattern of local step components).

## Step 16 (Costing Variations)

For each selected option:

- If `use_custom_allocation`: render a new **"Cost Per Person"** table above the existing SGL/DBL/TRP block with columns Person / Room Type / Room Cost / GST / Room Total, then Shared Costs breakdown (transport, guide, entrances, misc, activities, optionals — using existing `computeAddonsTotal` split), then Markup per person, GST 5% on markup per person, Grand Total per person, and Package Total.
- Keep the existing SGL/DBL/TRP summary rows untouched below (spec Change 4 explicitly says "keep for reference").

## Step 17 (Final)

For options with custom allocation, add a per-person summary card (Change 5 layout) alongside the existing final blocks. Non-custom options render exactly as today.

## PDF export (`src/components/QuoteDocument.tsx`)

For each included option with custom allocation, add a **"Room Allocation & Cost Per Person"** table (Change 6 columns: Person, Room Type, Accommodation, Shared Costs, Markup+GST, Total) with the footnote about shared costs. Options without custom allocation render unchanged.

## Backward compatibility

- New fields are optional; existing drafts and saved quotes without them fall through to today's behaviour.
- `computeOption`, `transportLineTotal`, `gstRateFor`, and add-ons breakdown are not modified.
- Hotels module, notifications, drafts store, saved quotes store, styling: untouched.

## Change 8 (Agents)

Verify `src/routes/_authenticated/agents.tsx` and Step 2 combobox still work; no code changes expected. If a regression is found I'll note it but not expand scope.

## Out of scope

Per-day allocation overrides, per-person meal-plan overrides, editing allocations from Step 16/17 (Step 15 remains the single edit surface).
