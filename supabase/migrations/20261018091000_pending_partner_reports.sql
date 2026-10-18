BEGIN;
ALTER TABLE public.whatshub_report_settings ADD COLUMN IF NOT EXISTS schedule_start_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date + 1);
ALTER TABLE public.whatshub_report_settings DROP CONSTRAINT IF EXISTS whatshub_report_settings_report_key_check;
ALTER TABLE public.whatshub_report_settings ADD CONSTRAINT whatshub_report_settings_report_key_check CHECK(report_key IN ('plan_actual','followups','outcomes','tl_outcomes','weekly_summary','conveyance','pending_partners'));
-- New report: first run tomorrow at 10:15 IST, then every 15 days. Existing report toggles are preserved.
INSERT INTO public.whatshub_report_settings(showroom_id,report_key,enabled)
SELECT id,'pending_partners',true FROM public.showrooms WHERE nullif(trim(whatsapp_group_id),'') IS NOT NULL
ON CONFLICT(showroom_id,report_key) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
