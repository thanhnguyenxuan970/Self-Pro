-- Add the durable activity identity without inventing provenance for legacy
-- rows. NULL means unresolved (and is also used by server-owned LOGIN
-- telemetry); the client must not upload an unresolved row.
ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS activity_key text;

-- Duplicate non-null keys are a deployment blocker, not an invitation to
-- merge or overwrite rows. Resolve them from an independent source first.
DO $function$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.activity_log
     WHERE activity_key IS NOT NULL
     GROUP BY lower(btrim(user_email)), activity_key
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'activity_key deployment blocked: duplicate non-null identities require reconciliation';
  END IF;
END;
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS activity_log_user_email_activity_key_key
  ON public.activity_log (lower(btrim(user_email)), activity_key)
  WHERE activity_key IS NOT NULL;

-- The new client no longer targets the device-local conflict key. Keeping the
-- old unique index would still reject two distinct devices with the same
-- local_id before the new activity_key could be considered.
-- The historical schema created this as a table-level UNIQUE constraint. Drop
-- that constraint first; PostgreSQL refuses to DROP its backing index while
-- the constraint owns it. The catalog lookup also handles a renamed
-- equivalent constraint, while the final DROP INDEX handles an independent
-- index-only deployment.
ALTER TABLE public.activity_log
  DROP CONSTRAINT IF EXISTS activity_log_user_email_local_id_key;

DO $function$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT constraint_row.conname
      FROM pg_catalog.pg_constraint AS constraint_row
     WHERE constraint_row.conrelid = 'public.activity_log'::pg_catalog.regclass
       AND constraint_row.contype = 'u'
       AND pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
           = 'UNIQUE (user_email, local_id)'
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.activity_log DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END;
$function$;

DROP INDEX IF EXISTS public.activity_log_user_email_local_id_key;

COMMENT ON COLUMN public.activity_log.activity_key IS
  'Stable activity identity. NULL or legacy-shaped values remain unresolved until reviewed provenance mapping exists.';
