# Changed Files — Offline Integration Pass

## New files

- `src/lib/crm/insights.ts`
- `src/pages/queries/my-sales-desk.tsx`
- `src/pages/queries/sales-control-tower.tsx`
- `src/pages/relationship-360.tsx`
- `src/pages/team-access.tsx`
- `src/routes/_authenticated/queries/my-sales-desk.tsx`
- `src/routes/_authenticated/queries/sales-control-tower.tsx`
- `src/routes/_authenticated/agents/$id.tsx`
- `src/routes/_authenticated/clients/$id.tsx`
- `src/routes/_authenticated/team-access.tsx`
- `MP_PHASE1_IMPLEMENTATION_SUMMARY.md`
- `CHANGED_FILES_OFFLINE_INTEGRATION.md`

## Modified files

- `src/components/AppSidebar.tsx` — added Sales Desk, Control Tower and Team & Access navigation.
- `src/lib/crm/access.ts` — added role/dashboard landing resolution.
- `src/lib/crm/clients-store.ts` — expanded Client identity and permanent client codes.
- `src/lib/crm/store.ts` — lifecycle timestamps, employee access fields and costing/follow-up timestamp capture.
- `src/lib/crm/types.ts` — richer Query and Employee data model.
- `src/lib/wizard/agents-store.ts` — expanded Agent states/identity and permanent agent codes.
- `src/pages/clients.tsx` — B2C overview KPIs and Client 360 links.
- `src/pages/new-lead.tsx` — relationship selection/auto-fill and safe B2C auto-create/deduplication.
- `src/pages/queries/query-workspace.tsx` — Lifecycle Clock and richer Query 360 timing visibility.
- `src/pages/users-roles.tsx` — employee/access/dashboard fields and history-preserving exit control.
- `src/routes/_authenticated/agents.tsx` — Agent KPIs, statuses, codes and Agent 360 navigation.
- `src/routes/index.tsx` — mapped landing route.
- `src/routes/login.tsx` — mapped post-login landing route.
- `src/routeTree.gen.ts` — generated route registrations for the new pages.

## Explicitly preserved (no direct edits)

- `src/routes/_authenticated/costing.tsx`
- `src/lib/wizard/calc.ts`
- `src/components/wizard/*`
- Existing Product, Contracting and Vendor master modules.
