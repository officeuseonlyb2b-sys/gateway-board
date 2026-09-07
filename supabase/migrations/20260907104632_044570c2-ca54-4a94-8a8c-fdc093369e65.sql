CREATE TABLE public.app_master_state (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  rev text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_master_state TO authenticated;
GRANT ALL ON public.app_master_state TO service_role;

ALTER TABLE public.app_master_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read master state"
  ON public.app_master_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in users insert master state"
  ON public.app_master_state FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Signed-in users update master state"
  ON public.app_master_state FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER app_master_state_updated_at
  BEFORE UPDATE ON public.app_master_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_master_state;