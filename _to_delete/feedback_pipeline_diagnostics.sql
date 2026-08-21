-- =====================================================================
-- HABI — CHẨN ĐOÁN "0 PHIẾU FEEDBACK" (Supabase Dashboard → SQL Editor)
-- Ngày viết: 2026-08-20  ·  Đi cùng: Docs/growth_audit_queries.sql,
-- Docs/survey_d0_analysis_queries.sql
-- =====================================================================
--
-- MỤC ĐÍCH: ba giả thuyết KHÁC HẲN nhau cùng hiện ra là con số 0. Phải
-- tách chúng ra TRƯỚC khi đổi bất cứ thứ gì trong UI.
--
--   H1. Mẫu số quá nhỏ — không đủ người để kỳ vọng >0 phiếu.
--   H2. D0 chưa từng đủ điều kiện bắn. Nó ship ở v2.0.2 (commit
--       2026-08-18) và chỉ bắn ở lần log ĐẦU ĐỜI ⇒ ai đã log trước đó
--       là vĩnh viễn không đủ điều kiện, dù mở app mỗi ngày.
--   H3. Pipeline ghi hỏng — có người gửi nhưng row không bao giờ tới.
--
-- LƯU Ý KỸ THUẬT (chép từ growth_audit_queries.sql, đã verify trong repo):
--   · activity_log khoá theo `user_email`, KHÔNG phải user_id.
--   · activity_log.local_date = TEXT 'YYYY-MM-DD' → phải ::date.
--   · source='LOGIN' là dòng do trigger đăng nhập sinh ra (migration 007),
--     KHÔNG phải hành vi log habit. Mọi query dưới đây đều loại nó ra —
--     nếu quên, "lần log đầu đời" sẽ ra ngày đăng ký và toàn bộ Q3/Q4 sai.
--   · SQL Editor chạy quyền postgres, bỏ qua RLS. Dữ liệu user thật.
-- =====================================================================

-- Tài khoản của chính bạn — luôn loại khỏi mọi phép đo mẫu số.
-- (Q1/Q2 CỐ Ý không loại, vì phiếu test của bạn chính là thứ cần thấy.)


