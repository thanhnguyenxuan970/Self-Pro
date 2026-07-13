DELETE FROM public.news
WHERE version = '' AND title = 'Giữ nhịp dễ hơn, thấy tiến bộ rõ hơn ✨';

INSERT INTO public.news (version, title, title_en, body, body_en, tag, tag_en)
VALUES (
  '',
  'Giữ nhịp dễ hơn, thấy tiến bộ rõ hơn ✨',
  'Build momentum, see your progress ✨',
  E'Giữ nhịp mỗi ngày:\n• Heatmap theo năm giúp bạn nhìn lại cả hành trình.\n• Thử thách liên kết biến mục tiêu thành những bước nhỏ dễ theo.\n\nĂn mừng tiến bộ:\n• Trophy Shelf lưu lại các cột mốc đáng tự hào của bạn.\n\nMượt mà hơn:\n• Trang chủ, Lịch, Thống kê, Hồ sơ và Rank dễ xem hơn.\n• Đã sửa lỗi rank, reset tuần, bố cục và hiển thị tiếng Việt.',
  E'Make every day count:\n• A yearly heatmap lets you see your whole journey at a glance.\n• Linked challenges turn goals into small, easier steps.\n\nCelebrate progress:\n• Trophy Shelf keeps your proudest milestones in one place.\n\nSmoother every day:\n• Home, Calendar, Analytics, Profile, and Rank are easier to use.\n• Fixed rank, weekly reset, layout, and Vietnamese text issues.',
  'Có gì mới',
  'What''s new'
);
