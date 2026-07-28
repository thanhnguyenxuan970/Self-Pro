import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabase';
import {
  getLastSeenNewsId,
  getLatestNewsId,
  getUnreadNewsCount,
  setLastSeenNewsId,
} from '../utils/news';

type NewsItem = {
  id: number;
  version: string;
  title: string;
  title_en: string | null;
  body: string;
  body_en: string | null;
  tag: string | null;
  tag_en: string | null;
  image: string | null;
  published_at: string;
};

type NewsRow = {
  id: number;
  version: string;
  title: string;
  title_en: string | null;
  body: string;
  body_en: string | null;
  tag: string | null;
  tag_en: string | null;
  image: string | null;
  published_at: string;
};

const NEWS_QUERY_KEY = ['news'] as const;

async function fetchNews(): Promise<NewsItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('news')
    .select('id, version, title, title_en, body, body_en, tag, tag_en, image, published_at')
    .order('published_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: NewsRow) => ({
    id: row.id,
    version: row.version,
    title: row.title,
    title_en: row.title_en,
    body: row.body,
    body_en: row.body_en,
    tag: row.tag,
    tag_en: row.tag_en,
    image: row.image,
    published_at: row.published_at,
  }));
}

export function useNewsFeed(viewerKey: string | null) {
  const queryClient = useQueryClient();
  const newsQuery = useQuery({ queryKey: NEWS_QUERY_KEY, queryFn: fetchNews });
  const lastSeenQuery = useQuery({
    queryKey: ['news', 'lastSeen', viewerKey],
    queryFn: () => getLastSeenNewsId(viewerKey!),
    enabled: viewerKey !== null,
  });

  const news = newsQuery.data ?? [];
  const lastSeenNewsId = lastSeenQuery.data ?? null;

  const latestNewsId = useMemo(() => getLatestNewsId(news), [news]);
  const unreadCount = useMemo(() => getUnreadNewsCount(news, lastSeenNewsId), [news, lastSeenNewsId]);

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!viewerKey) return null;
      const cachedNews = queryClient.getQueryData<NewsItem[]>(NEWS_QUERY_KEY) ?? [];
      const latestId = getLatestNewsId(cachedNews);
      if (latestId == null) return null;
      await setLastSeenNewsId(viewerKey, latestId);
      return latestId;
    },
    onSuccess: (newsId) => {
      queryClient.setQueryData(['news', 'lastSeen', viewerKey], newsId);
    },
  });

  return {
    news,
    lastSeenNewsId,
    latestNewsId,
    unreadCount,
    isLoading: newsQuery.isLoading || lastSeenQuery.isLoading,
    isFetching: newsQuery.isFetching || lastSeenQuery.isFetching,
    error: newsQuery.error ?? lastSeenQuery.error ?? null,
    refetch: () => Promise.all([newsQuery.refetch(), lastSeenQuery.refetch()]),
    markAllRead,
  };
}
