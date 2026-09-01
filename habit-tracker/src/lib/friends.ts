import type { AppLanguage } from '../config/i18n';

export type FriendMutationStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'OK'
  | 'NOT_FOUND'
  | 'SELF'
  | 'ALREADY_PENDING'
  | 'ALREADY_FRIENDS'
  | 'RATE_LIMITED'
  | 'FRIEND_LIMIT_REACHED'
  | 'PENDING_LIMIT_REACHED'
  | 'FORBIDDEN'
  | 'UNAVAILABLE';

export type FriendActionResult = {
  status: FriendMutationStatus;
  retryAfterSeconds: number | null;
};

export type FriendSection = 'self' | 'accepted' | 'incoming' | 'outgoing';

// Mirrors get_my_year_friend_dashboard()'s RETURNS TABLE shape (migration 069)
// exactly. player_id is users.leaderboard_public_id, never the auth uuid.
export type RemoteFriendDashboardRow = {
  relationship_id: string | null;
  section: FriendSection;
  player_id: string | null;
  display_name: string | null;
  effective_streak: number | null;
  year_stars: number | null;
  friend_rank: number | null;
  is_current_user: boolean;
  created_at: string | null;
  expires_at: string | null;
};

export type FriendLadderRow = {
  relationshipId: string | null; // null for the self row
  playerId: string;
  displayName: string;
  effectiveStreak: number;
  yearStars: number;
  friendRank: number;
  isCurrentUser: boolean;
  // Count of rows sharing this row's friendRank. >1 marks a tie group for
  // the rail treatment; the rank numeral still repeats on every row in it.
  tiedCount: number;
};

export type FriendIncomingRow = {
  relationshipId: string;
  requesterPlayerId: string;
  requesterDisplayName: string;
  createdAt: string;
  expiresAt: string;
};

export type FriendOutgoingRow = {
  relationshipId: string;
  // 1-based position among outgoing rows, newest first — never a name or
  // code, since the recipient must stay unidentifiable until they accept.
  ordinal: number;
  createdAt: string;
  expiresAt: string;
};

export type FriendDashboard = {
  ladder: FriendLadderRow[];
  incoming: FriendIncomingRow[];
  outgoing: FriendOutgoingRow[];
};

/**
 * Defensive display-name normalizer, mirroring the server's
 * sanitize_friend_display_name(): strip control characters, collapse
 * whitespace, trim, cap at 80 Unicode code points, null if nothing remains.
 * The server already guarantees this on write; this exists so any stale or
 * locally-cached row can never render a blank/garbled name.
 */
