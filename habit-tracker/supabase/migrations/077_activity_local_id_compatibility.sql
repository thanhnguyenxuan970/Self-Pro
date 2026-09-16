-- Keep PostgREST's pre-identity upsert request structurally valid while the
-- server gate rejects that obsolete write path. PostgreSQL resolves an
-- ON CONFLICT target before RLS/privilege checks; without this compatibility
-- index, old clients receive 42P10 instead of the intended permission error.
--
-- The durable activity key remains the application identity. The compatibility
-- index is only a legacy-request parse guard; the append RPC below remaps a
-- colliding source local_id before inserting a new durable activity.
DO $function$
DECLARE
  max_local_id bigint;
  duplicate_count bigint;
BEGIN
  SELECT COALESCE(MAX(activity.local_id), 0)
    INTO max_local_id
    FROM public.activity_log AS activity;

  SELECT COUNT(*)
    INTO duplicate_count
    FROM (
      SELECT activity.id,
             ROW_NUMBER() OVER (
               PARTITION BY activity.user_email, activity.local_id
               ORDER BY activity.id
             ) AS duplicate_number
        FROM public.activity_log AS activity
    ) AS activity
   WHERE activity.duplicate_number > 1;

  IF duplicate_count > 0 THEN
    IF max_local_id > 2147483647 - duplicate_count THEN
      RAISE EXCEPTION 'activity_log compatibility local_id range exhausted';
    END IF;

    -- local_id is a legacy mirror field, not the durable activity identity.
    -- Preserve every row and its primary key; only duplicate mirror ids are
    -- moved above the current range so old ON CONFLICT requests can resolve.
    WITH duplicate_rows AS (
      SELECT activity.id,
             ROW_NUMBER() OVER (ORDER BY activity.user_email, activity.local_id, activity.id) AS allocation_number
        FROM (
          SELECT activity.id, activity.user_email, activity.local_id,
                 ROW_NUMBER() OVER (
                   PARTITION BY activity.user_email, activity.local_id
                   ORDER BY activity.id
                 ) AS duplicate_number
            FROM public.activity_log AS activity
        ) AS activity
       WHERE activity.duplicate_number > 1
    )
    UPDATE public.activity_log AS activity
       SET local_id = max_local_id + duplicate_rows.allocation_number
      FROM duplicate_rows
     WHERE activity.id = duplicate_rows.id;
  END IF;
END;
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS activity_log_user_email_local_id_compat_key
  ON public.activity_log (user_email, local_id);

