-- Costing master READ access for linked Sales roles.
-- Does not disable RLS, does not grant master writes, and does not touch Query tables.

CREATE OR REPLACE FUNCTION public.is_linked_costing_master_reader() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.crm_employees
    WHERE data->>'auth_user_id' = auth.uid()::text
      AND data->>'active' = 'true'
      AND data->>'account_status' = 'Active'
      AND coalesce(data->>'employee_status', '') <> 'Exited'
      AND lower(btrim(data->>'role')) IN (
        'super admin',
        'sales manager',
        'senior sales executive',
        'sales executive'
      )
  )
$$;

REVOKE ALL ON FUNCTION public.is_linked_costing_master_reader() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_linked_costing_master_reader() TO authenticated, service_role;

-- The blanket restrictive policy requires Super Admin for every command, so
-- Sales SELECT was filtered to zero rows even though permissive SELECT exists.
-- Replace it only on the shared costing master tables. Query/CRM tables stay gated.
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['app_master_state', 'destination_cities', 'destination_tours']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS single_super_admin_restriction ON public.%I', target);
    EXECUTE format('DROP POLICY IF EXISTS costing_master_select_gate ON public.%I', target);
    EXECUTE format('DROP POLICY IF EXISTS costing_master_insert_gate ON public.%I', target);
    EXECUTE format('DROP POLICY IF EXISTS costing_master_update_gate ON public.%I', target);
    EXECUTE format('DROP POLICY IF EXISTS costing_master_delete_gate ON public.%I', target);

    EXECUTE format(
      'CREATE POLICY costing_master_select_gate ON public.%I AS RESTRICTIVE FOR SELECT TO public USING (public.is_linked_costing_master_reader())',
      target
    );
    EXECUTE format(
      'CREATE POLICY costing_master_insert_gate ON public.%I AS RESTRICTIVE FOR INSERT TO public WITH CHECK (public.is_linked_super_admin())',
      target
    );
    EXECUTE format(
      'CREATE POLICY costing_master_update_gate ON public.%I AS RESTRICTIVE FOR UPDATE TO public USING (public.is_linked_super_admin()) WITH CHECK (public.is_linked_super_admin())',
      target
    );
    EXECUTE format(
      'CREATE POLICY costing_master_delete_gate ON public.%I AS RESTRICTIVE FOR DELETE TO public USING (public.is_linked_super_admin())',
      target
    );
  END LOOP;
END $$;
