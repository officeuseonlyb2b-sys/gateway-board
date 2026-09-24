# MP Tourism Hub — Phase 1 baseline audit

Date: 15 September 2026

## Reuse decisions

| Capability              | Authoritative implementation                                                     | Phase-1 action                                                                  |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Query data and activity | `src/lib/crm/*`                                                                  | Extend in place; all Sales screens read/write this store.                       |
| Query views             | `/queries/*` and `src/pages/queries/*`                                           | Keep and connect to the canonical store.                                        |
| Costing and quotation   | `/costing`, wizard calculation modules, saved quotes                             | Preserve calculation engine; only strengthen Query linking and version history. |
| Tasks and follow-ups    | CRM tasks/events plus existing task pages                                        | Use CRM task records as the common Sales task engine.                           |
| Agent master            | `src/lib/wizard/agents-store.ts`                                                 | Keep as the organisation-wide Agent master and link Queries by `agent_id`.      |
| Program/routing master  | `src/lib/wizard/agents-store.ts` program records                                 | Keep as the MP program source used by Costing.                                  |
| Users and roles         | Auth user plus CRM employee roster                                               | Extend with department, unit and data scope without restructuring Supabase.     |
| Product/vendor masters  | Existing Hotels, Transport, Guides, Entrance, Meals, Activities and Misc modules | Preserve; add readiness visibility only.                                        |

## Duplicate/legacy paths

- `src/lib/queries/*` is legacy and must not receive new Phase-1 writes.
- `/query-tracker` redirects to `/queries/query-tracker`.
- `/query/$queryId` redirects to `/queries/$id` after resolving the canonical Query.
- `/manager-dashboard` remains available but Sales navigation now points to the canonical Query dashboard/performance views.

## Baseline verification

- Dependency installation: passed with `npm ci`.
- Production build: passed before modifications.
- Project-wide lint: pre-existing formatting debt (6,900+ errors), therefore not used as the Phase-1 acceptance gate.
- Acceptance gates for every batch: production build, TypeScript compilation through the app build, and targeted functional inspection.

## Guardrails

- No database migration, RLS change, Supabase normalisation or cloud-persistence conversion in Phase 1.
- Costing formulas, rate lookup, quote generation and master-data modules are not redesigned.
- No sample Query data is introduced into the canonical CRM store.
