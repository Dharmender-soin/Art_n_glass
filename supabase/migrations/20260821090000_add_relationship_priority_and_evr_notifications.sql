-- Shared ownership: creator is always Primary; one colleague can be Secondary.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS secondary_owner_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS secondary_owner_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_secondary_owner_idx
  ON public.clients (secondary_owner_id) WHERE secondary_owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS partners_secondary_owner_idx
  ON public.partners (secondary_owner_id) WHERE secondary_owner_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_assignable_users()
RETURNS TABLE(user_id uuid, full_name text, role text, showroom_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (ur.user_id)
    ur.user_id,
    COALESCE(NULLIF(p.full_name, ''), 'Team Member') AS full_name,
    ur.role::text,
    ur.showroom_id
  FROM public.user_roles ur
  JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE COALESCE(ur.is_active, true) = true
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles me
        WHERE me.user_id = auth.uid() AND me.role IN ('admin', 'md')
      )
      OR ur.showroom_id IN (
        SELECT my_role.showroom_id
        FROM public.user_roles my_role
        WHERE my_role.user_id = auth.uid() AND my_role.showroom_id IS NOT NULL
      )
      OR ur.user_id = auth.uid()
    )
  ORDER BY ur.user_id, COALESCE(NULLIF(p.full_name, ''), 'Team Member');
$$;
GRANT EXECUTE ON FUNCTION public.get_assignable_users() TO authenticated;

DROP POLICY IF EXISTS "Can view clients" ON public.clients;
CREATE POLICY "Can view clients" ON public.clients FOR SELECT TO authenticated USING (
  created_by = auth.uid() OR secondary_owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'md'))
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('manager', 'tl') AND public.in_same_showroom(auth.uid(), created_by))
);

DROP POLICY IF EXISTS "Can update clients" ON public.clients;
CREATE POLICY "Can update clients" ON public.clients FOR UPDATE TO authenticated USING (
  created_by = auth.uid() OR secondary_owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'md'))
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('manager', 'tl') AND public.in_same_showroom(auth.uid(), created_by))
) WITH CHECK (
  created_by = auth.uid() OR secondary_owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'md'))
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('manager', 'tl') AND public.in_same_showroom(auth.uid(), created_by))
);

DROP POLICY IF EXISTS "Can view partners" ON public.partners;
CREATE POLICY "Can view partners" ON public.partners FOR SELECT TO authenticated USING (
  created_by = auth.uid() OR secondary_owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'md'))
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('manager', 'tl') AND public.in_same_showroom(auth.uid(), created_by))
);

DROP POLICY IF EXISTS "Can update partners" ON public.partners;
CREATE POLICY "Can update partners" ON public.partners FOR UPDATE TO authenticated USING (
  created_by = auth.uid() OR secondary_owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'md'))
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('manager', 'tl') AND public.in_same_showroom(auth.uid(), created_by))
) WITH CHECK (
  created_by = auth.uid() OR secondary_owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'md'))
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('manager', 'tl') AND public.in_same_showroom(auth.uid(), created_by))
);

-- Secondary owners also see and update the visits/WOS attached to their shared records.
DROP POLICY IF EXISTS "Can view visits" ON public.visits;
CREATE POLICY "Can view visits" ON public.visits FOR SELECT TO authenticated USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = visits.client_id AND c.secondary_owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.partners p WHERE p.id = visits.partner_id AND p.secondary_owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'md'))
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('manager', 'tl') AND public.in_same_showroom(auth.uid(), created_by))
);

DROP POLICY IF EXISTS "Can view work scope" ON public.work_scope_items;
CREATE POLICY "Can view work scope" ON public.work_scope_items FOR SELECT TO authenticated USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = work_scope_items.client_id AND c.secondary_owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'md'))
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('manager', 'tl') AND public.in_same_showroom(auth.uid(), created_by))
);

DROP POLICY IF EXISTS "Can update work scope" ON public.work_scope_items;
CREATE POLICY "Can update work scope" ON public.work_scope_items FOR UPDATE TO authenticated USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = work_scope_items.client_id AND c.secondary_owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'md'))
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('manager', 'tl') AND public.in_same_showroom(auth.uid(), created_by))
);

-- Queue a weekly, executive-specific EVR notification. The report is generated
-- from live visit data when the executive opens the deep link, so it never goes stale.
CREATE OR REPLACE FUNCTION public.queue_weekly_executive_evr_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.scheduled_notifications
    (title, body, target_type, target_id, target_url, scheduled_for, status, recurrence)
  SELECT
    'Your weekly EVR is ready',
    'Open your Executive Visit Report and download the PDF for the last 7 days.',
    'individual',
    ur.user_id,
    '/reports?report=evr&period=weekly&executive=' || ur.user_id::text,
    now(),
    'pending',
    'one_time'
  FROM public.user_roles ur
  WHERE ur.role = 'executive'
    AND COALESCE(ur.is_active, true) = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.scheduled_notifications sn
      WHERE sn.target_id = ur.user_id
        AND sn.target_url = '/reports?report=evr&period=weekly&executive=' || ur.user_id::text
        AND sn.created_at >= date_trunc('week', now())
    );
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('weekly-executive-evr');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Monday 09:00 Asia/Kolkata = Monday 03:30 UTC.
SELECT cron.schedule(
  'weekly-executive-evr',
  '30 3 * * 1',
  'SELECT public.queue_weekly_executive_evr_notifications();'
);
