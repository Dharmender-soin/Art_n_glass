-- ─────────────────────────────────────────────────────────────
-- MIGRATION: Add is_active to user_roles for employee deactivation
-- DATE: 2026-06-25
-- ─────────────────────────────────────────────────────────────

-- 1. Add is_active column (default true = all existing employees stay active)
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Allow admins/MD to update is_active
DROP POLICY IF EXISTS "Admins can update user_roles is_active" ON public.user_roles;
CREATE POLICY "Admins can update user_roles is_active"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'md')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'md')
  )
);
