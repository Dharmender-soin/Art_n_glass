BEGIN;
ALTER TABLE public.work_scope_items ADD COLUMN IF NOT EXISTS execution_status text NOT NULL DEFAULT 'not_started';
ALTER TABLE public.work_scope_items ADD COLUMN IF NOT EXISTS execution_updated_at timestamptz;
ALTER TABLE public.work_scope_items ADD COLUMN IF NOT EXISTS execution_updated_by uuid;
ALTER TABLE public.work_scope_items DROP CONSTRAINT IF EXISTS work_scope_items_execution_status_check;
ALTER TABLE public.work_scope_items ADD CONSTRAINT work_scope_items_execution_status_check CHECK (execution_status IN ('not_started','in_progress','completed'));
CREATE TABLE IF NOT EXISTS public.wos_execution_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), work_scope_id uuid NOT NULL REFERENCES public.work_scope_items(id) ON DELETE CASCADE,
  old_status text NOT NULL, new_status text NOT NULL, changed_by uuid, changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wos_execution_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_execution_history FROM anon, authenticated;
GRANT SELECT ON public.wos_execution_history TO authenticated;
DROP POLICY IF EXISTS "Read visible work progress history" ON public.wos_execution_history;
CREATE POLICY "Read visible work progress history" ON public.wos_execution_history FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.work_scope_items w WHERE w.id = work_scope_id));

CREATE OR REPLACE FUNCTION public.validate_wos_execution_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.execution_status IS NOT DISTINCT FROM OLD.execution_status THEN
    NEW.execution_updated_at = OLD.execution_updated_at;
    NEW.execution_updated_by = OLD.execution_updated_by;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT (public.can_manage_shared_record(OLD.created_by,NULL) OR public.can_manage_client_record(OLD.client_id))
    THEN RAISE EXCEPTION 'You cannot update this WOS progress'; END IF;
  NEW.execution_updated_at = now(); NEW.execution_updated_by = auth.uid();
  INSERT INTO public.wos_execution_history(work_scope_id,old_status,new_status,changed_by)
    VALUES (OLD.id,OLD.execution_status,NEW.execution_status,auth.uid());
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS validate_wos_execution_status ON public.work_scope_items;
CREATE TRIGGER validate_wos_execution_status BEFORE UPDATE ON public.work_scope_items FOR EACH ROW EXECUTE FUNCTION public.validate_wos_execution_status();

CREATE OR REPLACE FUNCTION public.set_wos_execution_status(p_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item public.work_scope_items;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('not_started','in_progress','completed') THEN RAISE EXCEPTION 'Invalid work progress'; END IF;
  SELECT * INTO item FROM public.work_scope_items WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Work item not found'; END IF;
  IF NOT (public.can_manage_shared_record(item.created_by,NULL) OR public.can_manage_client_record(item.client_id))
    THEN RAISE EXCEPTION 'You cannot update this WOS progress'; END IF;
  UPDATE public.work_scope_items SET execution_status = p_status WHERE id = p_id;
END; $$;
REVOKE ALL ON FUNCTION public.set_wos_execution_status(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_wos_execution_status(uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