-- ---------------------------------------------------------------------
-- Q1. Có row nào không, và thuộc loại gì?
-- Chạy SAU KHI bạn tự gửi 1 phiếu test từ app (xem "CÁCH ĐỌC" ở cuối).
-- ---------------------------------------------------------------------
SELECT
  type,
  count(*)                                     AS rows,
  count(*) FILTER (WHERE answers IS NOT NULL)  AS with_answers,
  count(*) FILTER (WHERE coalesce(message, '') <> '') AS with_text,
  min(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS first_seen,
  max(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS last_seen
FROM public.feedback
GROUP BY type
ORDER BY rows DESC;


-- ---------------------------------------------------------------------
-- Q2. app_version của các row — bằng chứng trực tiếp cho bug hằng số.
--
-- Nếu thấy '1.1.0.0' trên row gửi từ build 2.0.x: đó là APP_VERSION
-- hardcode ở feedbackService.ts:15 (ĐÃ SỬA trong lần thay đổi này — giờ
-- đọc thẳng từ app.json). Sau khi ship bản vá, mọi row MỚI phải mang
-- đúng version thật. Nếu vẫn thấy '1.1.0.0' trên row mới ⇒ người gửi
-- đang chạy binary cũ, chưa cập nhật.
-- ---------------------------------------------------------------------
SELECT app_version, type, count(*) AS rows,
       max(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS last_seen
FROM public.feedback
GROUP BY app_version, type
ORDER BY last_seen DESC NULLS LAST;


-- ---------------------------------------------------------------------
-- Q3. MẪU SỐ THẬT CỦA D0 — câu quan trọng nhất trong file này.
--
-- ⚠️ SỬA `ship_date` thành ngày bản 2.0.2 THẬT SỰ tải được trên store,
-- KHÔNG phải ngày commit. Play review + staged rollout theo % thường
-- chậm hơn commit vài ngày, và chênh vài ngày ở đây là đủ để lật ngược
-- kết luận. Nếu không chắc, dùng ngày muộn nhất bạn tin được.
-- ---------------------------------------------------------------------
WITH params AS (
  SELECT DATE '2026-08-18' AS ship_date,                    -- <<< SỬA Ở ĐÂY
         ARRAY['thanhnguyenxuan970@gmail.com'] AS excluded  -- <<< thêm account test
),
first_log AS (
  SELECT lower(user_email) AS email,
         min(local_date::date) AS first_log_date
  FROM public.activity_log
  WHERE source IS DISTINCT FROM 'LOGIN'
  GROUP BY 1
)
SELECT
  count(*)                                                AS users_with_any_log,
  count(*) FILTER (WHERE f.first_log_date >= p.ship_date)  AS eligible_for_d0,
  count(*) FILTER (WHERE f.first_log_date <  p.ship_date)  AS permanently_ineligible,
  min(f.first_log_date)                                    AS earliest_first_log,
  max(f.first_log_date)                                    AS latest_first_log
FROM first_log f
CROSS JOIN params p
WHERE f.email <> ALL (p.excluded);


-- ---------------------------------------------------------------------
-- Q4. Tỉ lệ trả lời D0 trên ĐÚNG mẫu số đủ điều kiện.
--
-- Đây là con số duy nhất được phép gọi là "tỉ lệ phản hồi survey".
-- Chia cho tổng số user đã đăng ký là sai và sẽ luôn ra gần 0, bất kể
-- survey tốt hay tệ.
-- ---------------------------------------------------------------------
WITH params AS (
  SELECT DATE '2026-08-18' AS ship_date,                    -- <<< SỬA CHO KHỚP Q3
         ARRAY['thanhnguyenxuan970@gmail.com'] AS excluded
),
eligible AS (
  SELECT lower(a.user_email) AS email
  FROM public.activity_log a
  CROSS JOIN params p
  WHERE a.source IS DISTINCT FROM 'LOGIN'
    AND lower(a.user_email) <> ALL (p.excluded)
  GROUP BY 1, p.ship_date
  HAVING min(a.local_date::date) >= p.ship_date
),
responded AS (
  SELECT count(DISTINCT lower(user_email)) AS n
  FROM public.feedback
  WHERE type = 'SURVEY_D0'
    AND lower(user_email) <> ALL (SELECT unnest(excluded) FROM params)
)
SELECT
  (SELECT count(*) FROM eligible) AS eligible_users,
  (SELECT n FROM responded)       AS survey_respondents,
  CASE WHEN (SELECT count(*) FROM eligible) = 0 THEN NULL
       ELSE round(100.0 * (SELECT n FROM responded) / (SELECT count(*) FROM eligible), 1)
  END                             AS response_rate_pct;


-- ---------------------------------------------------------------------
-- Q5. Mẫu số cho feedback THỦ CÔNG (nút 📬 trong Settings).
--
-- Tự nhân trước khi kết luận "không ai đụng đến nó":
--   users_ever_logged × tỉ lệ gửi feedback tự nguyện thực tế (1–3%)
--   = 13 × 0.02 ≈ 0.26 phiếu kỳ vọng.
-- Con số 0 quan sát được KHỚP HOÀN TOÀN với một cái nút đặt ở vị trí
-- hoàn hảo. Đó là lý do đổi vị trí nút không trả lời được câu hỏi nào —
-- nó không phân biệt được với giả thuyết "nút vốn đã ổn".
-- ---------------------------------------------------------------------
WITH params AS (
  SELECT ARRAY['thanhnguyenxuan970@gmail.com'] AS excluded
)
SELECT
  count(DISTINCT lower(a.user_email))                          AS users_ever_logged,
  count(DISTINCT lower(a.user_email))
    FILTER (WHERE a.local_date::date >= CURRENT_DATE - 7)      AS logged_last_7d,
  count(DISTINCT lower(a.user_email))
    FILTER (WHERE a.local_date::date >= CURRENT_DATE - 30)     AS logged_last_30d
FROM public.activity_log a
CROSS JOIN params p
WHERE a.source IS DISTINCT FROM 'LOGIN'
  AND lower(a.user_email) <> ALL (p.excluded);


-- =====================================================================
-- CÁCH ĐỌC
--
-- BƯỚC 0 — LÀM TRƯỚC KHI CHẠY BẤT KỲ QUERY NÀO:
--   Tự gửi 1 phiếu thật từ app: Settings → Báo lỗi / Phản hồi → gõ >3
--   ký tự → Gửi. Đợi thấy toast "Cảm ơn bạn đã phản hồi".
--   Đây là phép thử rẻ nhất và có giá trị thông tin cao nhất trong toàn
--   bộ việc này. Không có nó, mọi con số dưới đây đều mơ hồ giữa H1/H2/H3.
--
--  • Q1 vẫn 0 sau khi app đã báo "Cảm ơn"
--      → H3: PIPELINE HỎNG. Nhiều khả năng Edge Function
--        `feedback-submit` chưa deploy, hoặc đang chạy bản cũ chưa
--        whitelist 'SURVEY_D0' và field `answers` (bảng feedback đã
--        revoke client INSERT ở migration 034 ⇒ field không được liệt kê
--        sẽ bị drop IM LẶNG, không báo lỗi). Source trong repo ĐÚNG —
--        nên nghi ngờ trạng thái deploy, không phải code.
--        Kiểm tra: Supabase → Edge Functions → feedback-submit → Logs.
--        Deploy lại: supabase functions deploy feedback-submit --no-verify-jwt
--        ⇒ MỌI thay đổi UI đều vô nghĩa cho tới khi loại trừ được H3.
--
--  • Q1 có row test của bạn, nhưng eligible_for_d0 (Q3) = 0
--      → H2: D0 CHƯA TỪNG CÓ CƠ HỘI BẮN. Không phải bug, là số học.
--        Việc cần làm không phải sửa survey, mà là đưa người MỚI vào.
--
--  • eligible_for_d0 > 0, survey_rows = 0, eligible_users < 30
--      → H1: MẪU SỐ QUÁ NHỎ. Ở n này, 0 phiếu và 1 phiếu không phân biệt
--        được với nhau về mặt thống kê. Đừng suy diễn gì từ hiệu số.
--
--  • eligible_for_d0 >= 20 mà vẫn 0 phiếu
--      → LÚC NÀY mới có bằng chứng thật rằng survey/nút có vấn đề, và mới
--        đáng bỏ công đổi thiết kế.
-- =====================================================================
