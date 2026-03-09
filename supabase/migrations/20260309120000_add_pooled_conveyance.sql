-- Add shared conveyance / pooling support to visits table
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS travel_mode TEXT DEFAULT 'own' CHECK (travel_mode IN ('own', 'pooled')),
  ADD COLUMN IF NOT EXISTS pooled_with_user_id UUID REFERENCES auth.users(id);

-- Add a comment to conveyance_records to explain pooled entries
COMMENT ON TABLE public.conveyance_records IS 'Tracks travel expenses per visit per executive. Pooled passengers have amount=0.';
