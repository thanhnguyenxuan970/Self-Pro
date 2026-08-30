import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabase';
import { buildQaSandboxLeaderboard, isQaSandboxActive } from '../qa/qaSandbox';
import { generatePlayerName } from '../config/playerNames';
import type { AppLanguage } from '../config/i18n';
import { withSupabaseSession } from '../api/syncService';
import { getLocalDate, getMillisecondsUntilLocalMidnight } from '../utils/formatters';

export class LeaderboardUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('The Analytics Year leaderboard is not available yet.');
    this.name = 'LeaderboardUnavailableError';
    if (cause !== undefined) this.cause = cause;
  }
}

function isMissingAnnualLeaderboardRpc(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null;
  const text = [candidate?.message, candidate?.details, candidate?.hint]
    .filter(value => typeof value === 'string')
    .join(' ');
  return candidate?.code === 'PGRST202'
    || (/get_global_year_leaderboard_v1/i.test(text) && /function|rpc|could not find/i.test(text));
}

export type LeaderboardEntry = {
  playerId: string;
  displayName: string;
  yearStars: number;
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
   * ~7 days. The annual RPC currently returns `null` because the existing
   * snapshot table is lifetime-based and cannot describe annual movement;
   * the local fallback also has no history. Never coerced to 0: a missing
   * comparison point is not the same fact as "no change".
   */
  rankDelta7d: number | null;
};

/**
 * Rows above and below the caller returned by `get_global_year_leaderboard_v1`
 * (migration 069). Mirrored here for tests and for the UI's gap detection;
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
      starsToNextRank: adjacent ? Math.max(0, above.yearStars - entry.yearStars) : null,
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
  year_stars: number | null;
  rank: number | string;
  is_current_user: boolean;
  /** Optional for local/fixture callers; annual RPC 069 returns this field. */
  current_streak?: number | null;
  /** Null until annual rank-history snapshots exist. */
  rank_delta_7d?: number | null;
};

function normalizeYearStars(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

export function aggregateYearStarsByPlayerId(rows: { player_id: string; year_stars: number | null }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.player_id, normalizeYearStars(row.year_stars));
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
      yearStars: normalizeYearStars(stars),
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
 * Sorts strictly by Analytics Year score descending (rank 1 = highest); ties
 * break on player id ascending for a stable, deterministic local result.
 */
export function buildRankedLeaderboard(
  starsByPlayerId: Map<string, number>,
  currentPlayerId: string | null,
): LeaderboardEntry[] {
  const entries = buildLeaderboardEntries(starsByPlayerId, currentPlayerId);
  entries.sort((a, b) => b.yearStars - a.yearStars || a.playerId.localeCompare(b.playerId));
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
        yearStars: normalizeYearStars(row.year_stars),
        rank: Math.max(1, Number(row.rank) || 1),
        isCurrentUser,
        // Keep fixture/defensive inputs safe: a missing streak means "unknown",
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
 * Global Analytics Year leaderboard — every player, sorted strictly by the
 * current calendar year's TASK-star score descending (rank 1 = highest).
 * No week filter, no tier band: this is
 * the single unified ranking, visible to everyone regardless of their own tier.
 * Ties break on the private server-side email key; the client only receives
 * the server-assigned public player id. Annual rank movement is intentionally
 * null until annual snapshots exist.
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
  currentUserGoogleSub: string | null = null,
) {
  const qaSandboxActive = isQaSandboxActive();
  const today = getLocalDate();
  const query = useQuery({
    // `lang` is part of the key because generated names are language-specific;
    // switching language must re-derive them rather than serve stale copy.
    queryKey: ['leaderboard', currentUserGoogleSub, currentUserEmail, today, currentUserName, playerLabel, lang, qaSandboxActive ? Math.round(currentStars) : null],
    enabled: !!currentUserEmail && (qaSandboxActive || !!supabase),
    staleTime: 60_000,
    refetchInterval: () => getMillisecondsUntilLocalMidnight(),
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

      return withSupabaseSession(currentUserEmail, currentUserGoogleSub ?? undefined, async () => {
        // The annual RPC is server-authoritative for every player. Do not
        // fall back to the lifetime RPC: that would make the signed-in row
        // disagree with the board's ranking and recreate the original bug.
        const { data, error } = await supabase!.rpc('get_global_year_leaderboard_v1', { p_limit: LEADERBOARD_TOP_LIMIT });
        if (error) {
          // Migration 069 may not be deployed on every environment yet. Keep
          // that rollout state distinct from a transient connection failure so
          // the UI does not offer an endless, futile network retry.
          if (isMissingAnnualLeaderboardRpc(error)) throw new LeaderboardUnavailableError(error);
          throw error;
        }
        return mapRemoteLeaderboardRows((data ?? []) as RemoteLeaderboardRow[], currentUserName, playerLabel, lang);
      });
    },
  });

  // A production build without the public Supabase variables disables the
  // query entirely. Keep that state explicit so the UI cannot mistake a
  // missing backend configuration for a genuinely empty global board.
  return {
    ...query,
    isUnavailable: !qaSandboxActive && (!supabase || query.error instanceof LeaderboardUnavailableError),
  };
}
