
-- 1. Role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'executive');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins and managers can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Partners (Builders/Architects)
CREATE TYPE public.partner_type AS ENUM ('builder', 'architect');

CREATE TABLE public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type partner_type NOT NULL,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  company_name TEXT,
  address TEXT,
  city TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Executives see own partners" ON public.partners
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Authenticated can create partners" ON public.partners
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Executives can update own partners" ON public.partners
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Executives can delete own partners" ON public.partners
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

-- 4. Clients
CREATE TYPE public.client_status AS ENUM ('new', 'hot', 'converted', 'lost');

CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  address TEXT,
  city TEXT,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  notes TEXT,
  status client_status NOT NULL DEFAULT 'new',
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Executives see own clients" ON public.clients
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Authenticated can create clients" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Executives can update own clients" ON public.clients
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Executives can delete own clients" ON public.clients
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

-- 5. Master Work Types
CREATE TABLE public.master_work_types (
  id TEXT PRIMARY KEY,
  type_of_work TEXT NOT NULL,
  sub_work TEXT NOT NULL
);

ALTER TABLE public.master_work_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read master work types" ON public.master_work_types
  FOR SELECT TO authenticated USING (true);

-- Seed master data
INSERT INTO public.master_work_types (id, type_of_work, sub_work) VALUES
  ('uPVC-uPVC', 'uPVC', 'uPVC'),
  ('Aluminium-Aluminium', 'Aluminium', 'Aluminium'),
  ('Skylight-ANG', 'Skylight', 'Art & Glass'),
  ('GlassRailing-ANG', 'Glass Railing', 'Art & Glass'),
  ('Aarna-Axsys', 'Aarna', 'Axsys'),
  ('Showers-Axsys', 'Showers', 'Axsys'),
  ('Mirrors-ANG', 'Mirrors', 'Art & Glass'),
  ('DecorativeGlass-ANG', 'Decorative Glass', 'Art & Glass'),
  ('Skylight-Axsys', 'Skylight', 'Axsys'),
  ('GlassRailing-Axsys', 'Glass Railing', 'Axsys'),
  ('Showers-ANG', 'Showers', 'Art & Glass');

-- 6. Work Scope Items
CREATE TABLE public.work_scope_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  work_type_id TEXT REFERENCES public.master_work_types(id) NOT NULL,
  description TEXT,
  quantity INT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.work_scope_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Executives see own work scope" ON public.work_scope_items
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Authenticated can create work scope" ON public.work_scope_items
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Executives can update own work scope" ON public.work_scope_items
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Executives can delete own work scope" ON public.work_scope_items
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

-- 7. Visits
CREATE TYPE public.visit_with_type AS ENUM ('client', 'partner');
CREATE TYPE public.visit_status AS ENUM ('planned', 'done', 'cancelled');

CREATE TABLE public.visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_date DATE NOT NULL,
  visit_with_type visit_with_type NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  address TEXT,
  purpose TEXT NOT NULL,
  status visit_status NOT NULL DEFAULT 'planned',
  remarks TEXT,
  gps_latitude DOUBLE PRECISION,
  gps_longitude DOUBLE PRECISION,
  photo_url TEXT,
  done_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Executives see own visits" ON public.visits
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Authenticated can create visits" ON public.visits
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Executives can update own visits" ON public.visits
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Executives can delete own visits" ON public.visits
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

-- 8. Storage bucket for visit photos
INSERT INTO storage.buckets (id, name, public) VALUES ('visit-photos', 'visit-photos', true);

CREATE POLICY "Authenticated users can upload visit photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'visit-photos');

CREATE POLICY "Anyone can view visit photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'visit-photos');

-- 9. Updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_partners_updated_at BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_visits_updated_at BEFORE UPDATE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
