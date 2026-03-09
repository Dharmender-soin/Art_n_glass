-- New Migration to align with FRD specification

-- Update Enums
ALTER TYPE visit_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE visit_status ADD VALUE IF NOT EXISTS 'missed';
ALTER TYPE visit_status ADD VALUE IF NOT EXISTS 'rescheduled';

ALTER TYPE work_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE work_status ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE work_status ADD VALUE IF NOT EXISTS 'rejected';

-- Create purpose_masters
CREATE TABLE IF NOT EXISTS purpose_masters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type visit_with_type NOT NULL,
    purpose_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Basic RLS for purpose_masters
ALTER TABLE purpose_masters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON purpose_masters
    FOR SELECT USING (true);

-- Create audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL, -- 'insert', 'update', 'delete'
    changed_by UUID REFERENCES auth.users(id),
    old_data JSONB,
    new_data JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Admin only RLS for audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable insert for authenticated users" ON audit_logs
    FOR INSERT WITH CHECK (auth.uid() = changed_by);

CREATE POLICY "Enable select for admin" ON audit_logs
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
      )
    );

-- Alter visits
ALTER TABLE visits 
  ADD COLUMN IF NOT EXISTS purpose_id UUID REFERENCES purpose_masters(id),
  ADD COLUMN IF NOT EXISTS planning_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS tat_due_date DATE;

-- Note: We are keeping the old "purpose" string column for backwards compatibility right now, 
-- but purpose_id is added for the new normalized flow.

-- Add status column to work_scope_items if it doesn't already use "work_status"
-- Wait, the types.ts shows 'work_scope_items' already has 'work_status'.
-- We just added enum values to 'work_status' above.
