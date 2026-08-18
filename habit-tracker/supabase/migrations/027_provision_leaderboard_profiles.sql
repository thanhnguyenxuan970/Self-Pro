-- Every authenticated account gets a leaderboard profile immediately, even
-- before the user records their first activity. Existing auth accounts are
-- backfilled below so the leaderboard population is complete after deploy.

CREATE OR REPLACE FUNCTION public.provision_leaderboard_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    INSERT INTO public.users (user_email)
    VALUES (NEW.email)
    ON CONFLICT (user_email) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_leaderboard_profile() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created_leaderboard_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_leaderboard_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_leaderboard_profile();

INSERT INTO public.users (user_email)
SELECT email
  FROM auth.users
 WHERE email IS NOT NULL
ON CONFLICT (user_email) DO NOTHING;
