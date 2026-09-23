BEGIN;

-- Keep the creator's display name on the work item itself. Managers can see
-- historical/shared work even when that creator moved outside their showroom.
-- The existing work-item RLS protects this name; profile access is not widened.
ALTER TABLE public.work_scope_items ADD COLUMN IF NOT EXISTS creator_name text;
CREATE OR REPLACE FUNCTION public.set_work_scope_creator_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  SELECT COALESCE(NULLIF(btrim(p.full_name), ''),
    NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''),
    NULLIF(btrim(u.raw_user_meta_data->>'name'), ''))
  INTO NEW.creator_name
  FROM auth.users u LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.id = NEW.created_by;
  IF NEW.creator_name IS NULL AND TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS NOT DISTINCT FROM OLD.created_by THEN
      NEW.creator_name := OLD.creator_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_work_scope_creator_name() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS set_work_scope_creator_name ON public.work_scope_items;
CREATE TRIGGER set_work_scope_creator_name
BEFORE INSERT OR UPDATE ON public.work_scope_items
FOR EACH ROW EXECUTE FUNCTION public.set_work_scope_creator_name();

UPDATE public.work_scope_items w
SET creator_name = COALESCE(NULLIF(btrim(p.full_name), ''),
  NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''),
  NULLIF(btrim(u.raw_user_meta_data->>'name'), ''))
FROM auth.users u LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE u.id = w.created_by AND w.creator_name IS NULL;

-- Return display names only, including historical/inactive employees. A missing
-- profile may recover its name from Auth metadata; no account data is returned.
CREATE OR REPLACE FUNCTION public.get_employee_display_names(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT u.id, COALESCE(NULLIF(btrim(p.full_name), ''),
    NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''),
    NULLIF(btrim(u.raw_user_meta_data->>'name'), ''))
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.id = ANY(p_user_ids)
    AND cardinality(p_user_ids) <= 100
    AND auth.uid() IS NOT NULL
    AND (
      u.id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'md'::public.app_role)
      OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND (
        EXISTS (
          SELECT 1 FROM public.user_roles me
          JOIN public.user_roles employee ON employee.showroom_id = me.showroom_id
          WHERE me.user_id = auth.uid() AND me.role = 'manager'
            AND employee.user_id = u.id
        )
        OR EXISTS (
          SELECT 1 FROM public.work_scope_items w
          JOIN public.clients c ON c.id = w.client_id
          WHERE w.created_by = u.id AND c.secondary_owner_id = auth.uid()
        )
      ))
    );
$$;
REVOKE ALL ON FUNCTION public.get_employee_display_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employee_display_names(uuid[]) TO authenticated;

-- Attendance must use the same management scope as the team shown on Live Map.
DROP POLICY IF EXISTS "Management can read team attendance" ON public.daily_attendance;
CREATE POLICY "Management can read team attendance" ON public.daily_attendance
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'md'::public.app_role)
  OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.user_roles me
    JOIN public.user_roles employee ON employee.showroom_id = me.showroom_id
    WHERE me.user_id = auth.uid() AND me.role = 'manager'
      AND employee.user_id = daily_attendance.user_id
  ))
);

DROP POLICY IF EXISTS "MDs can view all live locations" ON public.live_locations;
CREATE POLICY "MDs can view all live locations" ON public.live_locations
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'md'::public.app_role));
DROP POLICY IF EXISTS "MDs can view all location history" ON public.location_history;
CREATE POLICY "MDs can view all location history" ON public.location_history
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'md'::public.app_role));

NOTIFY pgrst, 'reload schema';
COMMIT;
