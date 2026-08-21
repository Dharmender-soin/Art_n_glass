-- Admin-managed WhatsHub configuration. Secret values live only in Supabase Vault.
ALTER TABLE public.showrooms
  ADD COLUMN IF NOT EXISTS whatsapp_group_id text;

CREATE OR REPLACE FUNCTION public.upsert_named_vault_secret(
  p_name text,
  p_value text,
  p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  existing_id uuid;
BEGIN
  IF NULLIF(BTRIM(p_value), '') IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO existing_id
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;

  IF existing_id IS NULL THEN
    PERFORM vault.create_secret(p_value, p_name, p_description);
  ELSE
    PERFORM vault.update_secret(existing_id, p_value, p_name, p_description);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_named_vault_secret(text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.configure_whatshub_integration(
  p_api_key text DEFAULT NULL,
  p_cron_secret text DEFAULT NULL,
  p_project_url text DEFAULT NULL,
  p_anon_key text DEFAULT NULL,
  p_showroom_groups jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  group_row record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admin can configure integrations';
  END IF;

  PERFORM public.upsert_named_vault_secret('whatshub_api_key', p_api_key, 'WhatsHub server API key');
  PERFORM public.upsert_named_vault_secret('whatshub_cron_secret', p_cron_secret, 'WhatsHub scheduler authentication secret');
  PERFORM public.upsert_named_vault_secret('project_url', p_project_url, 'Supabase project URL used by scheduled jobs');
  PERFORM public.upsert_named_vault_secret('anon_key', p_anon_key, 'Supabase anon key used by scheduled jobs');

  FOR group_row IN
    SELECT * FROM jsonb_to_recordset(COALESCE(p_showroom_groups, '[]'::jsonb))
      AS entry(showroom_id uuid, group_id text, planning_enabled boolean)
  LOOP
    UPDATE public.showrooms
    SET whatsapp_group_id = NULLIF(BTRIM(group_row.group_id), ''),
        whatsapp_planning_enabled = COALESCE(group_row.planning_enabled, true)
    WHERE id = group_row.showroom_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_whatshub_integration(text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_whatshub_integration(text, text, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_whatshub_integration_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admin can view integration configuration';
  END IF;

  RETURN jsonb_build_object(
    'api_key_configured', EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'whatshub_api_key'),
    'cron_secret_configured', EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'whatshub_cron_secret'),
    'project_url_configured', EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_url'),
    'anon_key_configured', EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'anon_key')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_whatshub_integration_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_whatshub_integration_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_whatshub_runtime_config()
RETURNS TABLE (api_key text, cron_secret text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'whatshub_api_key' LIMIT 1),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'whatshub_cron_secret' LIMIT 1);
$$;

REVOKE ALL ON FUNCTION public.get_whatshub_runtime_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatshub_runtime_config() TO service_role;
