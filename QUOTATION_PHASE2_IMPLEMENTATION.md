# Quotation Builder Phase 2 — Developer Handoff

## Outcome

This revision implements the approved ten-step Sales quotation workflow on top of the existing Gateway Board project. It preserves the existing Product, Contracting and Vendor master connections and does not replace the existing application, Supabase setup or working quotation foundation.

The generated quotation is an internal costing record. The client-facing itinerary/quotation designer remains a later phase.

## Implemented workflow

| Step | Implemented behaviour |
| --- | --- |
| 1. Type | B2B, B2C and Brochure remain available. Every generated quotation must be linked to one authoritative Query. |
| 2. Who | B2B uses an Agent Master record and now includes **Register New Agent** in the workflow. B2C details remain inline. |
| 3. Trip Basics | Exact pax or pax range; adult/senior/child composition; home city separated from tour start/end; independent arrival/departure modes; dated or Without Dates flow. Pending arrival/departure mode is a warning, not a blocker. |
| 4. Program | Existing-program selection and new/custom program creation remain available. Quote-specific edits do not overwrite the master; a new program is added only through the explicit save-to-master path. |
| 5. Routing | Day-wise itinerary starts at the tour starting city, keeps overnight/destination/tour selections and supports road, self-drive, train, flight and bus details. |
| 6. Land Part | Activity, Guide, Entrances, Miscellaneous and Transport remain separate working areas. Master per-person/group/slab prices are recalculated for each requested pax row. Vehicle alternatives remain independent. |
| 7. Accommodation | Up to four hotel options; standard/dynamic rooming; supplier GST slab; manual-rate reason/audit; exact-pax room-mix constraint; quad availability validation; meals controlled by hotel meal plan. |
| 8. Costing | Package, Transport-only and Accommodation-only modes; separate Land and Hotels/Meals markup/GST; category × vehicle variations; selected exact/range pax rows. |
| 9. Optional Supplements | Only deliberately selected optional activities/services are carried forward. Optional amounts do not enter the package total. |
| 10. Final Review | Internal readiness review, scenario totals, selected rate-sheet rows, warnings/blockers and Generate action. |

## Calculation rules now enforced

- Supplier hotel GST: 5% for room tariff up to and including ₹7,500; 18% above ₹7,500.
- Hotel/meal and Land markup/GST are calculated separately.
- Meals are always costed per person.
- AP blocks separate lunch and dinner selection; MAP blocks separate dinner; CP leaves both available.
- Activity and Miscellaneous master pricing is evaluated per pax row using its configured per-person, fixed/group or slab rule.
- Guide master tiers are evaluated again for each pax row.
- Entrance totals retain the traveller-category distribution while scaling to the selected pax row.
- Vehicle alternatives are not added together. Each hotel-option × vehicle combination is a separate quotation variation.
- Exact-pax enquiries show the exact applicable row by default. Range enquiries show only the requested range and vehicle-capacity-compatible rows.
- Optional supplements are excluded from package totals.
- Dynamic rooming is restricted to exact-pax enquiries and must cover exactly the stated traveller count.
- A selected final rate-sheet row is required before generation.

## Quote lifecycle and integrity

- Drafts autosave and remain linked to their Query.
- Drafts resume at the last saved step.
- Generated quotations are append-only and read-only.
- A correction creates V2/V3/etc. and requires a revision reason.
- The previous active version is marked Superseded; it is not deleted.
- Voiding requires a reason and retains the audit record.
- The immutable snapshot includes the input draft, scenarios, selected services, selected final pax rows and a content checksum.
- Finalising updates the linked Query commercial snapshot and removes the completed draft.
- Recent Quotes defaults to the last seven days and links back to the Query dashboard.

## Files changed for this quotation phase

### Workflow shell and screens

- `src/routes/_authenticated/costing.tsx`
- `src/routes/_authenticated/drafts.tsx`
- `src/routes/_authenticated/quotes.tsx`
- `src/routes/_authenticated/queries/$id.tsx`
- `src/components/AppSidebar.tsx`
- `src/routes/_authenticated/dashboard.tsx`

### Quotation UI

- `src/components/quotation/CostingSheet.tsx`
- `src/components/quotation/MarkupGstSettings.tsx`
- `src/components/quotation/ScenarioComparison.tsx`
- `src/components/quotation/steps/StepCosting.tsx`
- `src/components/quotation/steps/StepFinal.tsx`
- `src/components/quotation/steps/StepHotels.tsx`
- `src/components/quotation/steps/StepMeals.tsx`
- `src/components/quotation/steps/StepTransport.tsx`
- `src/components/QuoteDocument.tsx`

### Calculation, validation and persistence

- `src/lib/wizard/types.ts`
- `src/lib/wizard/calc.ts`
- `src/lib/wizard/scenario.ts`
- `src/lib/wizard/costsheet.ts`
- `src/lib/wizard/validation.ts`
- `src/lib/wizard/build-saved-quote.ts`
- `src/lib/quotes-store.ts`
- `src/lib/crm/store.ts`

### Supporting correction

- `src/routes/_authenticated/routing-programs.tsx` — corrected a card icon component type while retaining the existing Program Master behaviour.

### Verification and handoff

- `scripts/audit-quotation-engine.mjs` — repeatable fixed-number calculation, capacity, validation and quotation-versioning regression audit.
- `package.json` — adds `npm run audit:quotation`.
- `QUOTATION_PHASE2_AUDIT.md` — final reconciliation, verified controls, corrections and parked items.

## Run and verify

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run audit:quotation
npx tsc --noEmit
npm run build
```

All three commands pass in this package. See `QUOTATION_PHASE2_AUDIT.md` for the fixed-number reconciliation and final audit findings.

`npm run lint` still reports the repository's pre-existing broad Prettier/formatting backlog. The project was not bulk-formatted because that would create thousands of unrelated file changes and make the developer merge unsafe.

## Intentionally parked

- Brochure-specific end-to-end workflow redesign.
- Client-facing itinerary and quotation document builder.
- Final Child-with-Bed versus Extra-Bed contract relationship; the data model should be finalised during the Hotel Contracting review to prevent duplicate charging.
- Live Google Maps distance/time integration; routing retains editable journey details.
- Database normalisation, migration, Supabase restructuring, RLS/security hardening and production cloud persistence.
- Full Operations workflow beyond the existing minimal Won-query handoff.

## Developer merge note

Merge the files listed above as one coordinated change. In particular, do not merge the UI files without `types.ts`, `costsheet.ts`, `scenario.ts`, `validation.ts`, `build-saved-quote.ts` and `quotes-store.ts`, because the final UI and immutable quotation record depend on the same calculation and snapshot contracts.
