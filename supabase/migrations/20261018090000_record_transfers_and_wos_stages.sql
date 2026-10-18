-- Art N Glass only. No employee profiles, visits, GPS points or claim amounts are changed.
BEGIN;

-- created_by is the existing primary-owner field used by this application.
-- Preserve the original creator independently before allowing an ownership transfer.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS original_created_by uuid;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS original_created_by uuid;
UPDATE public.clients SET original_created_by=created_by WHERE original_created_by IS NULL;
UPDATE public.partners SET original_created_by=created_by WHERE original_created_by IS NULL;
CREATE OR REPLACE FUNCTION public.preserve_record_creator() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN NEW.original_created_by:=NEW.created_by;
  ELSE NEW.original_created_by:=coalesce(OLD.original_created_by,OLD.created_by); END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS preserve_client_creator ON public.clients;
CREATE TRIGGER preserve_client_creator BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.preserve_record_creator();
DROP TRIGGER IF EXISTS preserve_partner_creator ON public.partners;
CREATE TRIGGER preserve_partner_creator BEFORE INSERT OR UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.preserve_record_creator();

CREATE TABLE IF NOT EXISTS public.record_transfer_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_type text NOT NULL CHECK(record_type IN ('client','partner')),
  record_id uuid NOT NULL, previous_owner uuid, new_owner uuid NOT NULL,
  changed_by uuid NOT NULL, reason text NOT NULL, changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.record_transfer_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.record_transfer_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.record_transfer_history TO authenticated;
DROP POLICY IF EXISTS "Management reads scoped transfers" ON public.record_transfer_history;
CREATE POLICY "Management reads scoped transfers" ON public.record_transfer_history FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.user_roles me WHERE me.user_id=auth.uid() AND me.is_active AND me.role::text IN ('admin','md','manager')
    AND (me.role::text IN ('admin','md') OR EXISTS(SELECT 1 FROM public.user_roles staff WHERE staff.user_id IN (previous_owner,new_owner) AND staff.showroom_id=me.showroom_id)))
);

