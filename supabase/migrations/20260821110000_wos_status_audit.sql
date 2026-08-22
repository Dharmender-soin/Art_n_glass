-- Complete, immutable status history for WOS changes.
ALTER TABLE public.work_scope_items
  ADD COLUMN IF NOT EXISTS last_status_change_reason text;

CREATE TABLE IF NOT EXISTS public.wos_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_scope_item_id uuid NOT NULL REFERENCES public.work_scope_items(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  reason text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wos_status_history_item_changed
  ON public.wos_status_history (work_scope_item_id, changed_at DESC);

ALTER TABLE public.wos_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view visible WOS status history" ON public.wos_status_history;
CREATE POLICY "Users can view visible WOS status history"
  ON public.wos_status_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.work_scope_items item
      WHERE item.id = wos_status_history.work_scope_item_id
    )
  );

CREATE OR REPLACE FUNCTION public.capture_wos_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.work_status IS DISTINCT FROM NEW.work_status THEN
    INSERT INTO public.wos_status_history (
      work_scope_item_id,
      old_status,
      new_status,
      reason,
      changed_by
    ) VALUES (
      NEW.id,
      OLD.work_status::text,
      NEW.work_status::text,
      NULLIF(BTRIM(NEW.last_status_change_reason), ''),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_capture_wos_status_change ON public.work_scope_items;
CREATE TRIGGER tr_capture_wos_status_change
AFTER UPDATE OF work_status ON public.work_scope_items
FOR EACH ROW
EXECUTE FUNCTION public.capture_wos_status_change();

CREATE OR REPLACE FUNCTION public.get_wos_status_history(p_work_scope_item_id uuid)
RETURNS TABLE (
  id uuid,
  old_status text,
  new_status text,
  reason text,
  changed_at timestamptz,
  changed_by_name text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    history.id,
    history.old_status,
    history.new_status,
    history.reason,
    history.changed_at,
    COALESCE(profile.full_name, 'User') AS changed_by_name
  FROM public.wos_status_history history
  LEFT JOIN public.profiles profile ON profile.user_id = history.changed_by
  WHERE history.work_scope_item_id = p_work_scope_item_id
  ORDER BY history.changed_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_wos_status_history(uuid) TO authenticated;
