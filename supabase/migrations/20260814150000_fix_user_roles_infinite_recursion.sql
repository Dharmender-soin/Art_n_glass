-- ─────────────────────────────────────────────────────────────
-- MIGRATION: Fix Infinite Recursion on user_roles RLS Policies
-- DATE: 2026-08-14
-- PROBLEM: RLS policies on user_roles invoked has_role() / is_admin_or_md(), 
--          which queried user_roles without SET row_security = off.
-- SOLUTION: 
-- 1. Redefine helper functions with SECURITY DEFINER + SET row_security = off.
-- 2. Clean up & consolidate RLS policies on public.user_roles.
-- ─────────────────────────────────────────────────────────────

-- 1. Helper Function: is_admin_or_md
CREATE OR REPLACE FUNCTION public.is_admin_or_md(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND role IN ('admin'::app_role, 'md'::app_role)
  );
$$;

-- 2. Helper Function: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- 3. Helper Function: get_user_showrooms
CREATE OR REPLACE FUNCTION public.get_user_showrooms(_user_id uuid)
RETURNS TABLE (showroom_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT showroom_id FROM public.user_roles WHERE user_id = _user_id AND showroom_id IS NOT NULL;
$$;

-- 4. Drop all existing user_roles policies that cause conflicts / recursion
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Manager can view showroom user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can self-assign executive role" ON public.user_roles;
DROP POLICY IF EXISTS "MD can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "MD can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update user_roles is_active" ON public.user_roles;
DROP POLICY IF EXISTS "Accountants can view user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Allow authenticated select user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Allow admin write user_roles" ON public.user_roles;

-- 5. Re-create clean, non-recursive RLS policies on public.user_roles

-- SELECT: Authenticated users can view user_roles (required for UI dropdowns, hierarchy, and profile lookup)
CREATE POLICY "Allow authenticated select user_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);

-- INSERT: Admins / MDs can insert roles, OR users can self-assign executive on signup
CREATE POLICY "Allow admin write user_roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_or_md(auth.uid()) 
  OR (user_id = auth.uid() AND role = 'executive'::app_role)
);

-- UPDATE: Admins & MDs can update any user_role
CREATE POLICY "Allow admin update user_roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.is_admin_or_md(auth.uid()))
WITH CHECK (public.is_admin_or_md(auth.uid()));

-- DELETE: Admins & MDs can delete user_roles
CREATE POLICY "Allow admin delete user_roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.is_admin_or_md(auth.uid()));
