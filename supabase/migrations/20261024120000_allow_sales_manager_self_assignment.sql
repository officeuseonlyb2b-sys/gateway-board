-- A manager may assign an accessible same-unit Query to themselves as well as
-- to another eligible Sales employee.  This preserves every other guard in
-- the existing assignment trigger.
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
  SELECT * INTO employee_record FROM public.crm_employees
  WHERE data ->> 'auth_user_id' = auth.uid()::text AND data ->> 'active' = 'true'
    AND data ->> 'account_status' = 'Active' AND COALESCE(data ->> 'employee_status', '') <> 'Exited'
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'An active linked CRM employee is required'; END IF;
  actor_employee_id := employee_record.id::text;
  IF NEW.stage = 'Quotation Sent' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    SELECT max((version.value ->> 'version')::integer) INTO latest_quotation_version
    FROM jsonb_array_elements(COALESCE(NEW.data -> 'costing_versions', '[]'::jsonb)) version(value);
    IF latest_quotation_version IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.data -> 'review_support' -> 'quotation_reviews', '[]'::jsonb)) review(value)
        WHERE (review.value ->> 'quotation_version')::integer = latest_quotation_version
          AND review.value ->> 'status' IN ('Requested', 'Assigned', 'In Review', 'Pending Review', 'Under Review')) THEN
        RAISE EXCEPTION 'The current quotation version has an active review';
      END IF;
      SELECT review.value ->> 'status' INTO current_quotation_review_status
      FROM jsonb_array_elements(COALESCE(NEW.data -> 'review_support' -> 'quotation_reviews', '[]'::jsonb)) review(value)
      WHERE (review.value ->> 'quotation_version')::integer = latest_quotation_version
      ORDER BY review.value ->> 'requested_at' DESC LIMIT 1;
      IF current_quotation_review_status = 'Returned' OR (EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.data -> 'review_support' -> 'quotation_reviews', '[]'::jsonb)) review(value)
        WHERE (review.value ->> 'quotation_version')::integer < latest_quotation_version AND review.value ->> 'status' = 'Returned')
        AND current_quotation_review_status IS DISTINCT FROM 'Approved') THEN
        RAISE EXCEPTION 'The current quotation version must be approved after a returned version';
      END IF;
    END IF;
  END IF;
  IF public.is_linked_super_admin() THEN RETURN NEW; END IF;
  is_owner := OLD.owner_user_id = auth.uid() OR OLD.owner_user_id = (employee_record.data ->> 'auth_user_id')::uuid;
  is_manager := employee_record.data ->> 'role' = 'Sales Manager' AND employee_record.data ->> 'department' = 'Sales'
    AND (EXISTS (SELECT 1 FROM public.crm_employees query_owner WHERE query_owner.data ->> 'department' = 'Sales'
          AND query_owner.data ->> 'unit' = employee_record.data ->> 'unit' AND query_owner.data ->> 'auth_user_id' = OLD.owner_user_id::text)
      OR (OLD.owner_user_id IS NULL AND COALESCE(OLD.data ->> 'owner', '') IN ('', 'Unassigned')
          AND (OLD.data ->> 'primary_unit' = employee_record.data ->> 'unit' OR COALESCE(OLD.data -> 'participating_units', '[]'::jsonb) ? (employee_record.data ->> 'unit'))));
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
    SELECT * INTO owner_target FROM public.crm_employees target
    WHERE target.data ->> 'auth_user_id' = NEW.owner_user_id::text AND target.data ->> 'department' = 'Sales'
      AND target.data ->> 'active' = 'true' AND target.data ->> 'account_status' = 'Active'
      AND COALESCE(target.data ->> 'employee_status', '') <> 'Exited'
      AND target.data ->> 'unit' = employee_record.data ->> 'unit'
      AND (target.id::text = NEW.owner OR target.data ->> 'name' = NEW.owner)
    LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'New Query owner must be an active Sales employee in your unit'; END IF;
    IF (NEW.data - ARRAY['owner','assignment_status','assigned_on','assigned_at','assigned_by','assignment_history','last_updated_by','last_activity_at','activities','lifecycle','first_action_at']) IS DISTINCT FROM
       (OLD.data - ARRAY['owner','assignment_status','assigned_on','assigned_at','assigned_by','assignment_history','last_updated_by','last_activity_at','activities','lifecycle','first_action_at']) THEN
      RAISE EXCEPTION 'Query reassignment cannot modify unrelated Query data';
    END IF;
    assignment_history := COALESCE(NEW.data -> 'assignment_history', '[]'::jsonb);
    IF jsonb_typeof(assignment_history) <> 'array' OR jsonb_array_length(assignment_history) <> jsonb_array_length(COALESCE(OLD.data -> 'assignment_history', '[]'::jsonb)) + 1
      OR NOT (assignment_history @> COALESCE(OLD.data -> 'assignment_history', '[]'::jsonb)) THEN RAISE EXCEPTION 'Query reassignment must append an assignment-history record'; END IF;
    last_assignment := assignment_history -> -1;
    IF last_assignment ->> 'assigned_to' IS DISTINCT FROM NEW.owner OR COALESCE(last_assignment ->> 'assigned_by', '') NOT IN (employee_record.id::text, employee_record.data ->> 'name')
      OR NULLIF(last_assignment ->> 'assigned_at', '') IS NULL OR (COALESCE(OLD.data ->> 'owner', '') NOT IN ('', 'Unassigned') AND last_assignment ->> 'assigned_from' IS DISTINCT FROM OLD.owner) THEN
      RAISE EXCEPTION 'Query assignment history does not match the authenticated manager and owner';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT is_owner AND (NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR NEW.owner IS DISTINCT FROM OLD.owner) THEN RAISE EXCEPTION 'Review/support access cannot change query ownership'; END IF;
  IF NOT is_owner AND (NEW.data - 'review_support' - 'reviewer_employee_ids' - 'assistance_employee_ids' - 'shared_with_employee_ids') IS DISTINCT FROM
                      (OLD.data - 'review_support' - 'reviewer_employee_ids' - 'assistance_employee_ids' - 'shared_with_employee_ids') THEN RAISE EXCEPTION 'Assigned reviewers/helpers may update review/support data only'; END IF;
  IF NOT is_owner AND (NEW.data -> 'reviewer_employee_ids' IS DISTINCT FROM OLD.data -> 'reviewer_employee_ids' OR NEW.data -> 'assistance_employee_ids' IS DISTINCT FROM OLD.data -> 'assistance_employee_ids' OR NEW.data -> 'shared_with_employee_ids' IS DISTINCT FROM OLD.data -> 'shared_with_employee_ids') THEN RAISE EXCEPTION 'Assigned reviewers/helpers cannot grant or remove Query access'; END IF;
  IF NEW.data -> 'review_support' IS DISTINCT FROM OLD.data -> 'review_support' AND NOT public.review_support_mutation_allowed(OLD.data, NEW.data, actor_employee_id, can_assign, is_manager) THEN RAISE EXCEPTION 'Only authorized requesters, assignees, or team managers may update this workflow'; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_review_support_query_update() FROM PUBLIC;
