# Query Tracker data refresh — FY 2026–27

## Delivered result

The active CRM Query store now uses the latest offline workbook as its replacement dataset. The retired `src/lib/queries/*` tracker remains inactive and is not used for the import.

Source workbook: `data-import/Query Tracker Sheet FY 26-27.xlsx`  
Source worksheet: `QTS - EMP`  
Latest populated Query: `EMP26-27EMP0356` (16 September 2026)

## Reconciliation

| Check | Result |
| --- | ---: |
| Pre-numbered workbook rows | 1,000 |
| Populated Queries imported | 356 |
| Empty template rows excluded | 644 |
| Duplicate Query IDs | 0 |
| Nurturing | 107 |
| Won | 47 |
| Lost | 202 |
| Imported open follow-up tasks | 107 |
| Imported per-Query audit events | 356 |
| B2B Query rows linked to Agent Master | 262 |
| Deduplicated B2B Agent records | 122 |
| B2C Query rows linked to Client List | 94 |
| Deduplicated B2C Client records | 93 |
| Total reconstructed Query value | ₹41,416,021.90 |

The workbook contains three populated rows whose cached `Total Query Amount` is blank even though both Pax and per-person price exist. The import applies the workbook formula (`Pax × Per Person Package Cost`) to preserve the intended value:

| Query | Reconstructed value |
| --- | ---: |
| EMP26-27EMP0180 | ₹31,900 |
| EMP26-27EMP0280 | ₹37,500 |
| EMP26-27EMP0296 | ₹74,800 |

Sixteen other Queries remain at ₹0 total value because the workbook is missing either Pax or per-person price. No commercial value was invented for those rows.

Advisor ownership was imported exactly as supplied: Bhumika Prajapati (156), Chhaya Prajapati (127), Deeksha Saini (56), Ashish Prajapati (12), and Shivam Kushwah (5).

## Relationship master refresh

- All 262 B2B Queries now carry an `agent_id` connected to the generated B2B Agent Master.
- All 94 B2C Queries now carry a `client_id` connected to the generated B2C Client List.
- Repeated B2B agency names are consolidated into one master relationship; additional contact names
  found against that agency are retained in the master notes.
- Repeated B2C contacts are reconciled by valid phone, valid email, or contact name plus city.
  Placeholder values such as `NA` are not treated as shared email identities.
- Twenty-one B2B records whose agency name is blank in Excel are retained instead of discarded and
  visibly flagged as `agency name pending` for cleanup.
- Manually created Agent/Client records already present in the application are preserved and merged
  with the imported relationships on the first load of this release.

## Field mapping

| Excel field | Active CRM field |
| --- | --- |
| Query No. | `query_id` (preserved exactly) |
| Query Date | `created_at` |
| Query Market Source | `customer_type`, `query_market_source` |
| Query Market / Region | `market` |
| Query Type | `enquiry_type`, derived FIT/GIT `costing_basis` |
| Query For | `requirement` |
| Query Base City | `query_base_city` |
| Query Source Type / Name | `lead_source`, `customer`, `query_source_type` |
| Contact Person / Number / Email | `contact_person`, `mobile`, `email` |
| Tour dates / cities / travel period | Travel and source-tracker fields |
| Pax / Per Person / Total | Pax, per-person, Query value and commercials |
| Hotel Category | Bottom/top hotel category |
| Program code / name / type / region / routing | Program fields |
| Travel Advisor | Query owner and relationship owner |
| Conversation Medium | `conversation_medium` and activity metadata |
| 1st–6th follow-up | Query activity history, last due date and open task |
| Final Lead Status | `Nurturing`, `Won`, or `Lost` stage |
| Remarks / Reason | Lost reason where supplied |

Won Queries create the existing minimal `Awaiting Operations Acceptance` handoff. Lost Queries with no spreadsheet reason are labelled `Not captured in source workbook`, rather than receiving an invented business reason.

## Replacement behaviour

On the first **administrator** login after this build is deployed:

1. the app checks for the dataset marker `query-tracker-fy26-27-2026-09-17-v2`;
2. old cloud Query events and tasks linked to Queries are removed;
3. old cloud Queries are removed;
4. the 356 imported Queries, 107 open follow-up tasks and 356 audit events are uploaded;
5. a persistent cloud marker prevents the replacement from running again.

Employee records, master data, Costing/Quotation data, and standalone/common tasks and events are preserved. The inactive legacy browser key `mp_tourism_queries` is cleared.

The first login must use an administrator account because current Supabase RLS permits Query/task/event deletion only to administrators. No schema migration or Supabase restructuring was added.

## Regenerating after a future workbook update

Replace `data-import/Query Tracker Sheet FY 26-27.xlsx`, change `DATASET_ID` in `scripts/generate-query-tracker-data.mjs`, then run:

```bash
npm run data:import:queries
npx tsc --noEmit
npm run build
```

Changing the dataset ID is required for a future authoritative replacement; it creates a new one-time cloud marker.

## Exact files changed or added

