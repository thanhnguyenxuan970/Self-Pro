DELETE FROM public.news
WHERE version = '2.0.2';

INSERT INTO public.news (version, title, title_en, body, body_en, tag, tag_en, published_at)
VALUES (
  '2.0.2',
  'Habi 2.0.2: Thứ hạng và sao luôn chính xác ✨',
  'Habi 2.0.2: Your rank and stars, always accurate ✨',
  E'Xếp hạng chính xác hơn:\n• Sửa lỗi bảng xếp hạng đôi khi hiển thị chưa đúng tổng số sao của bạn.\n• Vị trí của bạn trên bảng xếp hạng giờ luôn phản ánh đúng toàn bộ tiến độ.\n\nBỏ check chính xác hơn:\n• Bỏ check một việc đã hoàn thành giờ trừ đúng số sao đã nhận — không còn bị cộng dư sao khi tích/bỏ nhiều lần.\n• Bỏ check ngày cuối của một thói quen liên kết với thử thách sẽ mở lại đúng thử thách đó.\n\nNhẹ và mượt hơn:\n• Ứng dụng nhẹ hơn và chạy mượt hơn.\n\nCập nhật ngay để trải nghiệm Habi chính xác và mượt mà hơn!',
  E'More accurate ranking:\n• Fixed the leaderboard sometimes showing the wrong total for your stars.\n• Your leaderboard position now always reflects your full progress.\n\nMore accurate unchecking:\n• Unchecking a completed task now removes exactly the stars it earned — no more extra stars from toggling it on and off.\n• Unchecking the last day of a habit linked to a challenge now reopens that challenge correctly.\n\nLighter and smoother:\n• The app is lighter and runs more smoothly.\n\nUpdate now for a more accurate, smoother Habi!',
  'Có gì mới',
  'What''s new',
  '2026-08-17T00:00:00+07:00'
);
