-- Add conveyance tracking elements to the database

-- 1. Update profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS conveyance_type TEXT CHECK (conveyance_type IN ('car', 'bike')),
ADD COLUMN IF NOT EXISTS conveyance_rate NUMERIC;

-- 2. Create daily_attendance table to capture start location
CREATE TABLE IF NOT EXISTS daily_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in_lat NUMERIC NOT NULL,
    check_in_lng NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, date)
);

-- RLS for daily_attendance
ALTER TABLE daily_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own attendance" ON daily_attendance
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own attendance" ON daily_attendance
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all attendance" ON daily_attendance
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role IN ('admin', 'md')
      )
    );

-- 3. Create conveyance_records table for leg-by-leg tracking
CREATE TABLE IF NOT EXISTS conveyance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    visit_id UUID REFERENCES visits(id) ON DELETE SET NULL, -- Can be null for return-to-office leg
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    from_location_name TEXT,
    from_lat NUMERIC NOT NULL,
    from_lng NUMERIC NOT NULL,
    to_location_name TEXT,
    to_lat NUMERIC NOT NULL,
    to_lng NUMERIC NOT NULL,
    distance_km NUMERIC NOT NULL,
    vehicle_type TEXT NOT NULL,
    rate_per_km NUMERIC NOT NULL,
    amount NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS for conveyance_records
ALTER TABLE conveyance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own conveyance records" ON conveyance_records
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own conveyance records" ON conveyance_records
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins/MD can view all conveyance records" ON conveyance_records
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role IN ('admin', 'md', 'manager')
      )
    );
