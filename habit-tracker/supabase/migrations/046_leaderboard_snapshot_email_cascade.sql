-- Migration 045 introduced a foreign key from leaderboard snapshots to the
-- legacy email-keyed users row. Auth email changes already cascade through
-- users/activity_log/fund_transactions in the profile trigger; snapshots must
-- follow the same identity update or the trigger fails before it can finish.
-- Keep this separate from 045 so it also repairs databases where 045 already
-- ran before the foreign key was corrected.

DO $$
DECLARE
  existing_fk text;
BEGIN
  SELECT con.conname
    INTO existing_fk
    FROM pg_constraint AS con
   WHERE con.conrelid = 'public.leaderboard_snapshots'::regclass
     AND con.contype = 'f'
     AND pg_get_constraintdef(con.oid) LIKE '%(user_email)%REFERENCES public.users(user_email)%';

  IF existing_fk IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.leaderboard_snapshots DROP CONSTRAINT %I',
      existing_fk
    );
  END IF;

  ALTER TABLE public.leaderboard_snapshots
    ADD CONSTRAINT leaderboard_snapshots_user_email_fkey
    FOREIGN KEY (user_email)
    REFERENCES public.users(user_email)
    ON DELETE CASCADE
    ON UPDATE CASCADE;
END;
$$;
