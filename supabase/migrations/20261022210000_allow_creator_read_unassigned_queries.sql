-- Keep INSERT and SELECT authorization consistent for creator-owned, unassigned
-- Queries so PostgREST can return a row after an authorized create/upsert.
CREATE OR REPLACE FUNCTION public.can_access_crm_query(query_data jsonb, row_owner_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_linked_super_admin()
    OR (public.current_crm_employee_id() IS NOT NULL AND row_owner_user_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.crm_employees creator
      WHERE creator.id::text = public.current_crm_employee_id()
        AND creator.data ->> 'auth_user_id' = auth.uid()::text
        AND creator.data ->> 'active' = 'true'
        AND creator.data ->> 'account_status' = 'Active'
        AND COALESCE(creator.data ->> 'employee_status', '') <> 'Exited'
        AND row_owner_user_id IS NULL
        AND COALESCE(query_data ->> 'owner', '') IN ('', 'Unassigned')
        AND query_data ->> 'created_by' IN (creator.id::text, creator.data ->> 'name')
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(query_data -> 'review_support' -> 'query_reviews', '[]'::jsonb)) review(value)
      WHERE public.current_crm_employee_id() IN (
        review.value ->> 'reviewer_employee_id', review.value ->> 'requested_by_employee_id'
      )
        AND (review.value ->> 'requested_by_employee_id' = public.current_crm_employee_id()
          OR COALESCE(review.value ->> 'status', '') <> 'Cancelled')
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(query_data -> 'review_support' -> 'quotation_reviews', '[]'::jsonb)) review(value)
      WHERE public.current_crm_employee_id() IN (
        review.value ->> 'reviewer_employee_id', review.value ->> 'requested_by_employee_id'
      )
        AND (review.value ->> 'requested_by_employee_id' = public.current_crm_employee_id()
          OR COALESCE(review.value ->> 'status', '') <> 'Cancelled')
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(query_data -> 'review_support' -> 'assistance', '[]'::jsonb)) support(value)
      WHERE public.current_crm_employee_id() IN (
        support.value ->> 'assistant_employee_id', support.value ->> 'assigned_by_employee_id'
      )
        AND (support.value ->> 'assigned_by_employee_id' = public.current_crm_employee_id()
          OR COALESCE(support.value ->> 'status', '') <> 'Cancelled')
    )
    OR (
      COALESCE(query_data -> 'shared_with_employee_ids', '[]'::jsonb) ? public.current_crm_employee_id()
      AND NOT EXISTS (
        SELECT 1 FROM public.crm_employees manager
        WHERE manager.data ->> 'auth_user_id' = auth.uid()::text
          AND manager.data ->> 'role' = 'Sales Manager'
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.crm_employees manager
      WHERE manager.data ->> 'auth_user_id' = auth.uid()::text
        AND manager.data ->> 'role' = 'Sales Manager'
        AND manager.data ->> 'department' = 'Sales'
        AND manager.data ->> 'active' = 'true'
        AND manager.data ->> 'account_status' = 'Active'
        AND COALESCE(manager.data ->> 'employee_status', '') <> 'Exited'
        AND (
          EXISTS (
            SELECT 1 FROM public.crm_employees owner
            WHERE owner.data ->> 'auth_user_id' = row_owner_user_id::text
              AND owner.data ->> 'department' = 'Sales'
              AND manager.data ->> 'unit' = owner.data ->> 'unit'
          )
          OR (row_owner_user_id IS NULL AND COALESCE(query_data ->> 'owner', '') IN ('', 'Unassigned')
            AND (query_data ->> 'primary_unit' = manager.data ->> 'unit'
              OR COALESCE(query_data -> 'participating_units', '[]'::jsonb) ? (manager.data ->> 'unit')))
        )
    )
$$;

REVOKE ALL ON FUNCTION public.can_access_crm_query(jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_crm_query(jsonb, uuid) TO authenticated;
