DELETE FROM public.news
WHERE version = '2.0.2';

INSERT INTO public.news (version, title, title_en, body, body_en, tag, tag_en, published_at)
VALUES (
  '2.0.2',
  'Habi 2.0.2: Đồng bộ và thứ hạng chính xác hơn ✨',
  'Habi 2.0.2: More accurate sync and ranking ✨',
  E'Đồng bộ bảng xếp hạng đáng tin cậy hơn:\n• Đồng bộ giờ tải lên toàn bộ hoạt động còn tồn đọng thay vì dừng lại giữa chừng.\n• Thứ hạng tự động khớp lại nếu server bị tụt so với dữ liệu trên máy của bạn.\n\nThao tác bỏ check chính xác hơn:\n• Bỏ check một hoạt động đã hoàn thành giờ trừ đúng số sao đã cộng trước đó, không còn bị tăng ảo khi bật/tắt nhiều lần.\n• Bỏ check ngày cuối của Daily liên kết với một Thử thách đã hoàn thành sẽ tự kích hoạt lại thử thách đó và hoàn tác đúng phần thưởng.\n\nNhẹ và mượt hơn:\n• Giảm dung lượng cài đặt và tối ưu hiệu năng ứng dụng.\n\nNâng cấp từ 2.0.1 lên 2.0.2 để bảng xếp hạng và thứ hạng của bạn luôn chính xác!',
  E'A more reliable leaderboard sync:\n• Sync now uploads your entire backlog of activity instead of stopping partway.\n• Your rank self-corrects automatically if the server ever falls behind your device.\n\nMore accurate unchecking:\n• Unchecking a completed task now correctly subtracts the stars it earned, instead of inflating your total when toggled repeatedly.\n• Unchecking the last day of a Daily linked to a finished Challenge now reactivates that Challenge and reverses its reward correctly.\n\nLighter and smoother:\n• Reduced install size and optimized app performance.\n\nUpgrade from 2.0.1 to 2.0.2 to keep your leaderboard and rank accurate!',
  'Có gì mới',
  'What''s new',
  '2026-08-17T00:00:00+07:00'
);
