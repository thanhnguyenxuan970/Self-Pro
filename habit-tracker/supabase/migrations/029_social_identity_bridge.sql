-- Bridge social identity to auth.users.id while retaining email-backed RPCs
-- and tables for already-released app versions.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- Never guess account merges. Normalized duplicate emails and orphaned legacy
-- profiles require operator reconciliation before this migration can proceed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.users
     GROUP BY lower(user_email)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot backfill auth UUIDs: duplicate normalized public.users emails';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM auth.users
     WHERE email IS NOT NULL
     GROUP BY lower(email)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot backfill auth UUIDs: duplicate normalized auth.users emails';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.users AS profile
      LEFT JOIN auth.users AS account
        ON lower(account.email) = lower(profile.user_email)
     WHERE account.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill auth UUIDs: public.users contains an orphaned email';
  END IF;
END;
$$;

UPDATE public.users AS profile
   SET auth_user_id = account.id
  FROM auth.users AS account
 WHERE lower(account.email) = lower(profile.user_email)
   AND profile.auth_user_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE auth_user_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce auth UUID identity: backfill left null values';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.users
     GROUP BY auth_user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce auth UUID identity: multiple profiles map to one auth user';
  END IF;
END;
$$;

ALTER TABLE public.users
  ALTER COLUMN auth_user_id SET NOT NULL,
  ADD CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id),
  ADD CONSTRAINT users_auth_user_id_fkey
    FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Replace the insert-only migration-027 trigger. Email is still the key used
-- by released clients, so an auth email change must update every retained
-- legacy table atomically while UUID-backed social state remains untouched.
CREATE OR REPLACE FUNCTION public.provision_leaderboard_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_profile public.users%ROWTYPE;
BEGIN
  IF NEW.email IS NULL THEN
    IF TG_OP = 'UPDATE' AND OLD.email IS NOT NULL THEN
      RAISE EXCEPTION 'Authenticated profile email cannot be cleared';
    END IF;
    RETURN NEW;
  END IF;

  SELECT profile.*
    INTO existing_profile
    FROM public.users AS profile
   WHERE lower(profile.user_email) = lower(NEW.email)
   LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    IF FOUND THEN
      IF existing_profile.auth_user_id IS DISTINCT FROM NEW.id THEN
        RAISE EXCEPTION 'Email is already attached to another authenticated profile';
      END IF;
      RETURN NEW;
    END IF;

    INSERT INTO public.users (user_email, auth_user_id)
    VALUES (NEW.email, NEW.id);
    RETURN NEW;
  END IF;

  IF OLD.email IS NOT DISTINCT FROM NEW.email THEN
    RETURN NEW;
  END IF;

  IF FOUND AND existing_profile.auth_user_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'New email is already attached to another authenticated profile';
  END IF;

  SELECT profile.*
    INTO existing_profile
    FROM public.users AS profile
   WHERE profile.auth_user_id = NEW.id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.users (user_email, auth_user_id)
    VALUES (NEW.email, NEW.id);
    RETURN NEW;
  END IF;

  UPDATE public.activity_log
     SET user_email = NEW.email
   WHERE user_email = existing_profile.user_email;

  UPDATE public.fund_transactions
     SET user_email = NEW.email
   WHERE user_email = existing_profile.user_email;

  UPDATE public.users
     SET user_email = NEW.email
   WHERE auth_user_id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_leaderboard_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_leaderboard_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_leaderboard_profile
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_leaderboard_profile();

-- Preserve the released one-argument RPC while teaching it the UUID identity
-- required to recreate a profile after delete_my_account_data().
CREATE OR REPLACE FUNCTION public.sync_user_profile(p_current_streak integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text := auth.email();
BEGIN
  IF caller_id IS NULL OR caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  INSERT INTO public.users (user_email, auth_user_id, current_streak)
  VALUES (
    caller_email,
    caller_id,
    GREATEST(COALESCE(p_current_streak, 0), 0)
  )
  ON CONFLICT (auth_user_id) DO UPDATE
     SET user_email = EXCLUDED.user_email,
         current_streak = EXCLUDED.current_streak;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_profile(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_profile(integer) TO authenticated;
