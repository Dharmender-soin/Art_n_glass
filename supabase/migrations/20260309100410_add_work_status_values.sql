ALTER TYPE public.work_status ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE public.work_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.work_status ADD VALUE IF NOT EXISTS 'rejected';
