CREATE TABLE public.hotel_cities (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_cities TO authenticated;
GRANT ALL ON public.hotel_cities TO service_role;
ALTER TABLE public.hotel_cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read hotel cities" ON public.hotel_cities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Hotel editors create cities" ON public.hotel_cities FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role));
CREATE POLICY "Hotel editors update cities" ON public.hotel_cities FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role));
CREATE POLICY "Admins delete hotel cities" ON public.hotel_cities FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE UNIQUE INDEX hotel_cities_name_unique_idx ON public.hotel_cities (lower(btrim(name)));

CREATE TABLE public.hotels (
  id text PRIMARY KEY,
  city_id text NOT NULL REFERENCES public.hotel_cities(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name text NOT NULL,
  hotel_category text NOT NULL,
  hotel_type text,
  contact_name text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  has_wifi boolean NOT NULL DEFAULT false,
  has_pool boolean NOT NULL DEFAULT false,
  address text NOT NULL DEFAULT '',
  blackout_ranges jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotels TO authenticated;
GRANT ALL ON public.hotels TO service_role;
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read hotels" ON public.hotels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Hotel editors create hotels" ON public.hotels FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role));
CREATE POLICY "Hotel editors update hotels" ON public.hotels FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role));
CREATE POLICY "Admins delete hotels" ON public.hotels FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE UNIQUE INDEX hotels_city_name_unique_idx ON public.hotels (city_id, lower(btrim(name)));
CREATE INDEX hotels_city_idx ON public.hotels(city_id);
CREATE INDEX hotels_category_idx ON public.hotels(hotel_category);

CREATE TABLE public.hotel_rooms (
  id text PRIMARY KEY,
  hotel_id text NOT NULL REFERENCES public.hotels(id) ON UPDATE CASCADE ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_rooms TO authenticated;
GRANT ALL ON public.hotel_rooms TO service_role;
ALTER TABLE public.hotel_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read hotel rooms" ON public.hotel_rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Hotel editors create rooms" ON public.hotel_rooms FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role));
CREATE POLICY "Hotel editors update rooms" ON public.hotel_rooms FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role));
CREATE POLICY "Admins delete rooms" ON public.hotel_rooms FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE UNIQUE INDEX hotel_rooms_hotel_name_unique_idx ON public.hotel_rooms (hotel_id, lower(btrim(name)));
CREATE INDEX hotel_rooms_hotel_idx ON public.hotel_rooms(hotel_id);

CREATE TABLE public.hotel_rates (
  id text PRIMARY KEY,
  room_id text NOT NULL REFERENCES public.hotel_rooms(id) ON UPDATE CASCADE ON DELETE CASCADE,
  validity_start date NOT NULL,
  validity_end date NOT NULL,
  season_label text NOT NULL DEFAULT 'Season',
  meal_plan text NOT NULL,
  double_rate numeric NOT NULL DEFAULT 0,
  single_rate numeric NOT NULL DEFAULT 0,
  quad_rate numeric,
  extra_bed_rate numeric NOT NULL DEFAULT 0,
  cwb_rate numeric,
  cwb_rule_text text,
  lunch_rate numeric,
  dinner_rate numeric,
  extra_breakfast_rate numeric,
  xmas_supplement numeric,
  xmas_supplement_type text,
  xmas_date_from date,
  xmas_date_to date,
  newyear_supplement numeric,
  newyear_supplement_type text,
  newyear_date_from date,
  newyear_date_to date,
  remarks text,
  include_in_quote boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_rates TO authenticated;
GRANT ALL ON public.hotel_rates TO service_role;
ALTER TABLE public.hotel_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read hotel rates" ON public.hotel_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Hotel editors create rates" ON public.hotel_rates FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role));
CREATE POLICY "Hotel editors update rates" ON public.hotel_rates FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role));
CREATE POLICY "Admins delete rates" ON public.hotel_rates FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX hotel_rates_room_idx ON public.hotel_rates(room_id);
CREATE INDEX hotel_rates_validity_idx ON public.hotel_rates(validity_start, validity_end);

