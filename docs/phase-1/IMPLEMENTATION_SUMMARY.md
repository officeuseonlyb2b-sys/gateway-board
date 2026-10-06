# MP Tourism Hub — Phase 1 implementation summary

## Run locally

```bash
npm ci
npm run dev
```

Production verification:

```bash
npx tsc --noEmit
npm run build
```

The generated Cloudflare/Nitro build can be previewed with `npm run preview` on a local machine with the Wrangler runtime available. For routine development use `npm run dev` (port 8080 in the baseline configuration).

Use the existing environment configuration for the connected Supabase project. Phase 1 does not add or require a database migration.

## Batch delivery

| Batch                    | Delivered                                                                                                                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Baseline audit       | Recorded authoritative modules, duplicate paths, guardrails and baseline build state.                                                                                                                                                                                         |
| 1 — Query foundation     | Canonical `Won` stage, explicit work/assignment state, created/assigned/first-action audit fields, MP primary Unit, separate manager Assignment Desk and reassignment history.                                                                                                |
| 2 — Query 360 + Costing  | Live Query 360 tabs, real activity/lifecycle history, program snapshot before activity, bottom/top-line commercials, linked Costing prefill, immutable version list, edit/download actions.                                                                                   |
| 3 — Sales views          | Result-oriented dashboard, real Query Tracker, Pipeline Board and Follow-up Desk using one reusable filter engine. Filters include FY, multiple received months, quick durations, date range, stage, advisor, travel month, customer, costing basis, priority and due window. |
| 4 — Relationships        | Existing B2B Agent master retained as organisation-wide; B2C Client master added; relationship owner is separate from Query owner.                                                                                                                                            |
| 5 — Team/access          | Employees now carry role, department, Unit and data scope; navigation gates manager and Operations functions by role.                                                                                                                                                         |
| 6 — Performance          | All-advisor daily/weekly/monthly SOD workload, weekly Sales performance, event-based stage speed, conversion and accountability views.                                                                                                                                        |
| 7 — MP backend readiness | Existing Product/Contracting/Vendor masters retained; MP readiness dashboard and common rate-gap task creation added.                                                                                                                                                         |
| 8 — Operations handoff   | Won celebration, automatic `Awaiting Operations Acceptance` record and minimal acceptance queue.                                                                                                                                                                              |

## Business rules implemented

- Quotation Sent creates an assigned follow-up task due in three days.
- Overdue follow-ups are sorted first and a manager escalation event is created after 48 hours.
- Lost requires a reason and closes outstanding Query tasks.
- Won closes outstanding Query tasks, displays a celebration and creates a minimal Operations handoff.
- Query creation is complete before assignment; manager assignment creates its own event and first review task.

## Retired or redirected paths

| Legacy path          | Canonical destination    |
| -------------------- | ------------------------ |
| `/query-tracker`     | `/queries/query-tracker` |
| `/query/:queryId`    | `/queries/:id`           |
| `/manager-dashboard` | `/queries/dashboard`     |

The legacy `src/lib/queries/*` and `src/components/queries/*` files are retained only to keep the baseline history recoverable; no active route writes through them.

## Intentionally parked

- Full Operations execution after handoff acceptance.
- Accounts, Marketing and Loyalty workflows.
- Supabase schema redesign, migration, RLS hardening and database normalisation.
- Cloud persistence for the new B2C client register and future multi-Unit master expansion.
- Advanced document/PDF authoring beyond the preserved quotation output.

## Remaining limitations

- Access visibility is implemented in the client navigation and team metadata; authoritative server-side enforcement remains a later RLS/security phase.
- Browser-local records that are not already covered by the baseline Supabase synchronisation require the planned persistence phase for cross-device durability.
- Existing workbooks/data imports are not silently re-run; existing CRM records are normalised in place when loaded, including migration from legacy `Confirmed` to `Won`.

## Regression confirmation

- TypeScript: passes with `npx tsc --noEmit`.
- Production build: passes with `npm run build`.
- Development route smoke test: dashboard, tracker, pipeline, follow-up, assignment, performance, Operations handoff and Costing routes all return successfully.
- Costing route, wizard calculations, rate lookup, master-data adapters, quote build and saved-quote flow were not redesigned.
- Query-to-Costing prefill and save hooks remain in the existing `/costing` route; saved Costings update Query commercials and append a version.
