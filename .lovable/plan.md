## Wizard Overhaul — Steps 3-14 + New Step 8

Incremental refactor of `src/routes/_authenticated/costing.tsx` plus supporting stores. I will land this in ordered commits so each change is verifiable in the preview before the next lands.

### Order of work

1. **Types + state (`src/lib/wizard/types.ts`)**
   - Extend `QuoteDraft` with: `tour_type`, `pax_min`, `pax_max`, `has_dates`, `brochure_validity_from/till`, `arrival_flight`, `departure_flight`, `arrival_train`, `departure_train`, entrance `students` fields, activity/guide/misc `pax_ranges`.
   - Extend `RoutingDay` with `day_name`, `from_city`, `to_city`, `travel_by`. Keep old `city_id` populated as an alias of `to_city` during migration so Step 15 (untouched) keeps working.
   - Extend `TransportLine` with `rate_format: 'per_day' | 'total' | 'prefilled'`, `reporting_cost`, `total_override`, `remarks`.
   - Extend `EntranceLine` with `student_pax`, `student_rate`.
   - `emptyDraft()` defaults for all new fields.

2. **Progress bar labels** — update `STEP_LABELS` array to the 18 new labels and bump total step count from 18 → 19 (new gate step 8). Steps 9-18 shift by +1 internally but keep their semantics; Step 15 (Hotels) etc. untouched in behavior.

3. **Step 3 (Pax + FIT/GIT)** — add auto-badge for B2B/B2C from total pax. For Brochure, swap adults/SS/children UI for `pax_min` / `pax_max` inputs. Persist `tour_type`.

4. **Step 4 (Departure)** — Brochure-only: relabel + restrict dropdown to the 19 MP cities listed.

5. **Step 5 (Travel Mode)** — add conditional Flight/Train arrival + departure detail cards. Brochure shows skip message; Next always enabled.

6. **Step 6 (Duration)** — B2B/B2C: With Dates vs Without Dates radio; day-name chips (weekday or "Day N"). Brochure: Validity From/Till + nights/days.

7. **Step 7 (Program)** — unchanged (already exists as current Step 4). Just reorder in the step map.

8. **Step 8 (Create Routing — NEW gate)** — summary card + disabled-until-valid "Generate Day-by-Day Routing" button. On click, seeds the routing rows and advances to Step 9.

9. **Step 9 (Routing table)** — add `Day Name`, `From City`, `To City`, `Travel By` columns. `From City` on Day 1 pulls from `departure_city`; subsequent days auto-fill from prior `to_city` (overridable). Keep existing program text + entrance suggestions. Ensure `city_id` alias stays in sync so Step 15 hotel lookups continue to work.

10. **Step 10 (Transport)** — add `Rate Format` radio (Per Day / Total Program / Pre-filled). Compute line total accordingly. Keep pax-based vehicle filter.

11. **Step 11 (Activities)** — Brochure only: pax-range pricing table per activity. Non-brochure unchanged.

12. **Step 12 (Entrances)** — add `Students` pax + rate as a third row alongside Indian/Foreigner. Update `/entrances` module to add `student_rate` column and modal field (default 0).

13. **Step 13 (Guide)** — restrict guide type options to the 3 new strings, update `/guide` module + reseed. Brochure adds pax-range pricing table per guide row.

14. **Step 14 (Misc)** — Brochure only: pax-range pricing table per misc item.

15. **Verification pass** — `tsgo` typecheck after each block; open preview and click through each step for the three query types (B2B, B2C, Brochure). Confirm Step 15/16/17/18 still render and Save Quote + drafts + banner unchanged.

### Backward compatibility

- All new draft fields optional or given safe defaults so existing drafts in `localStorage` continue to load.
- Old routing rows lacking `from_city`/`to_city` fall back to `city_id` on read.
- Step 15/16/17/18 code paths not modified beyond reading `to_city ?? city_id`.

### Files touched

- `src/lib/wizard/types.ts` (fields + defaults)
- `src/routes/_authenticated/costing.tsx` (all step UI + step map + progress labels)
- `src/routes/_authenticated/entrances.tsx` + `src/lib/mock-store.ts` (student rate column)
- `src/routes/_authenticated/guide.tsx` + `src/lib/mock-store.ts` (guide-type enum + reseed)
- `src/lib/wizard/calc.ts` (transport rate format, entrance students, brochure pax-range picks)

Shall I proceed?
