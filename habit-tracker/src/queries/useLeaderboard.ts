import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabase';
import { getWeekStart } from '../utils/formatters';

type LeaderboardEntry = {
  userEmail: string;
  displayName: string;
  weeklyStars: number;
  rank: number;
  isCurrentUser: boolean;
};

type TierDef = { tier_order: number; stars_required: number };

/** Mask email for display: "thanhnguyenxuan970@gmail.com" → "tha***@gmail.com" */
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local.slice(0, Math.min(3, local.length))}***${domain}`;
}

const EXCLUDED_FROM_LEADERBOARD = new Set(['thanhnguyenxuan970@gmail.com']);

function aggregateStarsByEmail(rows: { user_email: string; stars_delta: number | null }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.user_email, (map.get(row.user_email) ?? 0) + (row.stars_delta ?? 0));
  }
  return map;
}

function computeTierBand(tiers: TierDef[], currentTierOrder: number): { tierMin: number; tierMax: number } | null {
  const sorted = [...tiers].sort((a, b) => a.stars_required - b.stars_required);
  const myTier = sorted.find(t => t.tier_order === currentTierOrder);
  if (!myTier) return null;
  const tierMin = myTier.stars_required;
  const nextTier = sorted.find(t => t.stars_required > tierMin);
  return { tierMin, tierMax: nextTier?.stars_required ?? Infinity };
}

function buildLeaderboardEntries(
  starsByEmail: Map<string, number>,
  tierMin: number, tierMax: number,
  currentUserEmail: string | null,
): Omit<LeaderboardEntry, 'rank'>[] {
  const entries: Omit<LeaderboardEntry, 'rank'>[] = [];
  for (const [email, stars] of starsByEmail) {
    if (EXCLUDED_FROM_LEADERBOARD.has(email)) continue;
    if (stars >= tierMin && stars < tierMax) {
      entries.push({ userEmail: email, displayName: maskEmail(email), weeklyStars: stars, isCurrentUser: email === currentUserEmail });
    }
  }
  return entries;
}

/**
 * Fetch leaderboard for the current user's tier.
 * Queries Supabase activity_log for current week, groups by user_email,
 * filters to users whose weekly star total falls in the same tier band.
 */
export function useLeaderboard(
  currentUserEmail: string | null,
  currentTierOrder: number,
  tiers: TierDef[],
) {
  const weekStart = getWeekStart();
  return useQuery({
    queryKey: ['leaderboard', weekStart, currentTierOrder],
    enabled: !!supabase && currentTierOrder > 0 && tiers.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      if (!supabase) return [];

      const { data, error } = await supabase
        .from('activity_log')
        .select('user_email, stars_delta')
        .eq('week_start', weekStart);

      if (error) throw error;
      if (!data?.length) return [];

      const starsByEmail = aggregateStarsByEmail(data);
      const band = computeTierBand(tiers, currentTierOrder);
      if (!band) return [];

      const entries = buildLeaderboardEntries(starsByEmail, band.tierMin, band.tierMax, currentUserEmail);
      entries.sort((a, b) => b.weeklyStars - a.weeklyStars);
      return entries.map((e, i) => ({ ...e, rank: i + 1 }));
    },
  });
}