| File | Purpose |
| --- | --- |
| `data-import/Query Tracker Sheet FY 26-27.xlsx` | Supplied source workbook retained for audit/regeneration |
| `scripts/generate-query-tracker-data.mjs` | Deterministic Excel-to-CRM transformer and validations |
| `src/lib/crm/query-tracker-import.generated.ts` | Generated 356-Query replacement dataset |
| `src/lib/crm/relationship-master-import.generated.ts` | Generated 122-agent and 93-client master dataset |
| `src/lib/crm/store.ts` | One-time local replacement plus linked Costing/Quotation write-back |
| `src/lib/crm/crm-remote.ts` | One-time cloud replacement and persistent dataset marker |
| `src/lib/crm/types.ts` | Optional source fields needed to retain all workbook information |
| `src/pages/queries/query-workspace.tsx` | Displays imported source, city, program, travel and commercial fields, including honest pending-pax states |
| `package.json` | Adds `data:import:queries` command |
| `src/pages/team-access.tsx` | Corrects a pre-existing TypeScript tuple inference error found during verification |
| `src/pages/new-lead.tsx` | Makes the Costing Range optional at Query creation and preserves unknown pax as pending |
| `src/lib/wizard/agents-store.ts` | Loads/merges imported B2B Agents and exposes them to Create Query |
| `src/lib/crm/clients-store.ts` | Loads/merges B2C Clients and automatically upserts new clients from Queries |
| `src/lib/crm/relationship-links.ts` | Shared safe matching between Queries and Agent/Client relationships |
| `src/pages/clients.tsx` | Uses shared relationship matching for client metrics and Query counts |
| `src/pages/relationship-360.tsx` | Uses IDs plus safe fallbacks for complete Query journey/history links |
| `src/routes/_authenticated/costing.tsx` | Prefills linked Query context and connects both Save Quote actions to Query write-back |
| `src/lib/wizard/build-saved-quote.ts` | Captures a Query-facing commercial/program/pax/hotel snapshot from the quotation |
| `src/lib/quotes-store.ts` | Adds the typed Query snapshot to saved quotation records |
| `src/components/crm/ui.tsx` | Adds the shared pending-aware pax range label |
| `src/pages/queries/assignment-desk.tsx` | Shows `Pax pending` until Costing supplies the range |
| `src/pages/queries/query-tracker.tsx` | Shows `Pax pending` until Costing supplies the range |
| `src/pages/queries/pipeline-board.tsx` | Shows `Pax pending` until Costing supplies the range |
| `src/components/quotation/CostingSheet.tsx` | Gateway Board 1.2 calculation/display corrections for entrance, miscellaneous and activity values |
| `src/lib/wizard/costsheet.ts` | Gateway Board 1.2 rate-sheet correction keeping vehicle lines independent |
| `QUERY_TRACKER_DATA_REFRESH.md` | This reconciliation and handoff report |
| `GATEWAY_BOARD_1_2_MERGE.md` | Exact reconciliation of the developer's parallel 1.2 changes |

Master-data modules and the Costing calculation formulas were not redesigned. The quotation builder
was extended only to expose its calculated Query snapshot and to write it back to the linked Query.

## Create Query → Costing/Quotation connection

- Minimum/maximum pax, hotel category from/to, bottom-line value and top-line value are optional on
  Create Query and no longer display a required asterisk.
- A Query created without them is stored with unknown pax/range instead of invented `1 pax` values.
- Opening Costing from a Query carries the Query/customer, B2B/B2C type, travel dates, programme,
  known pax range, departure city and traveler type into the quotation draft.
- Saving through either the header **Save Quote** or the final-step **Save Quote** writes the saved
  version back to the same Query.
- The write-back updates the programme, routing, travel dates, pax range, hotel category range,
  bottom/top-line opportunity, internal cost/selling figures, lifecycle, activity and version history.
- Existing Costing formulas, rate lookups, quotation documents and master-data modules remain intact.

## Create Query → Relationship connection

- B2B and B2B2B Queries must select an active record from the B2B Agent Master. Free-text
  creation of an unlinked B2B Agent is blocked.
- **Add it in Agent Master** opens the existing master route in a new tab. Cross-tab store refresh
  makes the newly created Agent selectable without rebuilding the Query module.
- Selecting a B2B Agent fills its agency, contact, phone, email and available city into the Query.
- B2C creation remains direct: the user can select an existing client or enter contact name, number,
  email and city while creating the Query.
- Creating a new B2C Query automatically creates the B2C Client master record; an existing matching
  client is reused and receives the new Query in Client 360.
- Agent 360 and Client 360 link to the same authoritative Query records and show the complete Query
  journey, pipeline totals, won business and open opportunity without duplicating Query data.

## Verification completed

- Import generation: passed (356 unique populated rows)
- Relationship generation: passed (262/262 B2B and 94/94 B2C Queries linked)
- TypeScript (`npx tsc --noEmit`): passed
- Production build (`npm run build`): passed
- Linked Query → Costing prefill and both Costing → Query save paths: connected
- Costing calculation engine: preserved; build passed after the connection update

The repository's ESLint command still reports the baseline project's existing Prettier/formatting backlog.
No bulk reformat was applied because that would create a large unrelated diff for the developer.
