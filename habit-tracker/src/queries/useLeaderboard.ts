import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabase';
import { buildQaSandboxLeaderboard, isQaSandboxActive } from '../qa/qaSandbox';
import { generatePlayerName } from '../config/playerNames';
import type { AppLanguage } from '../config/i18n';

export type LeaderboardEntry = {
  playerId: string;
  displayName: string;
  lifetimeStars: number;
  rank: number;
  isCurrentUser: boolean;
  /**
   * Stars needed to overtake the player one rank above. `null` at rank 1 (no
   * one to catch) and also `null` when the row above simply is not in the
   * fetched set — the server returns the top 50 plus a window around the
   * caller, so a rank-51 row has no rank-50 neighbour to measure against
   * unless that row happened to come back too. Never guessed.
   */
  starsToNextRank: number | null;
  /**
   * Consecutive logged days, straight from `public.users.current_streak`
   * (migration 027). This is the row's only "a person is behind this" signal —
   * a star total alone reads as seeded data.
   */
  currentStreak: number;
  /**
   * Rank positions climbed (positive) or dropped (negative) over the last
   * ~7 days, from `public.leaderboard_snapshots` (migration 045). `null`
   * means no snapshot old enough exists yet for this player — a brand-new
   * row, a returning player, or the local (offline) leaderboard path, which
   * has no history at all. Never coerced to 0: a missing comparison point is
   * not the same fact as "no change".
   */
  rankDelta7d: number | null;
};

/**
 * Rows above and below the caller returned by `get_global_leaderboard_v2`
 * (migration 026). Mirrored here for tests and for the UI's gap detection;
 * the server is the authority and clamps this itself.
 */
export const LEADERBOARD_TOP_LIMIT = 50;
const LEADERBOARD_NEIGHBORHOOD_RADIUS = 5;

/**
 * Fills in `starsToNextRank` for a list already sorted by rank ascending.
 * Only measures against a row that is actually present and exactly one rank
 * above, so the top-50 block and the caller's neighbourhood each get correct
 * gaps and nothing is computed across the discontinuity between them.
 */
function annotateStarsToNextRank(
  entries: Omit<LeaderboardEntry, 'starsToNextRank'>[],
): LeaderboardEntry[] {
  return entries.map((entry, index) => {
    const above = index > 0 ? entries[index - 1] : undefined;
    const adjacent = above && above.rank === entry.rank - 1;
    return {
      ...entry,
      starsToNextRank: adjacent ? Math.max(0, above.lifetimeStars - entry.lifetimeStars) : null,
    };
  });
}

/**
 * Defensive render ceiling. The server already bounds the payload to the top
 * `cap` plus the caller's ±5 window, so this only matters if that contract
 * ever drifts. Keeps every row inside the top block *and* every neighbourhood
 * row below it — a plain `slice(0, cap)` would silently drop the caller's
 * neighbourhood, which is the entire point of the fetch.
 */
export function capLeaderboardRows(
  entries: LeaderboardEntry[],
  topLimit = LEADERBOARD_TOP_LIMIT,
  neighborhoodRadius = LEADERBOARD_NEIGHBORHOOD_RADIUS,
): LeaderboardEntry[] {
  if (entries.length <= topLimit) return entries;

  const safeTopLimit = Math.max(1, Math.floor(topLimit));
  const safeRadius = Math.max(0, Math.floor(neighborhoodRadius));
  const selected = new Map<string, LeaderboardEntry>();
  for (const [index, entry] of entries.entries()) {
    if (index < safeTopLimit) selected.set(entry.playerId, entry);
  }

  const current = entries.find(entry => entry.isCurrentUser);
  if (current) {
    for (const entry of entries) {
      if (Math.abs(entry.rank - current.rank) <= safeRadius) selected.set(entry.playerId, entry);
    }
  }

  return [...selected.values()].sort((a, b) => a.rank - b.rank || a.playerId.localeCompare(b.playerId));
}

/**
 * Two-letter monogram for an avatar circle. Strips the disambiguating
 * `#NN` suffix `generatePlayerName` appends, then takes the first
 * character of each of the first two words (case-insensitively upper).
 */
