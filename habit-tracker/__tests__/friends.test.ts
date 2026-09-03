import {
  avatarPaletteSlot,
  buildFriendsSummary,
  daysAgo,
  daysUntil,
  friendSummaryStars,
  filterFriendCodeInput,
  formatRelativeAgo,
  formatStarCount,
  initialsFromName,
  isStickyResult,
  mapFriendDashboardRows,
  resultBannerTone,
  sanitizeDisplayName,
  withCurrentUserAnalyticsYearStars,
  type RemoteFriendDashboardRow,
} from '../src/lib/friends';

test('sanitizeDisplayName trims, collapses whitespace, strips control characters, caps at 80 code points', () => {
  expect(sanitizeDisplayName('  Minh   Nguyễn  ')).toBe('Minh Nguyễn');
  expect(sanitizeDisplayName('Minh\x00\x07Nguyễn')).toBe('MinhNguyễn');
  expect(sanitizeDisplayName('   ')).toBeNull();
  expect(sanitizeDisplayName(null)).toBeNull();
  expect(sanitizeDisplayName('a'.repeat(100))).toHaveLength(80);
});

test('initialsFromName takes first+last token first code point, uppercased', () => {
  expect(initialsFromName('Nguyễn Thị Hoàng Anh', 'P')).toBe('NA');
  // Single-token names use up to their first two code points, not one.
  expect(initialsFromName('Minh', 'P')).toBe('MI');
  expect(initialsFromName('  ', 'Player')).toBe('PL');
  expect(initialsFromName(null, 'Player')).toBe('PL');
});

test('avatarPaletteSlot is deterministic and bounded to 0-5', () => {
  const a = avatarPaletteSlot('player-abc-123');
  const b = avatarPaletteSlot('player-abc-123');
  expect(a).toBe(b);
  expect(a).toBeGreaterThanOrEqual(0);
  expect(a).toBeLessThanOrEqual(5);
  // Different ids should not all collide onto the same slot.
  const slots = new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map(avatarPaletteSlot));
  expect(slots.size).toBeGreaterThan(1);
});

function row(overrides: Partial<RemoteFriendDashboardRow>): RemoteFriendDashboardRow {
  return {
    relationship_id: null,
    section: 'accepted',
    player_id: 'p',
    display_name: 'Name',
    effective_streak: 0,
    year_stars: 0,
    friend_rank: 1,
    is_current_user: false,
    created_at: null,
    expires_at: null,
    ...overrides,
  };
}

test('mapFriendDashboardRows re-sorts self+accepted by dense rank even though the RPC always returns self before accepted', () => {
  // Mirrors get_my_friend_dashboard()'s ORDER BY: section priority (self=3
  // before accepted=4) wins over friend_rank, so raw row order puts self
  // first regardless of where they actually rank.
  const rows: RemoteFriendDashboardRow[] = [
    row({ section: 'self', player_id: 'me', friend_rank: 2, year_stars: 100, is_current_user: true }),
    row({ section: 'accepted', player_id: 'top', friend_rank: 1, year_stars: 240 }),
    row({ section: 'accepted', player_id: 'bottom', friend_rank: 3, year_stars: 10 }),
  ];
  const { ladder } = mapFriendDashboardRows(rows, 'Player');
  expect(ladder.map(r => r.playerId)).toEqual(['top', 'me', 'bottom']);
  expect(ladder.map(r => r.friendRank)).toEqual([1, 2, 3]);
});

test('mapFriendDashboardRows never collides two null player_id rows onto the same key — playerId doubles as the FlatList key', () => {
  const rows: RemoteFriendDashboardRow[] = [
    row({ section: 'accepted', player_id: null, friend_rank: 1, year_stars: 50 }),
    row({ section: 'accepted', player_id: null, friend_rank: 2, year_stars: 20 }),
  ];
  const { ladder } = mapFriendDashboardRows(rows, 'Player');
  const ids = ladder.map(r => r.playerId);
  expect(new Set(ids).size).toBe(ids.length);
});

test('mapFriendDashboardRows computes tiedCount per rank and preserves the tie in the rank numeral', () => {
  const rows: RemoteFriendDashboardRow[] = [
    row({ section: 'accepted', player_id: 'a', friend_rank: 1, year_stars: 1240 }),
    row({ section: 'accepted', player_id: 'b', friend_rank: 1, year_stars: 1240 }),
    row({ section: 'self', player_id: 'me', friend_rank: 2, year_stars: 900, is_current_user: true }),
  ];
  const { ladder } = mapFriendDashboardRows(rows, 'Player');
  expect(ladder.filter(r => r.friendRank === 1).every(r => r.tiedCount === 2)).toBe(true);
  expect(ladder.find(r => r.isCurrentUser)?.tiedCount).toBe(1);
});

