# Quotation Workspace UI — Implementation Summary

> Historical UI-only checkpoint. The later approved calculation, lifecycle and
> integrity work is documented in `QUOTATION_PHASE2_IMPLEMENTATION.md`, which is
> the authoritative handoff for the current package.

## Scope

This revision improves the presentation and navigation of the existing quotation workflow without removing any existing step, question, option, master-data lookup, calculation, save action, or export action.

## Files changed

1. `src/routes/_authenticated/costing.tsx`
   - Reorganised the 10-step quotation builder into five visual phases while keeping all 10 steps individually accessible.
   - Added a persistent quotation header, linked-query context, autosave indicator, trip context strip, grouped left navigation, central working area, and live summary/readiness panel.
   - Improved the Type selection screen and the Land/Accommodation sub-step navigation.
   - Preserved the original save-draft, save-quote, discard, query-link, program-master, calculation, PDF, Excel, and print behaviour.

2. `src/routes/_authenticated/drafts.tsx`
   - Aligned draft progress labels with the current 10-step workflow.
   - Preserved Resume, Rename, and Delete behaviour.

3. `src/routes/_authenticated/quotes.tsx`
   - Renamed the screen to Recent Quotes.
   - Added a default seven-day view with an All option.
   - Grouped results into Today, Yesterday, and dated sections.
   - Added linked Query IDs that open the corresponding Query dashboard.
   - Preserved View, PDF, Excel, Print, Delete, search, and date-filter actions.

4. `src/components/AppSidebar.tsx`
   - Renamed the quotation history navigation item from Saved Quotes to Recent Quotes.

5. `src/routes/_authenticated/dashboard.tsx`
   - Updated matching dashboard wording from Saved Quotes to Recent Quotes.

6. `QUOTATION_UI_PRESERVATION_MAP.md`
   - Documents the exact mapping of every original step and sub-step into the revised UI.

## Explicitly unchanged

- All quotation calculation formulas and totals.
- Costing data structures and the existing costing engine.
- Product, Contracting, hotel, transport, guide, activity, entrance, meal, and miscellaneous master-data connections.
- Query-to-quotation linking and query costing snapshots.
- Program creation and Routing/Program Master connection.
- Brochure fields and behaviour.
- Existing draft and saved-quote storage formats.

## Verification

- Production build: passed with `npm run build`.
- The build generated the client and server bundles successfully.
- No calculation module was edited as part of this UI revision.