export function initialsForName(displayName: string): string {
  const stripped = displayName.replace(/\s*#\S+$/, '').trim();
  // Only words starting with an actual letter count -- a name that is pure
  // punctuation (or empty/whitespace after stripping) falls back to '?'
  // rather than putting a stray symbol in the avatar circle.
  const words = stripped.split(/[\s-]+/).filter(w => w.length > 0 && /\p{L}/u.test(w[0]!));
  if (words.length === 0) return '?';
  return words.slice(0, 2).map(w => w[0]!.toUpperCase()).join('');
}

/**
 * True when `entry` does not directly follow `previous` in the global ladder,
 * i.e. the UI is about to draw the caller's neighbourhood after the top 50
 * with an arbitrary number of unshown players in between.
 */
export function hasRankGapBefore(entry: LeaderboardEntry, previous: LeaderboardEntry | undefined): boolean {
  return !!previous && entry.rank > previous.rank + 1;
}

export type RemoteLeaderboardRow = {
  player_id: string;
  lifetime_stars: number | null;
  rank: number | string;
  is_current_user: boolean;
  /** Absent on responses from a server still on migration 026 or earlier. */
  current_streak?: number | null;
  /** Absent on responses from a server still on migration 044 or earlier. */
  rank_delta_7d?: number | null;
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
): Omit<LeaderboardEntry, 'rank' | 'starsToNextRank'>[] {
  const entries: Omit<LeaderboardEntry, 'rank' | 'starsToNextRank'>[] = [];
  for (const [playerId, stars] of starsByPlayerId) {
    entries.push({
      playerId,
      displayName: playerId,
      lifetimeStars: Math.max(0, stars),
      isCurrentUser: playerId === currentPlayerId,
      // This local path only ever sees a stars map; streak is a server-only
      // field, so report 0 rather than inventing one.
      currentStreak: 0,
      // Same reasoning: this path has no snapshot history to compare against.
      rankDelta7d: null,
    });
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
  return annotateStarsToNextRank(entries.map((e, i) => ({ ...e, rank: i + 1 })));
}

/**
 * Pseudonym shown for every player who is not the caller. Delegates to the
 * curated word list rather than slicing the UUID: identical anonymity, but it
 * reads as a competitor instead of a database row.
 */
function publicPlayerName(playerId: string, playerLabel: string, lang: AppLanguage = 'vi'): string {
  if (playerId === 'unknown') return `${playerLabel} #unknown`;
  return generatePlayerName(playerId, lang, `${playerLabel} #unknown`);
}

export function mapRemoteLeaderboardRows(
  rows: RemoteLeaderboardRow[],
  currentUserName: string | null,
  playerLabel: string,
  lang: AppLanguage = 'vi',
): LeaderboardEntry[] {
  const ordered = rows
    .map((row) => {
      const playerId = typeof row.player_id === 'string' && row.player_id.length > 0 ? row.player_id : 'unknown';
      const isCurrentUser = row.is_current_user === true;
      return {
        playerId,
        displayName: isCurrentUser ? (currentUserName?.trim() || playerLabel) : publicPlayerName(playerId, playerLabel, lang),
        lifetimeStars: Math.max(0, Number(row.lifetime_stars) || 0),
        rank: Math.max(1, Number(row.rank) || 1),
        isCurrentUser,
        // Tolerate a server still on 026: a missing column means "unknown",
        // and an unknown streak must render as no signal, never a fake one.
        currentStreak: Math.max(0, Math.floor(Number(row.current_streak) || 0)),
        // Explicit null check, not `Number(x) || 0` — that idiom would turn a
        // genuine "no 7-day snapshot yet" into a fabricated "no change".
        rankDelta7d: row.rank_delta_7d == null ? null : Math.trunc(Number(row.rank_delta_7d)) || 0,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.playerId.localeCompare(b.playerId));
  return annotateStarsToNextRank(ordered);
}

/**
 * Global lifetime leaderboard — every player, sorted strictly by lifetime
 * score descending (rank 1 = highest). No week filter, no tier band: this is
 * the single unified ranking, visible to everyone regardless of their own tier.
 * Ties break on the private server-side email key; the client only receives
 * the server-assigned public player id.
 *
 * The RPC returns the top 50 *plus* the caller's rank neighbourhood (±5), so
 * the returned list can contain a discontinuity — use `hasRankGapBefore` when
 * rendering rather than assuming consecutive ranks.
 */
export function useLeaderboard(
  currentUserEmail: string | null,
  currentUserName: string | null,
  playerLabel: string,
  lang: AppLanguage = 'vi',
  currentStars = 0,
) {
  const qaSandboxActive = isQaSandboxActive();
  const query = useQuery({
    // `lang` is part of the key because generated names are language-specific;
    // switching language must re-derive them rather than serve stale copy.
    queryKey: ['leaderboard', currentUserEmail, currentUserName, playerLabel, lang, qaSandboxActive ? Math.round(currentStars) : null],
    enabled: !!currentUserEmail && (qaSandboxActive || !!supabase),
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      if (qaSandboxActive) {
        // The sandbox board is intentionally local and in-memory. This keeps
        // the real Supabase leaderboard path unreachable while still letting
        // QA exercise the full Rank UI with a crowded, moving board.
        return mapRemoteLeaderboardRows(
          buildQaSandboxLeaderboard(currentStars),
          currentUserName,
          playerLabel,
          lang,
        );
      }
      if (!supabase || !currentUserEmail) return [];

      // Supabase sessions are intentionally not persisted. Re-establish the
      // short-lived authenticated session before the protected leaderboard RPC
      // so returning users do not get a misleading network error.
      const { ensureSupabaseSession } = await import('../api/syncService');
      await ensureSupabaseSession(currentUserEmail);

      // Best-effort: record this instant's rank so a visit ~7 days from now
      // can show movement. Never let this delay or fail the leaderboard load.
      void Promise.resolve(supabase.rpc('record_leaderboard_snapshot')).catch(() => {});

      const { data, error } = await supabase.rpc('get_global_leaderboard_v2', { p_limit: LEADERBOARD_TOP_LIMIT });
      if (error) throw error;
      return mapRemoteLeaderboardRows((data ?? []) as RemoteLeaderboardRow[], currentUserName, playerLabel, lang);
    },
  });

  // A production build without the public Supabase variables disables the
  // query entirely. Keep that state explicit so the UI cannot mistake a
  // missing backend configuration for a genuinely empty global board.
  return { ...query, isUnavailable: !qaSandboxActive && !supabase };
}
