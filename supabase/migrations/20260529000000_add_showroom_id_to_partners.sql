-- ============================================================
-- Migration: Add showroom_id to partners table
-- Fixes: Partner Utilization section in Command Centre showing 0 partners
-- Root cause: partners table had no showroom_id column; the app code
-- was already querying and filtering by it, but it didn't exist.
-- ============================================================

-- 1. Add showroom_id column to partners
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL;

-- 2. Backfill: derive showroom_id from the creating executive's user_role
--    This links each partner to the showroom of the executive who created them.
UPDATE public.partners p
SET showroom_id = ur.showroom_id
FROM public.user_roles ur
WHERE ur.user_id = p.created_by
  AND ur.role = 'executive'
  AND p.showroom_id IS NULL
  AND ur.showroom_id IS NOT NULL;

-- Also backfill for managers who may have created partners
UPDATE public.partners p
SET showroom_id = ur.showroom_id
FROM public.user_roles ur
WHERE ur.user_id = p.created_by
  AND ur.role = 'manager'
  AND p.showroom_id IS NULL
  AND ur.showroom_id IS NOT NULL;

-- 3. Add an index on showroom_id for performance
CREATE INDEX IF NOT EXISTS idx_partners_showroom_id ON public.partners(showroom_id);

-- 4. Add md role to app_role enum if not present (so "md" logins work correctly)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'md'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'md';
  END IF;
END
$$;