CREATE OR REPLACE FUNCTION public.append_my_activity_rows(p_activity_rows jsonb)
RETURNS TABLE (activity_key text, local_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text;
  item jsonb;
  v_local_id bigint;
  v_next_local_id bigint;
  v_activity_key text;
  v_task_type_id bigint;
  v_kind text;
  v_duration_min integer;
  v_points_earned integer;
  v_stars_delta numeric;
  v_source text;
  v_logged_at bigint;
  v_local_date text;
  v_week_start text;
  v_note text;
  existing_row public.activity_log%ROWTYPE;
BEGIN
  PERFORM public.assert_account_write_allowed();
  caller_email := public.canonical_auth_email(caller_id);
  IF caller_id IS NULL OR caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  -- Serialize local-id remapping with every other append for this account.
  PERFORM 1 FROM auth.users WHERE id = caller_id FOR UPDATE;

  IF p_activity_rows IS NULL OR jsonb_typeof(p_activity_rows) <> 'array' THEN
    RAISE EXCEPTION 'Activity append payload must be an array';
  END IF;
  IF jsonb_array_length(p_activity_rows) > 100 THEN
    RAISE EXCEPTION 'Activity append batch is too large';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_activity_rows) LOOP
    IF jsonb_typeof(item) <> 'object' THEN
      RAISE EXCEPTION 'Activity append row must be an object';
    END IF;

    SELECT parsed.local_id, parsed.activity_key, parsed.task_type_id,
           parsed.kind, parsed.duration_min, parsed.points_earned,
           parsed.stars_delta, parsed.source, parsed.logged_at,
           parsed.local_date, parsed.week_start, parsed.note
      INTO v_local_id, v_activity_key, v_task_type_id,
           v_kind, v_duration_min, v_points_earned,
           v_stars_delta, v_source, v_logged_at,
           v_local_date, v_week_start, v_note
      FROM jsonb_to_record(item) AS parsed(
        local_id bigint,
        activity_key text,
        task_type_id bigint,
        kind text,
        duration_min integer,
        points_earned integer,
        stars_delta numeric,
        source text,
        logged_at bigint,
        local_date text,
        week_start text,
        note text
      );

    IF v_local_id IS NULL OR v_local_id <= 0
       OR v_activity_key IS NULL
       OR v_activity_key <> btrim(v_activity_key)
       OR length(v_activity_key) = 0
       OR length(v_activity_key) > 128
       OR v_activity_key LIKE 'legacy:%' THEN
      RAISE EXCEPTION 'Activity append requires a reviewed durable activity_key';
    END IF;
    IF v_kind IS NULL OR v_kind = '' OR v_kind <> btrim(v_kind)
       OR length(v_kind) > 64
       OR v_source IS NULL OR v_source = '' OR v_source <> btrim(v_source)
       OR length(v_source) > 64 OR v_source = 'LOGIN' THEN
      RAISE EXCEPTION 'Invalid activity kind/source';
    END IF;
    IF (v_task_type_id IS NOT NULL AND v_task_type_id <= 0)
       OR (v_duration_min IS NOT NULL AND v_duration_min < 0)
       OR v_points_earned IS NULL OR v_points_earned < 0
       OR v_stars_delta IS NULL
       OR v_logged_at IS NULL OR v_logged_at < 0
       OR v_local_date IS NULL OR v_local_date !~ '^\d{4}-\d{2}-\d{2}$'
       OR v_week_start IS NULL OR v_week_start !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Invalid activity numeric/date fields';
    END IF;
    PERFORM v_local_date::date;
    PERFORM v_week_start::date;

    SELECT *
      INTO existing_row
      FROM public.activity_log
     WHERE lower(btrim(public.activity_log.user_email)) = caller_email
       AND public.activity_log.activity_key = v_activity_key
      FOR UPDATE;
    IF NOT FOUND THEN
      -- Legacy rows can retain a differently cased or padded email. The
      -- compatibility index is intentionally raw for old ON CONFLICT parsing,
      -- so allocate a fresh mirror id before that index can reject a
      -- normalized-account collision.
      PERFORM 1
        FROM public.activity_log AS collision
       WHERE lower(btrim(collision.user_email)) = caller_email
         AND collision.local_id = v_local_id
       FOR UPDATE;
      IF FOUND THEN
        SELECT COALESCE(MAX(activity.local_id), 0) + 1
          INTO v_next_local_id
          FROM public.activity_log AS activity
         WHERE lower(btrim(activity.user_email)) = caller_email
           AND activity.local_id > 0;
        IF v_next_local_id > 2147483647 THEN
          RAISE EXCEPTION 'Activity local id compatibility range exhausted';
        END IF;
        v_local_id := v_next_local_id;
      END IF;

      -- A targetless conflict clause handles both durable-key retries and the
      -- legacy local-id compatibility index without requiring either specific
      -- constraint to be present in a mixed-version deployment.
      INSERT INTO public.activity_log (
        user_email, local_id, user_id, task_type_id, kind, duration_min,
        points_earned, stars_delta, source, logged_at, local_date, week_start,
        note, activity_key
      ) VALUES (
        caller_email, v_local_id, NULL, v_task_type_id, v_kind, v_duration_min,
        v_points_earned, v_stars_delta, v_source, v_logged_at, v_local_date,
        v_week_start, v_note, v_activity_key
      )
      ON CONFLICT DO NOTHING
      RETURNING * INTO existing_row;

      IF FOUND THEN
        activity_key := existing_row.activity_key;
        local_id := existing_row.local_id;
        RETURN NEXT;
        CONTINUE;
      END IF;

      SELECT *
        INTO existing_row
        FROM public.activity_log
       WHERE lower(btrim(public.activity_log.user_email)) = caller_email
         AND public.activity_log.activity_key = v_activity_key
        FOR UPDATE;
      IF NOT FOUND THEN
        -- A different durable activity from this account already owns the
        -- source device's local_id. Keep the durable key and allocate a fresh
        -- mirror id; local_id is no longer the logical identity.
        SELECT COALESCE(MAX(activity.local_id), 0) + 1
          INTO v_next_local_id
          FROM public.activity_log AS activity
         WHERE lower(btrim(activity.user_email)) = caller_email
           AND activity.local_id > 0;
        IF v_next_local_id > 2147483647 THEN
          RAISE EXCEPTION 'Activity local id compatibility range exhausted';
        END IF;

        INSERT INTO public.activity_log (
          user_email, local_id, user_id, task_type_id, kind, duration_min,
          points_earned, stars_delta, source, logged_at, local_date, week_start,
          note, activity_key
        ) VALUES (
          caller_email, v_next_local_id, NULL, v_task_type_id, v_kind,
          v_duration_min, v_points_earned, v_stars_delta, v_source,
          v_logged_at, v_local_date, v_week_start, v_note, v_activity_key
        )
        ON CONFLICT DO NOTHING
        RETURNING * INTO existing_row;

        IF FOUND THEN
          activity_key := existing_row.activity_key;
          local_id := existing_row.local_id;
          RETURN NEXT;
          CONTINUE;
        END IF;

        SELECT *
          INTO existing_row
          FROM public.activity_log
         WHERE lower(btrim(public.activity_log.user_email)) = caller_email
           AND public.activity_log.activity_key = v_activity_key
          FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Activity append conflict could not be resolved: %', v_activity_key
            USING ERRCODE = '23505';
        END IF;
      END IF;
    END IF;

    IF FOUND THEN
      IF existing_row.task_type_id IS DISTINCT FROM v_task_type_id
         OR existing_row.kind IS DISTINCT FROM v_kind
         OR existing_row.duration_min IS DISTINCT FROM v_duration_min
         OR existing_row.points_earned IS DISTINCT FROM v_points_earned
         OR existing_row.stars_delta IS DISTINCT FROM v_stars_delta
         OR existing_row.source IS DISTINCT FROM v_source
         OR existing_row.logged_at IS DISTINCT FROM v_logged_at
         OR existing_row.local_date IS DISTINCT FROM v_local_date
         OR existing_row.week_start IS DISTINCT FROM v_week_start
         OR existing_row.note IS DISTINCT FROM v_note THEN
        RAISE EXCEPTION 'Activity key content conflict: %', v_activity_key
          USING ERRCODE = '23505';
      END IF;
      activity_key := v_activity_key;
      local_id := existing_row.local_id;
      RETURN NEXT;
      CONTINUE;
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.append_my_activity_rows(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_my_activity_rows(jsonb) TO authenticated;
