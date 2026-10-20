-- Explicit Query review/assistance access without changing Query ownership.
CREATE OR REPLACE FUNCTION public.current_crm_employee_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id::text
  FROM public.crm_employees
  WHERE data ->> 'auth_user_id' = auth.uid()::text
    AND COALESCE((data ->> 'active')::boolean, false)
    AND data ->> 'account_status' = 'Active'
    AND COALESCE(data ->> 'employee_status', '') <> 'Exited'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_crm_employee_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_crm_employee_id() TO authenticated;

-- A deliberately small directory projection supplies reviewer selectors and
-- manager team scoping, with only the auth UUID needed for persisted ownership linkage.
CREATE OR REPLACE FUNCTION public.crm_review_employee_directory()
RETURNS TABLE(id text, name text, role text, department text, unit text, auth_user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target.id::text, target.data ->> 'name', target.data ->> 'role',
    target.data ->> 'department', target.data ->> 'unit',
    CASE WHEN actor.data ->> 'role' = 'Sales Manager'
      THEN (target.data ->> 'auth_user_id')::uuid ELSE NULL END
  FROM public.crm_employees actor
  JOIN public.crm_employees target
    ON target.data ->> 'unit' = actor.data ->> 'unit'
  WHERE actor.data ->> 'auth_user_id' = auth.uid()::text
    AND actor.data ->> 'active' = 'true'
    AND actor.data ->> 'account_status' = 'Active'
    AND COALESCE(actor.data ->> 'employee_status', '') <> 'Exited'
    AND actor.data ->> 'department' = 'Sales'
    AND target.data ->> 'department' = 'Sales'
    AND target.data ->> 'active' = 'true'
    AND target.data ->> 'account_status' = 'Active'
    AND NULLIF(target.data ->> 'auth_user_id', '') IS NOT NULL
    AND COALESCE(target.data ->> 'employee_status', '') <> 'Exited'
    AND (
      (actor.data ->> 'role' = 'Sales Executive'
        AND target.data ->> 'role' IN ('Senior Sales Executive', 'Sales Manager'))
      OR (actor.data ->> 'role' = 'Senior Sales Executive'
        AND target.data ->> 'role' = 'Sales Manager')
      OR (actor.data ->> 'role' = 'Sales Manager')
    )
  ORDER BY target.data ->> 'name'
$$;
REVOKE ALL ON FUNCTION public.crm_review_employee_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_review_employee_directory() TO authenticated;

-- Backfill only unambiguous legacy owners; all authorization below uses this UUID,
-- never a display name or email supplied by the client.
UPDATE public.crm_queries query_row
SET owner_user_id = (
  SELECT (employee.data ->> 'auth_user_id')::uuid
  FROM public.crm_employees employee
  WHERE (employee.id::text = query_row.owner OR employee.data ->> 'name' = query_row.owner)
    AND NULLIF(employee.data ->> 'auth_user_id', '') IS NOT NULL
    AND employee.data ->> 'active' = 'true'
    AND employee.data ->> 'account_status' = 'Active'
    AND COALESCE(employee.data ->> 'employee_status', '') <> 'Exited'
  ORDER BY employee.id
  LIMIT 1
)
WHERE query_row.owner_user_id IS NULL
  AND NULLIF(query_row.owner, '') IS NOT NULL
  AND (
    SELECT count(*)
    FROM public.crm_employees employee
    WHERE (employee.id::text = query_row.owner OR employee.data ->> 'name' = query_row.owner)
      AND NULLIF(employee.data ->> 'auth_user_id', '') IS NOT NULL
      AND employee.data ->> 'active' = 'true'
      AND employee.data ->> 'account_status' = 'Active'
      AND COALESCE(employee.data ->> 'employee_status', '') <> 'Exited'
  ) = 1;

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

CREATE OR REPLACE FUNCTION public.can_create_crm_query(query_data jsonb, row_owner_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_linked_super_admin()
    OR (
      public.current_crm_employee_id() IS NOT NULL
      AND COALESCE(query_data -> 'review_support', '{}'::jsonb) = '{}'::jsonb
      AND COALESCE(query_data -> 'reviewer_employee_ids', '[]'::jsonb) = '[]'::jsonb
      AND COALESCE(query_data -> 'assistance_employee_ids', '[]'::jsonb) = '[]'::jsonb
      AND COALESCE(query_data -> 'shared_with_employee_ids', '[]'::jsonb) = '[]'::jsonb
      AND (
        EXISTS (
          SELECT 1 FROM public.crm_employees creator
          WHERE creator.id::text = public.current_crm_employee_id()
            AND creator.data ->> 'auth_user_id' = auth.uid()::text
            AND creator.data ->> 'active' = 'true'
            AND creator.data ->> 'account_status' = 'Active'
            AND row_owner_user_id = auth.uid()
            AND (query_data ->> 'owner' = creator.id::text OR query_data ->> 'owner' = creator.data ->> 'name')
        )
        OR EXISTS (
          SELECT 1 FROM public.crm_employees creator
          WHERE creator.id::text = public.current_crm_employee_id()
            AND creator.data ->> 'auth_user_id' = auth.uid()::text
            AND creator.data ->> 'active' = 'true'
            AND creator.data ->> 'account_status' = 'Active'
            AND query_data ->> 'created_by' IN (creator.id::text, creator.data ->> 'name')
            AND row_owner_user_id IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM public.crm_employees manager
          WHERE manager.id::text = public.current_crm_employee_id()
            AND manager.data ->> 'role' = 'Sales Manager'
            AND manager.data ->> 'department' = 'Sales'
            AND manager.data ->> 'active' = 'true'
            AND manager.data ->> 'account_status' = 'Active'
            AND COALESCE(manager.data ->> 'employee_status', '') <> 'Exited'
            AND (
              (row_owner_user_id IS NULL
                AND COALESCE(query_data ->> 'owner', '') IN ('', 'Unassigned')
                AND (query_data ->> 'primary_unit' = manager.data ->> 'unit'
                  OR COALESCE(query_data -> 'participating_units', '[]'::jsonb) ? (manager.data ->> 'unit')))
              OR EXISTS (
                SELECT 1 FROM public.crm_employees assigned_owner
                WHERE assigned_owner.data ->> 'auth_user_id' = row_owner_user_id::text
                  AND assigned_owner.data ->> 'department' = 'Sales'
                  AND assigned_owner.data ->> 'active' = 'true'
                  AND assigned_owner.data ->> 'account_status' = 'Active'
                  AND COALESCE(assigned_owner.data ->> 'employee_status', '') <> 'Exited'
                  AND assigned_owner.data ->> 'unit' = manager.data ->> 'unit'
                  AND (query_data ->> 'owner' = assigned_owner.id::text
                    OR query_data ->> 'owner' = assigned_owner.data ->> 'name')
              )
            )
        )
      )
    )
$$;

-- The identity migration intentionally installed a restrictive Super-Admin-only
-- policy on every business table. Remove that gate only for these workflow tables;
-- the existing permissive Super Admin access policies remain in place.
REVOKE ALL ON FUNCTION public.can_access_crm_query(jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_crm_query(jsonb, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.can_create_crm_query(jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_create_crm_query(jsonb, uuid) TO authenticated;

DROP POLICY IF EXISTS single_super_admin_restriction ON public.crm_queries;
DROP POLICY IF EXISTS single_super_admin_restriction ON public.crm_events;
DROP POLICY IF EXISTS single_super_admin_restriction ON public.crm_notifications;

DROP POLICY IF EXISTS "CRM users read permitted queries" ON public.crm_queries;
DROP POLICY IF EXISTS "CRM users update permitted queries" ON public.crm_queries;
DROP POLICY IF EXISTS "CRM users create queries" ON public.crm_queries;
DROP POLICY IF EXISTS "CRM users read explicit queries" ON public.crm_queries;
DROP POLICY IF EXISTS "CRM users create owned queries" ON public.crm_queries;
DROP POLICY IF EXISTS "CRM users update explicit queries" ON public.crm_queries;

CREATE POLICY "CRM users read explicit queries"
ON public.crm_queries FOR SELECT TO authenticated
USING (public.can_access_crm_query(data, owner_user_id));

CREATE POLICY "CRM users create owned queries"
ON public.crm_queries FOR INSERT TO authenticated
WITH CHECK (public.can_create_crm_query(data, owner_user_id));

CREATE POLICY "CRM users update explicit queries"
ON public.crm_queries FOR UPDATE TO authenticated
USING (public.can_access_crm_query(data, owner_user_id))
WITH CHECK (
  public.can_access_crm_query(data, owner_user_id)
);

CREATE OR REPLACE FUNCTION public.crm_review_target_allowed(
    target_employee_id text,
    actor_employee_id text,
    manager_reassignment boolean
  )
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.crm_employees actor
      JOIN public.crm_employees target ON target.id::text = target_employee_id
      WHERE actor.id::text = actor_employee_id
        AND actor.data ->> 'department' = 'Sales'
        AND actor.data ->> 'active' = 'true'
        AND actor.data ->> 'account_status' = 'Active'
        AND COALESCE(actor.data ->> 'employee_status', '') <> 'Exited'
        AND target.data ->> 'department' = 'Sales'
        AND target.data ->> 'active' = 'true'
        AND target.data ->> 'account_status' = 'Active'
        AND NULLIF(target.data ->> 'auth_user_id', '') IS NOT NULL
        AND COALESCE(target.data ->> 'employee_status', '') <> 'Exited'
        AND target.data ->> 'unit' = actor.data ->> 'unit'
        AND target.data ->> 'role' IN ('Senior Sales Executive', 'Sales Manager')
        AND (
          (manager_reassignment AND actor.data ->> 'role' = 'Sales Manager')
          OR (NOT manager_reassignment AND actor.data ->> 'role' = 'Sales Executive'
            AND target.data ->> 'role' IN ('Senior Sales Executive', 'Sales Manager'))
          OR (NOT manager_reassignment AND actor.data ->> 'role' = 'Senior Sales Executive'
            AND target.data ->> 'role' = 'Sales Manager')
          OR (NOT manager_reassignment AND actor.data ->> 'role' = 'Sales Manager')
        )
    )
  $$;

REVOKE ALL ON FUNCTION public.crm_review_target_allowed(text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_review_target_allowed(text, text, boolean) FROM authenticated;

CREATE OR REPLACE FUNCTION public.review_support_mutation_allowed(
    old_data jsonb,
    new_data jsonb,
    actor_employee_id text,
    can_assign boolean,
    is_manager boolean
  )
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    review_key text;
    old_items jsonb;
    new_items jsonb;
    old_item jsonb;
    new_item jsonb;
    old_status text;
    new_status text;
    history jsonb;
    contribution jsonb;
  BEGIN
    FOREACH review_key IN ARRAY ARRAY['query_reviews', 'quotation_reviews'] LOOP
      old_items := COALESCE(old_data -> 'review_support' -> review_key, '[]'::jsonb);
      new_items := COALESCE(new_data -> 'review_support' -> review_key, '[]'::jsonb);
      IF jsonb_typeof(old_items) <> 'array' OR jsonb_typeof(new_items) <> 'array' THEN
        RETURN false;
      END IF;

      FOR old_item IN SELECT value FROM jsonb_array_elements(old_items) LOOP
        SELECT value INTO new_item FROM jsonb_array_elements(new_items)
        WHERE value ->> 'id' = old_item ->> 'id';
        IF NOT FOUND THEN RETURN false; END IF;
      END LOOP;

      FOR new_item IN SELECT value FROM jsonb_array_elements(new_items) LOOP
        old_item := NULL;
        SELECT value INTO old_item FROM jsonb_array_elements(old_items)
        WHERE value ->> 'id' = new_item ->> 'id';
        IF old_item IS NULL THEN
          IF NOT can_assign
            OR new_item ->> 'requested_by_employee_id' IS DISTINCT FROM actor_employee_id
            OR new_item ->> 'status' NOT IN ('Requested', 'Assigned')
            OR NOT public.crm_review_target_allowed(new_item ->> 'reviewer_employee_id', actor_employee_id, false) THEN
            RETURN false;
          END IF;
          IF review_key = 'quotation_reviews' AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(new_data -> 'costing_versions', '[]'::jsonb)) version(value)
            WHERE version.value IS NOT DISTINCT FROM new_item -> 'quotation_snapshot'
              AND version.value ->> 'version' = new_item ->> 'quotation_version'
              AND version.value -> 'quote' ->> 'id' = new_item ->> 'quotation_id'
          ) THEN
            RETURN false;
          END IF;
          CONTINUE;
        END IF;
        IF old_item IS NOT DISTINCT FROM new_item THEN CONTINUE; END IF;

        old_status := old_item ->> 'status';
        new_status := new_item ->> 'status';
        IF is_manager AND old_item ->> 'reviewer_employee_id' IS DISTINCT FROM new_item ->> 'reviewer_employee_id' THEN
          history := COALESCE(new_item -> 'assignment_history', '[]'::jsonb);
          IF old_status NOT IN ('Requested', 'Assigned', 'In Review', 'Pending Review', 'Under Review')
            OR new_status <> 'Assigned'
            OR NOT public.crm_review_target_allowed(new_item ->> 'reviewer_employee_id', actor_employee_id, true)
            OR (old_item - ARRAY['reviewer_employee_id', 'status', 'started_at', 'completed_at', 'decided_at', 'decision_note', 'checklist', 'assignment_history'])
              IS DISTINCT FROM
               (new_item - ARRAY['reviewer_employee_id', 'status', 'started_at', 'completed_at', 'decided_at', 'decision_note', 'checklist', 'assignment_history'])
            OR jsonb_array_length(history) <> jsonb_array_length(COALESCE(old_item -> 'assignment_history', '[]'::jsonb))
              + (CASE WHEN jsonb_array_length(COALESCE(old_item -> 'assignment_history', '[]'::jsonb)) = 0 THEN 2 ELSE 1 END)
            OR NOT (history @> COALESCE(old_item -> 'assignment_history', '[]'::jsonb))
            OR (jsonb_array_length(COALESCE(old_item -> 'assignment_history', '[]'::jsonb)) = 0
                AND history -> 0 ->> 'employee_id' IS DISTINCT FROM old_item ->> 'reviewer_employee_id')
            OR history -> -1 ->> 'employee_id' IS DISTINCT FROM new_item ->> 'reviewer_employee_id'
            OR history -> -1 ->> 'assigned_by_employee_id' IS DISTINCT FROM actor_employee_id THEN
            RETURN false;
          END IF;
          CONTINUE;
        END IF;

        IF new_item ->> 'reviewer_employee_id' = actor_employee_id THEN
          IF (old_item - ARRAY['status', 'decision_note', 'review_notes', 'decided_at', 'started_at', 'completed_at', 'checklist'])
              IS DISTINCT FROM
             (new_item - ARRAY['status', 'decision_note', 'review_notes', 'decided_at', 'started_at', 'completed_at', 'checklist']) THEN
            RETURN false;
          END IF;
          IF old_status IS NOT DISTINCT FROM new_status THEN
            IF (old_item - 'checklist') IS DISTINCT FROM (new_item - 'checklist')
              OR old_status NOT IN ('In Review', 'Under Review') THEN RETURN false; END IF;
          ELSIF new_status = 'In Review' THEN
            IF old_status NOT IN ('Requested', 'Assigned', 'Pending Review', 'Under Review')
              OR NULLIF(new_item ->> 'started_at', '') IS NULL THEN RETURN false; END IF;
          ELSIF new_status IN ('Approved', 'Returned') THEN
            IF old_status NOT IN ('In Review', 'Under Review')
              OR NULLIF(new_item ->> 'decided_at', '') IS NULL
              OR NULLIF(new_item ->> 'completed_at', '') IS NULL
              OR (new_status = 'Returned' AND NULLIF(btrim(new_item ->> 'decision_note'), '') IS NULL) THEN
              RETURN false;
            END IF;
          ELSE
            RETURN false;
          END IF;
        ELSIF new_item ->> 'requested_by_employee_id' = actor_employee_id
          AND new_status = 'Cancelled'
          AND old_status IN ('Requested', 'Assigned', 'In Review', 'Pending Review', 'Under Review') THEN
          IF (old_item - ARRAY['status', 'decided_at', 'completed_at'])
              IS DISTINCT FROM (new_item - ARRAY['status', 'decided_at', 'completed_at'])
            OR NULLIF(new_item ->> 'completed_at', '') IS NULL THEN RETURN false; END IF;
        ELSE
          RETURN false;
        END IF;
      END LOOP;
    END LOOP;

    old_items := COALESCE(old_data -> 'review_support' -> 'assistance', '[]'::jsonb);
    new_items := COALESCE(new_data -> 'review_support' -> 'assistance', '[]'::jsonb);
    IF jsonb_typeof(old_items) <> 'array' OR jsonb_typeof(new_items) <> 'array' THEN RETURN false; END IF;
    FOR old_item IN SELECT value FROM jsonb_array_elements(old_items) LOOP
      SELECT value INTO new_item FROM jsonb_array_elements(new_items)
      WHERE value ->> 'id' = old_item ->> 'id';
      IF NOT FOUND THEN RETURN false; END IF;
    END LOOP;

    FOR new_item IN SELECT value FROM jsonb_array_elements(new_items) LOOP
      old_item := NULL;
      SELECT value INTO old_item FROM jsonb_array_elements(old_items)
      WHERE value ->> 'id' = new_item ->> 'id';
      IF old_item IS NULL THEN
        IF NOT can_assign
          OR new_item ->> 'assigned_by_employee_id' IS DISTINCT FROM actor_employee_id
          OR new_item ->> 'status' NOT IN ('Requested', 'Assigned')
          OR NOT public.crm_review_target_allowed(new_item ->> 'assistant_employee_id', actor_employee_id, false) THEN
          RETURN false;
        END IF;
        CONTINUE;
      END IF;
      IF old_item IS NOT DISTINCT FROM new_item THEN CONTINUE; END IF;

      old_status := old_item ->> 'status';
      new_status := new_item ->> 'status';
      IF is_manager AND old_item ->> 'assistant_employee_id' IS DISTINCT FROM new_item ->> 'assistant_employee_id' THEN
        history := COALESCE(new_item -> 'assignment_history', '[]'::jsonb);
        IF old_status NOT IN ('Requested', 'Assigned', 'In Progress')
          OR new_status <> 'Assigned'
          OR NOT public.crm_review_target_allowed(new_item ->> 'assistant_employee_id', actor_employee_id, true)
          OR (old_item - ARRAY['assistant_employee_id', 'status', 'started_at', 'assignment_history'])
            IS DISTINCT FROM
             (new_item - ARRAY['assistant_employee_id', 'status', 'started_at', 'assignment_history'])
          OR jsonb_array_length(history) <> jsonb_array_length(COALESCE(old_item -> 'assignment_history', '[]'::jsonb))
            + (CASE WHEN jsonb_array_length(COALESCE(old_item -> 'assignment_history', '[]'::jsonb)) = 0 THEN 2 ELSE 1 END)
          OR NOT (history @> COALESCE(old_item -> 'assignment_history', '[]'::jsonb))
          OR (jsonb_array_length(COALESCE(old_item -> 'assignment_history', '[]'::jsonb)) = 0
              AND history -> 0 ->> 'employee_id' IS DISTINCT FROM old_item ->> 'assistant_employee_id')
          OR history -> -1 ->> 'employee_id' IS DISTINCT FROM new_item ->> 'assistant_employee_id'
          OR history -> -1 ->> 'assigned_by_employee_id' IS DISTINCT FROM actor_employee_id THEN
          RETURN false;
        END IF;
        CONTINUE;
      END IF;

      IF new_item ->> 'assistant_employee_id' = actor_employee_id THEN
        IF (old_item - ARRAY['status', 'started_at', 'completed_at', 'completion_summary', 'completed_by_employee_id', 'contributions'])
            IS DISTINCT FROM
           (new_item - ARRAY['status', 'started_at', 'completed_at', 'completion_summary', 'completed_by_employee_id', 'contributions']) THEN
          RETURN false;
        END IF;
        IF old_status IS NOT DISTINCT FROM new_status THEN
          IF (old_item - 'contributions') IS DISTINCT FROM (new_item - 'contributions') THEN RETURN false; END IF;
          IF old_item -> 'contributions' IS DISTINCT FROM new_item -> 'contributions' THEN
            IF old_status <> 'In Progress'
              OR jsonb_array_length(COALESCE(new_item -> 'contributions', '[]'::jsonb))
                < jsonb_array_length(COALESCE(old_item -> 'contributions', '[]'::jsonb))
              OR NOT (COALESCE(new_item -> 'contributions', '[]'::jsonb)
                @> COALESCE(old_item -> 'contributions', '[]'::jsonb)) THEN RETURN false; END IF;
            FOR contribution IN SELECT value FROM jsonb_array_elements(COALESCE(new_item -> 'contributions', '[]'::jsonb)) LOOP
              IF NOT (COALESCE(old_item -> 'contributions', '[]'::jsonb) @> jsonb_build_array(contribution))
                AND contribution ->> 'employee_id' IS DISTINCT FROM actor_employee_id THEN RETURN false; END IF;
            END LOOP;
          END IF;
        ELSIF new_status = 'Assigned' THEN
          IF old_status <> 'Requested' OR old_item -> 'contributions' IS DISTINCT FROM new_item -> 'contributions'
            OR old_item ->> 'started_at' IS DISTINCT FROM new_item ->> 'started_at' THEN RETURN false; END IF;
        ELSIF new_status = 'In Progress' THEN
          IF old_status <> 'Assigned' OR NULLIF(new_item ->> 'started_at', '') IS NULL
            OR old_item -> 'contributions' IS DISTINCT FROM new_item -> 'contributions' THEN RETURN false; END IF;
        ELSIF new_status = 'Completed' THEN
          IF old_status <> 'In Progress' OR NULLIF(btrim(new_item ->> 'completion_summary'), '') IS NULL
            OR NULLIF(new_item ->> 'completed_at', '') IS NULL
            OR new_item ->> 'completed_by_employee_id' IS DISTINCT FROM actor_employee_id
            OR old_item -> 'contributions' IS DISTINCT FROM new_item -> 'contributions' THEN RETURN false; END IF;
        ELSE
          RETURN false;
        END IF;
      ELSIF new_item ->> 'assigned_by_employee_id' = actor_employee_id
        AND new_status = 'Cancelled'
        AND old_status IN ('Requested', 'Assigned', 'In Progress') THEN
        IF (old_item - 'status') IS DISTINCT FROM (new_item - 'status') THEN RETURN false; END IF;
      ELSE
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  END;
  $$;

REVOKE ALL ON FUNCTION public.review_support_mutation_allowed(jsonb, jsonb, text, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_support_mutation_allowed(jsonb, jsonb, text, boolean, boolean) FROM authenticated;

  CREATE OR REPLACE FUNCTION public.review_support_change_allowed(
  old_data jsonb,
  new_data jsonb,
  actor_employee_id text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  review_key text;
  old_items jsonb;
  new_items jsonb;
  old_item jsonb;
  new_item jsonb;
  old_status text;
  new_status text;
  contribution jsonb;
BEGIN
  FOREACH review_key IN ARRAY ARRAY['query_reviews', 'quotation_reviews'] LOOP
    old_items := COALESCE(old_data -> 'review_support' -> review_key, '[]'::jsonb);
    new_items := COALESCE(new_data -> 'review_support' -> review_key, '[]'::jsonb);
    IF jsonb_typeof(old_items) <> 'array' OR jsonb_typeof(new_items) <> 'array'
      OR jsonb_array_length(old_items) <> jsonb_array_length(new_items) THEN
      RETURN false;
    END IF;

    FOR old_item IN SELECT value FROM jsonb_array_elements(old_items) LOOP
      SELECT value INTO new_item
      FROM jsonb_array_elements(new_items)
      WHERE value ->> 'id' = old_item ->> 'id';
      IF NOT FOUND THEN RETURN false; END IF;
      IF old_item IS NOT DISTINCT FROM new_item THEN CONTINUE; END IF;
      IF (old_item - ARRAY['status', 'decision_note', 'decided_at', 'started_at', 'completed_at', 'checklist'])
          IS DISTINCT FROM
         (new_item - ARRAY['status', 'decision_note', 'decided_at', 'started_at', 'completed_at', 'checklist'])
        OR old_item ->> 'reviewer_employee_id' IS DISTINCT FROM actor_employee_id THEN
        RETURN false;
      END IF;

      old_status := old_item ->> 'status';
      new_status := new_item ->> 'status';
      IF old_status IS NOT DISTINCT FROM new_status THEN
        IF (old_item - 'checklist') IS DISTINCT FROM (new_item - 'checklist') THEN
          RETURN false;
        END IF;
      ELSIF new_status = 'In Review' THEN
        IF old_status NOT IN ('Requested', 'Assigned', 'Pending Review', 'Under Review')
          OR NULLIF(new_item ->> 'started_at', '') IS NULL THEN RETURN false; END IF;
      ELSIF new_status IN ('Approved', 'Returned') THEN
        IF old_status NOT IN ('In Review', 'Under Review')
          OR NULLIF(new_item ->> 'decided_at', '') IS NULL
          OR NULLIF(new_item ->> 'completed_at', '') IS NULL
          OR (new_status = 'Returned' AND NULLIF(btrim(new_item ->> 'decision_note'), '') IS NULL) THEN
          RETURN false;
        END IF;
      ELSIF new_status = 'Cancelled' THEN
        IF old_item ->> 'requested_by_employee_id' IS DISTINCT FROM actor_employee_id
          OR old_status NOT IN ('Requested', 'Assigned', 'In Review', 'Pending Review', 'Under Review')
          OR NULLIF(new_item ->> 'completed_at', '') IS NULL THEN RETURN false; END IF;
      ELSE
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;

  old_items := COALESCE(old_data -> 'review_support' -> 'assistance', '[]'::jsonb);
  new_items := COALESCE(new_data -> 'review_support' -> 'assistance', '[]'::jsonb);
  IF jsonb_typeof(old_items) <> 'array' OR jsonb_typeof(new_items) <> 'array'
    OR jsonb_array_length(old_items) <> jsonb_array_length(new_items) THEN
    RETURN false;
  END IF;
  FOR old_item IN SELECT value FROM jsonb_array_elements(old_items) LOOP
    SELECT value INTO new_item
    FROM jsonb_array_elements(new_items)
    WHERE value ->> 'id' = old_item ->> 'id';
    IF NOT FOUND THEN RETURN false; END IF;
    IF old_item IS NOT DISTINCT FROM new_item THEN CONTINUE; END IF;
    IF (old_item - ARRAY['status', 'started_at', 'completed_at', 'completion_summary', 'contributions'])
        IS DISTINCT FROM
       (new_item - ARRAY['status', 'started_at', 'completed_at', 'completion_summary', 'contributions'])
      OR old_item ->> 'assistant_employee_id' IS DISTINCT FROM actor_employee_id THEN
      RETURN false;
    END IF;

    old_status := old_item ->> 'status';
    new_status := new_item ->> 'status';
    IF old_status IS NOT DISTINCT FROM new_status THEN
      IF old_item -> 'contributions' IS DISTINCT FROM new_item -> 'contributions' THEN
        IF old_status <> 'In Progress'
          OR jsonb_array_length(COALESCE(new_item -> 'contributions', '[]'::jsonb))
            < jsonb_array_length(COALESCE(old_item -> 'contributions', '[]'::jsonb))
          OR NOT (COALESCE(new_item -> 'contributions', '[]'::jsonb)
            @> COALESCE(old_item -> 'contributions', '[]'::jsonb)) THEN
          RETURN false;
        END IF;
        FOR contribution IN
          SELECT value FROM jsonb_array_elements(COALESCE(new_item -> 'contributions', '[]'::jsonb))
        LOOP
          IF NOT (COALESCE(old_item -> 'contributions', '[]'::jsonb) @> jsonb_build_array(contribution))
            AND contribution ->> 'employee_id' IS DISTINCT FROM actor_employee_id THEN
            RETURN false;
          END IF;
        END LOOP;
      ELSIF (old_item - 'contributions') IS DISTINCT FROM (new_item - 'contributions') THEN
        RETURN false;
      END IF;
    ELSIF new_status = 'In Progress' THEN
      IF old_status NOT IN ('Requested', 'Assigned')
        OR NULLIF(new_item ->> 'started_at', '') IS NULL
        OR old_item -> 'contributions' IS DISTINCT FROM new_item -> 'contributions' THEN
        RETURN false;
      END IF;
    ELSIF new_status = 'Completed' THEN
      IF old_status <> 'In Progress'
        OR NULLIF(btrim(new_item ->> 'completion_summary'), '') IS NULL
        OR NULLIF(new_item ->> 'completed_at', '') IS NULL
        OR old_item -> 'contributions' IS DISTINCT FROM new_item -> 'contributions' THEN
        RETURN false;
      END IF;
    ELSIF new_status = 'Cancelled' THEN
      IF old_item ->> 'assigned_by_employee_id' IS DISTINCT FROM actor_employee_id
        OR old_status NOT IN ('Requested', 'Assigned', 'In Progress')
        OR old_item -> 'contributions' IS DISTINCT FROM new_item -> 'contributions' THEN
        RETURN false;
      END IF;
    ELSE
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS public.review_support_change_allowed(jsonb, jsonb, text);

CREATE OR REPLACE FUNCTION public.guard_review_support_query_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  employee_record public.crm_employees%ROWTYPE;
  is_owner boolean;
  is_manager boolean;
  can_assign boolean;
  actor_employee_id text;
  latest_quotation_version integer;
  current_quotation_review_status text;
  owner_target public.crm_employees%ROWTYPE;
  assignment_history jsonb;
  last_assignment jsonb;
BEGIN
  SELECT * INTO employee_record
  FROM public.crm_employees
  WHERE data ->> 'auth_user_id' = auth.uid()::text
    AND data ->> 'active' = 'true'
    AND data ->> 'account_status' = 'Active'
    AND COALESCE(data ->> 'employee_status', '') <> 'Exited'
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'An active linked CRM employee is required'; END IF;
  actor_employee_id := employee_record.id::text;
  IF NEW.stage = 'Quotation Sent' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    SELECT max((version.value ->> 'version')::integer)
    INTO latest_quotation_version
    FROM jsonb_array_elements(COALESCE(NEW.data -> 'costing_versions', '[]'::jsonb)) version(value);
    IF latest_quotation_version IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(NEW.data -> 'review_support' -> 'quotation_reviews', '[]'::jsonb)) review(value)
        WHERE (review.value ->> 'quotation_version')::integer = latest_quotation_version
          AND review.value ->> 'status' IN ('Requested', 'Assigned', 'In Review', 'Pending Review', 'Under Review')
      ) THEN
        RAISE EXCEPTION 'The current quotation version has an active review';
      END IF;

      SELECT review.value ->> 'status'
      INTO current_quotation_review_status
      FROM jsonb_array_elements(COALESCE(NEW.data -> 'review_support' -> 'quotation_reviews', '[]'::jsonb)) review(value)
      WHERE (review.value ->> 'quotation_version')::integer = latest_quotation_version
      ORDER BY review.value ->> 'requested_at' DESC
      LIMIT 1;

      IF current_quotation_review_status = 'Returned' OR (
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(NEW.data -> 'review_support' -> 'quotation_reviews', '[]'::jsonb)) review(value)
          WHERE (review.value ->> 'quotation_version')::integer < latest_quotation_version
            AND review.value ->> 'status' = 'Returned'
        ) AND current_quotation_review_status IS DISTINCT FROM 'Approved'
      ) THEN
        RAISE EXCEPTION 'The current quotation version must be approved after a returned version';
      END IF;
    END IF;
  END IF;
  IF public.is_linked_super_admin() THEN RETURN NEW; END IF;
  is_owner := OLD.owner_user_id = auth.uid()
    OR OLD.owner_user_id = (employee_record.data ->> 'auth_user_id')::uuid;
  is_manager := employee_record.data ->> 'role' = 'Sales Manager'
    AND employee_record.data ->> 'department' = 'Sales'
    AND (
      EXISTS (
        SELECT 1 FROM public.crm_employees query_owner
        WHERE query_owner.data ->> 'department' = 'Sales'
          AND query_owner.data ->> 'unit' = employee_record.data ->> 'unit'
          AND query_owner.data ->> 'auth_user_id' = OLD.owner_user_id::text
      )
      OR (OLD.owner_user_id IS NULL AND COALESCE(OLD.data ->> 'owner', '') IN ('', 'Unassigned')
        AND (OLD.data ->> 'primary_unit' = employee_record.data ->> 'unit'
          OR COALESCE(OLD.data -> 'participating_units', '[]'::jsonb) ? (employee_record.data ->> 'unit')))
    );
  can_assign := is_owner OR is_manager;

  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR NEW.owner IS DISTINCT FROM OLD.owner THEN
    IF NOT is_manager OR NEW.owner_user_id IS NULL OR NEW.owner IS DISTINCT FROM NEW.data ->> 'owner'
      OR NEW.data ->> 'assignment_status' IS DISTINCT FROM 'Assigned'
      OR COALESCE(NEW.data ->> 'assigned_by', '') NOT IN (employee_record.id::text, employee_record.data ->> 'name')
      OR NEW.data -> 'review_support' IS DISTINCT FROM OLD.data -> 'review_support'
      OR NEW.data -> 'reviewer_employee_ids' IS DISTINCT FROM OLD.data -> 'reviewer_employee_ids'
      OR NEW.data -> 'assistance_employee_ids' IS DISTINCT FROM OLD.data -> 'assistance_employee_ids'
      OR NEW.data -> 'shared_with_employee_ids' IS DISTINCT FROM OLD.data -> 'shared_with_employee_ids' THEN
      RAISE EXCEPTION 'Only an authorized Sales Manager may reassign this Query';
    END IF;
    SELECT * INTO owner_target
    FROM public.crm_employees target
    WHERE target.data ->> 'auth_user_id' = NEW.owner_user_id::text
      AND target.data ->> 'department' = 'Sales'
      AND target.data ->> 'active' = 'true'
      AND target.data ->> 'account_status' = 'Active'
      AND COALESCE(target.data ->> 'employee_status', '') <> 'Exited'
      AND target.data ->> 'unit' = employee_record.data ->> 'unit'
      AND (target.id::text = NEW.owner OR target.data ->> 'name' = NEW.owner)
      AND target.data ->> 'auth_user_id' <> auth.uid()::text
    LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'New Query owner must be an active Sales employee in your unit'; END IF;
    IF (NEW.data - ARRAY['owner', 'assignment_status', 'assigned_on', 'assigned_at', 'assigned_by',
        'assignment_history', 'last_updated_by', 'last_activity_at', 'activities', 'lifecycle', 'first_action_at'])
        IS DISTINCT FROM
       (OLD.data - ARRAY['owner', 'assignment_status', 'assigned_on', 'assigned_at', 'assigned_by',
        'assignment_history', 'last_updated_by', 'last_activity_at', 'activities', 'lifecycle', 'first_action_at']) THEN
      RAISE EXCEPTION 'Query reassignment cannot modify unrelated Query data';
    END IF;
    assignment_history := COALESCE(NEW.data -> 'assignment_history', '[]'::jsonb);
    IF jsonb_typeof(assignment_history) <> 'array'
      OR jsonb_array_length(assignment_history) <> jsonb_array_length(COALESCE(OLD.data -> 'assignment_history', '[]'::jsonb)) + 1
      OR NOT (assignment_history @> COALESCE(OLD.data -> 'assignment_history', '[]'::jsonb)) THEN
      RAISE EXCEPTION 'Query reassignment must append an assignment-history record';
    END IF;
    last_assignment := assignment_history -> -1;
    IF last_assignment ->> 'assigned_to' IS DISTINCT FROM NEW.owner
      OR COALESCE(last_assignment ->> 'assigned_by', '') NOT IN (employee_record.id::text, employee_record.data ->> 'name')
      OR NULLIF(last_assignment ->> 'assigned_at', '') IS NULL
      OR (COALESCE(OLD.data ->> 'owner', '') NOT IN ('', 'Unassigned')
        AND last_assignment ->> 'assigned_from' IS DISTINCT FROM OLD.owner) THEN
      RAISE EXCEPTION 'Query assignment history does not match the authenticated manager and owner';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT is_owner AND (
    NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR NEW.owner IS DISTINCT FROM OLD.owner
  ) THEN
    RAISE EXCEPTION 'Review/support access cannot change query ownership';
  END IF;
  IF NOT is_owner THEN
    IF (NEW.data - 'review_support' - 'reviewer_employee_ids' - 'assistance_employee_ids' - 'shared_with_employee_ids')
       IS DISTINCT FROM
       (OLD.data - 'review_support' - 'reviewer_employee_ids' - 'assistance_employee_ids' - 'shared_with_employee_ids') THEN
      RAISE EXCEPTION 'Assigned reviewers/helpers may update review/support data only';
    END IF;
  END IF;
  IF NOT is_owner AND (
    NEW.data -> 'reviewer_employee_ids' IS DISTINCT FROM OLD.data -> 'reviewer_employee_ids'
    OR NEW.data -> 'assistance_employee_ids' IS DISTINCT FROM OLD.data -> 'assistance_employee_ids'
    OR NEW.data -> 'shared_with_employee_ids' IS DISTINCT FROM OLD.data -> 'shared_with_employee_ids'
  ) THEN
    RAISE EXCEPTION 'Assigned reviewers/helpers cannot grant or remove Query access';
  END IF;
  IF NEW.data -> 'review_support' IS DISTINCT FROM OLD.data -> 'review_support'
    AND NOT public.review_support_mutation_allowed(
      OLD.data, NEW.data, actor_employee_id, can_assign, is_manager
    ) THEN
    RAISE EXCEPTION 'Only authorized requesters, assignees, or team managers may update this workflow';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_review_support_query_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS guard_review_support_query_update ON public.crm_queries;
CREATE TRIGGER guard_review_support_query_update
BEFORE UPDATE ON public.crm_queries
FOR EACH ROW EXECUTE FUNCTION public.guard_review_support_query_update();

DROP POLICY IF EXISTS "CRM users read permitted events" ON public.crm_events;
DROP POLICY IF EXISTS "CRM users read explicit query events" ON public.crm_events;
CREATE POLICY "CRM users read explicit query events"
ON public.crm_events FOR SELECT TO authenticated
USING (
  public.is_linked_super_admin()
  OR (query_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.crm_queries q
    WHERE q.query_id = crm_events.query_id
      AND public.can_access_crm_query(q.data, q.owner_user_id)
  ))
);

