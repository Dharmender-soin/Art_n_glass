-- Apply in the Art N Glass project before deploying this frontend/WhatsHub update.
-- No employees are deleted or deactivated. Historical claim amounts are unchanged.
BEGIN;
ALTER TYPE public.visit_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS architect_name text;

ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS showroom_id uuid REFERENCES public.showrooms(id);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS secondary_owner_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS secondary_owner_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS clients_secondary_owner_idx ON public.clients(secondary_owner_id) WHERE secondary_owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS partners_secondary_owner_idx ON public.partners(secondary_owner_id) WHERE secondary_owner_id IS NOT NULL;

-- Backfill only an exact, unambiguous match to the old showroom picker label.
WITH matches AS (
  SELECT v.id, (array_agg(s.id))[1] AS showroom_id
  FROM public.visits v JOIN public.showrooms s ON lower(trim(v.address)) = lower(trim(
    s.name || ' Showroom' || CASE WHEN nullif(s.city, '') IS NOT NULL THEN ', ' || s.city ELSE '' END))
  WHERE v.visit_with_type::text = 'showroom' AND v.showroom_id IS NULL
  GROUP BY v.id HAVING count(*) = 1
)
UPDATE public.visits v SET showroom_id = matches.showroom_id FROM matches WHERE v.id = matches.id;

CREATE OR REPLACE FUNCTION public.can_manage_shared_record(p_owner uuid, p_secondary uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles me WHERE me.user_id = auth.uid() AND me.is_active
    AND me.role::text IN ('executive','tl','manager','admin','md')
    AND (p_owner = auth.uid() OR p_secondary = auth.uid() OR me.role::text IN ('admin','md')
      OR (me.role::text = 'tl' AND EXISTS (
        SELECT 1 FROM public.user_roles staff WHERE staff.user_id = p_owner AND staff.reports_to = auth.uid()))
      OR (me.role::text = 'manager' AND EXISTS (
        SELECT 1 FROM public.user_roles staff WHERE staff.user_id = p_owner AND staff.showroom_id = me.showroom_id)))
  );
