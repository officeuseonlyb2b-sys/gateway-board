## Plan — 10 additive fixes to the New Quotation flow

I'll implement each item as a focused edit, preserving all existing calculations, drafts, and step wiring.

### 1. Step 12 Guide — checkbox toggle + reporting by pax + language filter
- `StepGuide.tsx`: fix `toggleTourSelection` so unchecking clears the disabled key + line reliably (bug is auto-sync re-adding the line — respect `guide_tour_disabled_by_day` in `ensureGuideLine`, already done, but the row-level state derivation is stale; force checkbox to use disabledKeys as the source of truth and skip the auto-sync when disabled).
- Add per-pax-category reporting cost row: `guide_reporting_indian / _foreigner / _student` (new optional fields in `QuoteDraft`). Render as a second Reporting sub-row grouped per language column, or as a compact 3-cell input group per language. Include in `totalForLang`.
- Make "Filter language" hide non-matching language columns and their subtotals/reporting/totals when a specific language is picked.

### 2. Hotel form — Hotel Type dropdown
- `types` in `mock-store.ts`: add `hotel_type?: HotelType` on `Hotel` with the 9 listed enum values.
- `HotelFormDialog.tsx`: add a required Select right after Category. Persist on save. Backfill undefined as blank.

### 3. Season Label preset dropdown with auto date ranges
- `SeasonFormDialog.tsx`: replace the free-text season label input with a Select of {Summer, Winter, Wildlife, Wildlife Buffer}. On change, set validity_start / validity_end using the fixed month-day rules relative to the currently displayed year (or open-ended: use current year for start, roll year for Winter). Fields remain editable.

### 4. Split Festive Supplements from Remarks / Blackout
- `HotelRatesEditor.tsx` (or SeasonFormDialog wherever they live): wrap each into its own titled Card block with spacing between them.

### 5. Blackout Dates — date-range picker at end of hotel form + multiple ranges
- Add `blackout_ranges: { id, from, to }[]` on `Hotel`.
- Move the control out of the per-season block into `HotelFormDialog.tsx` at the very end after "Add Another Room Category". Multi-row list with From/To pickers + Add/Remove buttons using the shadcn Calendar Popover pattern.

### 6. Festive Supplements — date-based trigger
- Extend festive supplement schema with `date_from?, date_to?` (per supplement) in the rate plan.
- `SeasonFormDialog.tsx`/rates editor: add two date-range pickers to X'mas & New Year rows.
- `src/lib/wizard/calc.ts`: when computing a night's cost, if the night date falls in any configured festive range, add that supplement (per person or per room per its mode) on top of the base rate for that night.

### 7. Transport per-vehicle Day-wise vs Total toggle
- Extend `TransportLine` with `rate_mode: 'daywise' | 'total'` and `total_rate?: number`.
- `StepTransport.tsx`: add a small toggle per vehicle row/card. When "Total", collapse day rows to a single rate input.
- `calc.ts` transport total: if `rate_mode==='total'`, use `total_rate * units`; else existing day-wise sum.

### 8. Bug: Step 15 Accommodation Options resetting on navigation
- Root-cause inside `StepHotels.tsx`: local `useState` initialized from draft on mount that never re-syncs when the component remounts after step navigation, OR a `useEffect` overwriting draft.hotel_options with a fresh default array whenever `draft.hotel_options.length===0` at first render. Fix by seeding from `draft.hotel_options` and only initializing when truly empty; ensure every mutation writes through `set({ hotel_options })`. Verify no `useEffect` clears selections on `pax`/`routing` changes.

### 9. Category fallback — next-lower categories, sorted by price desc
- In hotel option "no hotels" branch of `StepHotels.tsx`: order categories `["5 Star","4 Star","3 Star","Budget",...]`, take those at or below the selected tier, filter hotels by city, sort by best-available rate desc, show in a labeled fallback list.

### 10. Pax Range selector alongside Adults/SS/Children
- Add `pax_range?: '1-5' | '6-14' | '15+'` (align with existing tier boundaries used across guide/activities/misc) to `QuoteDraft`.
- Step 1/Pax step: add a `Select` next to counters. When set, `calc.ts` helpers (`guideRateForPax`, activity slab, misc slab, transport already per-day) read from `draft.pax_range` override rather than `totalPax(draft)`. Provide `effectivePaxTier(draft)` helper used everywhere so nothing else needs changes.

### Technical notes
- Storage version bumped only if schema requires migration; new optional fields don't need a bump (existing drafts keep working).
- No route or shell changes. No changes to existing GST / markup logic.
- After each item I'll re-run tsgo and spot-check the affected step visually via the dev preview.
