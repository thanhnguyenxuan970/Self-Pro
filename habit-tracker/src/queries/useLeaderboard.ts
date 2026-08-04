import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabase';

export type LeaderboardEntry = {
  playerId: string;
  displayName: string;
  lifetimeStars: number;
  rank: number;
  isCurrentUser: boolean;
};

export type RemoteLeaderboardRow = {
  player_id: string;
  lifetime_stars: number | null;
  rank: number | string;
  is_current_user: boolean;
};

export function aggregateLifetimeStarsByPlayerId(rows: { player_id: string; lifetime_stars: number | null }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.player_id, row.lifetime_stars ?? 0);
  }
  return map;
}

function buildLeaderboardEntries(
  starsByPlayerId: Map<string, number>,
  currentPlayerId: string | null,
): Omit<LeaderboardEntry, 'rank'>[] {
  const entries: Omit<LeaderboardEntry, 'rank'>[] = [];
  for (const [playerId, stars] of starsByPlayerId) {
    entries.push({ playerId, displayName: playerId, lifetimeStars: Math.max(0, stars), isCurrentUser: playerId === currentPlayerId });
  }
  return entries;
}

/**
 * Sorts strictly by lifetime score descending (rank 1 = highest); ties break
 * on player id ascending for a stable, deterministic local result.
 */
export function buildRankedLeaderboard(
  starsByPlayerId: Map<string, number>,
  currentPlayerId: string | null,
): LeaderboardEntry[] {
  const entries = buildLeaderboardEntries(starsByPlayerId, currentPlayerId);
  entries.sort((a, b) => b.lifetimeStars - a.lifetimeStars || a.playerId.localeCompare(b.playerId));
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}

export function publicPlayerName(playerId: string, playerLabel: string): string {
  const suffix = playerId.replaceAll('-', '').slice(0, 6) || 'unknown';
  return `${playerLabel} #${suffix}`;
}

export function mapRemoteLeaderboardRows(
  rows: RemoteLeaderboardRow[],
  currentUserName: string | null,
  playerLabel: string,
): LeaderboardEntry[] {
  return rows
    .map((row) => {
      const playerId = typeof row.player_id === 'string' && row.player_id.length > 0 ? row.player_id : 'unknown';
      const isCurrentUser = row.is_current_user === true;
      return {
        playerId,
        displayName: isCurrentUser ? (currentUserName?.trim() || playerLabel) : publicPlayerName(playerId, playerLabel),
        lifetimeStars: Math.max(0, Number(row.lifetime_stars) || 0),
        rank: Math.max(1, Number(row.rank) || 1),
        isCurrentUser,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.playerId.localeCompare(b.playerId));
}

/**
 * Global lifetime leaderboard — every player, sorted strictly by lifetime
 * score descending (rank 1 = highest). No week filter, no tier band: this is
 * the single unified ranking, visible to everyone regardless of their own tier.
 * Ties break on the private server-side email key; the client only receives
 * the server-assigned public player id.
 */
export function useLeaderboard(currentUserEmail: string | null, currentUserName: string | null, playerLabel: string) {
  return useQuery({
    queryKey: ['leaderboard', currentUserEmail, currentUserName, playerLabel],
    enabled: !!supabase,
    staleTime: 60_000,
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      if (!supabase) return [];

      const { data, error } = await supabase.rpc('get_global_leaderboard', { p_limit: 50 });
      if (error) throw error;
      return mapRemoteLeaderboardRows((data ?? []) as RemoteLeaderboardRow[], currentUserName, playerLabel);
    },
  });
}
