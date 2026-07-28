import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabase';

export type LeaderboardEntry = {
  userEmail: string;
  displayName: string;
  lifetimeStars: number;
  rank: number;
  isCurrentUser: boolean;
};

export function emailPrefix(email: string): string {
  const at = email.indexOf('@');
  if (at < 0) return email;
  return email.slice(0, at);
}

export function aggregateStarsByEmail(rows: { user_email: string; stars_delta: number | null }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.user_email, (map.get(row.user_email) ?? 0) + (row.stars_delta ?? 0));
  }
  return map;
}

function buildLeaderboardEntries(
  starsByEmail: Map<string, number>,
  currentUserEmail: string | null,
): Omit<LeaderboardEntry, 'rank'>[] {
  const entries: Omit<LeaderboardEntry, 'rank'>[] = [];
  for (const [email, stars] of starsByEmail) {
    entries.push({ userEmail: email, displayName: emailPrefix(email), lifetimeStars: Math.max(0, stars), isCurrentUser: email === currentUserEmail });
  }
  return entries;
}

/**
 * Sorts strictly by lifetime score descending (rank 1 = highest); ties break
 * on userEmail ascending for a stable, deterministic order across identical
 * repeated queries.
 */
export function buildRankedLeaderboard(
  starsByEmail: Map<string, number>,
  currentUserEmail: string | null,
): LeaderboardEntry[] {
  const entries = buildLeaderboardEntries(starsByEmail, currentUserEmail);
  entries.sort((a, b) => b.lifetimeStars - a.lifetimeStars || a.userEmail.localeCompare(b.userEmail));
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}

/**
 * Global lifetime leaderboard — every player, sorted strictly by lifetime
 * score descending (rank 1 = highest). No week filter, no tier band: this is
 * the single unified ranking, visible to everyone regardless of their own tier.
 * Ties break on userEmail ascending for a stable, deterministic order.
 */
export function useLeaderboard(currentUserEmail: string | null) {
  return useQuery({
    queryKey: ['leaderboard'],
    enabled: !!supabase,
    staleTime: 60_000,
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      if (!supabase) return [];

      // 10 000 row ceiling — pre-existing scaling limit, tracked in TODOS.md
      // as follow-up scope (server-side aggregate view/RPC). Not fixed here.
      const { data, error } = await supabase
        .from('activity_log')
        .select('user_email, stars_delta')
        .limit(10000);

      if (error) throw error;
      if (!data?.length) return [];

      const starsByEmail = aggregateStarsByEmail(data);
      return buildRankedLeaderboard(starsByEmail, currentUserEmail);
    },
  });
}
