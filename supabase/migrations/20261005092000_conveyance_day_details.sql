BEGIN;
CREATE OR REPLACE FUNCTION public.accountant_can_view_conveyance(record_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles acc JOIN public.user_roles staff ON staff.showroom_id = acc.showroom_id
    WHERE acc.user_id = auth.uid() AND acc.role::text = 'accountant' AND acc.is_active AND staff.user_id = record_user_id);
$$;
REVOKE ALL ON FUNCTION public.accountant_can_view_conveyance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accountant_can_view_conveyance(uuid) TO authenticated;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS end_latitude double precision;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS end_longitude double precision;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS actual_address text;

-- Only use the explicitly recorded return trip for historical day-end times.
WITH endings AS (
  SELECT user_id,date,min(created_at) AS ended_at FROM public.conveyance_records
  WHERE visit_id IS NULL AND to_location_name = 'End Day Location' GROUP BY user_id,date
)
UPDATE public.daily_attendance a SET ended_at = e.ended_at FROM endings e
WHERE a.user_id = e.user_id AND a.date = e.date AND a.ended_at IS NULL;

CREATE OR REPLACE FUNCTION public.end_attendance_day(p_date date,p_lat double precision,p_lng double precision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_date <> (now() AT TIME ZONE 'Asia/Kolkata')::date THEN RAISE EXCEPTION 'Only today can be ended'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180
    OR (p_lat = 0 AND p_lng = 0) THEN RAISE EXCEPTION 'Valid end-day GPS coordinates are required'; END IF;
  UPDATE public.daily_attendance SET ended_at = now(), end_latitude = p_lat,end_longitude = p_lng
    WHERE user_id = auth.uid() AND date = p_date AND ended_at IS NULL;
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.daily_attendance WHERE user_id = auth.uid() AND date = p_date)
    THEN RAISE EXCEPTION 'Start Day is required before End Day'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.end_attendance_day(date,double precision,double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_attendance_day(date,double precision,double precision) TO authenticated;
DROP POLICY IF EXISTS "Report staff can read attendance" ON public.daily_attendance;
CREATE POLICY "Report staff can read attendance" ON public.daily_attendance FOR SELECT TO authenticated USING (
  public.can_manage_shared_record(user_id,NULL) OR public.accountant_can_view_conveyance(user_id));
DROP POLICY IF EXISTS "Accountants can read completed showroom visits" ON public.visits;
CREATE POLICY "Accountants can read completed showroom visits" ON public.visits FOR SELECT TO authenticated
  USING (status::text = 'done' AND public.accountant_can_view_conveyance(created_by));
NOTIFY pgrst, 'reload schema';
COMMIT;
