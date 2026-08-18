-- =====================================================================
-- HABI — GROWTH AUDIT (chạy trong Supabase Dashboard → SQL Editor)
-- Ngày viết: 2026-08-15   ·   App: com.habitring.app   ·   v2.0.1.5
-- =====================================================================
--
-- TIỀN ĐỀ: bạn KHÔNG cần cài analytics SDK. Toàn bộ hành vi user đã nằm
-- sẵn trong Postgres của bạn từ ngày đầu:
--
--   public.activity_log  — mọi lần log habit đã sync lên (syncService.ts:204)
--                          + mọi lần đăng nhập (trigger log_auth_signin,
--                            migration 007 → source='LOGIN', local_id < 0)
--   auth.users           — created_at = ngày đăng ký, last_sign_in_at
--   public.users         — current_streak, last_active_local_date, timezone,
--                          lifetime_stars, friend_code, auth_user_id
--   public.feedback      — feedback thật user gõ tay (type/message/device)
--   public.friend_relationships / friend_code_attempts
--
-- LƯU Ý KỸ THUẬT (đã verify trong repo, đừng sửa nếu không chắc):
--   · activity_log.logged_at  = BIGINT epoch MILLISECOND  → /1000.0
--   · activity_log.local_date = TEXT 'YYYY-MM-DD'         → ::date
--   · source='LOGIN' là dòng do trigger sinh, KHÔNG phải hành vi log habit.
--     Mọi query "active" bên dưới đều loại nó ra.
--   · SQL Editor chạy quyền postgres nên bỏ qua RLS. Đây là dữ liệu của
--     user thật — đừng copy email ra ngoài.
--
-- CHỈNH TRƯỚC KHI CHẠY: thêm mọi tài khoản test/của bạn vào EXCLUDED bên
-- dưới. Migration 036–039 cho thấy account chủ app đã bị seed dữ liệu giả;
-- để nguyên nó trong tập đo sẽ làm mọi con số đẹp giả tạo.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Q0. SANITY — có những `source` nào trong activity_log?
-- Chạy CÁI NÀY TRƯỚC. Nếu thấy source lạ (seed/demo/test), thêm vào
-- danh sách loại trừ ở các query sau.
-- ---------------------------------------------------------------------
SELECT
  source,
  kind,
  count(*)                        AS rows,
  count(DISTINCT user_email)      AS users,
  min(to_timestamp(logged_at/1000.0) AT TIME ZONE 'Asia/Ho_Chi_Minh') AS first_seen,
  max(to_timestamp(logged_at/1000.0) AT TIME ZONE 'Asia/Ho_Chi_Minh') AS last_seen
FROM public.activity_log
GROUP BY source, kind
ORDER BY rows DESC;