DROP POLICY IF EXISTS "Signed-in users append CRM events" ON public.crm_events;
CREATE POLICY "CRM users append own permitted events"
ON public.crm_events FOR INSERT TO authenticated
WITH CHECK (
  public.is_linked_super_admin()
  OR (
    public.current_crm_employee_id() IS NOT NULL
    AND (
      data ->> 'by' = public.current_crm_employee_id()
      OR EXISTS (
        SELECT 1 FROM public.crm_employees employee
        WHERE employee.id::text = public.current_crm_employee_id()
          AND employee.data ->> 'name' = data ->> 'by'
      )
    )
    AND query_id IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM public.crm_queries q
        WHERE q.query_id = crm_events.query_id
          AND public.can_access_crm_query(q.data, q.owner_user_id)
      )
  )
);

-- Workflow notifications are generated from committed query changes by a
-- SECURITY DEFINER trigger below. Authenticated clients may not forge them.
DROP POLICY IF EXISTS "Signed-in users create CRM notifications" ON public.crm_notifications;
DROP POLICY IF EXISTS "CRM clients cannot forge workflow notifications" ON public.crm_notifications;
CREATE POLICY "CRM clients cannot forge workflow notifications"
ON public.crm_notifications FOR INSERT TO authenticated WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.notify_review_support_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_support jsonb := '{}'::jsonb;
  new_support jsonb;
  old_items jsonb;
  new_items jsonb;
  item jsonb;
  previous_item jsonb;
  recipient_employee_id text;
  notification_category text;
  notification_message text;
  review_key text;
