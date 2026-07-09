-- Fix: Manager RLS policy on user_roles to support multi-showroom managers
-- Problem: The policy used public.get_user_showroom_id() which returned LIMIT 1,
-- restricting managers to see user roles only in their first showroom.

-- 1. Create a security definer function to return all showroom IDs for a user
CREATE OR REPLACE FUNCTION public.get_user_showroom_ids(_user_id uuid)
RETURNS TABLE (showroom_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT showroom_id FROM public.user_roles WHERE user_id = _user_id AND showroom_id IS NOT NULL;
$$;

-- 2. Drop the old manager view roles policy
DROP POLICY IF EXISTS "Manager can view showroom user roles" ON public.user_roles;

-- 3. Recreate the policy supporting multiple showrooms
CREATE POLICY "Manager can view showroom user roles"
ON public.user_roles FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND showroom_id IN (SELECT public.get_user_showroom_ids(auth.uid()))
);
