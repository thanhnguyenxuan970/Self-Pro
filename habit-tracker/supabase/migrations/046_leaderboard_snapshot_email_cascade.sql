-- Migration 045 introduced a foreign key from leaderboard snapshots to the
-- legacy email-keyed users row. Auth email changes already cascade through
-- users/activity_log/fund_transactions in the profile trigger; snapshots must
-- follow the same identity update or the trigger fails before it can finish.
-- Keep this separate from 045 so it also repairs databases where 045 already
-- ran before the foreign key was corrected.

DO $$
DECLARE
  target_name CONSTANT text := 'leaderboard_snapshots_user_email_fkey';
  local_email_attnum smallint;
  users_email_attnum smallint;
  target_fk record;
  existing_fk record;
BEGIN
  -- Serialize manual/concurrent reruns. A second runner will observe the
  -- repaired constraint after the first transaction commits.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('habi:leaderboard_snapshots_user_email_fkey', 0)
  );

  SELECT attnum
    INTO local_email_attnum
    FROM pg_catalog.pg_attribute
   WHERE attrelid = 'public.leaderboard_snapshots'::regclass
     AND attname = 'user_email'
     AND NOT attisdropped;

  SELECT attnum
    INTO users_email_attnum
    FROM pg_catalog.pg_attribute
   WHERE attrelid = 'public.users'::regclass
     AND attname = 'user_email'
     AND NOT attisdropped;

  IF local_email_attnum IS NULL OR users_email_attnum IS NULL THEN
    RAISE EXCEPTION
      'Cannot repair leaderboard snapshot FK: user_email columns are missing';
  END IF;

  SELECT con.conname,
         con.contype,
         con.confrelid,
         con.conkey,
         con.confkey,
         con.confdeltype,
         con.confupdtype,
         con.convalidated
    INTO target_fk
    FROM pg_catalog.pg_constraint AS con
   WHERE con.conrelid = 'public.leaderboard_snapshots'::regclass
     AND con.conname = target_name;

  IF FOUND THEN
    -- Never remove an unrelated constraint that happens to use our name.
    IF target_fk.contype <> 'f'
       OR target_fk.confrelid <> 'public.users'::regclass
       OR target_fk.conkey IS DISTINCT FROM ARRAY[local_email_attnum]::smallint[]
       OR target_fk.confkey IS DISTINCT FROM ARRAY[users_email_attnum]::smallint[] THEN
      RAISE EXCEPTION
        'Constraint % already exists with an unexpected definition', target_name;
    END IF;

    -- A correct 045/046 result is a no-op. Only remove duplicate legacy FKs
    -- with the same intended relationship, if an earlier repair left one.
    IF target_fk.confdeltype = 'c' AND target_fk.confupdtype = 'c' THEN
      IF NOT target_fk.convalidated THEN
        EXECUTE pg_catalog.format(
          'ALTER TABLE public.leaderboard_snapshots VALIDATE CONSTRAINT %I',
          target_name
        );
      END IF;

      FOR existing_fk IN
        SELECT con.conname
          FROM pg_catalog.pg_constraint AS con
         WHERE con.conrelid = 'public.leaderboard_snapshots'::regclass
           AND con.contype = 'f'
           AND con.conname <> target_name
           AND con.confrelid = 'public.users'::regclass
           AND con.conkey = ARRAY[local_email_attnum]::smallint[]
           AND con.confkey = ARRAY[users_email_attnum]::smallint[]
      LOOP
        EXECUTE pg_catalog.format(
          'ALTER TABLE public.leaderboard_snapshots DROP CONSTRAINT %I',
          existing_fk.conname
        );
      END LOOP;
      RETURN;
    END IF;

    -- The named FK points to the right columns but has stale actions, so it
    -- is safe to replace it with the intended cascading definition.
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.leaderboard_snapshots DROP CONSTRAINT %I',
      target_fk.conname
    );
  END IF;

  -- Migration 045 may have created the same relationship under a different
  -- name. This exact user_email -> users(user_email) relationship is owned
  -- by this repair, so replace stale referential actions with CASCADE too.
  FOR existing_fk IN
    SELECT con.conname
      FROM pg_catalog.pg_constraint AS con
     WHERE con.conrelid = 'public.leaderboard_snapshots'::regclass
       AND con.contype = 'f'
       AND con.confrelid = 'public.users'::regclass
       AND con.conkey = ARRAY[local_email_attnum]::smallint[]
       AND con.confkey = ARRAY[users_email_attnum]::smallint[]
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.leaderboard_snapshots DROP CONSTRAINT %I',
      existing_fk.conname
    );
  END LOOP;

  ALTER TABLE public.leaderboard_snapshots
    ADD CONSTRAINT leaderboard_snapshots_user_email_fkey
    FOREIGN KEY (user_email)
    REFERENCES public.users(user_email)
    ON DELETE CASCADE
    ON UPDATE CASCADE;
END;
$$;
