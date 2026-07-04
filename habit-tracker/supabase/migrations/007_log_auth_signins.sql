CREATE OR REPLACE FUNCTION public.log_auth_signin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  signin_at timestamptz;
  signin_local_date text;
  signin_week_start text;
  next_local_id integer;
BEGIN
  signin_at := NEW.last_sign_in_at;

  IF NEW.email IS NULL OR signin_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.last_sign_in_at IS NOT DISTINCT FROM OLD.last_sign_in_at THEN
    RETURN NEW;
  END IF;

  signin_local_date := to_char((signin_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD');
  signin_week_start := to_char(date_trunc('week', signin_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD');

  SELECT COALESCE(MIN(local_id), 0) - 1
    INTO next_local_id
    FROM public.activity_log
   WHERE user_email = NEW.email
     AND local_id < 0;

  INSERT INTO public.activity_log (
    user_email,
    local_id,
    user_id,
    task_type_id,
    kind,
    duration_min,
    points_earned,
    stars_delta,
    source,
    logged_at,
    local_date,
    week_start,
    note
  ) VALUES (
    NEW.email,
    next_local_id,
    NULL,
    NULL,
    'LOGIN',
    NULL,
    0,
    0,
    'LOGIN',
    FLOOR(EXTRACT(EPOCH FROM signin_at) * 1000)::bigint,
    signin_local_date,
    signin_week_start,
    'Supabase auth sign-in'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_signin ON auth.users;
CREATE TRIGGER on_auth_user_signin
AFTER INSERT OR UPDATE OF last_sign_in_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.log_auth_signin();

WITH auth_signins AS (
  SELECT
    au.email,
    au.last_sign_in_at,
    ROW_NUMBER() OVER (
      PARTITION BY au.email
      ORDER BY au.last_sign_in_at DESC, au.id DESC
    ) AS auth_rank
  FROM auth.users au
  WHERE au.email IS NOT NULL
    AND au.last_sign_in_at IS NOT NULL
),
missing_signins AS (
  SELECT
    a.email,
    a.last_sign_in_at,
    ROW_NUMBER() OVER (
      PARTITION BY a.email
      ORDER BY a.last_sign_in_at DESC
    ) AS missing_rank
  FROM auth_signins a
  WHERE a.auth_rank = 1
    AND NOT EXISTS (
      SELECT 1
      FROM public.activity_log al
      WHERE al.user_email = a.email
        AND al.source = 'LOGIN'
        AND al.logged_at = FLOOR(EXTRACT(EPOCH FROM a.last_sign_in_at) * 1000)::bigint
    )
),
next_ids AS (
  SELECT
    m.email,
    m.last_sign_in_at,
    COALESCE((
      SELECT MIN(al.local_id)
      FROM public.activity_log al
      WHERE al.user_email = m.email
        AND al.local_id < 0
    ), 0) - m.missing_rank AS local_id
  FROM missing_signins m
)
INSERT INTO public.activity_log (
  user_email,
  local_id,
  user_id,
  task_type_id,
  kind,
  duration_min,
  points_earned,
  stars_delta,
  source,
  logged_at,
  local_date,
  week_start,
  note
)
SELECT
  n.email,
  n.local_id,
  NULL,
  NULL,
  'LOGIN',
  NULL,
  0,
  0,
  'LOGIN',
  FLOOR(EXTRACT(EPOCH FROM n.last_sign_in_at) * 1000)::bigint,
  to_char((n.last_sign_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD'),
  to_char(date_trunc('week', n.last_sign_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD'),
  'Backfilled from auth.users.last_sign_in_at'
FROM next_ids n;
