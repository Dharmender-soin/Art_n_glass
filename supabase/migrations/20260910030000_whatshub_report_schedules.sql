BEGIN;
CREATE TABLE IF NOT EXISTS public.whatshub_report_settings (
  showroom_id uuid NOT NULL REFERENCES public.showrooms(id) ON DELETE CASCADE,
  report_key text NOT NULL CHECK (report_key IN ('plan_actual','followups','outcomes','weekly_summary','conveyance')),
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (showroom_id, report_key)
);
ALTER TABLE public.whatshub_report_settings ENABLE ROW LEVEL SECURITY;
-- Only the authenticated Edge Function service role reads/writes these settings.
REVOKE ALL ON public.whatshub_report_settings FROM anon, authenticated;
GRANT ALL ON public.whatshub_report_settings TO service_role;
CREATE TABLE IF NOT EXISTS public.whatshub_report_runs (
  showroom_id uuid NOT NULL REFERENCES public.showrooms(id) ON DELETE CASCADE,
  report_key text NOT NULL,
  report_date date NOT NULL,
  status text NOT NULL DEFAULT 'running',
  error text,
  PRIMARY KEY (showroom_id, report_key, report_date)
);
ALTER TABLE public.whatshub_report_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatshub_report_runs FROM anon, authenticated;
GRANT ALL ON public.whatshub_report_runs TO service_role;
CREATE OR REPLACE FUNCTION public.invoke_daily_whatshub_planning()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE u text; a text; s text;
BEGIN
  SELECT decrypted_secret INTO u FROM vault.decrypted_secrets WHERE name='project_url' LIMIT 1;
  SELECT decrypted_secret INTO a FROM vault.decrypted_secrets WHERE name='anon_key' LIMIT 1;
  SELECT decrypted_secret INTO s FROM vault.decrypted_secrets WHERE name='whatshub_cron_secret' LIMIT 1;
  IF u IS NULL OR a IS NULL OR s IS NULL THEN RAISE EXCEPTION 'WhatsHub scheduler secrets missing'; END IF;
  PERFORM net.http_post(url := rtrim(u,'/') || '/functions/v1/whatshub',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||a,'apikey',a,'X-Cron-Secret',s),
    body := '{"action":"run_scheduled_reports"}'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.invoke_daily_whatshub_planning() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN PERFORM cron.unschedule('daily-showroom-whatshub-planning'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('showroom-whatshub-reports'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('showroom-whatshub-reports','*/15 * * * *','SELECT public.invoke_daily_whatshub_planning();');
NOTIFY pgrst, 'reload schema';
COMMIT;
