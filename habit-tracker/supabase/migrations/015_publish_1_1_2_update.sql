DELETE FROM public.news
WHERE version = '1.1.2'
  AND title = 'Gọn gàng hơn, đúng gu của bạn ✨';

INSERT INTO public.news (version, title, title_en, body, body_en, tag, tag_en)
VALUES (
  '1.1.2',
  'Gọn gàng hơn, đúng gu của bạn ✨',
  'Cleaner details, more your style ✨',
  E'Trải nghiệm mượt hơn:\n• Các bảng và popup giờ không bị che bởi thanh điều hướng.\n• Thêm hoạt động nhanh hơn: khi dùng tiếng Việt, tên được giữ nguyên; màn chọn thời lượng có nút quay lại.\n• Lịch và Tủ thành tựu dễ xem hơn với bố cục gọn gàng.\n\nTheo màu bạn chọn:\n• Heatmap, Thống kê và các điểm nhấn dùng màu chủ đề đang chọn.\n• Heatmap dùng nhãn tháng/thứ tiếng Anh rõ ràng hơn.',
  E'Smoother every day:\n• Sheets and popups no longer sit behind the navigation bar.\n• Adding an activity is faster: Vietnamese names stay as entered, and the duration step has a back button.\n• Calendar and Trophy Shelf are easier to scan with cleaner layouts.\n\nMade for your theme:\n• Heatmap, Analytics, and key highlights use your selected accent.\n• Heatmap month and weekday labels are now clearer in English.',
  'Có gì mới',
  'What''s new'
);
