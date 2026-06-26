-- ─────────────────────────────────────────────────────────────
-- MIGRATION: Add Recurrence to Scheduled Notifications
-- DATE: 2026-06-26
-- ─────────────────────────────────────────────────────────────

-- 1. Add recurrence column to scheduled_notifications
ALTER TABLE public.scheduled_notifications 
  ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT 'one_time';

-- 2. Update process_scheduled_notifications function to handle recurring dispatches
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

    -- Call Edge Function via pg_net
    BEGIN
      SELECT net.http_post(
        url := 'https://khuqshdbpmuolyarhuud.supabase.co/functions/v1/send-push-notification',
        headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Rs8MWYZC0DOgeqmcTc9pGg_VNCOqbCz"}'::jsonb,
        body := payload
      ) INTO req_id;

      -- If it's a recurring notification, we want to keep a history of the sent one,
      -- and schedule the next occurrence.
      IF r.recurrence IS NOT NULL AND r.recurrence != 'one_time' THEN
        -- Calculate next run time
        IF r.recurrence = 'daily' THEN
          next_scheduled := r.scheduled_for + interval '1 day';
        ELSIF r.recurrence = 'weekly' THEN
          next_scheduled := r.scheduled_for + interval '1 week';
        ELSIF r.recurrence = 'fifteen_days' THEN
          next_scheduled := r.scheduled_for + interval '15 days';
        ELSIF r.recurrence = 'monthly' THEN
          next_scheduled := r.scheduled_for + interval '1 month';
        ELSE
          next_scheduled := NULL;
        END IF;

        IF next_scheduled IS NOT NULL THEN
          -- Reschedule the current one to the next time and set back to pending
          UPDATE public.scheduled_notifications
          SET status = 'pending', scheduled_for = next_scheduled
          WHERE id = r.id;

          -- Insert a copy representing the historical dispatch
          INSERT INTO public.scheduled_notifications (
            title, body, target_type, target_id, target_url, scheduled_for, status, recurrence
          ) VALUES (
            r.title, r.body, r.target_type, r.target_id, r.target_url, r.scheduled_for, 'sent', 'one_time'
          );
        ELSE
          -- Fallback if recurrence is invalid
          UPDATE public.scheduled_notifications
          SET status = 'sent'
          WHERE id = r.id;
        END IF;
      ELSE
        -- Mark as sent for one_time
        UPDATE public.scheduled_notifications
        SET status = 'sent'
        WHERE id = r.id;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- Handle failure case for recurring/one-time
      IF r.recurrence IS NOT NULL AND r.recurrence != 'one_time' THEN
        -- Calculate next run time
        IF r.recurrence = 'daily' THEN
          next_scheduled := r.scheduled_for + interval '1 day';
        ELSIF r.recurrence = 'weekly' THEN
          next_scheduled := r.scheduled_for + interval '1 week';
        ELSIF r.recurrence = 'fifteen_days' THEN
          next_scheduled := r.scheduled_for + interval '15 days';
        ELSIF r.recurrence = 'monthly' THEN
          next_scheduled := r.scheduled_for + interval '1 month';
        ELSE
          next_scheduled := NULL;
        END IF;

        IF next_scheduled IS NOT NULL THEN
          -- Reschedule the current one to the next time and set back to pending
          UPDATE public.scheduled_notifications
          SET status = 'pending', scheduled_for = next_scheduled
          WHERE id = r.id;

          -- Insert a copy representing the historical dispatch (failed)
          INSERT INTO public.scheduled_notifications (
            title, body, target_type, target_id, target_url, scheduled_for, status, recurrence, error_message
          ) VALUES (
            r.title, r.body, r.target_type, r.target_id, r.target_url, r.scheduled_for, 'failed', 'one_time', SQLERRM
          );
        ELSE
          UPDATE public.scheduled_notifications
          SET status = 'failed', error_message = SQLERRM
          WHERE id = r.id;
        END IF;
      ELSE
        UPDATE public.scheduled_notifications
        SET status = 'failed', error_message = SQLERRM
        WHERE id = r.id;
      END IF;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
