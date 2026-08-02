import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabase';

export type LeaderboardEntry = {
  userEmail: string;
  displayName: string;
  lifetimeStars: number;
  rank: number;
  isCurrentUser: boolean;
};

export type RemoteLeaderboardRow = {
  user_email: string;
  lifetime_stars: number | null;
  rank: number | string;
};

export function emailPrefix(email: string): string {
  const at = email.indexOf('@');
  if (at < 0) return email;
  return email.slice(0, at);
}

export function aggregateLifetimeStarsByEmail(rows: { user_email: string; lifetime_stars: number | null }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.user_email, row.lifetime_stars ?? 0);
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

export function mapRemoteLeaderboardRows(
  rows: RemoteLeaderboardRow[],
  currentUserEmail: string | null,
): LeaderboardEntry[] {
  return rows
    .map((row) => ({
      userEmail: row.user_email,
      displayName: emailPrefix(row.user_email),
      lifetimeStars: Math.max(0, Number(row.lifetime_stars) || 0),
      rank: Math.max(1, Number(row.rank) || 1),
      isCurrentUser: row.user_email === currentUserEmail,
    }))
    .sort((a, b) => a.rank - b.rank || a.userEmail.localeCompare(b.userEmail));
}

/**
 * Global lifetime leaderboard — every player, sorted strictly by lifetime
 * score descending (rank 1 = highest). No week filter, no tier band: this is
 * the single unified ranking, visible to everyone regardless of their own tier.
 * Ties break on userEmail ascending for a stable, deterministic order.
 */
export function useLeaderboard(currentUserEmail: string | null) {
  return useQuery({
    queryKey: ['leaderboard', currentUserEmail],
    enabled: !!supabase,
    staleTime: 60_000,
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      if (!supabase) return [];

      const { data, error } = await supabase.rpc('get_global_leaderboard', { p_limit: 50 });
      if (error) throw error;
      return mapRemoteLeaderboardRows((data ?? []) as RemoteLeaderboardRow[], currentUserEmail);
    },
  });
}
