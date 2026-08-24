-- Fix WOS duplicate blocking:
-- A few live environments inherited a too-restrictive unique key on work_type_id
-- alone. That blocks adding the same work type for different clients and causes
-- the UI to show "already added" even when the current client has no WOS.
--
-- Intended rule: the same work type can be used across many clients, but a
-- single client should not have the same work type twice.

DO $$
DECLARE
  obj record;
BEGIN
  -- Drop any UNIQUE constraint whose only column is work_type_id.
  FOR obj IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.work_scope_items'::regclass
      AND con.contype = 'u'
      AND (
        SELECT array_agg(att.attname ORDER BY cols.ord)
        FROM unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord)
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid
         AND att.attnum = cols.attnum
      ) = ARRAY['work_type_id']::text[]
  LOOP
    EXECUTE format('ALTER TABLE public.work_scope_items DROP CONSTRAINT %I', obj.conname);
  END LOOP;

  -- Drop any standalone UNIQUE index whose only column is work_type_id.
  FOR obj IN
    SELECT idx.indexrelid::regclass::text AS index_name
    FROM pg_index idx
    WHERE idx.indrelid = 'public.work_scope_items'::regclass
      AND idx.indisunique
      AND (
        SELECT array_agg(att.attname ORDER BY cols.ord)
        FROM unnest(idx.indkey) WITH ORDINALITY AS cols(attnum, ord)
        JOIN pg_attribute att
          ON att.attrelid = idx.indrelid
         AND att.attnum = cols.attnum
      ) = ARRAY['work_type_id']::text[]
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %s', obj.index_name);
  END LOOP;

  -- Add the intended per-client uniqueness rule when existing data is clean.
  IF NOT EXISTS (
    SELECT 1
    FROM public.work_scope_items
    GROUP BY client_id, work_type_id
    HAVING COUNT(*) > 1
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'work_scope_items_client_work_type_uidx'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX work_scope_items_client_work_type_uidx ON public.work_scope_items (client_id, work_type_id)';
  END IF;
END $$;
