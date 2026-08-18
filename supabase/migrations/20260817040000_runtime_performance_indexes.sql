-- Read-path indexes for the dashboard, CRM lists, conveyance and live map.
-- Additive and safe to deploy independently; no business rows are changed.

CREATE INDEX IF NOT EXISTS visits_creator_date_status_idx
  ON public.visits (created_by, visit_date DESC, status);
CREATE INDEX IF NOT EXISTS visits_date_status_idx
  ON public.visits (visit_date DESC, status);
CREATE INDEX IF NOT EXISTS visits_partner_date_idx
  ON public.visits (partner_id, visit_date DESC) WHERE partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS visits_client_date_idx
  ON public.visits (client_id, visit_date DESC) WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_creator_created_idx
  ON public.clients (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS partners_creator_created_idx
  ON public.partners (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS partners_showroom_idx
  ON public.partners (showroom_id) WHERE showroom_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS work_scope_creator_created_idx
  ON public.work_scope_items (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS work_scope_status_created_idx
  ON public.work_scope_items (work_status, created_at DESC);

CREATE INDEX IF NOT EXISTS conveyance_user_date_idx
  ON public.conveyance_records (user_id, date DESC);
CREATE INDEX IF NOT EXISTS conveyance_date_idx
  ON public.conveyance_records (date DESC);

CREATE INDEX IF NOT EXISTS live_locations_updated_idx
  ON public.live_locations (updated_at DESC);
CREATE INDEX IF NOT EXISTS location_history_user_time_idx
  ON public.location_history (user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS user_roles_showroom_role_idx
  ON public.user_roles (showroom_id, role);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);
