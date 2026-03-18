-- Create location_history table
CREATE TABLE IF NOT EXISTS public.location_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_location_history_user_time ON public.location_history (user_id, timestamp DESC);

-- Add check-in fields to visits table
ALTER TABLE public.visits 
ADD COLUMN IF NOT EXISTS check_in_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS check_in_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS check_in_lng DOUBLE PRECISION;

-- Enable RLS on location_history
ALTER TABLE public.location_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own history
CREATE POLICY "Users can insert their own location history"
ON public.location_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can read their own history
CREATE POLICY "Users can view their own location history"
ON public.location_history
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Admins and managers can view all history
CREATE POLICY "Admins and managers can view all location history"
ON public.location_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'manager')
  )
);
