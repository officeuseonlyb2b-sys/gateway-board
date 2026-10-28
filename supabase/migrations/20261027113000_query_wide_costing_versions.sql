-- Costing versions are a single immutable sequence per CRM Query, regardless
-- of quotation family.  Retrying the same draft returns its existing version.
CREATE OR REPLACE FUNCTION public.finalize_crm_quotation_version(
  p_query_id text,
  p_quote jsonb,
  p_draft_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  query_row public.crm_queries%ROWTYPE;
  actor public.crm_employees%ROWTYPE;
  versions jsonb;
  quote_id text;
  quote_number text;
  next_version integer;
  saved_at text;
  final_quote jsonb;
  version_record jsonb;
  next_data jsonb;
BEGIN
  SELECT * INTO actor FROM public.crm_employees employee
  WHERE employee.data ->> 'auth_user_id' = auth.uid()::text
    AND employee.data ->> 'active' = 'true'
    AND employee.data ->> 'account_status' = 'Active'
    AND COALESCE(employee.data ->> 'employee_status', '') <> 'Exited'
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active linked CRM employee required'; END IF;

  SELECT * INTO query_row FROM public.crm_queries
  WHERE id = p_query_id OR query_id = p_query_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_crm_query(query_row.data, query_row.owner_user_id) THEN
    RAISE EXCEPTION 'Query access denied';
  END IF;

  versions := COALESCE(query_row.data -> 'costing_versions', '[]'::jsonb);
  -- A repeated request from the same saved draft is idempotent, including a
  -- retry after a network response was lost.
  IF p_draft_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(versions) item WHERE item.value ->> 'draft_id' = p_draft_id
  ) THEN RETURN query_row.data; END IF;

  quote_id := COALESCE(NULLIF(p_quote ->> 'id', ''), gen_random_uuid()::text);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(versions) item WHERE item.value -> 'quote' ->> 'id' = quote_id) THEN
    RAISE EXCEPTION 'Quotation version already exists';
  END IF;

  SELECT COALESCE(MAX((item.value ->> 'version')::integer), 0) + 1,
         MAX(item.value -> 'quote' ->> 'quote_number')
    INTO next_version, quote_number FROM jsonb_array_elements(versions) item;
  IF quote_number IS NULL THEN
    quote_number := format('QT-%s-%s', to_char(CURRENT_DATE, 'YYYY'), lpad(nextval('public.crm_quotation_number_seq')::text, 5, '0'));
  END IF;
  saved_at := clock_timestamp()::text;
  final_quote := p_quote || jsonb_build_object(
    'id', quote_id, 'query_id', query_row.query_id, 'version', next_version,
    'quote_number', quote_number, 'display_number', quote_number || ' · V' || next_version,
    'saved_at', saved_at, 'generated_at', saved_at, 'saved_by', actor.data ->> 'name',
    'generated_by', actor.data ->> 'name', 'prepared_by_employee_id', actor.id::text,
    'prepared_by_auth_user_id', auth.uid()::text, 'prepared_by_name', actor.data ->> 'name',
    'prepared_by_role', actor.data ->> 'role'
  );
  version_record := jsonb_build_object(
    'version', next_version, 'saved_at', saved_at, 'saved_by', actor.data ->> 'name',
    'prepared_by_employee_id', actor.id::text, 'prepared_by_auth_user_id', auth.uid()::text,
    'prepared_by_name', actor.data ->> 'name', 'prepared_by_role', actor.data ->> 'role',
    'draft_id', p_draft_id, 'quote', final_quote
  );
  next_data := jsonb_set(query_row.data, '{costing_versions}', versions || jsonb_build_array(version_record), true);
  IF p_draft_id IS NOT NULL THEN
    next_data := jsonb_set(next_data, '{quotation_drafts}', COALESCE((
      SELECT jsonb_agg(item.value) FROM jsonb_array_elements(COALESCE(next_data -> 'quotation_drafts', '[]'::jsonb)) item
      WHERE item.value ->> 'id' <> p_draft_id), '[]'::jsonb), true);
  END IF;
  next_data := next_data || jsonb_build_object('last_costing_prepared_by', actor.data ->> 'name', 'last_quotation_prepared_by', actor.data ->> 'name', 'costing_completed_at', saved_at);
  UPDATE public.crm_queries SET data = next_data, updated_at = clock_timestamp() WHERE id = query_row.id;
  RETURN next_data;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_crm_quotation_version(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_crm_quotation_version(text, jsonb, text) TO authenticated;
