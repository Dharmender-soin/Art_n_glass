BEGIN;

-- Report configuration only; employee identity, permissions and business records stay intact.
CREATE TABLE IF NOT EXISTS public.whatshub_report_exclusions (
  report_key text NOT NULL CHECK (report_key = 'plan_actual'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_key, user_id)
);
ALTER TABLE public.whatshub_report_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatshub_report_exclusions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.whatshub_report_exclusions TO service_role;

DO $$
DECLARE target_id uuid; matches integer;
BEGIN
  SELECT count(*), (array_agg(p.user_id))[1] INTO matches, target_id
  FROM public.profiles p
  WHERE lower(btrim(regexp_replace(btrim(p.full_name), '^mr([.][[:space:]]*|[[:space:]]+)', '', 'i'))) = 'gurgaon manager'
    AND EXISTS (
      SELECT 1 FROM public.user_roles r
      JOIN public.showrooms s ON s.id = r.showroom_id
      WHERE r.user_id = p.user_id AND r.role = 'manager' AND r.is_active = true
        AND lower(btrim(s.name)) IN ('gurgaon', 'gurugram')
    );
  IF matches <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active Gurgaon Manager test account in Gurgaon; found %. No exclusion applied. Identify the correct user_id first.', matches;
  END IF;
  INSERT INTO public.whatshub_report_exclusions(report_key, user_id, reason)
  VALUES ('plan_actual', target_id, 'Gurgaon Manager account is used for testing; exclude from Director manager report.')
  ON CONFLICT (report_key, user_id) DO UPDATE SET reason = EXCLUDED.reason;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT p.user_id, p.full_name, e.report_key, e.reason,
  EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id AND r.role = 'manager' AND r.is_active = true) AS manager_login_role_still_active
FROM public.whatshub_report_exclusions e
JOIN public.profiles p ON p.user_id = e.user_id
WHERE e.report_key = 'plan_actual';