CREATE TRIGGER hotel_cities_updated_at BEFORE UPDATE ON public.hotel_cities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER hotels_updated_at BEFORE UPDATE ON public.hotels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER hotel_rooms_updated_at BEFORE UPDATE ON public.hotel_rooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER hotel_rates_updated_at BEFORE UPDATE ON public.hotel_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.hotel_cities (id, name)
SELECT c->>'id', c->>'name'
FROM public.app_master_state s CROSS JOIN LATERAL jsonb_array_elements(s.data->'cities') c
WHERE s.id = 'shared' AND nullif(c->>'id','') IS NOT NULL AND nullif(btrim(c->>'name'),'') IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.hotels (id, city_id, name, hotel_category, hotel_type, contact_name, contact_phone, email, has_wifi, has_pool, address, blackout_ranges, created_at, updated_at)
SELECT h->>'id', h->>'city_id', h->>'name', coalesce(nullif(h->>'hotel_category',''),'3 Star'), nullif(h->>'hotel_type',''), coalesce(h->>'contact_name',''), coalesce(h->>'contact_phone',''), coalesce(h->>'email',''), coalesce((h->>'has_wifi')::boolean,false), coalesce((h->>'has_pool')::boolean,false), coalesce(h->>'address',''), coalesce(h->'blackout_ranges','[]'::jsonb), coalesce((h->>'created_at')::timestamptz,now()), coalesce((h->>'updated_at')::timestamptz,now())
FROM public.app_master_state s CROSS JOIN LATERAL jsonb_array_elements(s.data->'hotels') h
WHERE s.id = 'shared' AND nullif(h->>'id','') IS NOT NULL AND nullif(h->>'city_id','') IS NOT NULL AND nullif(btrim(h->>'name'),'') IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.hotel_rooms (id, hotel_id, name, created_at, updated_at)
SELECT r->>'id', r->>'hotel_id', r->>'name', coalesce((r->>'created_at')::timestamptz,now()), coalesce((r->>'created_at')::timestamptz,now())
FROM public.app_master_state s CROSS JOIN LATERAL jsonb_array_elements(s.data->'room_categories') r
WHERE s.id = 'shared' AND nullif(r->>'id','') IS NOT NULL AND nullif(r->>'hotel_id','') IS NOT NULL AND nullif(btrim(r->>'name'),'') IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.hotel_rates (id, room_id, validity_start, validity_end, season_label, meal_plan, double_rate, single_rate, quad_rate, extra_bed_rate, cwb_rate, cwb_rule_text, lunch_rate, dinner_rate, extra_breakfast_rate, xmas_supplement, xmas_supplement_type, xmas_date_from, xmas_date_to, newyear_supplement, newyear_supplement_type, newyear_date_from, newyear_date_to, remarks, include_in_quote, created_at, updated_at)
SELECT p->>'id', p->>'room_category_id', (p->>'validity_start')::date, (p->>'validity_end')::date, coalesce(nullif(p->>'season_label',''),'Season'), p->>'meal_plan', coalesce((p->>'double_rate')::numeric,0), coalesce((p->>'single_rate')::numeric,0), nullif(p->>'quad_rate','')::numeric, coalesce((p->>'extra_bed_rate')::numeric,0), nullif(p->>'cwb_rate','')::numeric, nullif(p->>'cwb_rule_text',''), nullif(p->>'lunch_rate','')::numeric, nullif(p->>'dinner_rate','')::numeric, nullif(p->>'extra_breakfast_rate','')::numeric, nullif(p->>'xmas_supplement','')::numeric, nullif(p->>'xmas_supplement_type',''), nullif(p->>'xmas_date_from','')::date, nullif(p->>'xmas_date_to','')::date, nullif(p->>'newyear_supplement','')::numeric, nullif(p->>'newyear_supplement_type',''), nullif(p->>'newyear_date_from','')::date, nullif(p->>'newyear_date_to','')::date, nullif(p->>'remarks',''), coalesce((p->>'include_in_quote')::boolean,true), coalesce((p->>'created_at')::timestamptz,now()), coalesce((p->>'updated_at')::timestamptz,now())
FROM public.app_master_state s CROSS JOIN LATERAL jsonb_array_elements(s.data->'rate_plans') p
WHERE s.id = 'shared' AND nullif(p->>'id','') IS NOT NULL AND nullif(p->>'room_category_id','') IS NOT NULL AND nullif(p->>'validity_start','') IS NOT NULL AND nullif(p->>'validity_end','') IS NOT NULL AND nullif(p->>'meal_plan','') IS NOT NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.hotel_cities REPLICA IDENTITY FULL;
ALTER TABLE public.hotels REPLICA IDENTITY FULL;
ALTER TABLE public.hotel_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.hotel_rates REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_cities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hotels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_rates;

