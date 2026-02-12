
-- Create showrooms table
CREATE TABLE public.showrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.showrooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read showrooms" ON public.showrooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert showrooms" ON public.showrooms FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can update showrooms" ON public.showrooms FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can delete showrooms" ON public.showrooms FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed 3 showrooms
INSERT INTO public.showrooms (name, city) VALUES
  ('Kirti Nagar', 'Delhi'),
  ('Gurgaon', 'Gurgaon'),
  ('Zirakpur', 'Zirakpur');

-- Add showroom_id to user_roles
ALTER TABLE public.user_roles ADD COLUMN showroom_id uuid REFERENCES public.showrooms(id);

-- Allow users to self-assign default executive role on signup
CREATE POLICY "Users can self-assign executive role" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND role = 'executive'::app_role);

-- Function to check if two users share a showroom
CREATE OR REPLACE FUNCTION public.in_same_showroom(_user_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles a
    JOIN public.user_roles b ON a.showroom_id = b.showroom_id
    WHERE a.user_id = _user_id AND b.user_id = _target_user_id
    AND a.showroom_id IS NOT NULL
  )
$$;

-- Update partners RLS: manager sees only their showroom
DROP POLICY IF EXISTS "Authenticated can create partners" ON public.partners;
DROP POLICY IF EXISTS "Executives can delete own partners" ON public.partners;
DROP POLICY IF EXISTS "Executives can update own partners" ON public.partners;
DROP POLICY IF EXISTS "Executives see own partners" ON public.partners;

CREATE POLICY "Can create partners" ON public.partners FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Can view partners" ON public.partners FOR SELECT TO authenticated USING (
  created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR (has_role(auth.uid(), 'manager'::app_role) AND in_same_showroom(auth.uid(), created_by))
);
CREATE POLICY "Can update partners" ON public.partners FOR UPDATE TO authenticated USING (
  created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR (has_role(auth.uid(), 'manager'::app_role) AND in_same_showroom(auth.uid(), created_by))
);
CREATE POLICY "Can delete partners" ON public.partners FOR DELETE TO authenticated USING (
  created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR (has_role(auth.uid(), 'manager'::app_role) AND in_same_showroom(auth.uid(), created_by))
);

-- Update clients RLS
DROP POLICY IF EXISTS "Authenticated can create clients" ON public.clients;
DROP POLICY IF EXISTS "Executives can delete own clients" ON public.clients;
DROP POLICY IF EXISTS "Executives can update own clients" ON public.clients;
DROP POLICY IF EXISTS "Executives see own clients" ON public.clients;

CREATE POLICY "Can create clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Can view clients" ON public.clients FOR SELECT TO authenticated USING (
  created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR (has_role(auth.uid(), 'manager'::app_role) AND in_same_showroom(auth.uid(), created_by))
);
CREATE POLICY "Can update clients" ON public.clients FOR UPDATE TO authenticated USING (
  created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR (has_role(auth.uid(), 'manager'::app_role) AND in_same_showroom(auth.uid(), created_by))
);
CREATE POLICY "Can delete clients" ON public.clients FOR DELETE TO authenticated USING (
  created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR (has_role(auth.uid(), 'manager'::app_role) AND in_same_showroom(auth.uid(), created_by))
);

-- Update visits RLS
DROP POLICY IF EXISTS "Authenticated can create visits" ON public.visits;
DROP POLICY IF EXISTS "Executives can delete own visits" ON public.visits;
DROP POLICY IF EXISTS "Executives can update own visits" ON public.visits;
DROP POLICY IF EXISTS "Executives see own visits" ON public.visits;

CREATE POLICY "Can create visits" ON public.visits FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Can view visits" ON public.visits FOR SELECT TO authenticated USING (
  created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR (has_role(auth.uid(), 'manager'::app_role) AND in_same_showroom(auth.uid(), created_by))
);
CREATE POLICY "Can update visits" ON public.visits FOR UPDATE TO authenticated USING (
  created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR (has_role(auth.uid(), 'manager'::app_role) AND in_same_showroom(auth.uid(), created_by))
);
CREATE POLICY "Can delete visits" ON public.visits FOR DELETE TO authenticated USING (
  created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR (has_role(auth.uid(), 'manager'::app_role) AND in_same_showroom(auth.uid(), created_by))
);

-- Update work_scope_items RLS
DROP POLICY IF EXISTS "Authenticated can create work scope" ON public.work_scope_items;
DROP POLICY IF EXISTS "Executives can delete own work scope" ON public.work_scope_items;
DROP POLICY IF EXISTS "Executives can update own work scope" ON public.work_scope_items;
DROP POLICY IF EXISTS "Executives see own work scope" ON public.work_scope_items;

CREATE POLICY "Can create work scope" ON public.work_scope_items FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Can view work scope" ON public.work_scope_items FOR SELECT TO authenticated USING (
  created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR (has_role(auth.uid(), 'manager'::app_role) AND in_same_showroom(auth.uid(), created_by))
);
CREATE POLICY "Can update work scope" ON public.work_scope_items FOR UPDATE TO authenticated USING (
  created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR (has_role(auth.uid(), 'manager'::app_role) AND in_same_showroom(auth.uid(), created_by))
);
CREATE POLICY "Can delete work scope" ON public.work_scope_items FOR DELETE TO authenticated USING (
  created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR (has_role(auth.uid(), 'manager'::app_role) AND in_same_showroom(auth.uid(), created_by))
);

-- Update profiles RLS: managers can see profiles in their showroom
DROP POLICY IF EXISTS "Admins and managers can view all profiles" ON public.profiles;
CREATE POLICY "Admin can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Manager can view showroom profiles" ON public.profiles FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'manager'::app_role) AND in_same_showroom(auth.uid(), user_id)
);