test('mapFriendDashboardRows falls back a blank display name to the player label', () => {
  const rows: RemoteFriendDashboardRow[] = [row({ section: 'accepted', display_name: '   ' })];
  const { ladder } = mapFriendDashboardRows(rows, 'Player');
  expect(ladder[0].displayName).toBe('Player');
});

test('mapFriendDashboardRows treats non-finite annual star totals as zero', () => {
  const { ladder } = mapFriendDashboardRows([
    row({ section: 'accepted', year_stars: Number.POSITIVE_INFINITY }),
  ], 'Player');
  expect(ladder[0].yearStars).toBe(0);
});

test('mapFriendDashboardRows numbers outgoing rows by position and never carries a name', () => {
  const rows: RemoteFriendDashboardRow[] = [
    row({ section: 'outgoing', relationship_id: 'r1', player_id: null, display_name: null, created_at: '2026-08-01T00:00:00Z', expires_at: '2026-08-31T00:00:00Z' }),
    row({ section: 'outgoing', relationship_id: 'r2', player_id: null, display_name: null, created_at: '2026-08-05T00:00:00Z', expires_at: '2026-09-04T00:00:00Z' }),
  ];
  const { outgoing } = mapFriendDashboardRows(rows, 'Player');
  expect(outgoing.map(r => r.ordinal)).toEqual([1, 2]);
  expect(outgoing.map(r => r.relationshipId)).toEqual(['r1', 'r2']);
});

test('mapFriendDashboardRows maps incoming rows with the requester identity intact', () => {
  const rows: RemoteFriendDashboardRow[] = [
    row({ section: 'incoming', relationship_id: 'req1', player_id: 'requester-1', display_name: 'Trần Gia Hân' }),
  ];
  const { incoming } = mapFriendDashboardRows(rows, 'Player');
  expect(incoming[0]).toMatchObject({ relationshipId: 'req1', requesterPlayerId: 'requester-1', requesterDisplayName: 'Trần Gia Hân' });
});

test('buildFriendsSummary: solo leader at #1 with no tie and no catch target', () => {
  const { ladder } = mapFriendDashboardRows([
    row({ section: 'self', player_id: 'me', friend_rank: 1, year_stars: 500, is_current_user: true }),
    row({ section: 'accepted', player_id: 'other', friend_rank: 2, year_stars: 100 }),
  ], 'Player');
  expect(buildFriendsSummary(ladder)).toEqual({ kind: 'leadingSolo' });
});

test('buildFriendsSummary: tied at #1 never claims solo leadership', () => {
  const { ladder } = mapFriendDashboardRows([
    row({ section: 'self', player_id: 'me', friend_rank: 1, year_stars: 500, is_current_user: true }),
    row({ section: 'accepted', player_id: 'other', friend_rank: 1, year_stars: 500 }),
  ], 'Player');
  expect(buildFriendsSummary(ladder)).toEqual({ kind: 'tied', rank: 1, tiedWithCount: 1 });
});

test('buildFriendsSummary: below #1 computes the exact star gap to rank-1, never "overtake"', () => {
  const { ladder } = mapFriendDashboardRows([
    row({ section: 'accepted', player_id: 'top', friend_rank: 1, year_stars: 1240 }),
    row({ section: 'self', player_id: 'me', friend_rank: 2, year_stars: 1100, is_current_user: true }),
  ], 'Player');
  expect(buildFriendsSummary(ladder)).toEqual({ kind: 'catch', rank: 2, catchStars: 140, catchRank: 1 });
});

test('buildFriendsSummary: tie below #1 carries both the tie and the catch target', () => {
  const { ladder } = mapFriendDashboardRows([
    row({ section: 'accepted', player_id: 'top', friend_rank: 1, year_stars: 1240 }),
    row({ section: 'self', player_id: 'me', friend_rank: 2, year_stars: 900, is_current_user: true }),
    row({ section: 'accepted', player_id: 'tied', friend_rank: 2, year_stars: 900 }),
  ], 'Player');
  expect(buildFriendsSummary(ladder)).toEqual({ kind: 'tiedWithCatch', rank: 2, tiedWithCount: 1, catchStars: 340, catchRank: 1 });
});

test('buildFriendsSummary returns null when there is no self row', () => {
  const { ladder } = mapFriendDashboardRows([row({ section: 'accepted', friend_rank: 1 })], 'Player');
  expect(buildFriendsSummary(ladder)).toBeNull();
});

test('daysAgo and daysUntil clamp at 0 and never go negative', () => {
  const now = new Date('2026-08-11T00:00:00Z');
  expect(daysAgo('2026-08-09T00:00:00Z', now)).toBe(2);
  expect(daysAgo('2026-08-12T00:00:00Z', now)).toBe(0);
  expect(daysUntil('2026-08-13T00:00:00Z', now)).toBe(2);
  expect(daysUntil('2026-08-01T00:00:00Z', now)).toBe(0);
});

