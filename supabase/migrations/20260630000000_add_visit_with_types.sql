-- Add new values to visit_with_type ENUM safely
ALTER TYPE public.visit_with_type ADD VALUE IF NOT EXISTS 'home';
ALTER TYPE public.visit_with_type ADD VALUE IF NOT EXISTS 'hotel';
ALTER TYPE public.visit_with_type ADD VALUE IF NOT EXISTS 'showroom';