BEGIN
  new_support := COALESCE(NEW.data -> 'review_support', '{}'::jsonb);
  IF TG_OP = 'UPDATE' THEN
    old_support := COALESCE(OLD.data -> 'review_support', '{}'::jsonb);
  END IF;

  FOREACH review_key IN ARRAY ARRAY['query_reviews', 'quotation_reviews'] LOOP
    old_items := COALESCE(old_support -> review_key, '[]'::jsonb);
    new_items := COALESCE(new_support -> review_key, '[]'::jsonb);
    FOR item IN SELECT value FROM jsonb_array_elements(new_items) LOOP
      previous_item := NULL;
      SELECT value INTO previous_item FROM jsonb_array_elements(old_items)
      WHERE value ->> 'id' = item ->> 'id';
      IF previous_item IS NULL THEN
        recipient_employee_id := item ->> 'reviewer_employee_id';
        notification_category := CASE WHEN review_key = 'query_reviews'
          THEN 'QUERY_REVIEW_REQUESTED' ELSE 'QUOTATION_REVIEW_REQUESTED' END;
        notification_message := CASE WHEN review_key = 'query_reviews'
          THEN format('Query review requested for %s.', NEW.query_id)
          ELSE format('Quotation V%s review requested for %s.', item ->> 'quotation_version', NEW.query_id) END;
      ELSIF previous_item ->> 'reviewer_employee_id' IS DISTINCT FROM item ->> 'reviewer_employee_id' THEN
        recipient_employee_id := item ->> 'reviewer_employee_id';
        notification_category := CASE WHEN review_key = 'query_reviews'
          THEN 'QUERY_REVIEW_ASSIGNED' ELSE 'QUOTATION_REVIEW_ASSIGNED' END;
        notification_message := format('%s review assigned to you for %s.',
          CASE WHEN review_key = 'query_reviews' THEN 'Query' ELSE 'Quotation' END,
          NEW.query_id);
      ELSIF previous_item ->> 'status' IS DISTINCT FROM item ->> 'status'
        AND item ->> 'status' IN ('Approved', 'Returned') THEN
        recipient_employee_id := item ->> 'requested_by_employee_id';
        notification_category := CASE
          WHEN review_key = 'query_reviews' THEN 'QUERY_REVIEW_' || upper(item ->> 'status')
          ELSE 'QUOTATION_REVIEW_' || upper(item ->> 'status') END;
        notification_message := format('%s review %s for %s.',
          CASE WHEN review_key = 'query_reviews' THEN 'Query' ELSE 'Quotation' END,
          lower(item ->> 'status'), NEW.query_id);
      ELSE
        CONTINUE;
      END IF;

      BEGIN
        INSERT INTO public.crm_notifications (
          id, recipient_user_id, recipient_name, query_id, kind, category, title, message,
          href, dedupe_key
        )
        SELECT gen_random_uuid()::text, (employee.data ->> 'auth_user_id')::uuid,
          employee.data ->> 'name', NEW.query_id, 'info', notification_category,
          replace(notification_category, '_', ' '), notification_message,
          '/queries/' || NEW.id, review_key || ':' || (item ->> 'id') || ':' || notification_category
        FROM public.crm_employees employee
        WHERE employee.id::text = recipient_employee_id
          AND employee.data ->> 'active' = 'true'
          AND employee.data ->> 'account_status' = 'Active'
          AND NULLIF(employee.data ->> 'auth_user_id', '') IS NOT NULL
        ON CONFLICT DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Review notification was not persisted for query %: %', NEW.query_id, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  old_items := COALESCE(old_support -> 'assistance', '[]'::jsonb);
  new_items := COALESCE(new_support -> 'assistance', '[]'::jsonb);
  FOR item IN SELECT value FROM jsonb_array_elements(new_items) LOOP
    previous_item := NULL;
    SELECT value INTO previous_item FROM jsonb_array_elements(old_items)
    WHERE value ->> 'id' = item ->> 'id';
    IF previous_item IS NULL THEN
      recipient_employee_id := item ->> 'assistant_employee_id';
      notification_category := 'ASSISTANCE_REQUESTED';
      notification_message := format('Assistance requested for Query %s.', NEW.query_id);
    ELSIF previous_item ->> 'assistant_employee_id' IS DISTINCT FROM item ->> 'assistant_employee_id' THEN
      recipient_employee_id := item ->> 'assistant_employee_id';
      notification_category := 'ASSISTANCE_ASSIGNED';
      notification_message := format('Assistance assigned to you for Query %s.', NEW.query_id);
    ELSIF previous_item ->> 'status' IS DISTINCT FROM item ->> 'status'
      AND item ->> 'status' = 'Completed' THEN
      recipient_employee_id := item ->> 'assigned_by_employee_id';
      notification_category := 'ASSISTANCE_COMPLETED';
      notification_message := format('Assistance completed for Query %s.', NEW.query_id);
    ELSE
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.crm_notifications (
        id, recipient_user_id, recipient_name, query_id, kind, category, title, message,
        href, dedupe_key
      )
      SELECT gen_random_uuid()::text, (employee.data ->> 'auth_user_id')::uuid,
        employee.data ->> 'name', NEW.query_id, 'info', notification_category,
        replace(notification_category, '_', ' '), notification_message,
        '/queries/' || NEW.id, 'assistance:' || (item ->> 'id') || ':' || notification_category
      FROM public.crm_employees employee
      WHERE employee.id::text = recipient_employee_id
        AND employee.data ->> 'active' = 'true'
        AND employee.data ->> 'account_status' = 'Active'
        AND NULLIF(employee.data ->> 'auth_user_id', '') IS NOT NULL
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Assistance notification was not persisted for query %: %', NEW.query_id, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Review/support notification generation failed for query %: %', NEW.query_id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_review_support_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS notify_review_support_change ON public.crm_queries;
CREATE TRIGGER notify_review_support_change
AFTER INSERT OR UPDATE OF data ON public.crm_queries
FOR EACH ROW EXECUTE FUNCTION public.notify_review_support_change();
