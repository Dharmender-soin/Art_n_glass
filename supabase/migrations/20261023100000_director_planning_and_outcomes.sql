BEGIN;

-- Apply the Gurgaon Manager exclusion migration first. These exclusions are shared
-- by Manager Planning, Plan vs Actual, and Manager Outcomes.
DO $$ BEGIN
  IF to_regclass('public.whatshub_report_exclusions') IS NULL
     OR to_regclass('public.whatshub_director_report_runs') IS NULL THEN
    RAISE EXCEPTION 'Apply the existing Director report and Gurgaon Manager exclusion SQL first.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.whatshub_director_report_settings (
  report_key text PRIMARY KEY CHECK (report_key IN ('manager_planning', 'manager_outcomes')),
  enabled boolean NOT NULL DEFAULT true
);
ALTER TABLE public.whatshub_director_report_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatshub_director_report_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.whatshub_director_report_settings TO service_role;

-- Enable the two requested new schedules. Re-running preserves any later OFF choice.
INSERT INTO public.whatshub_director_report_settings(report_key, enabled)
VALUES ('manager_planning', true), ('manager_outcomes', true)
ON CONFLICT (report_key) DO NOTHING;

ALTER TABLE public.whatshub_director_report_runs
  DROP CONSTRAINT IF EXISTS whatshub_director_report_runs_report_key_check;
ALTER TABLE public.whatshub_director_report_runs
  ADD CONSTRAINT whatshub_director_report_runs_report_key_check
  CHECK (report_key IN ('plan_actual', 'manager_planning', 'manager_outcomes'));

-- Existing group settings, cron job, Plan vs Actual settings, exclusions and run history stay intact.
NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT report_key, enabled,
  CASE report_key WHEN 'manager_planning' THEN '10:00 AM IST' ELSE '09:00 PM IST' END AS send_time,
  'Active Director / MD personal WhatsApp numbers' AS destination
FROM public.whatshub_director_report_settings ORDER BY report_key;