CREATE OR REPLACE FUNCTION public.manage_crm_record(p_kind text,p_id uuid,p_action text,p_target uuid DEFAULT NULL,p_include_clients boolean DEFAULT false,p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_owner uuid; current_secondary uuid; item record; changed integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND is_active AND role::text IN ('admin','md','manager'))
    THEN RAISE EXCEPTION 'Only Admin, Director or an authorized Manager can transfer or delete records'; END IF;
  IF p_kind IS NULL OR p_action IS NULL OR p_kind NOT IN ('client','partner') OR p_action NOT IN ('transfer','delete') THEN RAISE EXCEPTION 'Invalid record action'; END IF;
  IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_kind='client' THEN
    SELECT created_by,secondary_owner_id INTO current_owner,current_secondary FROM clients WHERE id=p_id FOR UPDATE;
  ELSE
    SELECT created_by,secondary_owner_id INTO current_owner,current_secondary FROM partners WHERE id=p_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Record not found'; END IF;
  -- Managers must manage the primary owner's showroom; secondary access alone is insufficient.
  IF NOT EXISTS(SELECT 1 FROM user_roles me WHERE me.user_id=auth.uid() AND me.is_active
    AND (me.role::text IN ('admin','md') OR (me.role::text='manager' AND EXISTS(SELECT 1 FROM user_roles staff WHERE staff.user_id=current_owner AND staff.showroom_id=me.showroom_id))))
    THEN RAISE EXCEPTION 'This record is outside your managed showrooms'; END IF;
  IF p_action='delete' THEN
    IF p_kind='client' THEN
      IF EXISTS(SELECT 1 FROM work_scope_items WHERE client_id=p_id) OR EXISTS(SELECT 1 FROM visits WHERE client_id=p_id)
        THEN RAISE EXCEPTION 'This client has linked WOS or visits. Transfer it or close the project to preserve its history'; END IF;
      DELETE FROM clients WHERE id=p_id;
    ELSE
      IF EXISTS(SELECT 1 FROM clients WHERE partner_id=p_id) OR EXISTS(SELECT 1 FROM visits WHERE partner_id=p_id)
        THEN RAISE EXCEPTION 'This partner has linked clients or visits. Transfer it to preserve its history'; END IF;
      DELETE FROM partners WHERE id=p_id;
    END IF;
    RETURN jsonb_build_object('deleted',true);
  END IF;
  IF p_target IS NULL OR p_target=current_owner THEN RAISE EXCEPTION 'Select a different executive'; END IF;
  IF NOT EXISTS(SELECT 1 FROM user_roles staff WHERE staff.user_id=p_target AND staff.is_active AND staff.role::text='executive')
    OR NOT EXISTS(SELECT 1 FROM get_assignable_users() WHERE user_id=p_target)
    THEN RAISE EXCEPTION 'Select an active executive in your permitted team'; END IF;
  IF p_kind='partner' AND p_include_clients THEN
    FOR item IN SELECT id,created_by FROM clients WHERE partner_id=p_id ORDER BY id FOR UPDATE LOOP
      IF NOT EXISTS(SELECT 1 FROM user_roles me WHERE me.user_id=auth.uid() AND me.is_active
        AND (me.role::text IN ('admin','md') OR (me.role::text='manager' AND EXISTS(SELECT 1 FROM user_roles staff WHERE staff.user_id=item.created_by AND staff.showroom_id=me.showroom_id))))
        THEN RAISE EXCEPTION 'A linked client is outside your managed showrooms; no records were transferred'; END IF;
      IF item.created_by IS DISTINCT FROM p_target THEN
        INSERT INTO record_transfer_history(record_type,record_id,previous_owner,new_owner,changed_by,reason) VALUES('client',item.id,item.created_by,p_target,auth.uid(),trim(p_reason));
        UPDATE clients SET created_by=p_target,secondary_owner_id=CASE WHEN secondary_owner_id=p_target THEN NULL ELSE secondary_owner_id END WHERE id=item.id;
        changed:=changed+1;
      END IF;
    END LOOP;
  END IF;
  INSERT INTO record_transfer_history(record_type,record_id,previous_owner,new_owner,changed_by,reason) VALUES(p_kind,p_id,current_owner,p_target,auth.uid(),trim(p_reason));
  IF p_kind='client' THEN UPDATE clients SET created_by=p_target,secondary_owner_id=CASE WHEN secondary_owner_id=p_target THEN NULL ELSE secondary_owner_id END WHERE id=p_id;
  ELSE UPDATE partners SET created_by=p_target,secondary_owner_id=CASE WHEN secondary_owner_id=p_target THEN NULL ELSE secondary_owner_id END WHERE id=p_id; END IF;
  RETURN jsonb_build_object('transferred_count',changed+1);
END; $$;
REVOKE ALL ON FUNCTION public.manage_crm_record(text,uuid,text,uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_crm_record(text,uuid,text,uuid,boolean,text) TO authenticated;

ALTER TABLE public.work_scope_items DROP CONSTRAINT IF EXISTS work_scope_items_execution_status_check;
ALTER TABLE public.work_scope_items ADD COLUMN IF NOT EXISTS last_status_change_reason text;
ALTER TABLE public.work_scope_items ADD CONSTRAINT work_scope_items_execution_status_check CHECK(execution_status IN ('not_started','in_progress','completed','pre_production','production','installation','handover'));
CREATE OR REPLACE FUNCTION public.set_wos_execution_status(p_id uuid,p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.work_scope_items;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('not_started','in_progress','completed','pre_production','production','installation','handover') THEN RAISE EXCEPTION 'Invalid work progress'; END IF;
  SELECT * INTO item FROM work_scope_items WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Work item not found'; END IF;
  IF NOT (can_manage_shared_record(item.created_by,NULL) OR can_manage_client_record(item.client_id)) THEN RAISE EXCEPTION 'You cannot update this WOS progress'; END IF;
  UPDATE work_scope_items SET execution_status=p_status WHERE id=p_id;
END; $$;
REVOKE ALL ON FUNCTION public.set_wos_execution_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_wos_execution_status(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.require_wos_status_reason() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.work_status IS DISTINCT FROM OLD.work_status AND NEW.work_status::text IN ('lost','hold') THEN
    IF nullif(trim(NEW.last_status_change_reason),'') IS NULL THEN RAISE EXCEPTION 'A reason is required for Lost or Hold'; END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS require_wos_status_reason ON public.work_scope_items;
CREATE TRIGGER require_wos_status_reason BEFORE UPDATE ON public.work_scope_items FOR EACH ROW EXECUTE FUNCTION public.require_wos_status_reason();
NOTIFY pgrst,'reload schema';
COMMIT;
