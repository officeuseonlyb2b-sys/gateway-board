-- Limit every public application table to the configured single super administrator.
-- Employee, Query, and audit records are intentionally retained.
DO $$
DECLARE
  app_table record;
BEGIN
  FOR app_table IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      app_table.schemaname,
      app_table.tablename
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      'single_super_admin_access',
      app_table.schemaname,
      app_table.tablename
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      'single_super_admin_restriction',
      app_table.schemaname,
      app_table.tablename
    );

    -- This permissive policy grants the administrator access even on tables
    -- that did not previously define an authenticated-user policy.
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS PERMISSIVE FOR ALL TO authenticated USING (lower(coalesce(auth.jwt() ->> ''email'', '''')) = ''admin@mptourism.in'') WITH CHECK (lower(coalesce(auth.jwt() ->> ''email'', '''')) = ''admin@mptourism.in'')',
      'single_super_admin_access',
      app_table.schemaname,
      app_table.tablename
    );

    -- Restrictive policies are ANDed with existing permissive policies, so
    -- earlier broad "signed-in users" policies cannot grant staff access.
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO public USING (lower(coalesce(auth.jwt() ->> ''email'', '''')) = ''admin@mptourism.in'') WITH CHECK (lower(coalesce(auth.jwt() ->> ''email'', '''')) = ''admin@mptourism.in'')',
      'single_super_admin_restriction',
      app_table.schemaname,
      app_table.tablename
    );
  END LOOP;
END;
$$;
