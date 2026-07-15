-- ─────────────────────────────────────────────────────────────
-- MIGRATION: Fix Conflicting apikey and Authorization Headers
-- DATE: 2026-07-15
-- ─────────────────────────────────────────────────────────────

-- 1. Re-define process_scheduled_notifications with matching apikey and Authorization headers
CREATE OR REPLACE FUNCTION public.process_scheduled_notifications()
RETURNS void AS $$
DECLARE
  r RECORD;
  payload jsonb;
  req_id bigint;
  next_scheduled TIMESTAMP WITH TIME ZONE;
BEGIN
  FOR r IN 
    UPDATE public.scheduled_notifications
    SET status = 'sending'
    WHERE status = 'pending' AND scheduled_for <= now()
    RETURNING id, title, body, target_type, target_id, target_url, recurrence, scheduled_for
  LOOP
    -- Build payload based on target type
    payload := jsonb_build_object(
      'title', r.title,
      'body', r.body,
      'data', jsonb_build_object('targetUrl', r.target_url)
    );

    IF r.target_type = 'broadcast' THEN
      payload := payload || '{"broadcast": true}'::jsonb;
    ELSIF r.target_type = 'showroom' THEN
      payload := payload || jsonb_build_object('showroomId', r.target_id);
    ELSIF r.target_type = 'individual' THEN
      payload := payload || jsonb_build_object('userId', r.target_id);
    END IF;

    -- Call Edge Function via pg_net with matching headers (using service role key for both apikey and Authorization)
    BEGIN
      SELECT net.http_post(
        url := 'https://khuqshdbpmuolyarhuud.supabase.co/functions/v1/send-push-notification',
        headers := '{"Content-Type": "application/json", "apikey": "sb_secret_sli3qU6nC-9_JU1E_T84og_IY1W8em4", "Authorization": "Bearer sb_secret_sli3qU6nC-9_JU1E_T84og_IY1W8em4"}'::jsonb,
        body := payload
      ) INTO req_id;

      -- Handle recurrence logic
      IF r.recurrence IS NOT NULL AND r.recurrence != 'one_time' THEN
        IF r.recurrence = 'daily' THEN
          next_scheduled := r.scheduled_for + interval '1 day';
        ELSIF r.recurrence = 'weekly' THEN
          next_scheduled := r.scheduled_for + interval '1 week';
        ELSIF r.recurrence = 'fifteen_days' THEN
          next_scheduled := r.scheduled_for + interval '15 days';
        ELSIF r.recurrence = 'monthly' THEN
          next_scheduled := r.scheduled_for + interval '1 month';
        ELSE
          next_scheduled := r.scheduled_for + interval '1 day';
        END IF;

        UPDATE public.scheduled_notifications
        SET status = 'sent'
        WHERE id = r.id;

        INSERT INTO public.scheduled_notifications (
          title, body, target_type, target_id, target_url, scheduled_for, status, recurrence
        ) VALUES (
          r.title, r.body, r.target_type, r.target_id, r.target_url, next_scheduled, 'pending', r.recurrence
        );
      ELSE
        UPDATE public.scheduled_notifications
        SET status = 'sent'
        WHERE id = r.id;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      UPDATE public.scheduled_notifications
      SET status = 'failed', error_message = SQLERRM
      WHERE id = r.id;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Re-define on_conveyance_inserted trigger function with matching headers
CREATE OR REPLACE FUNCTION public.on_conveyance_inserted()
RETURNS TRIGGER AS $$
DECLARE
  exec_name text;
  payload jsonb;
  req_id bigint;
BEGIN
  SELECT full_name INTO exec_name FROM public.profiles WHERE user_id = NEW.user_id;
  IF exec_name IS NULL THEN
    exec_name := 'An employee';
  END IF;

  payload := jsonb_build_object(
    'role', 'md',
    'title', 'New Conveyance Claim',
    'body', exec_name || ' has submitted a claim of ₹' || NEW.amount || ' for ' || NEW.distance_km || ' km.',
    'data', jsonb_build_object('targetUrl', '/md-dashboard')
  );

  SELECT net.http_post(
    url := 'https://khuqshdbpmuolyarhuud.supabase.co/functions/v1/send-push-notification',
    headers := '{"Content-Type": "application/json", "apikey": "sb_secret_sli3qU6nC-9_JU1E_T84og_IY1W8em4", "Authorization": "Bearer sb_secret_sli3qU6nC-9_JU1E_T84og_IY1W8em4"}'::jsonb,
    body := payload
  ) INTO req_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Re-define on_work_scope_status_updated trigger function with matching headers
CREATE OR REPLACE FUNCTION public.on_work_scope_status_updated()
RETURNS TRIGGER AS $$
DECLARE
  client_name text;
  payload jsonb;
  req_id bigint;
BEGIN
  IF OLD.work_status = NEW.work_status THEN
    RETURN NEW;
  END IF;

  SELECT name INTO client_name FROM public.clients WHERE id = NEW.client_id;
  IF client_name IS NULL THEN
    client_name := 'Client';
  END IF;

  IF NEW.work_status IN ('won', 'rejected') THEN
    payload := jsonb_build_object(
      'userId', NEW.created_by,
      'title', CASE WHEN NEW.work_status = 'won' THEN 'Deal Won! 🎉' ELSE 'Work Scope Rejected ❌' END,
      'body', CASE 
        WHEN NEW.work_status = 'won' THEN 'Congratulations! Your work scope item for ' || client_name || ' has been approved/won.'
        ELSE 'Your work scope item for ' || client_name || ' was rejected.'
      END,
      'data', jsonb_build_object('targetUrl', '/my-pipeline')
    );

    SELECT net.http_post(
      url := 'https://khuqshdbpmuolyarhuud.supabase.co/functions/v1/send-push-notification',
      headers := '{"Content-Type": "application/json", "apikey": "sb_secret_sli3qU6nC-9_JU1E_T84og_IY1W8em4", "Authorization": "Bearer sb_secret_sli3qU6nC-9_JU1E_T84og_IY1W8em4"}'::jsonb,
      body := payload
    ) INTO req_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Re-schedule daily crons with matching headers
DO $$ BEGIN PERFORM cron.unschedule('executive-morning-reminder'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'executive-morning-reminder',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://khuqshdbpmuolyarhuud.supabase.co/functions/v1/send-push-notification',
    headers := '{"Content-Type": "application/json", "apikey": "sb_secret_sli3qU6nC-9_JU1E_T84og_IY1W8em4", "Authorization": "Bearer sb_secret_sli3qU6nC-9_JU1E_T84og_IY1W8em4"}'::jsonb,
    body := '{"role": "executive", "title": "Start Your Day! ☀️", "body": "Remember to mark your attendance and check your scheduled visits.", "data": {"targetUrl": "/my-pipeline"}}'::jsonb
  );
  $$
);

DO $$ BEGIN PERFORM cron.unschedule('executive-evening-reminder'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'executive-evening-reminder',
  '30 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://khuqshdbpmuolyarhuud.supabase.co/functions/v1/send-push-notification',
    headers := '{"Content-Type": "application/json", "apikey": "sb_secret_sli3qU6nC-9_JU1E_T84og_IY1W8em4", "Authorization": "Bearer sb_secret_sli3qU6nC-9_JU1E_T84og_IY1W8em4"}'::jsonb,
    body := '{"role": "executive", "title": "End of Day Reminder 📋", "body": "Don''t forget to check out of any active visits and log your conveyance details.", "data": {"targetUrl": "/conveyance"}}'::jsonb
  );
  $$
);
