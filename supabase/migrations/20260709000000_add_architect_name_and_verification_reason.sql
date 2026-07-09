-- Migration: Add architect_name to clients & verification_reason to work_scope_items

-- 1. Add architect_name column to clients table
ALTER TABLE public.clients 
  ADD COLUMN IF NOT EXISTS architect_name TEXT;

-- 2. Add verification_reason column to work_scope_items table
ALTER TABLE public.work_scope_items 
  ADD COLUMN IF NOT EXISTS verification_reason TEXT;

COMMENT ON COLUMN public.clients.architect_name IS 'Name of the architect associated with this client project';
COMMENT ON COLUMN public.work_scope_items.verification_reason IS 'Reason provided by manager when verifying won/lost WOS status';
