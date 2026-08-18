-- Adds structured-answer storage to public.feedback for the D0 growth survey
-- (see the survey question doc's "DB — một cột, không bảng mới" section).
-- One additive column, no new table, no data migration needed.
--
-- Client writes go exclusively through the feedback-submit Edge Function
-- (migration 034 revoked direct client INSERT on this table) — the function
-- itself must also be updated to accept and whitelist this field, or every
-- survey submission with an `answers` payload silently drops it.

ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS answers jsonb;

CREATE INDEX IF NOT EXISTS feedback_survey_idx
  ON public.feedback ((answers->>'survey'))
  WHERE answers IS NOT NULL;
