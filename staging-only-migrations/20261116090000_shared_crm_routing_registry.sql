-- STAGING REVIEW ONLY. Do not copy to supabase/migrations or apply to production.
create table if not exists public.crm_routing_registry (
  programme_id text primary key check (length(trim(programme_id)) between 1 and 120),
  programme_code text not null unique check (length(trim(programme_code)) between 1 and 80),
  programme_name text not null check (length(trim(programme_name)) between 1 and 240),
  itinerary_id text not null unique check (length(trim(itinerary_id)) between 1 and 160),
  nights integer not null check (nights >= 1 and nights <= 365),
  days integer not null check (days = nights + 1),
  start_city text not null check (length(trim(start_city)) between 1 and 160),
  end_city text not null check (length(trim(end_city)) between 1 and 160),
  routing jsonb not null check (jsonb_typeof(routing) = 'array' and jsonb_array_length(routing) = days),
  overnight_cities jsonb not null check (jsonb_typeof(overnight_cities) = 'array' and jsonb_array_length(overnight_cities) = nights),
  routing_fingerprint text not null check (length(trim(routing_fingerprint)) between 16 and 256),
  active boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(), updated_by uuid not null references auth.users(id)
);
alter table public.crm_routing_registry owner to postgres;
alter table public.crm_routing_registry enable row level security;
revoke all on public.crm_routing_registry from public, anon, authenticated;
grant select on public.crm_routing_registry to authenticated;
drop policy if exists "active linked costing readers read active routings" on public.crm_routing_registry;
create policy "active linked costing readers read active routings" on public.crm_routing_registry for select to authenticated using (
  active and public.is_linked_costing_master_reader()
);
create or replace function public.crm_routing_registry_touch_updated_at() returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$ begin new.updated_at = now(); return new; end $$;
alter function public.crm_routing_registry_touch_updated_at() owner to postgres;
revoke all on function public.crm_routing_registry_touch_updated_at() from public, anon, authenticated;
drop trigger if exists crm_routing_registry_touch on public.crm_routing_registry;
create trigger crm_routing_registry_touch before update on public.crm_routing_registry for each row execute function public.crm_routing_registry_touch_updated_at();
