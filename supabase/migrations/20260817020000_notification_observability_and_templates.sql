-- Professional notification observability, reusable templates and rich payload support.
-- This migration is additive: existing bell history and scheduled queue remain compatible.

CREATE TABLE IF NOT EXISTS public.notification_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'informational',
  priority text NOT NULL DEFAULT 'normal',
  notification_type text NOT NULL DEFAULT 'general',
  source text NOT NULL DEFAULT 'manual',
  style text NOT NULL DEFAULT 'standard',
  target_type text NOT NULL,
  target_id text,
  target_url text DEFAULT '/notifications',
  image_url text,
  template_key text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_notification_id uuid REFERENCES public.scheduled_notifications(id) ON DELETE SET NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  device_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.notification_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.notification_dispatches(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_token_id uuid REFERENCES public.user_fcm_tokens(id) ON DELETE SET NULL,
  device_platform text,
  status text NOT NULL DEFAULT 'queued',
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  received_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'informational',
  priority text NOT NULL DEFAULT 'normal',
  style text NOT NULL DEFAULT 'standard',
  title_template text NOT NULL,
  body_template text NOT NULL,
  target_url text DEFAULT '/notifications',
  allowed_variables text[] NOT NULL DEFAULT '{}',
  default_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dispatch_id uuid REFERENCES public.notification_dispatches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS style text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS variables jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.scheduled_notifications
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'reminder',
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS notification_type text DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS style text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS variables jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispatch_id uuid REFERENCES public.notification_dispatches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS notification_dispatches_created_at_idx
  ON public.notification_dispatches (created_at DESC);
CREATE INDEX IF NOT EXISTS notification_dispatches_status_idx
  ON public.notification_dispatches (status, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_delivery_logs_dispatch_idx
  ON public.notification_delivery_logs (dispatch_id, status);
CREATE INDEX IF NOT EXISTS notification_delivery_logs_user_idx
  ON public.notification_delivery_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_dispatch_idx
  ON public.notifications (dispatch_id);

ALTER TABLE public.notification_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and MD can read notification dispatches"
  ON public.notification_dispatches FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'md')
  ));

CREATE POLICY "Admins and MD can read notification delivery logs"
  ON public.notification_delivery_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'md')
  ));

CREATE POLICY "Users can update their own notification delivery events"
  ON public.notification_delivery_logs FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Authenticated users can read active notification templates"
  ON public.notification_templates FOR SELECT TO authenticated
  USING (is_active = true OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'md')
  ));

CREATE POLICY "Admins and MD can manage notification templates"
  ON public.notification_templates FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'md')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'md')
  ));

INSERT INTO public.notification_templates
  (template_key, name, description, category, priority, style, title_template, body_template, target_url, allowed_variables)
VALUES
  ('daily_summary', 'Daily Business Summary', 'MD-ready daily KPI snapshot', 'report', 'normal', 'report',
   'Daily Summary — {{today}}',
   '{{total_visits}} visits, {{completed_visits}} completed, {{wos_count}} WOS and {{won_count}} wins across {{showroom_name}}.',
   '/md-dashboard', ARRAY['today','total_visits','completed_visits','wos_count','won_count','showroom_name']),
  ('start_day', 'Start Day Reminder', 'Attendance and field-work reminder', 'reminder', 'high', 'standard',
   'Start Day Reminder — {{today}}',
   'Good morning {{user_name}}. Mark Start Day and check in for today''s {{planned_visits}} planned visits.',
   '/daily-visits', ARRAY['today','user_name','planned_visits']),
  ('deal_won', 'Deal Won Celebration', 'Celebrate a newly won work order', 'achievement', 'normal', 'celebration',
   'Deal Won — {{client_name}}',
   '{{user_name}} won {{wos_number}} worth {{amount}}. Great work!',
   '/reports', ARRAY['client_name','user_name','wos_number','amount']),
  ('critical_alert', 'Critical Action Alert', 'Urgent operational escalation', 'critical', 'urgent', 'critical',
   'Action Required — {{showroom_name}}',
   '{{inactive_count}} employees need attention and {{overdue_count}} actions are overdue.',
   '/md-dashboard', ARRAY['showroom_name','inactive_count','overdue_count']),
  ('partner_overdue', 'Partner Follow-up', 'Partner coverage follow-up reminder', 'reminder', 'high', 'report',
   'Partner Follow-up — {{showroom_name}}',
   '{{partner_overdue_count}} partners have not been visited in the selected period.',
   '/partner-visits', ARRAY['showroom_name','partner_overdue_count'])
ON CONFLICT (template_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  priority = EXCLUDED.priority,
  style = EXCLUDED.style,
  title_template = EXCLUDED.title_template,
  body_template = EXCLUDED.body_template,
  target_url = EXCLUDED.target_url,
  allowed_variables = EXCLUDED.allowed_variables,
  updated_at = now();

COMMENT ON TABLE public.notification_dispatches IS
  'One row per manual, scheduled or automatic notification campaign.';
COMMENT ON TABLE public.notification_delivery_logs IS
  'Per-device push lifecycle without storing raw FCM tokens.';
