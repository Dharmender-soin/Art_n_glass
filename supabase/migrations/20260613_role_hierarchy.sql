-- ============================================================
-- Migration: Role Hierarchy — Add TL, Backhand Executive roles
--            and reports_to column
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add new values to the app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'tl';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'backhand_executive';

-- 2. Add reports_to column to user_roles
--    For executives: stores their TL's user_id
--    For TLs: stores their Manager's user_id
ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS reports_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Index for fast hierarchy lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_reports_to ON user_roles(reports_to);

-- ============================================================
-- Example: How to assign roles with hierarchy
-- ============================================================
-- Assign TL role:
--   INSERT INTO user_roles (user_id, role, showroom_id, reports_to)
--   VALUES ('<tl_user_id>', 'tl', '<showroom_id>', '<manager_user_id>');
--
-- Assign Executive under a TL:
--   INSERT INTO user_roles (user_id, role, showroom_id, reports_to)
--   VALUES ('<exec_user_id>', 'executive', '<showroom_id>', '<tl_user_id>');
--
-- Assign Backhand Executive:
--   INSERT INTO user_roles (user_id, role, showroom_id)
--   VALUES ('<bh_user_id>', 'backhand_executive', '<showroom_id>');
-- ============================================================
