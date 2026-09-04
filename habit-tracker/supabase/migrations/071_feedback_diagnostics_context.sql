-- Add bounded, non-sensitive diagnostics to feedback rows.
-- Client writes still go exclusively through feedback-submit.

ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS platform TEXT
  CHECK (platform IS NULL OR platform IN ('android', 'ios', 'web'));
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS device_timezone TEXT
  CHECK (device_timezone IS NULL OR char_length(device_timezone) <= 64);
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS device_locale TEXT
  CHECK (device_locale IS NULL OR char_length(device_locale) <= 64);
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS app_language TEXT
  CHECK (app_language IS NULL OR app_language IN ('vi', 'en'));
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS local_date TEXT
  CHECK (local_date IS NULL OR local_date ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS screen TEXT
  CHECK (screen IS NULL OR char_length(screen) <= 128);
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS route TEXT
  CHECK (route IS NULL OR char_length(route) <= 128);
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS error_code TEXT
  CHECK (error_code IS NULL OR char_length(error_code) <= 64);
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS error_notice TEXT
  CHECK (error_notice IS NULL OR char_length(error_notice) <= 256);
