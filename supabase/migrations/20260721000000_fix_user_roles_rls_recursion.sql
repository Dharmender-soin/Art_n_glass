-- Migration: Fix infinite recursion in user_roles RLS policies
-- Problem: Policies "Admins can update user_roles is_active" and "Accountants can view user_roles"
-- perform direct subqueries on public.user_roles without SECURITY DEFINER, causing infinite recursion
-- when updating or querying user_roles in the Admin panel.

-- 1. Create/replace SECURITY DEFINER helper function for checking admin/md roles
CREATE OR REPLACE FUNCTION public.is_admin_or_md(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND role IN ('admin'::app_role, 'md'::app_role)
  );
$$;

-- 2. Drop problematic recursive policies on user_roles
DROP POLICY IF EXISTS "Admins can update user_roles is_active" ON public.user_roles;
DROP POLICY IF EXISTS "Accountants can view user_roles" ON public.user_roles;

-- 3. Re-create policies using SECURITY DEFINER functions to prevent recursion
CREATE POLICY "Admins can update user_roles is_active"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.is_admin_or_md(auth.uid()))
WITH CHECK (public.is_admin_or_md(auth.uid()));

CREATE POLICY "Accountants can view user_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'accountant'::app_role));
