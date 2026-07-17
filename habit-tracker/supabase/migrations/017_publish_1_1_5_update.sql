DELETE FROM public.news
WHERE version = '1.1.5';

INSERT INTO public.news (version, title, title_en, body, body_en, tag, tag_en, published_at)
VALUES (
  '1.1.5',
  'Rank sống động, theo dõi mượt hơn ✨',
  'More lively ranks, smoother tracking ✨',
  E'Rank rõ ràng hơn:\n• Xem mascot của các rank bạn đã vượt qua ngay trong hướng dẫn.\n• Rank chưa đạt vẫn được khóa rõ ràng.\n• Màn chúc mừng thăng hạng gọn và tập trung hơn.\n\nMượt mà hơn:\n• Cải thiện cách duy trì rank theo tuần.\n• Sửa các thao tác chỉnh sửa/backfill hoạt động để tiến độ luôn chính xác.',
  E'Clearer ranks:\n• See mascots for ranks you have already passed in the guide.\n• Ranks you have not reached remain clearly locked.\n• A cleaner, more focused rank-up celebration.\n\nSmoother tracking:\n• Improved weekly rank carry-over.\n• Fixed edit and backfill actions so progress stays accurate.',
  'Có gì mới',
  'What''s new',
  '2026-07-17T00:00:00+07:00'
);
