# Relationship master update — developer handoff

## Result

The FY 2026–27 Query Tracker now populates the Relationship modules as well as the Query store:

| Relationship | Source Query rows | Master records |
| ------------ | ----------------: | -------------: |
| B2B Agents   |               262 |            122 |
| B2C Clients  |                94 |             93 |

Every imported B2B Query has a valid Agent link, and every imported B2C Query has a valid Client
link. Repeated relationships are deduplicated without deleting existing manually created records.

## Exact files changed from the previous merged 1.2 ZIP

1. `scripts/generate-query-tracker-data.mjs`
2. `src/lib/crm/query-tracker-import.generated.ts`
3. `src/lib/crm/relationship-master-import.generated.ts` — new
4. `src/lib/wizard/agents-store.ts`
5. `src/lib/crm/clients-store.ts`
6. `src/lib/crm/relationship-links.ts` — new
7. `src/pages/new-lead.tsx`
8. `src/pages/clients.tsx`
9. `src/pages/relationship-360.tsx`
10. `QUERY_TRACKER_DATA_REFRESH.md`
11. `RELATIONSHIP_MASTER_UPDATE.md` — this handoff note

No Costing/Quotation calculation file, master-data route, Supabase schema, RLS policy, or unrelated
module was changed in this update.

## Functional behavior

- B2B/B2B2B Create Query requires an Agent selected from the existing Agent Master.
- A missing Agent is created through the existing `/agents` master route and then appears in the
  Create Query selector.
- Selecting an Agent fills the stored agency/contact details and saves its `agent_id` on the Query.
- B2C Create Query permits direct entry of client name, phone, email and city.
- On Query creation, a new B2C client is added automatically or an existing client is safely reused.
- Agent 360 and Client 360 resolve Query history by authoritative relationship ID, with normalized
  agency/email/phone/name fallbacks for older records.
- `NA`, blank and other placeholder contact values are not used to merge unrelated relationships.

## Actionable relationship dashboards

The relationship masters are no longer passive directories:

- every B2B Agent table row, Agent ID and visible **Open** action lead to `/agents/$id`;
- every B2C Client table row, Client ID and visible **Open** action lead to `/clients/$id`;
- rows support mouse, keyboard Enter and keyboard Space activation;
- both master tables show linked Query count, open Queries, wins, converted business, conversion and
  the current relationship status/lifecycle;
- Agent 360 and Client 360 show the complete contact profile, relationship owner, relationship age,
  last Query, business, open opportunity, Query journey, funnel, relationship health, latest activity
  and pending/overdue next steps;
- each Query, activity and next-step record inside the relationship dashboard opens the same
  authoritative Query workspace.

Files changed for this follow-up correction:

1. `src/routes/_authenticated/agents.tsx`
2. `src/routes/_authenticated/clients.tsx`
3. `src/pages/clients.tsx`
4. `src/pages/relationship-360.tsx`
5. `RELATIONSHIP_MASTER_UPDATE.md`

### Detail-route rendering correction

The Agent and Client list route files are parents of their `$id` routes in the generated TanStack
Router tree. They now render the nested `<Outlet />` whenever an individual relationship ID is
present. This prevents the URL from changing while the master list remains on screen and allows the
Agent 360 or Client 360 dashboard to render correctly at `/agents/$id` and `/clients/$id`.

## Deployment note

The Query dataset revision is now `query-tracker-fy26-27-2026-09-17-v2`. On the first administrator
login after deployment, the existing one-time import flow refreshes the same 356 Queries with their
new Agent/Client relationship IDs. The Relationship master records are merged into their existing
browser stores once, preserving manual records.

## Verification

- Import generation: passed
- Relationship-link validation: 262/262 B2B and 94/94 B2C passed
- Targeted ESLint on changed source files: passed
- TypeScript: passed
- Production build: passed
- Existing Costing engine: unchanged and included in the successful build