-- ---------------------------------------------------------------------
-- Q1. ROSTER — CÂU QUAN TRỌNG NHẤT.
-- Với 10–49 user, đây không phải "thống kê", đây là DANH SÁCH TỪNG NGƯỜI.
-- Mỗi dòng là một câu chuyện đầy đủ: đăng ký ngày nào, có log lần nào
-- không, sống được bao nhiêu ngày, chết ngày nào.
-- Đọc từng dòng. Đừng tính trung bình.
-- ---------------------------------------------------------------------
WITH excluded AS (
  SELECT unnest(ARRAY[
    'thanhnguyenxuan970@gmail.com'      -- ⬅️ THÊM account test của bạn vào đây
  ]) AS email
),
signup AS (
  SELECT lower(au.email) AS email,
         (au.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS signup_date,
         (au.last_sign_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS last_signin_date
  FROM auth.users au
  WHERE au.email IS NOT NULL
    AND lower(au.email) NOT IN (SELECT email FROM excluded)
),
acts AS (
  SELECT lower(user_email) AS email,
         count(*) FILTER (WHERE source <> 'LOGIN')                       AS log_rows,
         count(DISTINCT local_date) FILTER (WHERE source <> 'LOGIN')     AS active_days,
         count(DISTINCT local_date) FILTER (WHERE source =  'LOGIN')     AS login_days,
         min(local_date) FILTER (WHERE source <> 'LOGIN')::date          AS first_log,
         max(local_date) FILTER (WHERE source <> 'LOGIN')::date          AS last_log
  FROM public.activity_log
  GROUP BY 1
)
SELECT
  row_number() OVER (ORDER BY s.signup_date, s.email)      AS n,
  s.signup_date,
  (CURRENT_DATE - s.signup_date)                           AS days_since_signup,
  COALESCE(a.login_days, 0)                                AS login_days,
  COALESCE(a.log_rows, 0)                                  AS log_rows,
  COALESCE(a.active_days, 0)                               AS active_days,
  a.first_log,
  a.last_log,
  (a.first_log - s.signup_date)                            AS days_signup_to_first_log,
  (a.last_log  - a.first_log)                              AS lifespan_days,
  (CURRENT_DATE - a.last_log)                              AS days_since_last_log,
  u.current_streak,
  round(u.lifetime_stars::numeric, 0)                      AS lifetime_stars,
  u.timezone,
  CASE
    WHEN a.log_rows IS NULL OR a.log_rows = 0 THEN 'D0 CHẾT — chưa từng log'
    WHEN a.active_days = 1                    THEN 'log 1 ngày rồi bỏ'
    WHEN CURRENT_DATE - a.last_log > 7        THEN 'đã rời'
    ELSE 'còn sống'
  END                                                      AS verdict
FROM signup s
LEFT JOIN acts a        ON a.email = s.email
LEFT JOIN public.users u ON lower(u.user_email) = s.email
ORDER BY s.signup_date, s.email;


-- ---------------------------------------------------------------------
-- Q2. FUNNEL — mỗi bậc rơi bao nhiêu người.
-- Đây là câu trả lời cho "app hỏng ở đâu", không phải "app thiếu feature gì".
-- ---------------------------------------------------------------------
WITH excluded AS (
  SELECT unnest(ARRAY['thanhnguyenxuan970@gmail.com']) AS email
),
base AS (
  SELECT lower(au.email) AS email
  FROM auth.users au
  WHERE au.email IS NOT NULL
    AND lower(au.email) NOT IN (SELECT email FROM excluded)
),
acts AS (
  SELECT lower(user_email) AS email,
         count(DISTINCT local_date) FILTER (WHERE source <> 'LOGIN') AS active_days,
         max(local_date) FILTER (WHERE source <> 'LOGIN')::date      AS last_log
  FROM public.activity_log GROUP BY 1
),
j AS (SELECT b.email, COALESCE(a.active_days,0) AS d, a.last_log
      FROM base b LEFT JOIN acts a ON a.email = b.email)
SELECT step, users,
       round(100.0 * users / NULLIF(max(users) OVER (), 0), 1) AS pct_of_signups
FROM (
  SELECT 1 AS ord, 'A. Đăng ký (qua được tường Google Sign-In)' AS step, count(*) AS users FROM j
  UNION ALL SELECT 2, 'B. Log habit ≥ 1 lần',        count(*) FROM j WHERE d >= 1
  UNION ALL SELECT 3, 'C. Log ≥ 2 ngày khác nhau',   count(*) FROM j WHERE d >= 2
  UNION ALL SELECT 4, 'D. Log ≥ 3 ngày khác nhau',   count(*) FROM j WHERE d >= 3
  UNION ALL SELECT 5, 'E. Log ≥ 7 ngày khác nhau',   count(*) FROM j WHERE d >= 7
  UNION ALL SELECT 6, 'F. Còn hoạt động trong 7 ngày qua', count(*) FROM j WHERE last_log >= CURRENT_DATE - 7
) t ORDER BY ord;
-- ĐỌC KẾT QUẢ:
--   A→B rơi mạnh  = vấn đề ONBOARDING (sign-in wall + màn hero nằm sau login)
--   B→C rơi mạnh  = app không cho lý do quay lại ngày 2 (notification lazy)
--   C→E rơi mạnh  = vấn đề GIÁ TRỊ CỐT LÕI, không phải feature thiếu


-- ---------------------------------------------------------------------
-- Q3. TIME-TO-FIRST-LOG — bao lâu từ đăng ký đến lần log đầu tiên.
-- Nếu phần lớn KHÔNG BAO GIỜ log → tường sign-in + onboarding hỏi
-- giới tính/năm sinh đang giết user trước khi họ thấy giá trị.
-- ---------------------------------------------------------------------
WITH excluded AS (SELECT unnest(ARRAY['thanhnguyenxuan970@gmail.com']) AS email),
s AS (SELECT lower(au.email) AS email,
             (au.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS signup_date
      FROM auth.users au
      WHERE au.email IS NOT NULL AND lower(au.email) NOT IN (SELECT email FROM excluded)),
f AS (SELECT lower(user_email) AS email,
             min(local_date) FILTER (WHERE source <> 'LOGIN')::date AS first_log
      FROM public.activity_log GROUP BY 1)
SELECT
  CASE
    WHEN f.first_log IS NULL              THEN '∞ — KHÔNG BAO GIỜ log'
    WHEN f.first_log - s.signup_date = 0  THEN 'cùng ngày đăng ký'
    WHEN f.first_log - s.signup_date = 1  THEN 'sau 1 ngày'
    WHEN f.first_log - s.signup_date <= 3 THEN 'sau 2–3 ngày'
    ELSE                                       'sau > 3 ngày'
  END AS time_to_first_log,
  count(*) AS users
FROM s LEFT JOIN f ON f.email = s.email
GROUP BY 1 ORDER BY users DESC;


-- ---------------------------------------------------------------------
-- Q4. USER CHẾT Ở NGÀY THỨ MẤY — histogram tuổi thọ.
-- Habit tracker thường chết ở ngày 3–7. Xem của bạn chết ở đâu.
-- ---------------------------------------------------------------------
WITH excluded AS (SELECT unnest(ARRAY['thanhnguyenxuan970@gmail.com']) AS email),
a AS (
  SELECT lower(user_email) AS email,
         count(DISTINCT local_date) AS active_days
  FROM public.activity_log
  WHERE source <> 'LOGIN'
    AND lower(user_email) NOT IN (SELECT email FROM excluded)
  GROUP BY 1
)
SELECT active_days AS "số ngày thực sự có log",
       count(*)    AS "số user",
       repeat('█', count(*)::int) AS bar
FROM a GROUP BY 1 ORDER BY 1;


-- ---------------------------------------------------------------------
-- Q5. RETENTION D1 / D3 / D7 theo cohort tuần đăng ký.
-- N nhỏ nên đây là ĐẾM ĐẦU NGƯỜI, không phải tỉ lệ đáng tin. Đọc cột
-- tuyệt đối, đừng đọc phần trăm.
-- ---------------------------------------------------------------------
WITH excluded AS (SELECT unnest(ARRAY['thanhnguyenxuan970@gmail.com']) AS email),
s AS (SELECT lower(au.email) AS email,
             (au.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS signup_date
      FROM auth.users au
      WHERE au.email IS NOT NULL AND lower(au.email) NOT IN (SELECT email FROM excluded)),
act AS (SELECT lower(user_email) AS email, local_date::date AS d
        FROM public.activity_log WHERE source <> 'LOGIN' GROUP BY 1,2)
SELECT
  date_trunc('week', s.signup_date)::date              AS cohort_week,
  count(DISTINCT s.email)                              AS signups,
  count(DISTINCT s.email) FILTER (WHERE EXISTS (
    SELECT 1 FROM act WHERE act.email=s.email AND act.d = s.signup_date))       AS "D0 có log",
  count(DISTINCT s.email) FILTER (WHERE EXISTS (
    SELECT 1 FROM act WHERE act.email=s.email AND act.d = s.signup_date + 1))   AS "D1",
  count(DISTINCT s.email) FILTER (WHERE EXISTS (
    SELECT 1 FROM act WHERE act.email=s.email AND act.d BETWEEN s.signup_date+2 AND s.signup_date+4)) AS "D2–4",
  count(DISTINCT s.email) FILTER (WHERE EXISTS (
    SELECT 1 FROM act WHERE act.email=s.email AND act.d BETWEEN s.signup_date+5 AND s.signup_date+9)) AS "D5–9"
FROM s GROUP BY 1 ORDER BY 1;


-- ---------------------------------------------------------------------
-- Q6. FEATURE REALITY CHECK — bao nhiêu user THẬT SỰ chạm vào các
-- feature bạn đã bỏ hàng tháng để xây?
-- Đây là query kiểm chứng giả thuyết "app đang over-build".
-- ---------------------------------------------------------------------
WITH excluded AS (SELECT unnest(ARRAY['thanhnguyenxuan970@gmail.com']) AS email),
pop AS (SELECT lower(au.email) AS email FROM auth.users au
        WHERE au.email IS NOT NULL AND lower(au.email) NOT IN (SELECT email FROM excluded))
SELECT 'Tổng user (trừ account test)' AS metric, count(*)::text AS value FROM pop
UNION ALL SELECT 'Đã từng log habit',
  count(DISTINCT lower(user_email))::text FROM public.activity_log
  WHERE source <> 'LOGIN' AND lower(user_email) IN (SELECT email FROM pop)
UNION ALL SELECT 'Đã từng nhận DAILY_BONUS',
  count(DISTINCT lower(user_email))::text FROM public.activity_log
  WHERE source = 'DAILY_BONUS' AND lower(user_email) IN (SELECT email FROM pop)
UNION ALL SELECT 'Có ít nhất 1 bạn (accepted)',
  count(DISTINCT x)::text FROM (
    SELECT user_a_id AS x FROM public.friend_relationships WHERE state='accepted'
    UNION SELECT user_b_id FROM public.friend_relationships WHERE state='accepted') q
UNION ALL SELECT 'Lời mời kết bạn đang pending',
  count(*)::text FROM public.friend_relationships WHERE state='pending'
UNION ALL SELECT 'Nhập friend-code SAI (probe_failure)',
  count(*)::text FROM public.friend_code_attempts WHERE kind='probe_failure'
UNION ALL SELECT 'Đã sinh friend_code (mở màn Add Friend)',
  count(*)::text FROM public.users WHERE friend_code IS NOT NULL
UNION ALL SELECT 'Đã gửi feedback',
  count(DISTINCT lower(user_email))::text FROM public.feedback WHERE user_email IS NOT NULL;
-- ĐỌC KẾT QUẢ: nếu "có ít nhất 1 bạn" ≈ 0 thì leaderboard/challenge/friends
-- đang hiển thị màn hình TRỐNG cho gần như mọi user — tức là feature xã hội
-- hiện đang LÀM HẠI trải nghiệm, không phải cải thiện.
-- Và mọi plan xây thêm feature xã hội (avatar, mascot, tier9) phải hoãn.


-- ---------------------------------------------------------------------
-- Q7. FEEDBACK — đọc nguyên văn. Miễn phí, định tính, giá trị cao nhất.
-- ---------------------------------------------------------------------
SELECT created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS at,
       type, app_version, device, os_version, message
FROM public.feedback
ORDER BY created_at DESC
LIMIT 100;


-- ---------------------------------------------------------------------
-- Q8. GIỜ TRONG NGÀY user log — quyết định giờ mặc định cho notification.
-- Hiện tại app chỉ xin quyền notification khi user tự vào đặt giờ
-- (src/utils/notifications.ts) → phần lớn user không bao giờ nhận nhắc.
-- Con số này cho bạn giờ mặc định đúng để prefill.
-- ---------------------------------------------------------------------
SELECT
  extract(hour FROM to_timestamp(logged_at/1000.0) AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS gio,
  count(*) AS logs,
  count(DISTINCT user_email) AS users,
  repeat('▇', GREATEST(1, (count(*) / GREATEST(1,(SELECT count(*)/20 FROM public.activity_log WHERE source<>'LOGIN')))::int)) AS bar
FROM public.activity_log
WHERE source <> 'LOGIN'
GROUP BY 1 ORDER BY 1;


-- =====================================================================
-- NGOÀI SQL — 3 báo cáo Play Console bạn đã có sẵn, chưa mở:
--
--   1. Statistics → Metrics: "Installs" vs "Uninstalls" theo ngày
--      → tỉ lệ gỡ cài. >40% trong 7 ngày = onboarding hỏng, không phải
--        thiếu feature.
--   2. Grow → Store performance → "Store listing conversion rate"
--      → % người XEM trang mà bấm cài. Đây là số duy nhất cho biết
--        6 screenshot + short description của bạn có thuyết phục không.
--        Nếu impression thấp thì đừng đụng ASO — vấn đề là phân phối.
--   3. Quality → Android vitals: crash rate + ANR rate
--      → nếu vượt ngưỡng "bad behavior" Google sẽ hạ hiển thị app.
--        Sentry đã có sẵn trong app, đối chiếu chéo.
--
-- Ba số đó + Q1 ở trên là toàn bộ dữ liệu bạn cần để quyết định tuần này.
-- =====================================================================
