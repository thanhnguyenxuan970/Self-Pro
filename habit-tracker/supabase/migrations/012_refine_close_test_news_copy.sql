UPDATE public.news
SET
  version = '',
  body = E'Tính năng mới:\n• Thử thách liên kết\n• Heatmap theo năm\n• Trophy Shelf\n\nCải tiến:\n• Trang chủ, Lịch, Thống kê, Hồ sơ và Rank rõ, mượt hơn\n\nHệ thống:\n• Cải thiện độ ổn định và bảo vệ dữ liệu\n\nSửa lỗi:\n• Rank, reset tuần, bố cục và tiếng Việt',
  body_en = E'New features:\n• Linked challenges\n• Yearly heatmap\n• Trophy Shelf\n\nUpdates:\n• Clearer, smoother Home, Calendar, Analytics, Profile, and Rank screens\n\nSystem:\n• Improved stability and data protection\n\nBug fixes:\n• Rank, weekly reset, layout, and Vietnamese text'
WHERE version = 'Close Test';
