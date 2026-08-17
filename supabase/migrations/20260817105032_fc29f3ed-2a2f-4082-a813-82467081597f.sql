CREATE TABLE public.destination_cities (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.destination_tours (
  id text PRIMARY KEY,
  city_id text NOT NULL REFERENCES public.destination_cities(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX destination_tours_city_id_idx ON public.destination_tours(city_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.destination_cities TO authenticated;
GRANT ALL ON public.destination_cities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.destination_tours TO authenticated;
GRANT ALL ON public.destination_tours TO service_role;

ALTER TABLE public.destination_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destination_tours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read cities" ON public.destination_cities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in users can insert cities" ON public.destination_cities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Signed-in users can update cities" ON public.destination_cities FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Signed-in users can delete cities" ON public.destination_cities FOR DELETE TO authenticated USING (true);

CREATE POLICY "Signed-in users can read tours" ON public.destination_tours FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in users can insert tours" ON public.destination_tours FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Signed-in users can update tours" ON public.destination_tours FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Signed-in users can delete tours" ON public.destination_tours FOR DELETE TO authenticated USING (true);

ALTER TABLE public.destination_cities REPLICA IDENTITY FULL;
ALTER TABLE public.destination_tours REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.destination_cities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.destination_tours;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TYPE public.app_role AS ENUM ('admin', 'staff');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();