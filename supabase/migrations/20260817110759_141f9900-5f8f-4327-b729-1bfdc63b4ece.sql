-- destination_cities: restrict writes to admin/staff
DROP POLICY IF EXISTS "Signed-in users can insert cities" ON public.destination_cities;
DROP POLICY IF EXISTS "Signed-in users can update cities" ON public.destination_cities;
DROP POLICY IF EXISTS "Signed-in users can delete cities" ON public.destination_cities;

CREATE POLICY "Admins and staff can insert cities" ON public.destination_cities FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));
CREATE POLICY "Admins and staff can update cities" ON public.destination_cities FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));
CREATE POLICY "Admins can delete cities" ON public.destination_cities FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- destination_tours
DROP POLICY IF EXISTS "Signed-in users can insert tours" ON public.destination_tours;
DROP POLICY IF EXISTS "Signed-in users can update tours" ON public.destination_tours;
DROP POLICY IF EXISTS "Signed-in users can delete tours" ON public.destination_tours;

CREATE POLICY "Admins and staff can insert tours" ON public.destination_tours FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));
CREATE POLICY "Admins and staff can update tours" ON public.destination_tours FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));
CREATE POLICY "Admins can delete tours" ON public.destination_tours FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- profiles: owner or admin only
DROP POLICY IF EXISTS "Signed-in users can read profiles" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- user_roles: owner or admin only
DROP POLICY IF EXISTS "Signed-in users can read roles" ON public.user_roles;
CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));