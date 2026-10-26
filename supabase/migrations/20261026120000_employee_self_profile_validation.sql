-- Let an authenticated user read only their own linked Employee Master row so
-- the client can distinguish linkage, status, exit, and role validation errors.
-- This does not grant directory access or any write permission.
BEGIN;

DROP POLICY IF EXISTS employee_read_self ON public.crm_employees;
CREATE POLICY employee_read_self ON public.crm_employees
  FOR SELECT TO authenticated
  USING (data ->> 'auth_user_id' = auth.uid()::text);

COMMIT;
