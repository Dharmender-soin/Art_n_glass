-- ─────────────────────────────────────────────────────────────
-- MIGRATION: Start Day & End Day Daily Reminders
-- DATE: 2026-06-26
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_and_trigger_attendance_alerts(is_start_day BOOLEAN)
RETURNS void AS $$
DECLARE
  rec RECORD;
BEGIN
  -- We query all active executives
  FOR rec IN
    SELECT 
      ur.user_id,
      p.full_name AS employee_name
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'executive' AND ur.is_active = true
  LOOP
    IF is_start_day THEN
      -- A. START DAY CHECK (Triggered at 9:00 AM)
      -- Check if they have checked in today
      IF NOT EXISTS (
        SELECT 1 FROM public.daily_attendance 
        WHERE user_id = rec.user_id AND date = CURRENT_DATE
      ) THEN
        -- Verify no similar alert scheduled in the last 12h
        IF NOT EXISTS (
          SELECT 1 FROM public.scheduled_notifications 
          WHERE target_type = 'individual' AND target_id = rec.user_id::text 
            AND title = 'Start Your Day! 🏃' AND created_at >= now() - interval '12 hours'
        ) THEN
          INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
          VALUES (
            'Start Your Day! 🏃',
            'Don''t forget to start your day! Please check in and log your attendance.',
            'individual',
            rec.user_id::text,
            '/',
            now()
          );
        END IF;
      END IF;
    ELSE
      -- B. END DAY CHECK (Triggered at 8:00 PM)
      -- Check if they checked in, but have NOT checked out (ended day)
      IF EXISTS (
        SELECT 1 FROM public.daily_attendance 
        WHERE user_id = rec.user_id AND date = CURRENT_DATE
      ) AND NOT EXISTS (
        SELECT 1 FROM public.conveyance_records
        WHERE user_id = rec.user_id AND date = CURRENT_DATE AND visit_id IS NULL
      ) THEN
        -- Verify no similar alert scheduled in the last 12h
        IF NOT EXISTS (
          SELECT 1 FROM public.scheduled_notifications 
          WHERE target_type = 'individual' AND target_id = rec.user_id::text 
            AND title = 'End Your Day! 🏁' AND created_at >= now() - interval '12 hours'
        ) THEN
          INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
          VALUES (
            'End Your Day! 🏁',
            'Gentle reminder: Please don''t forget to end your day and log your final updates.',
            'individual',
            rec.user_id::text,
            '/',
            now()
          );
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Schedule cron tasks for daily attendance alerts
-- Run start day alerts at 9:00 AM IST (3:30 AM UTC)
DO $$ BEGIN PERFORM cron.unschedule('attendance-start-day-alerts'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'attendance-start-day-alerts',
  '30 3 * * *',
  'SELECT public.check_and_trigger_attendance_alerts(true);'
);

-- Run end day alerts at 8:00 PM IST (2:30 PM UTC / 14:30 UTC)
DO $$ BEGIN PERFORM cron.unschedule('attendance-end-day-alerts'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'attendance-end-day-alerts',
  '30 14 * * *',
  'SELECT public.check_and_trigger_attendance_alerts(false);'
);
