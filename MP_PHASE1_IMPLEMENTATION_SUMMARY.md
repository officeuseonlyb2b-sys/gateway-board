# MP Tourism Hub — Phase 1 Sales Integration

This build uses the existing Gateway Board project as its baseline and integrates the strongest approved features from the offline Query Tracker and the Phase 1 handoff. The existing Costing/Quotation engine and Product/Contracting/Vendor masters remain in place.

## Batch-wise implementation

### Batch 1 — Query truth and lifecycle foundation

- Preserved one authoritative Query record and the separate Create Query / Manager Assignment flow.
- Added lifecycle timestamps for stage entry, requirement completion, costing start/completion, quotation dates, follow-ups, nurturing and closure.
- Added reusable lifecycle calculations for assignment wait, first response, quotation TAT, stage age, Query age and sales cycle.
- Retained audited reassignment history, required Lost reason, automatic task closure and Won-to-Operations handoff.
- Retained quotation-sent +3 day follow-up automation and 48-hour manager escalation.

### Batch 2 — Employee execution workspace

- Added **My Sales Desk** at `/queries/my-sales-desk`.
- Added actionable cards for active Queries, first actions, pending quotations, today/overdue follow-ups, tasks, completions and urgent leads.
- Added Attention Centre, My Pipeline, My Day, Nurturing/Revisit and personal conversion/commercial score.

### Batch 3 — Manager control workspace

- Added **Sales Control Tower** at `/queries/sales-control-tower`.
- Added assignment queue with elapsed waiting time and manager-controlled assignment.
- Added intervention queue based on SLA, overdue and missing-next-action rules.
- Added composite advisor capacity, SOD workload, ageing, source health and manager quick actions.
- Dashboard landing is now mapped by employee dashboard template/role.

### Batch 4 — Query 360

- Preserved the seven approved Query sections: Overview, Program Info, Commercials, Itinerary & Costings, Lifecycle Progress, Latest Activity and Follow-ups / Next Steps.
- Added Lifecycle Clock to Overview and Lifecycle Progress.
- Preserved bottom-line/top-line commercial range, program snapshot before activity, assignment history, tasks, costing versions, communication logging and follow-up scheduling.
- Preserved the Won celebration and minimal Operations handoff.

### Batch 5 — Relationship 360

- Added permanent generated `AGT-000001` / `CLI-000001` style codes for new records.
- Added B2B Agent 360 at `/agents/$id` and B2C Client 360 at `/clients/$id`.
- Added relationship KPIs, funnel, conversion, business generated, opportunity, last Query, repeat relationship and linked Query history.
- B2C Query creation now matches mobile/email first and auto-creates a new organisation-wide Client only when no match exists.
- Existing Agent/Client selection auto-fills contact details during Query creation.

### Batch 6 — Team & Access

- Added Team & Access hub at `/team-access`.
- Added permanent employee code, employee status, separate account status and dashboard mapping fields.
- Added hierarchy view, effective permission overview, live workload and access/assignment audit.
- Employee exit now preserves history and blocks exit while active Queries still require reassignment.

### Batch 7 — Filters, common work engines and validation

- Shared Query filters cover financial year, multiple received months, exact date range, quick duration, travel month, stage, advisor, customer, costing basis, priority and due window.
- Filters continue to drive Query Dashboard, Tracker, Pipeline and Follow-up Desk counts/lists.
- Preserved the common Task engine, Follow-up Desk advisor SOD view and priority sorting.
- Production build, TypeScript, targeted lint and route smoke checks pass.

## Retired or redirected legacy behaviour

- Login and root landing no longer default every user to the Product/master dashboard. Landing now follows the employee dashboard mapping.
- Sidebar **Users & Roles** entry is replaced by **Team & Access**; detailed employee editing remains available through the Manage Employees & Roles action.
- Relationship “View” dialogs are superseded by full Agent/Client 360 routes. Existing edit dialogs remain.
- Employee deletion is superseded by a history-preserving exit/disable flow.

## Intentionally parked for later

- Full Operations workflow after the Won handoff.
- Database normalisation, migration redesign, RLS/security hardening and broader Supabase restructuring.
- HRMS functions such as payroll, leave management, attendance and appraisal administration.
- Predictive/AI assignment, messaging-provider delivery and production push/email notification integrations.
- Multi-Unit operational rollout beyond the future-ready Unit fields and current Madhya Pradesh experience.

## Functional limitations

- The active development data layer still uses the project's existing local-first/shared-sync approach; production database hardening is not part of this phase.
- Historical imported rows can only show lifecycle timings for timestamps available in the source data. New actions capture the richer timestamps automatically.
- Manager escalation is recorded in the application audit/notification flow; external email or WhatsApp escalation requires later provider integration.

## Verification

- `npx tsc --noEmit` — passed.
- Targeted ESLint on all changed source files — passed.
- `npm run build` — passed for client, SSR and Nitro output.
- HTTP smoke check — 200 for login, My Sales Desk, Sales Control Tower, Team & Access, Agent/Client 360, Query Dashboard, Pipeline, Follow-up Desk and Costing routes.
- No direct changes were made to `src/routes/_authenticated/costing.tsx`, `src/lib/wizard/calc.ts` or the Costing wizard components.

