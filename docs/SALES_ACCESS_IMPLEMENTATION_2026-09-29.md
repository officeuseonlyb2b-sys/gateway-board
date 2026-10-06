# MP Sales Access & Dashboard Merge

Baseline: developer-supplied `Gateway Board (1).zip`  
Scope: Sales Manager, Senior Sales Executive and Sales Executive access only.

## What was implemented

- Individual Supabase login remains the authentication source.
- Public self-registration was removed. Password reset now uses Supabase Auth.
- Owner / Administrator can send an employee invitation through the `invite-employee` Edge Function.
- Active employee email is the authoritative mapping from login to designation, role, Unit and data scope.
- Supabase Auth UUID / invitation employee ID is now the primary account mapping; exact employee email is the compatibility fallback.
- Legacy Auth metadata no longer grants Administrator access. This fixes the old public-signup behaviour that marked every account as `admin`.
- Suspended, disabled, exited or unmapped accounts are stopped before the application workspace opens.
- Sales Manager inherits normal Sales working capabilities and receives Unit team views.
- Senior Sales Executive sees owned Queries plus only the Queries explicitly shared for review or assistance.
- Sales Executive sees owned / self-created Queries only.
- Manager `My Sales Desk` and `My Day` remain personal; team monitoring stays in Control Tower, Query Health, Analytics, Performance and Executive Workload.
- Sales role sidebars now use the approved labels, groups and order.
- Sales employees can read Programmes / Routings and Destination / Tour Library, while master-data editing controls remain hidden.
- Query collaboration fields are persisted inside the existing `crm_queries.data` JSON record, so no database migration or table restructuring is required.
- First-run CRM synchronisation now writes the approved employee roster into `crm_employees`; the earlier empty employee payload that left account data local-only has been removed.
- Sales metrics and task/calendar views use the effective role scope.
- Support contribution is visible in Sales Performance.

## Database and authentication connection

The following existing Supabase tables remain authoritative and unchanged:

- `crm_queries`
- `crm_tasks`
- `crm_employees`
- `crm_events`

The new Query fields are optional JSON properties:

- `reviewer_employee_ids`
- `assistance_employee_ids`
- `shared_with_employee_ids`

Deploy the invitation function once in the target Supabase project:

```bash
supabase functions deploy invite-employee
```

Before the first employee mapping, configure the one authorised bootstrap administrator email in both environments:

```bash
# Frontend deployment environment
VITE_BOOTSTRAP_ADMIN_EMAIL=actual-admin@company.com

# Supabase Edge Function secret
supabase secrets set BOOTSTRAP_ADMIN_EMAIL=actual-admin@company.com
```

After signing in with that account, open **Team & Access → Manage Employees & Roles**, replace each placeholder with the employee's actual login email and select **Link / Invite**. Existing Supabase accounts are linked in place; new accounts receive an invitation. The function writes the Auth UUID back to the existing `crm_employees.data` record, so each login thereafter resolves to that employee's real role, department, Unit, dashboard and Query scope.

The function verifies that the caller's employee record has the `Administrator` or `Owner / Director` role before using Supabase Admin Auth to issue the invitation.

## Verification performed

- `npm ci` clean-install compatibility
- `npx tsc --noEmit`
- `npm run build`
- `npm run audit:quotation`
- `npm run audit:access`
- Targeted ESLint check for every changed application source file (zero errors and zero warnings)
- Direct source comparison against the supplied baseline confirms `src/lib/wizard`,
  `src/lib/quotes-store.ts`, `src/lib/drafts-store.ts` and
  `src/routes/_authenticated/costing.tsx` are unchanged

The quotation audit covers commercial totals, passenger ranges, meals and generated-quotation immutability.
The access audit confirms every imported Query owner resolves to the approved employee roster, the three account-linking keys are present and no application page derives permissions from the legacy Auth role.

## Deployment note

- Keep the existing Supabase project and tables.
- Apply the supplied source project normally.
- Deploy `invite-employee` once before using the invitation button.
- No SQL migration is required for this merge.
- Database-level RLS/security hardening remains intentionally parked for the later infrastructure phase; this delivery enforces the approved access model in the application and invitation function without restructuring the database.

## Intentionally untouched

- Quotation calculations and costing algorithms
- Quotation wizard steps and commercial formulas
- Hotel, contracting, transport, guide, entrance, activity and miscellaneous rate engines
- Existing CRM / master-data Supabase tables
- Existing B2B/B2C relationships and Query/quotation links

## Exact changed files

### Core access, authentication and navigation

- `src/components/AppSidebar.tsx`
- `src/components/TopBar.tsx`
- `src/lib/auth-mock.ts`
- `src/lib/crm/access.ts`
- `src/lib/crm/crm-remote.ts`
- `src/lib/crm/store.ts`
- `src/lib/crm/types.ts`
- `src/routes/login.tsx`
- `src/routes/index.tsx`
- `src/routes/_authenticated/route.tsx`
- `src/routes/_authenticated/settings.tsx`
- `src/routeTree.gen.ts` (generated by TanStack Router)

### Existing pages adjusted for role scope

- `src/pages/my-tasks.tsx`
- `src/pages/all-tasks.tsx`
- `src/pages/programs.tsx`
- `src/pages/team-access.tsx`
- `src/pages/users-roles.tsx`
- `src/pages/queries/follow-up-desk.tsx`
- `src/pages/queries/performance.tsx`
- `src/pages/queries/query-analytics.tsx`
- `src/pages/queries/query-dashboard.tsx`
- `src/pages/queries/query-workspace.tsx`
- `src/routes/_authenticated/destinations.tsx`
- `src/routes/_authenticated/tasks/calendar.tsx`
- `src/routes/_authenticated/hotels/index.tsx`
- `src/routes/_authenticated/hotels/$id.tsx`

### New pages and routes

- `src/pages/help-training.tsx`
- `src/pages/profile.tsx`
- `src/pages/sales-team.tsx`
- `src/pages/queries/executive-workload.tsx`
- `src/pages/queries/sales-review.tsx`
- `src/routes/_authenticated/help.tsx`
- `src/routes/_authenticated/profile.tsx`
- `src/routes/_authenticated/sales-team.tsx`
- `src/routes/_authenticated/queries/assisted.tsx`
- `src/routes/_authenticated/queries/executive-workload.tsx`
- `src/routes/_authenticated/queries/quotation-review.tsx`
- `src/routes/_authenticated/queries/review.tsx`

### Supabase and build reproducibility

- `supabase/functions/invite-employee/index.ts`
- `.env.example`
- `package-lock.json` (synchronised with the existing `package.json`; source versions were mismatched)
- `package.json`
- `scripts/audit-account-linkage.mjs`

## Role acceptance matrix

| Capability                         | Sales Executive | Senior Sales Executive | Sales Manager |
| ---------------------------------- | --------------: | ---------------------: | ------------: |
| Create and work own Query          |             Yes |                    Yes |           Yes |
| Prepare Costing / Quotation        |             Yes |                    Yes |           Yes |
| Own My Day / My Sales Desk         |             Yes |                    Yes |           Yes |
| Explicit Query review / assistance |              No |                    Yes |           Yes |
| Full MP Sales Unit visibility      |              No |                     No |           Yes |
| Assignment Desk                    |              No |                     No |           Yes |
| Control Tower / Executive Workload |              No |                     No |           Yes |
| Administer login access            |              No |                     No |            No |

Owner / Administrator retain employee and login-access administration.
