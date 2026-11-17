-- STAGING REVIEW ONLY. Apply before 20261116090000_shared_crm_routing_registry.sql.
-- This is additive: it creates/repairs authorization helpers only. It does not
-- update employee JSON, Auth accounts, quotations, Brochures, pricing, or data.

do $$
begin
  if to_regclass('public.crm_employees') is null then
    raise exception 'Missing required table public.crm_employees';
  end if;
  if not exists (
    select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace join pg_type t on t.oid = a.atttypid
    where n.nspname = 'public' and c.relname = 'crm_employees' and a.attname = 'id'
      and not a.attisdropped and t.typname = 'text'
  ) then raise exception 'public.crm_employees.id must be text'; end if;
  if not exists (
    select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace join pg_type t on t.oid = a.atttypid
    where n.nspname = 'public' and c.relname = 'crm_employees' and a.attname = 'data'
      and not a.attisdropped and t.typname = 'jsonb'
  ) then raise exception 'public.crm_employees.data must be jsonb'; end if;
end $$;

create or replace function public.is_linked_super_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.crm_employees employee
    where employee.data->>'auth_user_id' = auth.uid()::text
      and employee.data->>'role' = 'Super Admin'
      and employee.data->>'active' = 'true'
      and employee.data->>'account_status' = 'Active'
      and coalesce(employee.data->>'employee_status', '') <> 'Exited'
  )
$$;

alter function public.is_linked_super_admin() owner to postgres;
revoke all on function public.is_linked_super_admin() from public;
grant execute on function public.is_linked_super_admin() to authenticated, service_role;

create or replace function public.is_linked_costing_master_reader()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.crm_employees employee
    where employee.data->>'auth_user_id' = auth.uid()::text
      and employee.data->>'active' = 'true'
      and employee.data->>'account_status' = 'Active'
      and coalesce(employee.data->>'employee_status', '') <> 'Exited'
      and lower(btrim(employee.data->>'role')) in (
        'super admin', 'sales manager', 'senior sales executive', 'sales executive'
      )
  )
$$;

alter function public.is_linked_costing_master_reader() owner to postgres;
revoke all on function public.is_linked_costing_master_reader() from public;
grant execute on function public.is_linked_costing_master_reader() to authenticated, service_role;
