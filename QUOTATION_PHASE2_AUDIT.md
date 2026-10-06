# Quotation Builder Phase 2 — Final Audit

Audit date: 23 September 2026

## Result

The ten-step quotation workflow, calculation chain, Query connection, resumable drafts, immutable generated versions and Recent Quotes flow have been rechecked against the approved discussion.

Production build and TypeScript compilation pass. A repeatable calculation and integrity test is included at `scripts/audit-quotation-engine.mjs` and can be run with:

```bash
npm run audit:quotation
npx tsc --noEmit
npm run build
```

## Reconciled calculation example

The automated test uses one two-pax quotation with one Double room and the following source values:

| Component | Source amount |
| --- | ---: |
| Room net | ₹4,000 |
| Supplier room GST at 5% | ₹200 |
| Transport | ₹10,000 |
| Activity | ₹2,000 |
| Guide | ₹1,000 |
| Entrances | ₹200 |
| Miscellaneous | ₹500 |
| Lunch and dinner | ₹1,000 |

Commercial settings are 10% markup and 5% company GST for both Land and Hotels/Meals.

| Reconciliation | Result |
| --- | ---: |
| Land source total | ₹13,700.00 |
| Land after markup and company GST | ₹15,823.50 |
| Room including supplier GST + meals | ₹5,200.00 |
| Hotels/Meals after markup and company GST | ₹6,006.00 |
| Final package total | ₹21,829.50 |
| Final per-person Double-sharing rate | ₹10,914.75 |

The scenario comparison and final rate-sheet row produce the same ₹10,914.75 per-person result.

## Calculation controls verified

- Hotel tariff of exactly ₹7,500 uses 5% supplier GST; a tariff above ₹7,500 uses 18%.
- Land and Hotels/Meals markup and company GST remain separate.
- Meals are multiplied once by the applicable pax count.
- CP permits lunch and dinner, MAP excludes a separate dinner charge, and AP excludes separate lunch and dinner charges.
- A previously selected meal is no longer charged if the hotel plan is subsequently changed to MAP/AP.
- Activities, Miscellaneous and Guides are repriced for every pax row using their master pricing/tier rules.
- Vehicle alternatives are not totalled together.
- Requested pax-range rows are intersected with each vehicle's minimum/maximum capacity; invalid rows show no price and cannot reach the final rate sheet.
- Dynamic rooming is exact-pax only and must cover exactly the traveller count.
- Quad selection is blocked where the selected contract has no Quad rate.
- Manual hotel-rate changes require a reason.
- Optional supplements remain outside package markup, GST and package totals.

## Flow and connection controls verified

- A quotation cannot be generated without an authoritative linked Query.
- B2B quotation creation requires an Agent Master record; a new Agent can be registered inline.
- Home/origin city remains separate from tour start and tour end.
- Arrival and departure modes can remain pending; they produce a warning rather than blocking a fresh enquiry.
- Existing Program edits stay inside the quotation and do not mutate the source master.
- A customized existing routing now has an explicit **Save as new Program** control and cannot overwrite an existing Program code.
- Drafts autosave, resume at the last step and appear under the linked Query.
- Final generation removes only the completed draft and creates a locked quotation snapshot.
- Duplicate save of the same generated record is rejected.
- Revision creation requires a reason, creates V2/V3, keeps the same quotation family/number and retains V1 as Superseded.
- Saved commercial, program, routing, pax and value-range information is written back to the linked Query.
- Recent Quotes defaults to the last seven days and links to the relevant Query.

## Corrections made during this audit

- Step 9 now starts with activities and miscellaneous services selected in Land Part but excluded in Costing.
- Guide supplements are consolidated by service/language instead of combining unrelated guide alternatives.
- Entrance supplements are shown as one calculated total rather than a tour-by-tour dump.
- Master activity suggestions remain available separately and only user-selected supplements reach the saved quote.
- Pax ranges no longer have an artificial 30-row truncation.
- Vehicles whose capacity does not intersect the requested pax range are disabled; capacity-preview cells outside a vehicle's range show `—`.
- Generated rate sheets no longer fall back to invalid pax rows when a vehicle has no compatible capacity.
- Bus was added to day-wise Routing, including operator/number, departure/arrival details and overnight indication.
- Road and Self Drive now record editable distance and travel time.
- Arrival/departure mode labels no longer incorrectly show as mandatory.
- The Accommodation empty-state text now points to Routing Step 5.
- The B2B Agent selector and inline registration action are responsive on narrow screens.

## Intentionally parked

- Full Brochure quotation workflow.
- Client-facing designed itinerary/quotation output; Step 10 remains the approved internal commercial review.
- Final Child-with-Bed versus Extra-Bed commercial relationship until real Hotel Contracting rules are reviewed. The current model keeps both fields available without inventing a universal policy.
- Automatic Google Maps distance/time lookup. Road and Self Drive values are editable and stored, but no external maps API is connected.
- Automatic Night-on-Board accommodation exclusion. Train/Bus overnight status is recorded; the specialist itinerary/accommodation treatment should be completed with the itinerary-builder phase as previously agreed.
- Database/Supabase restructuring, migration, RLS/security hardening and full Operations.

## Known non-blocking technical note

The production build reports bundle-size advisory warnings and the repository retains its existing broad formatting/lint backlog. Neither affects the verified quotation calculations or runtime build. The project was not bulk-formatted because doing so would create unrelated merge noise.
