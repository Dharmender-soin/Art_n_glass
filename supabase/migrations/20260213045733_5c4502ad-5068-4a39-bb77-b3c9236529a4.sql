
-- Add amount field to work_scope_items
ALTER TABLE public.work_scope_items ADD COLUMN amount_in_lac NUMERIC DEFAULT NULL;

-- Add manager verification fields
ALTER TABLE public.work_scope_items ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.work_scope_items ADD COLUMN verified_by UUID DEFAULT NULL;
ALTER TABLE public.work_scope_items ADD COLUMN verified_at TIMESTAMPTZ DEFAULT NULL;
