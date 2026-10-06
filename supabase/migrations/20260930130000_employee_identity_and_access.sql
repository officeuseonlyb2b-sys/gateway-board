-- Identity/authentication only. No business rows are deleted, rewritten or reassigned.
BEGIN;

-- JSON remains the existing storage contract; indexed identities are database-enforced.
CREATE UNIQUE INDEX IF NOT EXISTS crm_employees_auth_user_unique
  ON public.crm_employees ((nullif(data->>'auth_user_id', '')));
CREATE UNIQUE INDEX IF NOT EXISTS crm_employees_code_unique
  ON public.crm_employees ((upper(nullif(data->>'employee_code', ''))));
CREATE UNIQUE INDEX IF NOT EXISTS crm_employees_internal_email_unique
  ON public.crm_employees ((lower(nullif(data->>'auth_login_email', ''))));
CREATE UNIQUE INDEX IF NOT EXISTS crm_employees_one_super_admin
  ON public.crm_employees ((data->>'role')) WHERE data->>'role' = 'Super Admin';

CREATE SEQUENCE IF NOT EXISTS public.crm_employee_code_seq;
SELECT setval('public.crm_employee_code_seq', greatest(
  coalesce((SELECT max(substring(data->>'employee_code' from '^EMP-([0-9]+)$')::bigint)
    FROM public.crm_employees WHERE data->>'employee_code' ~ '^EMP-[0-9]+$'), 0) + 1,
  (SELECT last_value FROM public.crm_employee_code_seq)), false);
REVOKE ALL ON SEQUENCE public.crm_employee_code_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE public.crm_employee_code_seq TO service_role;
CREATE OR REPLACE FUNCTION public.next_employee_code() RETURNS text
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = public AS $$
  SELECT 'EMP-' || lpad(n::text, greatest(4, length(n::text)), '0')
  FROM (SELECT nextval('public.crm_employee_code_seq') AS n) allocated
$$;
REVOKE ALL ON FUNCTION public.next_employee_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_employee_code() TO service_role;

CREATE OR REPLACE FUNCTION public.is_linked_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.crm_employees
    WHERE data->>'auth_user_id' = auth.uid()::text
      AND data->>'role' = 'Super Admin' AND data->>'active' = 'true'
      AND data->>'account_status' = 'Active'
      AND coalesce(data->>'employee_status', '') <> 'Exited')
$$;
REVOKE ALL ON FUNCTION public.is_linked_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_linked_super_admin() TO anon, authenticated, service_role;

-- Replace the prior email gate on every table it covered. Retain business policies
-- beneath a restrictive linked-admin gate; no department permissions are invented.
DO $$ DECLARE t record; p record; BEGIN
  FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS single_super_admin_access ON %I.%I', t.schemaname, t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS single_super_admin_restriction ON %I.%I', t.schemaname, t.tablename);
    IF t.tablename <> 'crm_employees' THEN
      EXECUTE format('CREATE POLICY single_super_admin_access ON %I.%I FOR ALL TO authenticated USING (public.is_linked_super_admin()) WITH CHECK (public.is_linked_super_admin())', t.schemaname, t.tablename);
      EXECUTE format('CREATE POLICY single_super_admin_restriction ON %I.%I AS RESTRICTIVE FOR ALL TO public USING (public.is_linked_super_admin()) WITH CHECK (public.is_linked_super_admin())', t.schemaname, t.tablename);
    END IF;
  END LOOP;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crm_employees' LOOP
    EXECUTE format('DROP POLICY %I ON public.crm_employees', p.policyname);
  END LOOP;
END $$;
CREATE POLICY employee_admin_all ON public.crm_employees FOR ALL TO authenticated
  USING (public.is_linked_super_admin()) WITH CHECK (public.is_linked_super_admin());
CREATE POLICY employee_read_self ON public.crm_employees FOR SELECT TO authenticated
  USING (data->>'auth_user_id' = auth.uid()::text AND data->>'active' = 'true'
    AND data->>'account_status' = 'Active' AND coalesce(data->>'employee_status', '') <> 'Exited');

CREATE OR REPLACE FUNCTION public.protect_employee_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.data->>'role' = 'Super Admin' THEN RAISE EXCEPTION 'Permanent Super Admin cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR
    (nullif(OLD.data->>'employee_code', '') IS NOT NULL AND NEW.data->>'employee_code' IS DISTINCT FROM OLD.data->>'employee_code'
      AND NOT (current_user = 'service_role' AND NEW.data->>'role' = 'Super Admin' AND NEW.data->>'employee_code' = 'ADMIN-001')) THEN
    RAISE EXCEPTION 'Employee identity is immutable';
  END IF;
  IF OLD.data->>'role' = 'Super Admin' AND (
    NEW.data->>'role' IS DISTINCT FROM 'Super Admin' OR NEW.data->>'active' IS DISTINCT FROM 'true'
    OR NEW.data->>'account_status' IS DISTINCT FROM 'Active' OR NEW.data->>'employee_status' IS DISTINCT FROM 'Active'
    OR NEW.data->>'auth_user_id' IS DISTINCT FROM OLD.data->>'auth_user_id') THEN
    RAISE EXCEPTION 'Permanent Super Admin cannot be disabled or unlinked';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_employee_identity BEFORE UPDATE OR DELETE ON public.crm_employees
  FOR EACH ROW EXECUTE FUNCTION public.protect_employee_identity();

COMMIT;
