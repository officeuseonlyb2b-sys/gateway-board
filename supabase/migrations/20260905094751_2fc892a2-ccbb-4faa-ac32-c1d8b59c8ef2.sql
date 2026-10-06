CREATE TABLE public.crm_employees (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_employees TO authenticated;
GRANT ALL ON public.crm_employees TO service_role;
ALTER TABLE public.crm_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users manage employees" ON public.crm_employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.crm_queries (
  id text PRIMARY KEY,
  query_id text,
  owner text,
  stage text,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_queries_query_id_idx ON public.crm_queries (query_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_queries TO authenticated;
GRANT ALL ON public.crm_queries TO service_role;
ALTER TABLE public.crm_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users manage queries" ON public.crm_queries FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.crm_tasks (
  id text PRIMARY KEY,
  query_id text,
  owner text,
  done boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_tasks_query_id_idx ON public.crm_tasks (query_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tasks TO authenticated;
GRANT ALL ON public.crm_tasks TO service_role;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users manage tasks" ON public.crm_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.crm_events (
  id text PRIMARY KEY,
  query_id text,
  at timestamptz,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_events_at_idx ON public.crm_events (at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_events TO authenticated;
GRANT ALL ON public.crm_events TO service_role;
ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users manage events" ON public.crm_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER crm_queries_updated_at BEFORE UPDATE ON public.crm_queries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER crm_tasks_updated_at BEFORE UPDATE ON public.crm_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER crm_employees_updated_at BEFORE UPDATE ON public.crm_employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_queries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_employees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_events;