-- ─────────────────────────────────────────────────────────────
-- MIGRATION: Notification Scheduling & Automated Triggers
-- DATE: 2026-06-24
-- ─────────────────────────────────────────────────────────────

-- 1. Enable pg_net and pg_cron extensions if not already present
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Create scheduled_notifications Table
CREATE TABLE IF NOT EXISTS public.scheduled_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_type TEXT NOT NULL, -- 'broadcast', 'showroom', 'individual'
  target_id TEXT,            -- user_id or showroom_id
  target_url TEXT DEFAULT '/',
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'sending', 'sent', 'failed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  error_message TEXT
);

-- Enable RLS
ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists and recreate
DROP POLICY IF EXISTS "Allow admins/md full access to scheduled_notifications" ON public.scheduled_notifications;
CREATE POLICY "Allow admins/md full access to scheduled_notifications"
ON public.scheduled_notifications
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'md')
  )
);

-- 3. Create Function to Process Scheduled Queue
CREATE OR REPLACE FUNCTION public.process_scheduled_notifications()
RETURNS void AS $$
DECLARE
  r RECORD;
  payload jsonb;
  req_id bigint;
BEGIN
  FOR r IN 
    UPDATE public.scheduled_notifications
    SET status = 'sending'
    WHERE status = 'pending' AND scheduled_for <= now()
    RETURNING id, title, body, target_type, target_id, target_url
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

    -- Call Edge Function via pg_net
    BEGIN
      SELECT net.http_post(
        url := 'https://khuqshdbpmuolyarhuud.supabase.co/functions/v1/send-push-notification',
        headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Rs8MWYZC0DOgeqmcTc9pGg_VNCOqbCz"}'::jsonb,
        body := payload
      ) INTO req_id;

      -- Mark as sent
      UPDATE public.scheduled_notifications
      SET status = 'sent'
      WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.scheduled_notifications
      SET status = 'failed', error_message = SQLERRM
      WHERE id = r.id;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Clean and schedule daily/minutely pg_cron tasks
DO $$ BEGIN PERFORM cron.unschedule('process-scheduled-notifications'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'process-scheduled-notifications',
  '* * * * *',
  'SELECT public.process_scheduled_notifications();'
);

-- Morning Reminder for Executives: 9:00 AM IST -> 3:30 AM UTC
DO $$ BEGIN PERFORM cron.unschedule('executive-morning-reminder'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'executive-morning-reminder',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://khuqshdbpmuolyarhuud.supabase.co/functions/v1/send-push-notification',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Rs8MWYZC0DOgeqmcTc9pGg_VNCOqbCz"}'::jsonb,
    body := '{"role": "executive", "title": "Start Your Day! ☀️", "body": "Remember to mark your attendance and check your scheduled visits.", "data": {"targetUrl": "/my-pipeline"}}'::jsonb
  );
  $$
);

-- Evening Reminder for Executives: 8:00 PM IST -> 2:30 PM UTC (14:30)
DO $$ BEGIN PERFORM cron.unschedule('executive-evening-reminder'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'executive-evening-reminder',
  '30 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://khuqshdbpmuolyarhuud.supabase.co/functions/v1/send-push-notification',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Rs8MWYZC0DOgeqmcTc9pGg_VNCOqbCz"}'::jsonb,
    body := '{"role": "executive", "title": "End of Day Reminder 📋", "body": "Don''t forget to check out of any active visits and log your conveyance details.", "data": {"targetUrl": "/conveyance"}}'::jsonb
  );
  $$
);

-- 5. Automated Database Trigger: New Conveyance Submitted (Notify MD/Admin)
CREATE OR REPLACE FUNCTION public.on_conveyance_inserted()
RETURNS TRIGGER AS $$
DECLARE
  exec_name text;
  payload jsonb;
  req_id bigint;
BEGIN
  -- Find executive name
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
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Rs8MWYZC0DOgeqmcTc9pGg_VNCOqbCz"}'::jsonb,
    body := payload
  ) INTO req_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger binding
DROP TRIGGER IF EXISTS tr_conveyance_inserted ON public.conveyance_records;
CREATE TRIGGER tr_conveyance_inserted
AFTER INSERT ON public.conveyance_records
FOR EACH ROW EXECUTE FUNCTION public.on_conveyance_inserted();

-- 6. Automated Database Trigger: Work Scope Item Status Updated (Won/Rejected) -> Notify Exec
CREATE OR REPLACE FUNCTION public.on_work_scope_status_updated()
RETURNS TRIGGER AS $$
DECLARE
  client_name text;
  payload jsonb;
  req_id bigint;
BEGIN
  -- Only run if status changed
  IF OLD.work_status = NEW.work_status THEN
    RETURN NEW;
  END IF;

  -- Get client name
  SELECT name INTO client_name FROM public.clients WHERE id = NEW.client_id;
  IF client_name IS NULL THEN
    client_name := 'Client';
  END IF;

  -- If status is won or rejected, notify the executive who created it
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
      headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Rs8MWYZC0DOgeqmcTc9pGg_VNCOqbCz"}'::jsonb,
      body := payload
    ) INTO req_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger binding
DROP TRIGGER IF EXISTS tr_work_scope_status_updated ON public.work_scope_items;
CREATE TRIGGER tr_work_scope_status_updated
AFTER UPDATE ON public.work_scope_items
FOR EACH ROW EXECUTE FUNCTION public.on_work_scope_status_updated();
