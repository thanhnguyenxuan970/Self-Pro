DO $$
BEGIN
  ALTER TABLE public.news ADD COLUMN title_en TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.news ADD COLUMN body_en TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.news ADD COLUMN tag_en TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

UPDATE public.news
SET
  title = 'Bản cập nhật mới',
  title_en = 'Latest updates',
  tag = 'Cập nhật',
  tag_en = 'Update',
  body = E'• Tính năng mới: thử thách liên kết, heatmap theo năm và Trophy Shelf.\n• Cải tiến: Trang chủ, Lịch, Thống kê, Hồ sơ và Rank rõ, mượt hơn.\n• Hệ thống: cải thiện độ ổn định và bảo vệ dữ liệu.\n• Sửa lỗi: rank, reset tuần, bố cục và tiếng Việt.',
  body_en = E'• New features: linked challenges, yearly heatmap, and Trophy Shelf.\n• Updates: clearer, smoother Home, Calendar, Analytics, Profile, and Rank screens.\n• System: improved stability and data protection.\n• Bug fixes: rank, weekly reset, layout, and Vietnamese text.'
WHERE version = 'Close Test';
