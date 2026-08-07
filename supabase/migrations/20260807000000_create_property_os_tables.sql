-- ════════════════════════════════════════════════════════════════════
-- PROPERTY OS — COMPLETE DATABASE SCHEMA MIGRATION
-- ════════════════════════════════════════════════════════════════════

-- 1. Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. PROPERTIES TABLE
CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('sale', 'rent', 'lease', 'pg', 'commercial')),
  property_type TEXT NOT NULL CHECK (property_type IN ('flat', 'villa', 'office', 'shop', 'warehouse', 'plot', 'project')),
  bhk TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  area_sqft NUMERIC,
  furnishing TEXT CHECK (furnishing IN ('furnished', 'semi_furnished', 'unfurnished')),
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  owner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  builder_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  assigned_executive_id UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'pending_verification', 'verified', 'active', 'booked', 'sold', 'rented', 'inactive')),
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  quality_score INTEGER DEFAULT 75,
  featured BOOLEAN DEFAULT false,
  amenities TEXT[] DEFAULT '{}',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. PROPERTY MEDIA TABLE
CREATE TABLE IF NOT EXISTS public.property_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video', 'floor_plan', 'tour_360')),
  url TEXT NOT NULL,
  caption TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. BUYER / TENANT REQUIREMENTS TABLE
CREATE TABLE IF NOT EXISTS public.requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('buy', 'rent', 'lease', 'pg', 'commercial')),
  property_type TEXT NOT NULL,
  bhk TEXT,
  budget_min NUMERIC DEFAULT 0,
  budget_max NUMERIC DEFAULT 0,
  preferred_locations TEXT[] DEFAULT '{}',
  furnishing TEXT,
  move_in_date DATE,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_executive_id UUID,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'matched', 'closed', 'cancelled')),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. DEALS PIPELINE TABLE
CREATE TABLE IF NOT EXISTS public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_code TEXT UNIQUE NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  executive_id UUID NOT NULL,
  stage TEXT NOT NULL DEFAULT 'interested' CHECK (stage IN ('interested', 'negotiation', 'offer_made', 'token_pending', 'token_received', 'documentation', 'payment_pending', 'closed_won', 'closed_lost')),
  asking_price NUMERIC DEFAULT 0,
  offer_price NUMERIC DEFAULT 0,
  final_price NUMERIC DEFAULT 0,
  token_amount NUMERIC DEFAULT 0,
  expected_brokerage NUMERIC DEFAULT 0,
  collected_brokerage NUMERIC DEFAULT 0,
  expected_closing_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. DEAL NEGOTIATIONS HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.deal_negotiations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  offered_by_type TEXT NOT NULL CHECK (offered_by_type IN ('buyer', 'owner', 'executive')),
  offer_amount NUMERIC NOT NULL,
  counter_amount NUMERIC,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. DOCUMENTS MANAGEMENT TABLE
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('property', 'owner', 'customer', 'deal')),
  entity_id UUID NOT NULL,
  document_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  rejection_reason TEXT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. OPERATIONAL TASKS TABLE
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  assigned_to UUID NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'overdue')),
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. RLS POLICIES FOR PUBLIC SCHEMAS
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Permissive policies for authenticated users
CREATE POLICY "Allow authenticated read/write properties" ON public.properties FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated read/write property_media" ON public.property_media FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated read/write requirements" ON public.requirements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated read/write deals" ON public.deals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated read/write deal_negotiations" ON public.deal_negotiations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated read/write documents" ON public.documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated read/write tasks" ON public.tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated read/write audit_logs" ON public.audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
