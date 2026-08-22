-- One authoritative Start/End Day scheduler.
-- The generic role broadcasts overlap with attendance-aware reminders and can
-- send the same notification twice to employees who have not checked in/out.
DO $$
BEGIN
  PERFORM cron.unschedule('executive-morning-reminder');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('executive-evening-reminder');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.check_and_trigger_attendance_alerts(is_start_day BOOLEAN)
RETURNS void AS $$
DECLARE
  rec RECORD;
BEGIN
  -- Field executives and team leaders both operate Start/End Day.
  FOR rec IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role IN ('executive', 'tl')
      AND ur.is_active = true
  LOOP
    IF is_start_day THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.daily_attendance
        WHERE user_id = rec.user_id AND date = CURRENT_DATE
      ) AND NOT EXISTS (
        SELECT 1 FROM public.scheduled_notifications
        WHERE target_type = 'individual'
          AND target_id = rec.user_id::text
          AND title = 'Start Your Day! 🏃'
          AND created_at >= date_trunc('day', now())
      ) THEN
        INSERT INTO public.scheduled_notifications
          (title, body, target_type, target_id, target_url, scheduled_for)
        VALUES
          ('Start Your Day! 🏃',
           'Don''t forget to start your day! Please check in and log your attendance.',
           'individual', rec.user_id::text, '/', now());
      END IF;
    ELSE
      IF EXISTS (
        SELECT 1 FROM public.daily_attendance
        WHERE user_id = rec.user_id AND date = CURRENT_DATE
      ) AND NOT EXISTS (
        SELECT 1 FROM public.conveyance_records
        WHERE user_id = rec.user_id
          AND date = CURRENT_DATE
          AND visit_id IS NULL
      ) AND NOT EXISTS (
        SELECT 1 FROM public.scheduled_notifications
        WHERE target_type = 'individual'
          AND target_id = rec.user_id::text
          AND title = 'End Your Day! 🏁'
          AND created_at >= date_trunc('day', now())
      ) THEN
        INSERT INTO public.scheduled_notifications
          (title, body, target_type, target_id, target_url, scheduled_for)
        VALUES
          ('End Your Day! 🏁',
           'Gentle reminder: Please don''t forget to end your day and log your final updates.',
           'individual', rec.user_id::text, '/', now());
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate the two attendance-aware schedules explicitly in IST-equivalent UTC.
DO $$ BEGIN PERFORM cron.unschedule('attendance-start-day-alerts'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'attendance-start-day-alerts',
  '30 3 * * *', -- 09:00 IST
  'SELECT public.check_and_trigger_attendance_alerts(true);'
);

DO $$ BEGIN PERFORM cron.unschedule('attendance-end-day-alerts'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'attendance-end-day-alerts',
  '30 14 * * *', -- 20:00 IST
  'SELECT public.check_and_trigger_attendance_alerts(false);'
);
