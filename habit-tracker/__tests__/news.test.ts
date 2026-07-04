import {
  getLatestNewsId,
  getNewsViewerKey,
  getUnreadNewsCount,
  isNewsRead,
} from '../src/utils/news';

test('news read state is scoped by latest seen id', () => {
  const news = [{ id: 12 }, { id: 10 }, { id: 8 }];
  expect(getLatestNewsId(news)).toBe(12);
  expect(getUnreadNewsCount(news, 10)).toBe(1);
  expect(isNewsRead(10, 10)).toBe(true);
  expect(isNewsRead(12, 10)).toBe(false);
});

test('viewer key is trimmed and nullable', () => {
  expect(getNewsViewerKey('  google-sub  ')).toBe('google-sub');
  expect(getNewsViewerKey('   ')).toBeNull();
  expect(getNewsViewerKey(null)).toBeNull();
});
