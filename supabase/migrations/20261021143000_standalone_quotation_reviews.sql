-- Standalone quotation review snapshots are deliberately separate from Queries.
-- Assignment grants access to this row only; Query RLS remains unchanged.
CREATE TABLE IF NOT EXISTS public.crm_standalone_quotation_reviews (
  id text PRIMARY KEY,
  requester_employee_id text NOT NULL,
  reviewer_employee_id text NOT NULL,
  creator_employee_id text NOT NULL,
  prepared_by_employee_id text NOT NULL,
  assigned_to_employee_id text NOT NULL,
  draft_id text NOT NULL,
  snapshot_id text NOT NULL,
  quotation_family_id text,
  query_id text,
  status text NOT NULL,
  reason text NOT NULL,
  priority text NOT NULL DEFAULT 'Normal',
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  return_notes text,
  snapshot jsonb NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_standalone_quotation_reviews ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_standalone_quotation_review(
  requester_id text, reviewer_id text, creator_id text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_linked_super_admin()
    OR public.current_crm_employee_id() IN (requester_id, reviewer_id, creator_id)
    OR EXISTS (
      SELECT 1
      FROM public.crm_employees manager
      JOIN public.crm_employees creator ON creator.id::text = creator_id
      WHERE manager.data ->> 'auth_user_id' = auth.uid()::text
        AND manager.data ->> 'role' = 'Sales Manager'
        AND manager.data ->> 'department' = 'Sales'
        AND manager.data ->> 'active' = 'true'
        AND manager.data ->> 'account_status' = 'Active'
        AND manager.data ->> 'unit' = creator.data ->> 'unit'
    )
$$;

REVOKE ALL ON FUNCTION public.can_access_standalone_quotation_review(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_standalone_quotation_review(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_assign_standalone_quotation_reviewer(
  requester_id text, reviewer_id text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT requester_id = public.current_crm_employee_id()
    AND requester_id <> reviewer_id
    AND EXISTS (
      SELECT 1
      FROM public.crm_employees requester
      JOIN public.crm_employees reviewer ON reviewer.id::text = reviewer_id
      WHERE requester.id::text = requester_id
        AND reviewer.data ->> 'department' = 'Sales'
        AND reviewer.data ->> 'active' = 'true'
        AND reviewer.data ->> 'account_status' = 'Active'
        AND COALESCE(reviewer.data ->> 'employee_status', '') <> 'Exited'
        AND (
          NULLIF(lower(btrim(requester.data ->> 'unit')), '') IS NULL
          OR NULLIF(lower(btrim(reviewer.data ->> 'unit')), '') IS NULL
          OR lower(btrim(requester.data ->> 'unit')) = lower(btrim(reviewer.data ->> 'unit'))
        )
        AND (
          (requester.data ->> 'role' = 'Sales Executive'
            AND reviewer.data ->> 'role' IN ('Senior Sales Executive', 'Sales Manager'))
          OR (requester.data ->> 'role' = 'Senior Sales Executive'
            AND reviewer.data ->> 'role' IN ('Senior Sales Executive', 'Sales Manager'))
          OR (requester.data ->> 'role' = 'Sales Manager'
            AND reviewer.data ->> 'role' IN ('Senior Sales Executive', 'Sales Manager'))
          OR requester.data ->> 'role' = 'Super Admin'
        )
    )
$$;

REVOKE ALL ON FUNCTION public.can_assign_standalone_quotation_reviewer(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_assign_standalone_quotation_reviewer(text, text) TO authenticated;

DROP POLICY IF EXISTS standalone_review_select ON public.crm_standalone_quotation_reviews;
CREATE POLICY standalone_review_select ON public.crm_standalone_quotation_reviews
FOR SELECT TO authenticated USING (
  public.can_access_standalone_quotation_review(
    requester_employee_id, reviewer_employee_id, creator_employee_id
  )
);

DROP POLICY IF EXISTS standalone_review_insert ON public.crm_standalone_quotation_reviews;
CREATE POLICY standalone_review_insert ON public.crm_standalone_quotation_reviews
FOR INSERT TO authenticated WITH CHECK (
  requester_employee_id = public.current_crm_employee_id()
  AND creator_employee_id = requester_employee_id
  AND data ->> 'requested_by_employee_id' = requester_employee_id
  AND data ->> 'reviewer_employee_id' = reviewer_employee_id
  AND data ->> 'assigned_to_employee_id' = assigned_to_employee_id
  AND data ->> 'created_by_employee_id' = creator_employee_id
  AND assigned_to_employee_id = reviewer_employee_id
  AND prepared_by_employee_id = creator_employee_id
  AND COALESCE(
    data #>> '{quotation_snapshot,prepared_by_employee_id}',
    data #>> '{quotation_snapshot,quote,prepared_by_employee_id}'
  ) = creator_employee_id
  AND query_id IS NULL
  AND data ->> 'source_type' = 'standalone_draft'
  AND data -> 'quotation_snapshot' IS NOT NULL
  AND status = data ->> 'status'
  AND snapshot = data -> 'quotation_snapshot'
  AND public.can_assign_standalone_quotation_reviewer(
    requester_employee_id, reviewer_employee_id
  )
);

DROP POLICY IF EXISTS standalone_review_update ON public.crm_standalone_quotation_reviews;
CREATE POLICY standalone_review_update ON public.crm_standalone_quotation_reviews
FOR UPDATE TO authenticated
USING (public.can_access_standalone_quotation_review(
  requester_employee_id, reviewer_employee_id, creator_employee_id
))
WITH CHECK (public.can_access_standalone_quotation_review(
  requester_employee_id, reviewer_employee_id, creator_employee_id
));

CREATE OR REPLACE FUNCTION public.guard_standalone_quotation_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM NEW.data ->> 'status' THEN
    RAISE EXCEPTION 'Standalone quotation review status columns must agree';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.requester_employee_id <> OLD.requester_employee_id
    OR NEW.reviewer_employee_id <> OLD.reviewer_employee_id
    OR NEW.creator_employee_id <> OLD.creator_employee_id
    OR NEW.prepared_by_employee_id <> OLD.prepared_by_employee_id
    OR NEW.assigned_to_employee_id <> OLD.assigned_to_employee_id
    OR NEW.draft_id <> OLD.draft_id
    OR NEW.snapshot_id <> OLD.snapshot_id
    OR NEW.quotation_family_id IS DISTINCT FROM OLD.quotation_family_id
    OR NEW.query_id IS DISTINCT FROM OLD.query_id
    OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.data -> 'quotation_snapshot' IS DISTINCT FROM OLD.data -> 'quotation_snapshot'
    OR NEW.data ->> 'draft_id' IS DISTINCT FROM OLD.data ->> 'draft_id'
    OR NEW.data ->> 'draft_snapshot_hash' IS DISTINCT FROM OLD.data ->> 'draft_snapshot_hash'
  ) THEN
    RAISE EXCEPTION 'Standalone quotation review identity and snapshot are immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
    AND NOT public.is_linked_super_admin() THEN
    IF public.current_crm_employee_id() = OLD.reviewer_employee_id THEN
      IF NOT (
        (OLD.status IN ('Requested', 'Assigned') AND NEW.status = 'In Review')
        OR (OLD.status = 'In Review' AND NEW.status IN ('Approved', 'Returned'))
      ) THEN
        RAISE EXCEPTION 'Invalid standalone quotation review transition';
      END IF;
      IF NEW.status = 'Returned' AND NULLIF(btrim(NEW.data ->> 'decision_note'), '') IS NULL THEN
        RAISE EXCEPTION 'Correction instructions are required';
      END IF;
    ELSIF public.current_crm_employee_id() IN (
      OLD.requester_employee_id, OLD.creator_employee_id
    ) THEN
      IF NEW.status <> 'Cancelled' OR OLD.status NOT IN ('Requested', 'Assigned', 'In Review') THEN
        RAISE EXCEPTION 'Requester may only cancel an active review';
      END IF;
    ELSE
      RAISE EXCEPTION 'Only the assigned reviewer may update this review';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_standalone_quotation_review ON public.crm_standalone_quotation_reviews;
CREATE TRIGGER guard_standalone_quotation_review
BEFORE UPDATE ON public.crm_standalone_quotation_reviews
FOR EACH ROW EXECUTE FUNCTION public.guard_standalone_quotation_review();

GRANT SELECT, INSERT, UPDATE ON public.crm_standalone_quotation_reviews TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'crm_standalone_quotation_reviews'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_standalone_quotation_reviews;
  END IF;
END $$;

-- Quotation review eligibility is role/capability based, not Query or unit based.
CREATE OR REPLACE FUNCTION public.crm_review_employee_directory()
RETURNS TABLE(id text, name text, role text, department text, unit text, auth_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT target.id::text, target.data ->> 'name', target.data ->> 'role',
    target.data ->> 'department', target.data ->> 'unit', NULL::uuid
  FROM public.crm_employees actor
  JOIN public.crm_employees target ON target.id <> actor.id
  WHERE actor.data ->> 'auth_user_id' = auth.uid()::text
    AND actor.data ->> 'active' = 'true'
    AND actor.data ->> 'account_status' = 'Active'
    AND target.data ->> 'department' = 'Sales'
    AND target.data ->> 'active' = 'true'
    AND target.data ->> 'account_status' = 'Active'
    AND NULLIF(target.data ->> 'auth_user_id', '') IS NOT NULL
    AND COALESCE(target.data ->> 'employee_status', '') <> 'Exited'
    AND (
      NULLIF(lower(btrim(actor.data ->> 'unit')), '') IS NULL
      OR NULLIF(lower(btrim(target.data ->> 'unit')), '') IS NULL
      OR lower(btrim(actor.data ->> 'unit')) = lower(btrim(target.data ->> 'unit'))
    )
    AND (
      (actor.data ->> 'role' = 'Sales Executive'
        AND target.data ->> 'role' IN ('Senior Sales Executive', 'Sales Manager'))
      OR (actor.data ->> 'role' = 'Senior Sales Executive'
        AND target.data ->> 'role' IN ('Senior Sales Executive', 'Sales Manager'))
      OR (actor.data ->> 'role' = 'Sales Manager'
        AND target.data ->> 'role' IN ('Senior Sales Executive', 'Sales Manager'))
      OR actor.data ->> 'role' = 'Super Admin'
    )
  ORDER BY target.data ->> 'name'
$$;

CREATE OR REPLACE FUNCTION public.crm_review_target_allowed(
  target_employee_id text, actor_employee_id text, manager_reassignment boolean
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
      AND (
        NULLIF(lower(btrim(actor.data ->> 'unit')), '') IS NULL
        OR NULLIF(lower(btrim(target.data ->> 'unit')), '') IS NULL
        OR lower(btrim(actor.data ->> 'unit')) = lower(btrim(target.data ->> 'unit'))
      )
      AND (
        (manager_reassignment AND actor.data ->> 'role' = 'Sales Manager'
          AND target.data ->> 'role' IN ('Senior Sales Executive', 'Sales Manager'))
        OR (NOT manager_reassignment AND actor.data ->> 'role' = 'Sales Executive'
          AND target.data ->> 'role' IN ('Senior Sales Executive', 'Sales Manager'))
        OR (NOT manager_reassignment AND actor.data ->> 'role' = 'Senior Sales Executive'
          AND target.data ->> 'role' IN ('Senior Sales Executive', 'Sales Manager'))
        OR (NOT manager_reassignment AND actor.data ->> 'role' = 'Sales Manager'
          AND target.data ->> 'role' IN ('Senior Sales Executive', 'Sales Manager'))
      )
  )
$$;

REVOKE ALL ON FUNCTION public.crm_review_target_allowed(text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_review_target_allowed(text, text, boolean) FROM authenticated;
