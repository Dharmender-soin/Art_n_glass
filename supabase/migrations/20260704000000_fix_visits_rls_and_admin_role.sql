-- ============================================================
-- Fix: Admin user_roles entry + Visits/Clients/Partners/Orders RLS
-- Problem: Admin user had no user_roles row → has_role() returned false
--          → RLS blocked all visits for admin
-- Solution:
--   1. Re-insert admin role (idempotent)
--   2. Drop & recreate SELECT policies for visits, clients,
--      partners, work_scope_items to be robust for all roles
--      (admin, md, manager, tl, executive)
-- ============================================================

DO $$
DECLARE
  v_admin_id UUID;
BEGIN
  -- Find admin user by email
  SELECT id INTO v_admin_id
  FROM auth.users
  WHERE email = 'application@artnglassinc.com';

  IF v_admin_id IS NOT NULL THEN
    -- Remove any wrongly auto-assigned executive row for admin
    DELETE FROM public.user_roles
    WHERE user_id = v_admin_id AND role = 'executive';

    -- Insert admin role (safe, idempotent, without depending on ON CONFLICT constraints)
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = v_admin_id AND role = 'admin'
    ) THEN
      INSERT INTO public.user_roles (user_id, role, showroom_id)
      VALUES (v_admin_id, 'admin', NULL);
    END IF;

    RAISE NOTICE 'Admin role ensured for user: %', v_admin_id;
  ELSE
    RAISE WARNING 'Admin user not found — skipping user_roles fix';
  END IF;
END $$;


-- ============================================================
-- Fix RLS SELECT policies for all 4 core tables
-- New logic:
--   admin / md  → see EVERYTHING
--   manager / tl → see their showroom only (via in_same_showroom)
--   executive   → see only their own records
-- ============================================================

-- ── VISITS ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Can view visits"       ON public.visits;
DROP POLICY IF EXISTS "Admin bypass visits"   ON public.visits;  -- created manually before

CREATE POLICY "Can view visits" ON public.visits
  FOR SELECT TO authenticated
  USING (
    -- Own record
    created_by = auth.uid()
    -- Admin or MD: see all
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::app_role, 'md'::app_role)
    )
    -- Manager or TL: same showroom only
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('manager'::app_role, 'tl'::app_role)
        AND public.in_same_showroom(auth.uid(), created_by)
    )
  );

-- ── CLIENTS ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Can view clients" ON public.clients;

CREATE POLICY "Can view clients" ON public.clients
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::app_role, 'md'::app_role)
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('manager'::app_role, 'tl'::app_role)
        AND public.in_same_showroom(auth.uid(), created_by)
    )
  );

-- ── PARTNERS ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Can view partners" ON public.partners;

CREATE POLICY "Can view partners" ON public.partners
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::app_role, 'md'::app_role)
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('manager'::app_role, 'tl'::app_role)
        AND public.in_same_showroom(auth.uid(), created_by)
    )
  );

-- ── WORK SCOPE ITEMS ─────────────────────────────────────────
DROP POLICY IF EXISTS "Can view work scope" ON public.work_scope_items;

CREATE POLICY "Can view work scope" ON public.work_scope_items
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::app_role, 'md'::app_role)
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('manager'::app_role, 'tl'::app_role)
        AND public.in_same_showroom(auth.uid(), created_by)
    )
  );
