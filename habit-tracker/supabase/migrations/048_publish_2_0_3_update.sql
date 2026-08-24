DELETE FROM public.news
WHERE version = '2.0.3';

INSERT INTO public.news (version, title, title_en, body, body_en, tag, tag_en, published_at)
VALUES (
  '2.0.3',
  'Habi 2.0.3: Giao diện Rank hoàn toàn mới ✨',
  'Habi 2.0.3: Rank has a whole new look ✨',
  E'Khám phá màn Rank mới:\n\n• Bảng Top 15 mới làm nổi bật người dẫn đầu, tôn vinh Top 3 bằng huy chương và giúp bạn dễ theo dõi vị trí của mình hơn.\n• Xem vị trí của bạn đã thay đổi thế nào trong 7 ngày qua.\n• Khi kiếm đủ sao để leo hạng, bạn có thể nhìn số sao và vị trí của mình tiến lên trên bảng — rồi xem lại khoảnh khắc thăng hạng gần nhất.\n\nMượt mà hơn mỗi ngày:\n\n• Nhắc thói quen và thử thách hoạt động ổn định hơn sau khi bạn đóng và mở lại app.\n• Chế độ Tuần, Tháng và Năm trong Analytics rõ ràng và thống nhất hơn.\n\nDễ dùng hơn:\n\n• Các nhiệm vụ trên Today luôn nằm gọn trong thẻ.\n• Hoạt ảnh tuân theo cài đặt Giảm chuyển động, các nút quan trọng cũng dễ chạm hơn.\n• Ảnh hoạt động được xử lý tối ưu hơn, cùng nhiều cải thiện về độ ổn định.\n\nTiếp tục tiến bộ, từng ngôi sao một 💚',
  E'Meet the redesigned Rank screen:\n\n• A new Top 15 board highlights the leader, celebrates the top three with medals, and makes your own position easier to follow.\n• See how your rank has changed over the last 7 days.\n• When you earn enough stars to climb, watch your star total and position move through the board — then replay your latest rank-up moment.\n\nA smoother daily rhythm:\n\n• Habit and Challenge reminders keep working more reliably after you close and reopen the app.\n• Week, Month, and Year views in Analytics are clearer and more consistent.\n\nMore comfortable to use:\n\n• Tasks on Today stay neatly inside their cards.\n• Animations follow your Reduce Motion setting, and important controls are easier to tap.\n• Activity photos are handled more efficiently, with broader stability improvements.\n\nKeep moving forward, one star at a time 💚',
  'Có gì mới',
  'What''s new',
  '2026-08-24T00:00:00+07:00'
);
