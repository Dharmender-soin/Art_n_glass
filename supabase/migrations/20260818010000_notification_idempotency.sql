-- One campaign must produce at most one dispatch, regardless of how many
-- browser/app sessions mount at the same time.
ALTER TABLE public.notification_dispatches
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notification_dispatches_idempotency_key_uidx
  ON public.notification_dispatches (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notification_dispatches_type_created_idx
  ON public.notification_dispatches (notification_type, created_at DESC);

COMMENT ON COLUMN public.notification_dispatches.idempotency_key IS
  'Stable campaign+recipient+business-date key used to suppress duplicate Bell and FCM delivery.';
