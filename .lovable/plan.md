# Plan: Refactor Costing Wizard + 5 Fixes

## Scope

Split the monolithic `src/routes/_authenticated/costing.tsx` into modular components and apply 4 functional fixes to Activities, Entrances, Guide, and Miscellaneous.

## FIX 1 — File Split (Zero UI/Behavior Change)

Extract from `src/routes/_authenticated/costing.tsx`:

```text
src/components/quotation/
  hooks/
    useWizardState.ts        # draft load/save + step nav helpers
    useCostCalculation.ts    # memoized totals used across steps 15-17
  utils/
    gstCalculator.ts         # 5% vs 18% slab helpers
    paxRateSelector.ts       # tier lookup (1-5 / 6-14 / 15+, slab match)
  steps/
    StepActivities.tsx       # Step 10
    StepEntrances.tsx        # Step 11
    StepGuide.tsx            # Step 12
    StepMisc.tsx             # Step 13
    StepTransport.tsx        # Step 14
    StepHotels.tsx           # Step 15
    StepCosting.tsx          # Step 16
    StepFinal.tsx            # Step 17
```

`costing.tsx` becomes a thin shell: stepper header + switch on `draft.step` rendering the extracted components. Steps 1-9, 18 stay inline for now (out of scope). All existing prop-less step functions are lifted verbatim — same JSX, same handlers, same imports — just receive `draft` + updater via a shared hook.

Verification: `tsgo` clean, preview loads all steps, no visual diff.

## FIX 2 — Activities

**Module (`/activity-experience` modal):**
- Reduce pricing type to exactly two radios: `per_person` | `slab`.
- `per_person`: slabs table `From Pax | To Pax | Price Per Person`.
- `slab`: slabs table `From Pax | To Pax | Total Price`.
- Drop any combined/legacy toggle.

**Wizard Step 10 (rebuild):**
- Day-by-day accordion; per day, one collapsible group per routing city.
- Inside each city: checkbox list of activities linked to tours selected in Step 9 for that city.
- On check:
  - `per_person`: `rate × pax` (rate from slab matching `total_pax`), pax input editable, default `total_pax`.
  - `slab`: fixed total from slab matching `total_pax`, no qty input, show per-person share as info.
- Bottom "Per Person Cost Breakdown" table: rows for 1..`total_pax`, columns per checked activity, plus Total column. Slab activities keep total constant; per-person scale linearly.
- Activities Total footer.

## FIX 3 — Entrances (Step 11) Read-Only

- Remove all editable price inputs.
- Table columns: `DAY | ROUTE | CITY + TOUR | INDIAN TOTAL | FOREIGNER TOTAL | STUDENT TOTAL | SUBTOTAL`.
- Rows derived from routing `tours_selected_by_city`; prices pulled from Entrances module by tour match.
- Pax defaults: Indian = `total_pax`, Foreign = 0, Student = 0 (no editing here).
- Missing price → amber "Price not set — update in Entrances module".
- Include/exclude checkbox per row, pre-checked from routing.
- Traveller filter chips (All / Indian / Foreigner / Student) highlight that column.
- Per-day subtotal row + grand Total Entrances footer.
- Column-total layout: each nationality column shows its own running total under its cells; grand total sums all three.

## FIX 4 — Guide (Step 12) Simplify + Escort Split

- Table columns: `DAY | ROUTE | CITY + TOUR | RATE (₹) | SUBTOTAL` (remove Escort/Entry columns).
- Radio per city selecting one tour; rate auto-filled from Guide module using language filter + pax tier; editable override.
- Language filter chips + "Rate applied: X-Y Pax" badge at top.
- Per-day subtotal; Guide Subtotal footer.
- **Separate Tour Escort section below**: checkbox toggle → Type, Language, Days, Rate/day (default from module escort rate), Total, Remarks, Extra Cost. Escort Total shown.
- **Reporting Cost section**: numeric input + remarks.
- Grand `GUIDE TOTAL = fees + escort + reporting`.
- Store escort as an existing `GuideLine` with `is_escort=true` (schema already supports it) so Step 16 math untouched.

## FIX 5 — Miscellaneous

**Module modal:** collapse pricing types to `per_person` | `slab` (drop `per_day`, `fixed`). Migration: existing `per_day`/`fixed` rows treated as `per_person` with a single 1..∞ slab of their `rate` on read. Slab tables mirror Activities.

**Wizard Step 13:**
- `per_person`: rate from slab for `total_pax`, `rate × qty` with editable qty default `total_pax`, label "₹X × N pax = ₹Y".
- `slab`: fixed total from slab, no qty, show per-person share as info.
- Misc Total footer.

## Out of Scope (untouched)

Steps 1-9, 14 (Transport), 15 (Hotels), 16-18 costing math, PDF export, other master modules.

## Technical Notes

- No changes to `QuoteDraft` line-item shapes; enrich `MiscellaneousItem` migration path in `miscRateForPax`.
- `Activity` slab shape already supports both modes via `pricing_mode` + `pax_ranges`; module UI just enforces the binary choice.
- Refactor lands first as pure moves (one commit worth), then each fix layered on top file-by-file to keep diffs reviewable.
- Verification per fix: `tsgo`, load wizard through Steps 10-13 in preview, spot-check totals feed unchanged into Step 16.
