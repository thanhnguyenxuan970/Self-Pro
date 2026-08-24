-- Reset progress must not erase the account configuration that the local app
-- deliberately keeps: categories, custom habits, and treats. Clear only the
-- earned/progress portion of the snapshot so a crash before the next client
-- sync cannot resurrect old history or lose the user's habit definitions.

CREATE OR REPLACE FUNCTION public.reset_my_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text;
BEGIN
  caller_email := public.canonical_auth_email(caller_id);
  IF caller_id IS NULL OR caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  UPDATE public.user_data_backups
     SET payload = payload || jsonb_build_object(
       'user', COALESCE(NULLIF(payload->'user', 'null'::jsonb), '{}'::jsonb) || jsonb_build_object(
         'carry_debt', 0,
         'treat_stars', 0,
         'treat_stars_lifetime', 0,
         'lifetime_stars', 0,
         'current_tier_id', NULL
       ),
       'activity_log', '[]'::jsonb,
       'daily_summary', '[]'::jsonb,
       'weekly_summary', '[]'::jsonb,
       'reward_unlocks', '[]'::jsonb,
       'fund_transactions', '[]'::jsonb,
       'streak_freezes', '[]'::jsonb,
       'treat_history', '[]'::jsonb,
       'challenges', '[]'::jsonb,
       'challenge_log', '[]'::jsonb,
       'challenge_days', '[]'::jsonb,
       'achievements', '[]'::jsonb,
       'milestone_stars', '[]'::jsonb,
       'boost_events', '[]'::jsonb
     ),
         updated_at = now()
   WHERE auth_user_id = caller_id;

  DELETE FROM public.activity_log WHERE user_email = caller_email;
  DELETE FROM public.fund_transactions WHERE user_email = caller_email;
  UPDATE public.users
     SET current_streak = 0,
         lifetime_stars = 0,
         last_active_local_date = NULL
   WHERE auth_user_id = caller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_my_progress() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_my_progress() TO authenticated;
