# Shared CRM Routing Registry — staging operator runbook

Target only: `nxmfzwxzspjpguvpxnfb`. Do not run against Production.

## Preconditions (read-only)

```sql
select current_user, session_user;

select to_regclass('public.crm_employees') as crm_employees,
       to_regclass('public.crm_routing_registry') as crm_routing_registry;

select p.proname, p.prosecdef, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_linked_super_admin', 'is_linked_costing_master_reader');
```

Expected before: `crm_employees` exists; registry and both helper functions are absent.

## Execution order

1. Review and apply `20261116080000_crm_routing_registry_authorization_prerequisites.sql`.
2. Review and apply `20261116090000_shared_crm_routing_registry.sql`.
3. Deploy the reviewed `crm-routing-registry` Edge Function only after the SQL checks pass.
4. Regenerate database TypeScript types and run the authenticated two-browser test plan.

No employee, Auth, quotation, brochure, pricing, or historical Programme rows are modified by either SQL file.
Run both SQL files as the `postgres` database owner; they intentionally set new
function/table ownership to `postgres` so the security-definer checks are stable.

## Post-migration verification (read-only)

```sql
select to_regclass('public.crm_routing_registry') as registry_exists;

select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.provolatile, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_linked_super_admin', 'is_linked_costing_master_reader');

select c.relname, pg_get_userbyid(c.relowner) as owner, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'crm_routing_registry';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'crm_routing_registry'
order by grantee, privilege_type;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'crm_routing_registry';
```

Expected after: RLS enabled; `anon` has no registry grant; `authenticated` has SELECT only; the active-reader policy calls `is_linked_costing_master_reader()`; no INSERT/UPDATE/DELETE policy exists. The Edge Function remains the only mutation path and performs active Super Admin validation itself.

## Rollback (only if no staging routing data must be retained)

Do not use this on Production. First confirm the registry has no rows:

```sql
select count(*) as registry_rows from public.crm_routing_registry;
```

If and only if it is zero, an operator may run:

```sql
drop table public.crm_routing_registry;
drop function public.is_linked_costing_master_reader();
drop function public.is_linked_super_admin();
```

These function drops are safe only because the preflight establishes that both
functions were absent before this staging rollout. If another staging migration
begins depending on either helper, stop and review dependencies instead of
running the rollback.
