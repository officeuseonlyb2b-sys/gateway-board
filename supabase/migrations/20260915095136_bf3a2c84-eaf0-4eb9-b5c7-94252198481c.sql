CREATE SEQUENCE IF NOT EXISTS public.crm_query_number_seq START WITH 1000;
GRANT USAGE, SELECT ON SEQUENCE public.crm_query_number_seq TO authenticated;
GRANT ALL ON SEQUENCE public.crm_query_number_seq TO service_role;

CREATE OR REPLACE FUNCTION public.next_crm_query_number()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT 'QRY-' || to_char(timezone('Asia/Kolkata', now()), 'DDMM') || '-' || lpad(nextval('public.crm_query_number_seq')::text, 4, '0')
$$;
GRANT EXECUTE ON FUNCTION public.next_crm_query_number() TO authenticated, service_role;

CREATE UNIQUE INDEX IF NOT EXISTS crm_queries_query_id_unique
  ON public.crm_queries (query_id)
  WHERE query_id IS NOT NULL;

ALTER TABLE public.crm_queries
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS sub_stage text,
  ADD COLUMN IF NOT EXISTS next_action_due timestamptz,
  ADD COLUMN IF NOT EXISTS lost_reason text,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz;

ALTER TABLE public.crm_tasks
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS item_kind text NOT NULL DEFAULT 'task',
  ADD COLUMN IF NOT EXISTS followup_type text,
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS completed_by text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS next_followup_at timestamptz,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS crm_tasks_dedupe_key_unique
  ON public.crm_tasks (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_tasks_due_status_idx
  ON public.crm_tasks (done, status, owner_user_id, created_at);

ALTER TABLE public.crm_events
  ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS crm_events_dedupe_key_unique
  ON public.crm_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_notifications (
  id text PRIMARY KEY,
  recipient_user_id uuid,
  recipient_name text,
  query_id text,
  task_id text,
  kind text NOT NULL DEFAULT 'info',
  category text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  message text NOT NULL,
  href text,
  dedupe_key text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_notifications TO authenticated;
GRANT ALL ON public.crm_notifications TO service_role;
ALTER TABLE public.crm_notifications ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS crm_notifications_dedupe_recipient_unique
  ON public.crm_notifications (recipient_user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_notifications_recipient_created_idx
  ON public.crm_notifications (recipient_user_id, created_at DESC);
CREATE TRIGGER crm_notifications_updated_at
  BEFORE UPDATE ON public.crm_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Signed-in users manage queries" ON public.crm_queries;
DROP POLICY IF EXISTS "Signed-in users manage tasks" ON public.crm_tasks;
DROP POLICY IF EXISTS "Signed-in users manage employees" ON public.crm_employees;
DROP POLICY IF EXISTS "Signed-in users manage events" ON public.crm_events;

CREATE POLICY "CRM users read permitted queries"
ON public.crm_queries FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'admin')
  OR owner_user_id = auth.uid()
  OR owner_user_id IS NULL
);
CREATE POLICY "CRM users create queries"
ON public.crm_queries FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'admin')
  OR owner_user_id = auth.uid()
  OR owner_user_id IS NULL
);
CREATE POLICY "CRM users update permitted queries"
ON public.crm_queries FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'admin')
  OR owner_user_id = auth.uid()
  OR owner_user_id IS NULL
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'admin')
  OR owner_user_id = auth.uid()
  OR owner_user_id IS NULL
);
CREATE POLICY "Managers delete queries"
ON public.crm_queries FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "CRM users read permitted tasks"
ON public.crm_tasks FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'admin')
  OR owner_user_id = auth.uid()
  OR owner_user_id IS NULL
);
CREATE POLICY "CRM users create tasks"
ON public.crm_tasks FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'admin')
  OR owner_user_id = auth.uid()
  OR owner_user_id IS NULL
);
CREATE POLICY "CRM users update permitted tasks"
ON public.crm_tasks FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'admin')
  OR owner_user_id = auth.uid()
  OR owner_user_id IS NULL
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'admin')
  OR owner_user_id = auth.uid()
  OR owner_user_id IS NULL
);
CREATE POLICY "Managers delete tasks"
ON public.crm_tasks FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Signed-in users read CRM employees"
ON public.crm_employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers create CRM employees"
ON public.crm_employees FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers update CRM employees"
ON public.crm_employees FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete CRM employees"
ON public.crm_employees FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "CRM users read permitted events"
ON public.crm_events FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'admin')
  OR query_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.crm_queries q
    WHERE q.query_id = crm_events.query_id
      AND (q.owner_user_id = auth.uid() OR q.owner_user_id IS NULL)
  )
);
CREATE POLICY "Signed-in users append CRM events"
ON public.crm_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins update CRM events"
ON public.crm_events FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete CRM events"
ON public.crm_events FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own CRM notifications"
ON public.crm_notifications FOR SELECT TO authenticated
USING (
  recipient_user_id = auth.uid()
  OR (recipient_user_id IS NULL AND recipient_name IS NULL)
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Signed-in users create CRM notifications"
ON public.crm_notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users update own CRM notifications"
ON public.crm_notifications FOR UPDATE TO authenticated
USING (recipient_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (recipient_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users delete own CRM notifications"
ON public.crm_notifications FOR DELETE TO authenticated
USING (recipient_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_notifications;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'staff')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;