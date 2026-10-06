# MP Tourism Hub — Phase 1 Three-Change Handoff

## Included changes

### 1. B2B company and individual contact intelligence

- One B2B Agent company can contain multiple independent contacts.
- Agent rows and contacts open their respective 360-degree dashboards.
- Company and contact dashboards show Query history, open opportunity, Won business and Lost quoted value.
- Contact-level performance allows the team to identify which person inside an agency generates business.
- B2C clients remain automatically linked from B2C Queries.

### 2. Sales team, access and assignment structure

- Approved employee roster and designations are applied across Query creation and assignment.
- Any authorised Sales team member can create a Query or prepare a quotation.
- Query creation remains separate from managerial assignment.
- Managerial assignment pools, role/access profiles and actor tracking use the same employee master.
- Creator, assignee and activity ownership remain independently traceable.

### 3. Routing, Program Master and program intelligence

- 277 programs imported from `Tour Programs Data Sheet.xlsx`.
- Two additional programs found only in historical Query data are retained as Query History programs.
- Existing Query program links resolve by Program Code or Program Name.
- Quotation Builder can search programs by name, code, duration, city and routing.
- Selecting an existing program pre-fills an editable routing.
- Saving a quotation with a fresh routing automatically adds it to Program Master.
- Manual program codes are supported; blank codes use the `MPCUSYY###` sequence.
- Duplicate Program Codes cannot overwrite a differently named program.
- Program Intelligence provides Program 360, Query history, Won business, open opportunity, Lost value, conversions, travel-month performance, destination performance and lost-reason insights.

## Data included

- 356 Queries
- 122 B2B Agent companies
- 154 Agent contacts
- 93 B2C Clients
- 279 available Program records: 277 workbook programs and 2 Query-history programs

## Developer setup

1. Run `npm install`.
2. Copy `.env.example` to `.env` and enter the environment values used by the developer's deployment.
3. Run `npm run dev` for local development.
4. Run `npm run build` for the production build.

To regenerate Program data from the included workbook:

```bash
npm run data:import:programs
```

## Verification completed

- Production build passes.
- New Program files pass targeted lint validation.
- All 273 historical Queries containing Program Codes resolve to Program Master records.
- The existing Costing and Quotation calculations remain operational.

## Final Phase 1 refinements

- Preserved the developer's repaired Program 360 to Query Workspace navigation.
- Added `Create Routing / Itinerary` within Routing & Programs.
- New routings capture Program Code, name, duration, departure city, categories, route summary and complete day-wise itinerary details.
- Manually created programs immediately become selectable in the Quotation Builder.
- Added two-direction sorting to every Query Tracker table header.
- Query Tracker defaults to newest-received Queries first.
- Simplified the filter surface into search, quick duration and four primary filters.
- Moved partner/client, costing basis, priority, due window, multiple received months and custom received dates into a collapsible advanced-filter panel.
- Replaced the large native multiple-month selector with a compact multi-select menu.
- Quick-duration labels, custom date ranges and Reset now remain visually and functionally synchronised.

## Packaging note

`node_modules`, generated build output and private `.env` values are intentionally excluded from the handoff ZIP.
