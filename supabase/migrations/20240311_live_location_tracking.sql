-- Create the live_locations table
CREATE TABLE IF NOT EXISTS public.live_locations (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;

-- Policy 1: Executives can insert/update their own live location
CREATE POLICY "Users can insert/update their own live location"
ON public.live_locations
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy 2: Admins and managers can view all live locations
CREATE POLICY "Admins and managers can view all live locations"
ON public.live_locations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'manager')
  )
);

-- Enable Realtime for this table
-- (This ensures the table is broadcast via Supabase Realtime)
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_locations;
