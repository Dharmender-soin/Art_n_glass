-- Additive telemetry fields for smooth, vehicle-aware live tracking.
ALTER TABLE public.live_locations
  ADD COLUMN IF NOT EXISTS accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS speed_mps double precision,
  ADD COLUMN IF NOT EXISTS bearing_deg double precision,
  ADD COLUMN IF NOT EXISTS altitude_m double precision,
  ADD COLUMN IF NOT EXISTS battery_pct integer,
  ADD COLUMN IF NOT EXISTS permission_status text,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz DEFAULT now();

ALTER TABLE public.location_history
  ADD COLUMN IF NOT EXISTS accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS speed_mps double precision,
  ADD COLUMN IF NOT EXISTS bearing_deg double precision,
  ADD COLUMN IF NOT EXISTS altitude_m double precision;

CREATE INDEX IF NOT EXISTS live_locations_updated_at_idx
  ON public.live_locations (updated_at DESC);
CREATE INDEX IF NOT EXISTS location_history_user_timestamp_cover_idx
  ON public.location_history (user_id, timestamp DESC)
  INCLUDE (lat, lng, speed_mps, bearing_deg, accuracy_m);

COMMENT ON COLUMN public.live_locations.accuracy_m IS 'GPS horizontal accuracy radius in metres.';
COMMENT ON COLUMN public.live_locations.bearing_deg IS 'Direction of travel, clockwise degrees from north.';
