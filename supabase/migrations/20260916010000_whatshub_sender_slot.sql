-- Keep existing installations on Number 1 until an admin selects another sender.
-- Existing credentials, destinations and schedules are unchanged.
BEGIN;

CREATE TABLE IF NOT EXISTS public.whatshub_sender_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  slot smallint NOT NULL DEFAULT 1 CHECK (slot IN (1, 2)),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.whatshub_sender_settings (id, slot)
VALUES (true, 1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.whatshub_sender_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatshub_sender_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.whatshub_sender_settings TO service_role;

CREATE OR REPLACE FUNCTION public.get_whatshub_sender_slot()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admin can view the WhatsHub sender';
  END IF;
  RETURN (SELECT slot::integer FROM public.whatshub_sender_settings WHERE id = true);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_whatshub_sender_slot(p_slot integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admin can change the WhatsHub sender';
  END IF;
  IF p_slot IS NULL OR p_slot NOT IN (1, 2) THEN
    RAISE EXCEPTION 'Choose WhatsHub Number 1 or Number 2';
  END IF;
  INSERT INTO public.whatshub_sender_settings (id, slot, updated_at, updated_by)
  VALUES (true, p_slot, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE
    SET slot = EXCLUDED.slot, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  RETURN p_slot;
END;
$$;

REVOKE ALL ON FUNCTION public.get_whatshub_sender_slot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_whatshub_sender_slot() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_whatshub_sender_slot(integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_whatshub_sender_slot(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
