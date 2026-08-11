DROP EXTENSION IF EXISTS pgcrypto CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS auth CASCADE;
DROP SCHEMA IF EXISTS extensions CASCADE;

CREATE SCHEMA public;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END;
$$;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;

CREATE FUNCTION auth.email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('test.email', true), '')
$$;

CREATE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    nullif(current_setting('test.jwt', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

CREATE TABLE public.users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_email text NOT NULL UNIQUE,
  current_streak integer NOT NULL DEFAULT 0
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.activity_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_email text NOT NULL,
  local_id bigint NOT NULL,
  user_id bigint,
  task_type_id bigint,
  kind text,
  duration_min integer,
  points_earned real,
  stars_delta real NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'TASK',
  logged_at bigint,
  local_date text,
  week_start text,
  note text,
  UNIQUE (user_email, local_id)
);

CREATE TABLE public.fund_transactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_email text NOT NULL,
  local_id bigint NOT NULL,
  user_id bigint,
  amount real NOT NULL DEFAULT 0,
  created_at bigint,
  UNIQUE (user_email, local_id)
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_transactions ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.activity_log, public.fund_transactions TO authenticated;
