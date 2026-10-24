-- Safe, manager-only projection for Query ownership assignment. Employee
-- Master RLS remains self-only for ordinary employees.
CREATE OR REPLACE FUNCTION public.list_sales_assignment_candidates()
RETURNS TABLE(
  employee_id text,
  name text,
  role text,
  unit text,
  department text,
  auth_user_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH actor AS (
    SELECT id, data,
      CASE lower(btrim(data ->> 'unit'))
        WHEN 'mp' THEN 'Madhya Pradesh'
        WHEN 'madhya pradesh' THEN 'Madhya Pradesh'
        WHEN 'madhya pradesh unit' THEN 'Madhya Pradesh'
        ELSE NULLIF(btrim(data ->> 'unit'), '')
      END AS canonical_unit
    FROM public.crm_employees
    WHERE data ->> 'auth_user_id' = auth.uid()::text
      AND data ->> 'role' = 'Sales Manager'
      AND lower(btrim(COALESCE(data ->> 'department', ''))) IN (
        'sales', 'sales & marketing', 'sales and marketing'
      )
      AND COALESCE((data ->> 'active')::boolean, false)
      AND lower(btrim(COALESCE(data ->> 'account_status', ''))) = 'active'
      AND lower(btrim(COALESCE(data ->> 'employee_status', ''))) <> 'exited'
    LIMIT 1
  )
  SELECT target.id::text,
    target.data ->> 'name',
    target.data ->> 'role',
    target.data ->> 'unit',
    target.data ->> 'department',
    (target.data ->> 'auth_user_id')::uuid
  FROM actor
  JOIN public.crm_employees target ON target.id <> actor.id
  WHERE CASE lower(btrim(target.data ->> 'unit'))
      WHEN 'mp' THEN 'Madhya Pradesh'
      WHEN 'madhya pradesh' THEN 'Madhya Pradesh'
      WHEN 'madhya pradesh unit' THEN 'Madhya Pradesh'
      ELSE NULLIF(btrim(target.data ->> 'unit'), '')
    END = actor.canonical_unit
    AND target.data ->> 'role' IN (
      'Sales Executive', 'Senior Sales Executive', 'Assistant Manager',
      'Sales Manager', 'Sales Head'
    )
    AND COALESCE((target.data ->> 'active')::boolean, false)
    AND lower(btrim(COALESCE(target.data ->> 'account_status', ''))) = 'active'
    AND lower(btrim(COALESCE(target.data ->> 'employee_status', ''))) <> 'exited'
    AND NULLIF(target.data ->> 'auth_user_id', '') IS NOT NULL
  ORDER BY target.data ->> 'name'
$$;

REVOKE ALL ON FUNCTION public.list_sales_assignment_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_sales_assignment_candidates() TO authenticated;
