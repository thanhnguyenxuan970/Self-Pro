DELETE FROM public.news
WHERE version = '2.0.0';

INSERT INTO public.news (version, title, title_en, body, body_en, tag, tag_en, published_at)
VALUES (
  '2.0.0',
  'Habi 2.0.0 đã chính thức có mặt trên Google Play ✨',
  'Habi 2.0.0 is now officially on Google Play ✨',
  E'Habi 2.0.0 đã có mặt trên Google Play!\n\nXếp hạng trọn đời:\n• Cấp bậc không còn reset mỗi tuần.\n• Theo dõi vị trí của bạn trên Bảng xếp hạng toàn cầu.\n• Xem màn chúc mừng khi đạt mốc mới.\n\nAnalytics mới:\n• Theo dõi tiến bộ theo Tuần, Tháng hoặc Năm.\n• Xem tổng điểm, biểu đồ hoạt động và độ ổn định streak.\n\nThêm động lực:\n• Nhận Multiplier Boost mỗi ngày để kiếm thêm sao trong thời gian hiệu lực.\n• Chinh phục Tier 9 Cosmic và xem lại mascot/rank đã mở khóa.\n• Nhận nhắc nhở hằng ngày cho thử thách Session/Week.\n\nTrải nghiệm ổn định hơn:\n• Cải thiện đồng bộ dữ liệu, thao tác back trên Android, hiệu năng, theme, độ tương phản và trình đọc màn hình.\n\nNâng cấp từ 1.1.5 lên 2.0.0 và tiếp tục xây dựng thói quen tốt cùng Habi!',
  E'Habi 2.0.0 is now officially on Google Play!\n\nLifetime Rank:\n• Ranks no longer reset weekly.\n• Track your position on the Global Leaderboard.\n• See a celebration when you reach a new milestone.\n\nNew Analytics:\n• Track progress by week, month, or year.\n• View total points, activity charts, and streak consistency.\n\nMore motivation:\n• Claim a daily Multiplier Boost to earn extra stars during the active window.\n• Reach Tier 9 Cosmic and revisit unlocked mascots and ranks.\n• Get daily reminders for Session and Week challenges.\n\nA smoother experience:\n• Improved data syncing, Android back navigation, performance, themes, contrast, and screen-reader support.\n\nUpgrade from 1.1.5 to 2.0.0 and keep building better habits with Habi!',
  'Có gì mới',
  'What''s new',
  '2026-08-05T00:00:00+07:00'
);
