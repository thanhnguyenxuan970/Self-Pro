import AsyncStorage from '@react-native-async-storage/async-storage';

const NEWS_LAST_SEEN_KEY_PREFIX = 'habit_tracker_last_seen_news_id';

type NewsLike = { id: number };

export function getNewsViewerKey(userSub: string | null | undefined): string | null {
  const key = userSub?.trim();
  return key ? key : null;
}

function getLastSeenStorageKey(viewerKey: string): string {
  return `${NEWS_LAST_SEEN_KEY_PREFIX}:${viewerKey}`;
}

export function getLatestNewsId(news: NewsLike[]): number | null {
  return news.length > 0 ? news[0].id : null;
}

export function isNewsRead(newsId: number, lastSeenNewsId: number | null | undefined): boolean {
  return lastSeenNewsId != null && newsId <= lastSeenNewsId;
}

export function getUnreadNewsCount(news: NewsLike[], lastSeenNewsId: number | null | undefined): number {
  return news.filter((item) => !isNewsRead(item.id, lastSeenNewsId)).length;
}

export async function getLastSeenNewsId(viewerKey: string): Promise<number | null> {
  const raw = await AsyncStorage.getItem(getLastSeenStorageKey(viewerKey));
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function setLastSeenNewsId(viewerKey: string, newsId: number): Promise<void> {
  await AsyncStorage.setItem(getLastSeenStorageKey(viewerKey), String(newsId));
}
