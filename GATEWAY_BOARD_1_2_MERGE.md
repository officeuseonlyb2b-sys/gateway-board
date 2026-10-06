# Gateway Board 1.2 merge note

## Reconciliation result

`Gateway Board 1.2.zip` was compared against the developer source baseline used for the earlier
Query-data work. The developer's parallel update changed exactly these two source files:

1. `src/components/quotation/CostingSheet.tsx`
2. `src/lib/wizard/costsheet.ts`

Both files were merged into the latest Query-data/Create Query build. No developer change was
discarded, and no unrelated 1.2 file replaced the newer Query Tracker data or CRM connection work.

## Developer changes retained

### `src/components/quotation/CostingSheet.tsx`

- Entrance and miscellaneous amounts retain their selected gross totals with markup and GST instead
  of being reduced to a per-person value in the affected Costing Sheet and Rate Sheet columns.
- Activity & Experiences keeps its dedicated per-person calculation.
- Entrance display uses the raw selected line amount.
- Costing cell wrappers match their parent table structure.

### `src/lib/wizard/costsheet.ts`

- Each selected transport line now retains its own transport amount in Rate Sheet / Final Costing.
- Multiple vehicle options are no longer combined into one transport total for every vehicle row.
- Entrance and miscellaneous values use the 1.2 gross-total calculation.

## Newer work preserved

- The 356-Query FY 2026–27 replacement dataset and one-time cloud replacement flow.
- Optional Costing Range fields during Create Query.
- Pending-pax display until Costing supplies the range.
- Query-to-Costing prefill.
- Both quotation Save Quote actions writing back to the authoritative linked Query.
- Existing master data and quotation/rate lookup structures.
