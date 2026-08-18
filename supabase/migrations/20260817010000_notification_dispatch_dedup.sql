-- Centralize scheduled notification dispatch and remove overlapping browser-era jobs.
-- The conditional attendance jobs remain the single source of Start/End Day reminders.

-- Bring the live notification table up to the richer payload expected by the app.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'informational',
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS notification_type text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS target_url text,
  ADD COLUMN IF NOT EXISTS deep_link text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

DO $$
BEGIN
  PERFORM cron.unschedule('executive-morning-reminder');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('executive-evening-reminder');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Prevent the same target/title/time from being queued more than once while active.
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_notifications_active_dedupe_idx
ON public.scheduled_notifications (
  target_type,
  COALESCE(target_id, ''),
  title,
  scheduled_for
)
WHERE status IN ('pending', 'sending');

COMMENT ON INDEX public.scheduled_notifications_active_dedupe_idx IS
  'Prevents duplicate active notification jobs for the same target, title, and schedule.';