export function sanitizeDisplayName(name: string | null | undefined): string | null {
  if (!name) return null;
  // eslint-disable-next-line no-control-regex
  const stripped = name.replace(/[\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ').trim();
  if (!stripped) return null;
  return Array.from(stripped).slice(0, 80).join('');
}

/**
 * Unicode-aware initials: normalizes to NFC (so Vietnamese base+diacritic
 * sequences collapse to one visual character before slicing), then takes the
 * first code point of the first and last whitespace-separated tokens. A
 * single-token name uses up to its first two code points. Blank, punctuation-
 * only, or emoji-only input falls back to the caller-supplied label's
 * initials treatment (the fallback string itself, e.g. "?" or a localized
 * "Player" first letter) rather than rendering nothing.
 */
export function initialsFromName(name: string | null | undefined, fallback: string): string {
  const clean = sanitizeDisplayName(name ?? null);
  const source = clean ?? fallback;
  const tokens = source.normalize('NFC').split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  const firstChars = Array.from(tokens[0]);
  if (tokens.length === 1) {
    return firstChars.slice(0, 2).join('').toUpperCase();
  }
  const lastChars = Array.from(tokens[tokens.length - 1]);
  const first = firstChars[0] ?? '';
  const last = lastChars[0] ?? '';
  return `${first}${last}`.toUpperCase();
}

/**
 * Deterministic 0-5 palette slot for a given player id — stable across
 * sessions/devices since it's a pure function of the id, never randomized or
 * assigned by insertion order.
 */
export function avatarPaletteSlot(playerId: string): number {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  }
  return hash % 6;
}

/**
 * Groups the flat dashboard payload into the ladder (self + accepted, sorted
 * by dense rank — the RPC's own row order puts every 'self' row before every
 * 'accepted' row regardless of rank, so this re-sorts them together),
 * incoming requests, and outgoing requests (newest first, numbered by
 * position since recipients stay anonymous).
 */
export function mapFriendDashboardRows(
  rows: RemoteFriendDashboardRow[],
  fallbackPlayerLabel: string,
): FriendDashboard {
  const ladderSource = rows.filter(row => row.section === 'self' || row.section === 'accepted');
  const rankCounts = new Map<number, number>();
  for (const row of ladderSource) {
    const rank = row.friend_rank ?? 0;
    rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
  }

  const ladder: FriendLadderRow[] = ladderSource
    .map((row, index) => ({
      relationshipId: row.relationship_id,
      // Falls back per-index, not a shared literal: playerId doubles as the
      // FlatList key (FriendsSection.tsx), and the server is never expected
      // to return more than one null-id row, but two 'unknown' rows would
      // collide on that key and React would misapply updates between them.
      playerId: row.player_id ?? `unknown-${index}`,
      displayName: sanitizeDisplayName(row.display_name) ?? fallbackPlayerLabel,
      effectiveStreak: Math.max(0, Math.floor(Number(row.effective_streak) || 0)),
      yearStars: Math.max(0, Math.floor(Number(row.year_stars) || 0)),
      friendRank: Math.max(1, Number(row.friend_rank) || 1),
      isCurrentUser: row.is_current_user === true,
      tiedCount: rankCounts.get(row.friend_rank ?? 0) ?? 1,
    }))
    .sort((a, b) => a.friendRank - b.friendRank || a.playerId.localeCompare(b.playerId));

  const incoming: FriendIncomingRow[] = rows
    .filter(row => row.section === 'incoming')
    .map(row => ({
      relationshipId: row.relationship_id ?? '',
      requesterPlayerId: row.player_id ?? 'unknown',
      requesterDisplayName: sanitizeDisplayName(row.display_name) ?? fallbackPlayerLabel,
      createdAt: row.created_at ?? new Date().toISOString(),
      expiresAt: row.expires_at ?? new Date().toISOString(),
    }));

  const outgoing: FriendOutgoingRow[] = rows
    .filter(row => row.section === 'outgoing')
    .map((row, index) => ({
      relationshipId: row.relationship_id ?? '',
      ordinal: index + 1,
      createdAt: row.created_at ?? new Date().toISOString(),
      expiresAt: row.expires_at ?? new Date().toISOString(),
    }));

  return { ladder, incoming, outgoing };
}

export type FriendsSummary =
  | { kind: 'leadingSolo' }
  | { kind: 'tied'; rank: number; tiedWithCount: number }
  | { kind: 'tiedWithCatch'; rank: number; tiedWithCount: number; catchStars: number; catchRank: number }
  | { kind: 'catch'; rank: number; catchStars: number; catchRank: number };

/**
 * Computes which lead/tie/catch case applies to the current user's row.
 * DENSE_RANK guarantees rank numbers are consecutive with no gaps and that
 * rank N-1 always carries strictly more stars than rank N, so "catch rank
 * N-1" always resolves when the self row isn't rank 1. Never says
 * "overtake" (the UI only ever needs one more star than this gap to do
 * that, which this function doesn't compute) and never renders a progress
 * bar — there is no finite race endpoint.
 */
export function buildFriendsSummary(ladder: FriendLadderRow[]): FriendsSummary | null {
  const self = ladder.find(row => row.isCurrentUser);
  if (!self) return null;

  const tiedWithCount = self.tiedCount - 1; // "with N others", excluding self
  if (self.friendRank === 1) {
    return tiedWithCount > 0
      ? { kind: 'tied', rank: 1, tiedWithCount }
      : { kind: 'leadingSolo' };
  }

  const catchRank = self.friendRank - 1;
  const catchRow = ladder.find(row => row.friendRank === catchRank);
  const catchStars = catchRow ? Math.max(0, catchRow.yearStars - self.yearStars) : 0;

  return tiedWithCount > 0
    ? { kind: 'tiedWithCatch', rank: self.friendRank, tiedWithCount, catchStars, catchRank }
    : { kind: 'catch', rank: self.friendRank, catchStars, catchRank };
}

function clampDays(ms: number): number {
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Whole days elapsed since `iso`, floored at 0. */
export function daysAgo(iso: string, now: Date = new Date()): number {
  return clampDays(now.getTime() - new Date(iso).getTime());
}

/** Whole days remaining until `iso`, floored at 0. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return clampDays(new Date(iso).getTime() - now.getTime());
}

function intlLocale(lang: AppLanguage): string {
  return lang === 'vi' ? 'vi-VN' : 'en-US';
}

/** Device-locale absolute date+time, e.g. "12 thg 8, 09:20" / "12 Aug, 09:20". */
export function formatAbsoluteDateTime(iso: string, lang: AppLanguage): string {
  return new Intl.DateTimeFormat(intlLocale(lang), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** Device-locale absolute date, e.g. "11 thg 9" / "11 Sep". */
export function formatAbsoluteDate(iso: string, lang: AppLanguage): string {
  return new Intl.DateTimeFormat(intlLocale(lang), { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/**
 * Locale-aware relative time via `Intl.RelativeTimeFormat` (never a
 * hardcoded phrase template) — "cập nhật 2 giờ trước" / "updated 2 hours
 * ago" for the stale-data banner. Picks the coarsest unit that stays >= 1.
 */
export function formatRelativeAgo(fromMs: number, lang: AppLanguage, now: Date = new Date()): string {
  const rtf = new Intl.RelativeTimeFormat(intlLocale(lang), { numeric: 'always' });
  const diffMs = Math.max(0, now.getTime() - fromMs);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return rtf.format(-Math.max(1, minutes), 'minute');
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.floor(diffMs / 86_400_000);
  return rtf.format(-days, 'day');
}

/** Locale group separator for star counts — "1.240" vi, "1,240" en. */
export function formatStarCount(n: number, lang: AppLanguage): string {
  return new Intl.NumberFormat(intlLocale(lang)).format(Math.round(n));
}

/**
 * The personal KPI in the Friends summary follows the same Analytics Year
 * source as Home and Rank. Missing data is zero; lifetime is never a visible
 * fallback.
 */
export function friendSummaryStars(yearStars: number | null | undefined): number {
  return Number.isFinite(yearStars) ? Math.max(0, Math.floor(yearStars as number)) : 0;
}

/**
 * Replaces only the signed-in Friends row with the local Analytics Year KPI.
 * Rival rows keep their own server-provided annual totals, and the input is
 * left untouched so server rank metadata remains separate from display copy.
 */
export function withCurrentUserAnalyticsYearStars(
  ladder: FriendLadderRow[],
  localYearStars: number | null | undefined,
): FriendLadderRow[] {
  const currentStars = friendSummaryStars(localYearStars);
  return ladder.map(row => row.isCurrentUser ? { ...row, yearStars: currentStars } : row);
}

export type ResultBannerTone = 'success' | 'warning' | 'danger';

/**
 * Which of the sheet's three visual banner treatments a result status gets.
 * `ACCEPTED` returns null — it closes the sheet and shows a toast over the
 * ladder instead of an inline banner. `FORBIDDEN` also returns null: a
 * recoverable session expiry retries silently once with no visible change,
 * and only an unrecoverable one exits through the auth gate — neither is an
 * inline sheet banner.
 */
export function resultBannerTone(status: FriendMutationStatus): ResultBannerTone | null {
  switch (status) {
    case 'ACCEPTED':
    case 'FORBIDDEN':
      return null;
    case 'PENDING':
    case 'ALREADY_PENDING':
    case 'ALREADY_FRIENDS':
      return 'success';
    case 'RATE_LIMITED':
      return 'warning';
    case 'NOT_FOUND':
    case 'SELF':
    case 'FRIEND_LIMIT_REACHED':
    case 'PENDING_LIMIT_REACHED':
    case 'UNAVAILABLE':
      return 'danger';
    default:
      return 'danger';
  }
}

/**
 * A result keeps the submit CTA disabled until the code text changes — the
 * caps and the rate limit are the "nothing changes without a different
 * code" family. NOT_FOUND/SELF are deliberately absent: those are
 * immediately retryable with the same code once the user notices the typo,
 * per §2's submit-enablement rule.
 */
export function isStickyResult(status: FriendMutationStatus): boolean {
  return status === 'ALREADY_PENDING' || status === 'ALREADY_FRIENDS' || status === 'RATE_LIMITED' || status === 'FRIEND_LIMIT_REACHED' || status === 'PENDING_LIMIT_REACHED';
}

// I, L, O, 0 and 1 are excluded — unreadable when a code is spoken aloud or
// retyped. Must match users_friend_code_format_check / generate_friend_code_
// candidate() in migration 030 exactly.
const FRIEND_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const FRIEND_CODE_LENGTH = 6;

/**
 * Auto-uppercases and filters to the valid alphabet, silently truncating at
 * six. `removedInvalidCount` counts only genuinely invalid characters —
 * typing or pasting past the six-character limit with otherwise-valid
 * characters truncates quietly, since that's not what "invalid" means to
 * the user (never announced as filtering when nothing was actually
 * rejected). Whitespace is dropped without counting as invalid, since it's
 * a common paste artifact, not a typo.
 */
export function filterFriendCodeInput(raw: string): { value: string; removedInvalidCount: number } {
  const upper = raw.toUpperCase();
  let value = '';
  let removedInvalidCount = 0;
  for (const ch of upper) {
    if (FRIEND_CODE_ALPHABET.includes(ch)) {
      if (value.length < FRIEND_CODE_LENGTH) value += ch;
    } else if (ch.trim() !== '') {
      removedInvalidCount++;
    }
  }
  return { value, removedInvalidCount };
}