$$;
REVOKE ALL ON FUNCTION public.can_manage_shared_record(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_shared_record(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_assignable_users()
RETURNS TABLE(user_id uuid, full_name text, role text, showroom_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (staff.user_id) staff.user_id,
    coalesce(nullif(trim(p.full_name),''),'Team Member'), staff.role::text, staff.showroom_id
  FROM public.user_roles staff LEFT JOIN public.profiles p ON p.user_id = staff.user_id
  WHERE staff.is_active AND staff.role::text IN ('executive','tl','manager','admin','md')
    AND EXISTS (SELECT 1 FROM public.user_roles me WHERE me.user_id = auth.uid() AND me.is_active
      AND me.role::text IN ('executive','tl','manager','admin','md')
      AND (me.role::text IN ('admin','md') OR staff.user_id = me.user_id
        OR staff.showroom_id = me.showroom_id OR staff.reports_to = me.user_id OR me.reports_to = staff.user_id))
  ORDER BY staff.user_id, staff.role::text;
$$;
REVOKE ALL ON FUNCTION public.get_assignable_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_assignable_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_secondary_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.secondary_owner_id IS NOT DISTINCT FROM OLD.secondary_owner_id THEN RETURN NEW; END IF;
  IF NEW.secondary_owner_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.secondary_owner_id = NEW.created_by THEN RAISE EXCEPTION 'Primary and secondary owner must be different'; END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.get_assignable_users() u WHERE u.user_id = NEW.secondary_owner_id)
    THEN RAISE EXCEPTION 'Secondary owner must be an active member of your permitted team'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS validate_client_secondary_owner ON public.clients;
CREATE TRIGGER validate_client_secondary_owner BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.validate_secondary_owner();
DROP TRIGGER IF EXISTS validate_partner_secondary_owner ON public.partners;
CREATE TRIGGER validate_partner_secondary_owner BEFORE INSERT OR UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.validate_secondary_owner();

-- A shared partner's client details and WOS follow the partner relationship.
CREATE OR REPLACE FUNCTION public.can_manage_client_record(p_client uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.clients c LEFT JOIN public.partners p ON p.id = c.partner_id
    WHERE c.id = p_client AND (public.can_manage_shared_record(c.created_by,c.secondary_owner_id)
      OR (p.id IS NOT NULL AND public.can_manage_shared_record(p.created_by,p.secondary_owner_id))));
$$;
REVOKE ALL ON FUNCTION public.can_manage_client_record(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_client_record(uuid) TO authenticated;

DROP POLICY IF EXISTS "Shared team can read clients" ON public.clients;
CREATE POLICY "Shared team can read clients" ON public.clients FOR SELECT TO authenticated USING (public.can_manage_client_record(id));
DROP POLICY IF EXISTS "Shared team can update clients" ON public.clients;
CREATE POLICY "Shared team can update clients" ON public.clients FOR UPDATE TO authenticated USING (public.can_manage_client_record(id)) WITH CHECK (public.can_manage_client_record(id));
DROP POLICY IF EXISTS "Shared team can read partners" ON public.partners;
CREATE POLICY "Shared team can read partners" ON public.partners FOR SELECT TO authenticated USING (public.can_manage_shared_record(created_by,secondary_owner_id));
DROP POLICY IF EXISTS "Shared team can update partners" ON public.partners;
CREATE POLICY "Shared team can update partners" ON public.partners FOR UPDATE TO authenticated USING (public.can_manage_shared_record(created_by,secondary_owner_id)) WITH CHECK (public.can_manage_shared_record(created_by,secondary_owner_id));
DROP POLICY IF EXISTS "Shared team can read visits" ON public.visits;
CREATE POLICY "Shared team can read visits" ON public.visits FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.clients c WHERE c.id = visits.client_id AND public.can_manage_client_record(c.id))
  OR EXISTS (SELECT 1 FROM public.partners p WHERE p.id = visits.partner_id AND public.can_manage_shared_record(p.created_by,p.secondary_owner_id)));
DROP POLICY IF EXISTS "Shared team can read work" ON public.work_scope_items;
CREATE POLICY "Shared team can read work" ON public.work_scope_items FOR SELECT TO authenticated USING (
  public.can_manage_shared_record(created_by,NULL) OR EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = work_scope_items.client_id AND public.can_manage_client_record(c.id)));

DROP POLICY IF EXISTS "Shared team can update work" ON public.work_scope_items;
CREATE POLICY "Shared team can update work" ON public.work_scope_items FOR UPDATE TO authenticated
  USING (public.can_manage_shared_record(created_by,NULL) OR public.can_manage_client_record(client_id))
  WITH CHECK (public.can_manage_shared_record(created_by,NULL) OR public.can_manage_client_record(client_id));

-- Existing client rows can still be edited; new clients require an architect.
CREATE OR REPLACE FUNCTION public.require_new_client_architect()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF nullif(trim(NEW.architect_name),'') IS NULL THEN RAISE EXCEPTION 'Architect Name is required for new clients'; END IF;
  NEW.architect_name = trim(NEW.architect_name);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS require_new_client_architect ON public.clients;
CREATE TRIGGER require_new_client_architect BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.require_new_client_architect();

ALTER TABLE public.whatshub_report_settings DROP CONSTRAINT IF EXISTS whatshub_report_settings_report_key_check;
ALTER TABLE public.whatshub_report_settings ADD CONSTRAINT whatshub_report_settings_report_key_check
  CHECK (report_key IN ('plan_actual','followups','outcomes','tl_outcomes','weekly_summary','conveyance'));
CREATE TABLE IF NOT EXISTS public.whatshub_director_report_runs (
  report_key text NOT NULL CHECK (report_key = 'plan_actual'), report_date date NOT NULL,
  status text NOT NULL DEFAULT 'running', error text, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_key,report_date)
);
ALTER TABLE public.whatshub_director_report_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatshub_director_report_runs FROM anon, authenticated;
GRANT ALL ON public.whatshub_director_report_runs TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
