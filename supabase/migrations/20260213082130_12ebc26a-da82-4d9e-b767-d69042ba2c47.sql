
-- Create a security definer function to get user's showroom_id without RLS
CREATE OR REPLACE FUNCTION public.get_user_showroom_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT showroom_id FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Drop and recreate the problematic manager policy
DROP POLICY IF EXISTS "Manager can view showroom user roles" ON public.user_roles;

CREATE POLICY "Manager can view showroom user roles"
ON public.user_roles FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND showroom_id = get_user_showroom_id(auth.uid())
);
