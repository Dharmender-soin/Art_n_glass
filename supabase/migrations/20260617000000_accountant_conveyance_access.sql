-- Allow accountants to view all conveyance records
-- (scoped to their own showroom via the app layer; DB allows the read)

CREATE POLICY "Accountants can view all conveyance records"
-- Migration: Accountant Conveyance Access
-- Date: 2026-06-17
-- Purpose: Allow accountants to view conveyance records and profiles for their showroom employees

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Security Definer function for conveyance_records RLS
-- (Bypasses user_roles RLS so the policy JOIN works correctly)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accountant_can_view_conveyance(record_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM user_roles acc
    JOIN user_roles emp ON acc.showroom_id = emp.showroom_id
    WHERE acc.user_id = auth.uid()
      AND acc.role = 'accountant'
      AND emp.user_id = record_user_id
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- STEP 2: RLS policy on conveyance_records for accountants
-- Accountant sees records of all employees in their showroom
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Accountants can view showroom conveyance records" ON conveyance_records;

CREATE POLICY "Accountants can view showroom conveyance records"
ON conveyance_records
FOR SELECT
USING (
  accountant_can_view_conveyance(conveyance_records.user_id)
);

-- ─────────────────────────────────────────────────────────────
-- STEP 3: Allow accountants to read profiles in their showroom
-- (Needed to resolve employee names in the Conveyance Panel)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Accountant can view showroom profiles" ON public.profiles;

CREATE POLICY "Accountant can view showroom profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'accountant'::app_role)
  AND in_same_showroom(auth.uid(), user_id)
);

-- Also allow accountants to view user_roles (needed to resolve employee names / showroom)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_roles'
      AND policyname = 'Accountants can view user_roles'
  ) THEN
    CREATE POLICY "Accountants can view user_roles"
    ON user_roles
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('accountant')
      )
    );
  END IF;
END $$;
