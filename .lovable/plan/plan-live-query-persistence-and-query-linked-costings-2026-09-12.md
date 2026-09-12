## Plan — Live Query Persistence and Query-Linked Costings

### Phase 1: Fix live query saving first
- Replace the browser-only CRM source of truth with the existing shared database tables for queries, tasks, employees, and activity history.
- Keep the current instant on-screen updates, but load authoritative records after sign-in and synchronize changes between sessions and devices.
- Surface failed writes instead of showing a false success message.
- Connect the existing Create New Query form to the database without changing its layout.
- Publish and test on the deployed URL: create one identifiable test query, then confirm it appears in Query Tracker, Follow-up Desk, Pipeline Board, and Query Dashboard.

### Phase 2: Connect existing entry points
- Route Query Tracker’s Create Query and Follow-up Desk’s New Query buttons to the same existing Create New Query form used by the sidebar.
- Remove no duplicate forms and make no visual changes.

### Phase 3: Link a costing to its query
- Add an optional query identity to quotation drafts and saved quotes.
- Make “+ New Version” on the query detail page open New Quotation for that query.
- Safely prefill only known values: customer/partner details, pax breakdown, dates, destination/program hint, FIT/GIT basis, and traveler type.
- Preserve independent New Quotation behavior when no query is supplied.
- Show the linked query number and name in the existing quotation heading throughout all ten steps.

### Phase 4: Save costing versions back to the query
- Store each completed linked quote as a new immutable version; mark the newest one CURRENT while retaining earlier versions.
- Populate the existing Costing versions list from saved data and wire its existing actions where supported.
- Update the query’s commercial values and mark the Costing lifecycle stage complete after a successful quote save.
- Publish again and test the complete deployed workflow from query creation through versioned costing.

### Technical details
- Reuse the existing database schema and authenticated access policies; no database migration is expected for Phase 1.
- Quote/query linkage will be additive optional data inside the existing JSON records, avoiding calculation changes and preserving old records.
- The costing formulas, wizard steps, fields, layout, and visual styling remain unchanged.