CREATE OR REPLACE FUNCTION public.save_hotel_bundle(p_hotel jsonb, p_rooms jsonb, p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_hotel_id text := p_hotel->>'id';
  v_room jsonb;
  v_rate jsonb;
  v_room_ids text[] := ARRAY[]::text[];
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)) THEN
    RAISE EXCEPTION 'Hotel editor permission required' USING ERRCODE = '42501';
  END IF;
  IF nullif(v_hotel_id, '') IS NULL OR nullif(p_hotel->>'city_id','') IS NULL OR nullif(btrim(p_hotel->>'name'),'') IS NULL THEN
    RAISE EXCEPTION 'Hotel id, city, and name are required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hotels WHERE city_id = p_hotel->>'city_id' AND lower(btrim(name)) = lower(btrim(p_hotel->>'name')) AND id <> v_hotel_id) THEN
    RAISE EXCEPTION 'A hotel with this name already exists in the selected city' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hotels WHERE id = v_hotel_id) THEN
    IF p_expected_updated_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.hotels WHERE id = v_hotel_id AND updated_at = p_expected_updated_at) THEN
      RAISE EXCEPTION 'This hotel was updated by another user. Reload and try again.' USING ERRCODE = '40001';
    END IF;
    UPDATE public.hotels SET city_id=p_hotel->>'city_id', name=btrim(p_hotel->>'name'), hotel_category=p_hotel->>'hotel_category', hotel_type=nullif(p_hotel->>'hotel_type',''), contact_name=coalesce(p_hotel->>'contact_name',''), contact_phone=coalesce(p_hotel->>'contact_phone',''), email=coalesce(p_hotel->>'email',''), has_wifi=coalesce((p_hotel->>'has_wifi')::boolean,false), has_pool=coalesce((p_hotel->>'has_pool')::boolean,false), address=coalesce(p_hotel->>'address',''), blackout_ranges=coalesce(p_hotel->'blackout_ranges','[]'::jsonb) WHERE id=v_hotel_id;
  ELSE
    INSERT INTO public.hotels(id,city_id,name,hotel_category,hotel_type,contact_name,contact_phone,email,has_wifi,has_pool,address,blackout_ranges) VALUES(v_hotel_id,p_hotel->>'city_id',btrim(p_hotel->>'name'),p_hotel->>'hotel_category',nullif(p_hotel->>'hotel_type',''),coalesce(p_hotel->>'contact_name',''),coalesce(p_hotel->>'contact_phone',''),coalesce(p_hotel->>'email',''),coalesce((p_hotel->>'has_wifi')::boolean,false),coalesce((p_hotel->>'has_pool')::boolean,false),coalesce(p_hotel->>'address',''),coalesce(p_hotel->'blackout_ranges','[]'::jsonb));
  END IF;
  FOR v_room IN SELECT value FROM jsonb_array_elements(coalesce(p_rooms,'[]'::jsonb)) LOOP
    v_room_ids := array_append(v_room_ids, v_room->>'id');
    INSERT INTO public.hotel_rooms(id,hotel_id,name) VALUES(v_room->>'id',v_hotel_id,btrim(v_room->>'name')) ON CONFLICT(id) DO UPDATE SET name=excluded.name WHERE hotel_rooms.hotel_id=v_hotel_id;
    DELETE FROM public.hotel_rates WHERE room_id=v_room->>'id';
    FOR v_rate IN SELECT value FROM jsonb_array_elements(coalesce(v_room->'rates','[]'::jsonb)) LOOP
      INSERT INTO public.hotel_rates(id,room_id,validity_start,validity_end,season_label,meal_plan,double_rate,single_rate,quad_rate,extra_bed_rate,cwb_rate,cwb_rule_text,lunch_rate,dinner_rate,extra_breakfast_rate,xmas_supplement,xmas_supplement_type,xmas_date_from,xmas_date_to,newyear_supplement,newyear_supplement_type,newyear_date_from,newyear_date_to,remarks,include_in_quote)
      VALUES(v_rate->>'id',v_room->>'id',(v_rate->>'validity_start')::date,(v_rate->>'validity_end')::date,coalesce(nullif(v_rate->>'season_label',''),'Season'),v_rate->>'meal_plan',coalesce((v_rate->>'double_rate')::numeric,0),coalesce((v_rate->>'single_rate')::numeric,0),nullif(v_rate->>'quad_rate','')::numeric,coalesce((v_rate->>'extra_bed_rate')::numeric,0),nullif(v_rate->>'cwb_rate','')::numeric,nullif(v_rate->>'cwb_rule_text',''),nullif(v_rate->>'lunch_rate','')::numeric,nullif(v_rate->>'dinner_rate','')::numeric,nullif(v_rate->>'extra_breakfast_rate','')::numeric,nullif(v_rate->>'xmas_supplement','')::numeric,nullif(v_rate->>'xmas_supplement_type',''),nullif(v_rate->>'xmas_date_from','')::date,nullif(v_rate->>'xmas_date_to','')::date,nullif(v_rate->>'newyear_supplement','')::numeric,nullif(v_rate->>'newyear_supplement_type',''),nullif(v_rate->>'newyear_date_from','')::date,nullif(v_rate->>'newyear_date_to','')::date,nullif(v_rate->>'remarks',''),coalesce((v_rate->>'include_in_quote')::boolean,true));
    END LOOP;
  END LOOP;
  DELETE FROM public.hotel_rooms WHERE hotel_id=v_hotel_id AND NOT (id=ANY(v_room_ids));
  RETURN v_hotel_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_hotel_bundle(jsonb,jsonb,timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_hotel_bundle(jsonb,jsonb,timestamptz) FROM anon;

CREATE OR REPLACE FUNCTION public.delete_hotel_cascade(p_hotel_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin permission required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.hotels WHERE id=p_hotel_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_hotel_cascade(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_hotel_cascade(text) FROM anon;