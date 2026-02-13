-- Fix: Change restrictive policies to permissive so rows are actually visible
-- Drop and recreate the SELECT policies as PERMISSIVE

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can self-assign executive role" ON public.user_roles;
CREATE POLICY "Users can self-assign executive role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND role = 'executive'::app_role);

DROP POLICY IF EXISTS "Manager can view showroom user roles" ON public.user_roles;
CREATE POLICY "Manager can view showroom user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND showroom_id = (
    SELECT ur.showroom_id FROM user_roles ur WHERE ur.user_id = auth.uid() LIMIT 1
  )
);