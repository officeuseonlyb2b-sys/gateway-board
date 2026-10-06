-- Refuse cleanup if deletion could touch a business table, including indirect FK chains.
-- Auth-owned tables and the application's profiles/user_roles are account data only.
CREATE OR REPLACE FUNCTION public.employee_cleanup_foreign_keys() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH RECURSIVE dependencies AS (
    SELECT c.oid, c.conrelid, c.confrelid, c.conname, c.confdeltype, ARRAY[c.confrelid, c.conrelid] AS visited
    FROM pg_constraint c WHERE c.contype = 'f' AND c.confrelid IN ('public.crm_employees'::regclass, 'auth.users'::regclass)
    UNION ALL
    SELECT c.oid, c.conrelid, c.confrelid, c.conname, c.confdeltype, d.visited || c.conrelid
    FROM dependencies d JOIN pg_constraint c ON c.confrelid = d.conrelid AND c.contype = 'f'
    WHERE NOT c.conrelid = ANY(d.visited)
  )
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('table', ns.nspname || '.' || cl.relname,
    'constraint', d.conname, 'delete_action', d.confdeltype)), '[]'::jsonb)
  FROM dependencies d JOIN pg_class cl ON cl.oid = d.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
  WHERE ns.nspname <> 'auth' AND NOT (ns.nspname = 'public' AND cl.relname IN ('profiles', 'user_roles'))
$$;
REVOKE ALL ON FUNCTION public.employee_cleanup_foreign_keys() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_cleanup_foreign_keys() TO service_role;