test('formatStarCount uses the locale group separator', () => {
  expect(formatStarCount(1240, 'vi')).toBe('1.240');
  expect(formatStarCount(1240, 'en')).toBe('1,240');
});

test('friend summary uses only the Analytics Year stars', () => {
  expect(friendSummaryStars(417)).toBe(417);
  expect(friendSummaryStars(null)).toBe(0);
  expect(friendSummaryStars(undefined)).toBe(0);
  expect(friendSummaryStars(-2)).toBe(0);
});

test('current Friends row follows local Analytics Year while rivals retain their own server totals', () => {
  const { ladder } = mapFriendDashboardRows([
    row({ section: 'self', player_id: 'me', friend_rank: 1, year_stars: 699, is_current_user: true }),
    row({ section: 'accepted', player_id: 'rival', friend_rank: 2, year_stars: 177 }),
  ], 'Player');

  const displayed = withCurrentUserAnalyticsYearStars(ladder, 356);

  expect(displayed.map(item => item.yearStars)).toEqual([356, 177]);
  expect(ladder.find(item => item.isCurrentUser)?.yearStars).toBe(699);
});

test('resultBannerTone: ACCEPTED and FORBIDDEN never get an inline banner', () => {
  expect(resultBannerTone('ACCEPTED')).toBeNull();
  expect(resultBannerTone('FORBIDDEN')).toBeNull();
});

test('resultBannerTone: informational statuses use success, the rate limit uses warning, hard failures use danger', () => {
  expect(resultBannerTone('PENDING')).toBe('success');
  expect(resultBannerTone('ALREADY_PENDING')).toBe('success');
  expect(resultBannerTone('ALREADY_FRIENDS')).toBe('success');
  expect(resultBannerTone('RATE_LIMITED')).toBe('warning');
  expect(resultBannerTone('NOT_FOUND')).toBe('danger');
  expect(resultBannerTone('SELF')).toBe('danger');
  expect(resultBannerTone('FRIEND_LIMIT_REACHED')).toBe('danger');
  expect(resultBannerTone('PENDING_LIMIT_REACHED')).toBe('danger');
  expect(resultBannerTone('UNAVAILABLE')).toBe('danger');
});

test('filterFriendCodeInput uppercases and passes through valid characters untouched', () => {
  expect(filterFriendCodeInput('k7m2qx')).toEqual({ value: 'K7M2QX', removedInvalidCount: 0 });
});

test('filterFriendCodeInput rejects I, L, O, 0, 1 — the excluded look-alikes', () => {
  expect(filterFriendCodeInput('IL01O').removedInvalidCount).toBe(5);
  expect(filterFriendCodeInput('IL01O').value).toBe('');
});

test('filterFriendCodeInput truncates silently past six valid characters — not counted as invalid', () => {
  expect(filterFriendCodeInput('ABCDEFGH')).toEqual({ value: 'ABCDEF', removedInvalidCount: 0 });
});

test('filterFriendCodeInput drops whitespace without counting it as an invalid character', () => {
  expect(filterFriendCodeInput('K7 M2 QX')).toEqual({ value: 'K7M2QX', removedInvalidCount: 0 });
});

test('filterFriendCodeInput counts genuinely invalid characters from a mixed paste', () => {
  expect(filterFriendCodeInput('b4k9-xy!')).toEqual({ value: 'B4K9XY', removedInvalidCount: 2 });
});

test('formatRelativeAgo picks the coarsest unit that stays >= 1, matching the board copy exactly', () => {
  const now = new Date('2026-08-11T12:00:00Z');
  expect(formatRelativeAgo(now.getTime() - 90_000, 'vi', now)).toBe('1 phút trước');
  expect(formatRelativeAgo(now.getTime() - 2 * 3_600_000, 'vi', now)).toBe('2 giờ trước');
  expect(formatRelativeAgo(now.getTime() - 2 * 3_600_000, 'en', now)).toBe('2 hours ago');
  expect(formatRelativeAgo(now.getTime() - 3 * 86_400_000, 'en', now)).toBe('3 days ago');
});

test('isStickyResult keeps submit disabled only for caps/rate-limit, not for an immediately-retryable typo', () => {
  expect(isStickyResult('ALREADY_PENDING')).toBe(true);
  expect(isStickyResult('ALREADY_FRIENDS')).toBe(true);
  expect(isStickyResult('RATE_LIMITED')).toBe(true);
  expect(isStickyResult('FRIEND_LIMIT_REACHED')).toBe(true);
  expect(isStickyResult('PENDING_LIMIT_REACHED')).toBe(true);
  expect(isStickyResult('NOT_FOUND')).toBe(false);
  expect(isStickyResult('SELF')).toBe(false);
  expect(isStickyResult('PENDING')).toBe(false);
});
