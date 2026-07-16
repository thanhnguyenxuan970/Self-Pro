DELETE FROM public.news
WHERE version = '1.1.4'
  AND title = 'Theo dõi dễ hơn, tiến bộ rõ hơn ✨';

INSERT INTO public.news (version, title, title_en, body, body_en, tag, tag_en, published_at)
VALUES (
  '1.1.4',
  'Theo dõi dễ hơn, tiến bộ rõ hơn ✨',
  'Follow progress with more clarity ✨',
  E'Theo dõi dễ hơn:\n• Chạm vào một ngày trên heatmap để xem chi tiết rõ ràng hơn.\n• Chú giải sao hằng ngày và điểm thưởng nay dễ hiểu hơn.\n\nDuy trì nhịp tốt hơn:\n• Danh sách và màn tạo thử thách được làm mới, nút ghi nhận luôn trong tầm tay.\n• Sửa cách tính số ngày còn lại của thử thách.\n\nMượt mà hơn:\n• Cải thiện khả năng đọc, vùng chạm và hỗ trợ trình đọc màn hình trên các màn chính.',
  E'Follow progress with more clarity:\n• Tap a day on the heatmap for clearer details.\n• Daily star and reward-point explanations are easier to understand.\n\nKeep your momentum:\n• Challenge browsing and creation have been refreshed, with logging always within reach.\n• Fixed the remaining-days calculation for challenges.\n\nSmoother to use:\n• Improved readability, touch targets, and screen-reader support across key screens.',
  'Có gì mới',
  'What''s new',
  '2026-07-16T00:00:00+07:00'
);
