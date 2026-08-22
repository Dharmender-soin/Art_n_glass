CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

ALTER TABLE public.showrooms
  ADD COLUMN IF NOT EXISTS whatsapp_planning_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.whatshub_message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  showroom_id uuid REFERENCES public.showrooms(id) ON DELETE SET NULL,
  message_type text NOT NULL,
  message text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('sent', 'partial', 'failed')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatshub_message_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Management can view WhatsHub logs" ON public.whatshub_message_logs;
CREATE POLICY "Management can view WhatsHub logs" ON public.whatshub_message_logs
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'md'))
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('manager', 'tl')
      AND showroom_id = whatshub_message_logs.showroom_id
  )
);

CREATE INDEX IF NOT EXISTS whatshub_message_logs_showroom_created_idx
  ON public.whatshub_message_logs (showroom_id, created_at DESC);

-- The Edge Function sends one internal summary to every active staff phone in
-- each showroom. Actual WhatsApp group IDs are not used because the documented
-- WhatsHub endpoint accepts phone recipients.
--
-- Configure these matching secrets before enabling the 10:30 scheduler:
--   Edge Function: WHATSHUB_CRON_SECRET
--   Vault: project_url, anon_key, whatshub_cron_secret
CREATE OR REPLACE FUNCTION public.invoke_daily_whatshub_planning()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_project_url text;
  v_anon_key text;
  v_cron_secret text;
BEGIN
  SELECT decrypted_secret INTO v_project_url FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  SELECT decrypted_secret INTO v_anon_key FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;
  SELECT decrypted_secret INTO v_cron_secret FROM vault.decrypted_secrets WHERE name = 'whatshub_cron_secret' LIMIT 1;

  IF v_project_url IS NULL OR v_anon_key IS NULL OR v_cron_secret IS NULL THEN
    RAISE WARNING 'WhatsHub planning skipped: required Vault secrets are missing';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/whatshub',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'apikey', v_anon_key,
      'X-Cron-Secret', v_cron_secret
    ),
    body := '{"action":"send_planning_summaries"}'::jsonb
  );
END;
$$;

DO $$ BEGIN PERFORM cron.unschedule('daily-showroom-whatshub-planning'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
-- 10:30 Asia/Kolkata = 05:00 UTC.
SELECT cron.schedule(
  'daily-showroom-whatshub-planning',
  '0 5 * * *',
  'SELECT public.invoke_daily_whatshub_planning();'
);
