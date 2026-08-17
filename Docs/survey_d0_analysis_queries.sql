-- =====================================================================
-- HABI — D0 SURVEY ANALYSIS (chạy trong Supabase Dashboard → SQL Editor)
-- App: com.habitring.app
-- Đi cùng: Docs/growth_audit_queries.sql (audit hành vi chung), migration
-- 044_feedback_survey_answers.sql (cột answers jsonb), và bộ câu hỏi D0
-- (Downloads/d0_survey_questions.md — xem "Đọc kết quả thế nào ở n<30").
--
-- TIỀN ĐỀ:
--   public.feedback.type = 'SURVEY_D0' — mỗi dòng là một lượt trả lời (hoặc
--   một phần, nếu user bỏ qua giữa chừng — form không lưu draft, nên mỗi
--   dòng ở đây là một lượt ĐÃ NHẤN GỬI, không phải một lượt ĐÃ THẤY form).
--   answers là jsonb, shape cố định:
--     { survey, q1_motivation, q2_impression, q3_friction[], q4_feature,
--       q5_return_intent, locale, device_lang, app_lang }
--   Q6 (câu mở) nằm ở feedback.message, không phải trong answers.
--
-- NHẮC LẠI (từ bộ câu hỏi gốc, đừng bỏ qua khi đọc số bên dưới):
--   · Đây là mẫu SURVIVOR — chỉ user đã vượt qua onboarding + log lần đầu
--     mới thấy form này. Đọc như "tiếng nói của người sống sót", không phải
--     "tiếng nói user" nói chung.
--   · n<30 → đọc SỐ TUYỆT ĐỐI, đừng tính phần trăm.
--   · Ngưỡng hành động: ≥3 người chọn Q3-A (sai ngôn ngữ) → giả thuyết
--     hardcode 'vi' được xác nhận, ngừng làm việc khác.
-- =====================================================================


