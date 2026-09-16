-- Migration 077 was applied to some environments before its duplicate-id
-- repair block was corrected. Re-run the non-destructive repair here so those
-- environments and fresh installs have the same compatibility contract.
DO $function$
DECLARE
  max_local_id bigint;
  duplicate_count bigint;
BEGIN
  SELECT COALESCE(MAX(activity.local_id), 0)
    INTO max_local_id
    FROM public.activity_log AS activity;

  SELECT COUNT(*)
    INTO duplicate_count
    FROM (
      SELECT activity.id,
             ROW_NUMBER() OVER (
               PARTITION BY activity.user_email, activity.local_id
               ORDER BY activity.id
             ) AS duplicate_number
        FROM public.activity_log AS activity
    ) AS activity
   WHERE activity.duplicate_number > 1;

  IF duplicate_count > 0 THEN
    IF max_local_id > 2147483647 - duplicate_count THEN
      RAISE EXCEPTION 'activity_log compatibility local_id range exhausted';
    END IF;

    WITH duplicate_rows AS (
      SELECT activity.id,
             ROW_NUMBER() OVER (
               ORDER BY activity.user_email, activity.local_id, activity.id
             ) AS allocation_number
        FROM (
          SELECT activity.id, activity.user_email, activity.local_id,
                 ROW_NUMBER() OVER (
                   PARTITION BY activity.user_email, activity.local_id
                   ORDER BY activity.id
                 ) AS duplicate_number
            FROM public.activity_log AS activity
        ) AS activity
       WHERE activity.duplicate_number > 1
    )
    UPDATE public.activity_log AS activity
       SET local_id = max_local_id + duplicate_rows.allocation_number
      FROM duplicate_rows
     WHERE activity.id = duplicate_rows.id;
  END IF;
END;
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS activity_log_user_email_local_id_compat_key
  ON public.activity_log (user_email, local_id);
