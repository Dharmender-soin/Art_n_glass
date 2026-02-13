
-- Create work_status enum
CREATE TYPE public.work_status AS ENUM ('pending', 'won', 'lost');

-- Add verification fields to work_scope_items
ALTER TABLE public.work_scope_items 
  ADD COLUMN IF NOT EXISTS verified_amount numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verification_remarks text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS work_status public.work_status NOT NULL DEFAULT 'pending';

-- MD RLS policies for all tables
CREATE POLICY "MD can view all clients" ON public.clients FOR SELECT USING (has_role(auth.uid(), 'md'::app_role));
CREATE POLICY "MD can update all clients" ON public.clients FOR UPDATE USING (has_role(auth.uid(), 'md'::app_role));
CREATE POLICY "MD can delete all clients" ON public.clients FOR DELETE USING (has_role(auth.uid(), 'md'::app_role));

CREATE POLICY "MD can view all partners" ON public.partners FOR SELECT USING (has_role(auth.uid(), 'md'::app_role));
CREATE POLICY "MD can update all partners" ON public.partners FOR UPDATE USING (has_role(auth.uid(), 'md'::app_role));
CREATE POLICY "MD can delete all partners" ON public.partners FOR DELETE USING (has_role(auth.uid(), 'md'::app_role));

CREATE POLICY "MD can view all visits" ON public.visits FOR SELECT USING (has_role(auth.uid(), 'md'::app_role));
CREATE POLICY "MD can update all visits" ON public.visits FOR UPDATE USING (has_role(auth.uid(), 'md'::app_role));
CREATE POLICY "MD can delete all visits" ON public.visits FOR DELETE USING (has_role(auth.uid(), 'md'::app_role));

CREATE POLICY "MD can view all work scope" ON public.work_scope_items FOR SELECT USING (has_role(auth.uid(), 'md'::app_role));
CREATE POLICY "MD can update all work scope" ON public.work_scope_items FOR UPDATE USING (has_role(auth.uid(), 'md'::app_role));
CREATE POLICY "MD can delete all work scope" ON public.work_scope_items FOR DELETE USING (has_role(auth.uid(), 'md'::app_role));

CREATE POLICY "MD can view all profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'md'::app_role));

CREATE POLICY "MD can view all roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'md'::app_role));
CREATE POLICY "MD can manage all roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'md'::app_role)) WITH CHECK (has_role(auth.uid(), 'md'::app_role));