-- ---------------------------------------------------------------------
-- S1. TỔNG QUAN PHẢN HỒI — bao nhiêu người, khi nào.
-- Chạy CÁI NÀY TRƯỚC để biết cỡ mẫu trước khi đọc bất kỳ bảng nào dưới đây.
-- ---------------------------------------------------------------------
SELECT
  count(*)                                   AS total_responses,
  count(DISTINCT lower(user_email))          AS distinct_users,
  min(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS first_response,
  max(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS last_response
FROM public.feedback
WHERE type = 'SURVEY_D0';


-- ---------------------------------------------------------------------
-- S2. MCQ — ĐẾM ĐẦU NGƯỜI cho Q1/Q2/Q4/Q5 (single-select).
-- Không tính %. "4/11 chọn C" luôn phải kèm mẫu số (xem S1).
-- ---------------------------------------------------------------------
SELECT 'Q1 — động cơ cài app' AS question, answers->>'q1_motivation' AS answer, count(*) AS n
FROM public.feedback WHERE type = 'SURVEY_D0' GROUP BY 1, 2
UNION ALL
SELECT 'Q2 — ấn tượng đầu', answers->>'q2_impression', count(*)
FROM public.feedback WHERE type = 'SURVEY_D0' GROUP BY 1, 2
UNION ALL
SELECT 'Q4 — ưu tiên feature', answers->>'q4_feature', count(*)
FROM public.feedback WHERE type = 'SURVEY_D0' GROUP BY 1, 2
UNION ALL
SELECT 'Q5 — ý định quay lại', answers->>'q5_return_intent', count(*)
FROM public.feedback WHERE type = 'SURVEY_D0' GROUP BY 1, 2
ORDER BY 1, 3 DESC;


-- ---------------------------------------------------------------------
-- S3. Q3 — RÀO CẢN (multi-select) — đếm mỗi option riêng, một user có
-- thể góp mặt ở nhiều dòng vì đây là multi-select.
-- ---------------------------------------------------------------------
SELECT
  opt AS friction_option,
  count(*) AS n,
  count(DISTINCT lower(user_email)) AS distinct_users
FROM public.feedback, jsonb_array_elements_text(answers->'q3_friction') AS opt
WHERE type = 'SURVEY_D0'
GROUP BY 1
ORDER BY n DESC;

-- NGƯỠNG HÀNH ĐỘNG: nếu dòng opt='A' ở trên có n >= 3, giả thuyết hardcode
-- 'vi' được XÁC NHẬN bằng chính lời user nói (không cần suy luận từ S4).
-- Dừng việc khác, đi fix locale trước.


-- ---------------------------------------------------------------------
-- S4. BỘ BA TỰ GHI locale/device_lang/app_lang — kiểm chứng giả thuyết
-- hardcode 'vi' NGAY CẢ KHI không ai chọn Q3-A. Đây là phần giá trị nhất
-- của toàn bộ survey vì nó không phụ thuộc user có ý thức về vấn đề hay
-- không — client tự ghi, không hỏi.
-- ---------------------------------------------------------------------
SELECT
  answers->>'device_lang' AS device_lang,
  answers->>'app_lang'    AS app_lang,
  answers->>'locale'      AS locale,
  count(*)                AS n,
  CASE
    WHEN answers->>'app_lang' = 'vi' AND answers->>'device_lang' <> 'vi'
      THEN '⚠️ app hiện tiếng Việt cho máy KHÔNG phải tiếng Việt'
    ELSE 'khớp'
  END AS verdict
FROM public.feedback
WHERE type = 'SURVEY_D0'
GROUP BY 1, 2, 3
ORDER BY n DESC;

-- ĐỌC KẾT QUẢ: nếu S3 có 0 người chọn Q3-A NHƯNG dòng ⚠️ ở đây xuất hiện
-- ≥3 lần — nghĩa là những người khổ nhất vì bug ngôn ngữ (thấy app sai
-- ngôn ngữ) đã không tồn tại đủ lâu để hoàn thành survey (mẫu survivor,
-- xem lời nhắc ở đầu file). Đó cũng là một kết quả xác nhận giả thuyết,
-- chỉ là không đến từ Q3.


-- ---------------------------------------------------------------------
-- S5. Q5 NÓI vs LÀM — đối chiếu "mai bạn có quay lại không" với hành vi
-- thật 24h sau (activity_log). Khoảng cách nói–làm mới là dữ liệu, không
-- phải câu trả lời Q5 tự thân. Ai chọn "chắc chắn" (A) mà không quay lại
-- là mẫu đáng nhắn tin xin 10 phút chat nhất.
-- ---------------------------------------------------------------------
WITH survey AS (
  SELECT
    lower(user_email) AS email,
    (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS survey_date,
    answers->>'q5_return_intent' AS q5
  FROM public.feedback
  WHERE type = 'SURVEY_D0' AND user_email IS NOT NULL
),
returned_next_day AS (
  SELECT DISTINCT lower(user_email) AS email, local_date::date AS d
  FROM public.activity_log
  WHERE source <> 'LOGIN'
)
SELECT
  s.q5 AS answered,
  count(*) AS respondents,
  count(*) FILTER (
    WHERE EXISTS (SELECT 1 FROM returned_next_day r WHERE r.email = s.email AND r.d = s.survey_date + 1)
  ) AS actually_returned_d1,
  count(*) FILTER (
    WHERE NOT EXISTS (SELECT 1 FROM returned_next_day r WHERE r.email = s.email AND r.d = s.survey_date + 1)
  ) AS said_but_did_not
FROM survey s
GROUP BY s.q5
ORDER BY s.q5;


-- ---------------------------------------------------------------------
-- S6. Q6 — CÂU MỞ, NGUYÊN VĂN. Đọc từng dòng, tự tay — đây là câu duy
-- nhất phát hiện thứ bạn chưa biết (đừng chỉ nhìn S1–S5 rồi kết luận).
-- ---------------------------------------------------------------------
SELECT
  created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS at,
  user_email,
  answers->>'q2_impression'    AS q2_impression,
  answers->>'q5_return_intent' AS q5_return_intent,
  message                      AS q6_raw_text
FROM public.feedback
WHERE type = 'SURVEY_D0' AND message IS NOT NULL AND length(trim(message)) > 0
ORDER BY created_at DESC;

-- GỢI Ý: nhắn riêng 3–5 người trong danh sách trên (ưu tiên q5='A' mà rơi
-- vào nhóm "said_but_did_not" ở S5, hoặc q2 thuộc D/E), xin 10 phút chat.
-- Đó là bước tiếp theo, không phải kết luận từ SQL.
-- =====================================================================
