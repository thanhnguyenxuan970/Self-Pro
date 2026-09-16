-- REVIEW DRAFT: fresh local/preview databases only. Do not run on production.
-- Add before 001_enable_rls.sql; preserve migrations 001-078 unchanged.
-- Reconstructed from the supplied column/constraint exports and migration 073.
-- Runtime replay of 000-078 has NOT been performed in this environment.
-- This is a bootstrap baseline, not a complete copy of the current schema.
-- 069 creates the analytics index; 073 adds activity_key and its unique index
-- and removes legacy uniqueness; 077 restores the compatibility unique index.
-- Do not add this file to a production-connected deployment until the migration
-- history/release process is reviewed. Existing tables cause a deliberate error.

BEGIN;

CREATE TABLE public.activity_log (
  id bigint GENERATED ALWAYS AS IDENTITY,
  user_email text NOT NULL,
  local_id integer NOT NULL,
  user_id integer,
  task_type_id integer,
  kind text NOT NULL,
  duration_min integer,
  points_earned integer NOT NULL DEFAULT 0,
  stars_delta real NOT NULL DEFAULT 0,
  source text NOT NULL,
  logged_at bigint NOT NULL,
  local_date text NOT NULL,
  week_start text NOT NULL,
  note text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT activity_log_pkey PRIMARY KEY (id),
  -- Historical uniqueness described and removed by migration 073.
  CONSTRAINT activity_log_user_email_local_id_key UNIQUE (user_email, local_id)
);

CREATE TABLE public.fund_transactions (
  id bigint GENERATED ALWAYS AS IDENTITY,
  user_email text NOT NULL,
  local_id integer NOT NULL,
  user_id integer,
  type text NOT NULL,
  amount real NOT NULL,
  currency text NOT NULL DEFAULT 'VND'::text,
  source_unlock_id integer,
  note text,
  occurred_at bigint NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT fund_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT fund_transactions_user_email_local_id_key UNIQUE (user_email, local_id)
);

-- Deny client access until migration 001 installs ownership policies/grants.
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.activity_log, public.fund_transactions
  FROM PUBLIC, anon, authenticated;

COMMIT;
