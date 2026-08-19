import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Radii, AppColors, FontFamily } from '../config/theme';
import { capLeaderboardRows, hasRankGapBefore, LEADERBOARD_TOP_LIMIT, type LeaderboardEntry } from '../queries/useLeaderboard';

// Render ceiling for the leaderboard list, which lives inside the screen's
// outer ScrollView (so it can't be its own virtualized FlatList).
const LEADERBOARD_ROW_CAP = LEADERBOARD_TOP_LIMIT;

type LeaderboardRowCopy = {
  youLabel: string;
  nearYouLabel: string;
  gapToNext: (stars: number) => string;
  gapLevelLabel: string;
  topOfLadderLabel: string;
  lifetimeStars: (stars: number) => string;
  expandLabel: string;
  collapseLabel: string;
  streakDays: (days: number) => string;
};

type LeaderboardSectionProps = {
  leaderboard: LeaderboardEntry[];
  lbLoading: boolean;
  lbError: boolean;
  lbUnavailable: boolean;
  colors: AppColors;
  youLabel: string;
  emptyNote: string;
  noSyncNote: string;
  currentUserEntry: LeaderboardEntry;
  copy: LeaderboardRowCopy;
};

/**
 * One tappable ladder row. Expanding shows the two numbers a user actually
 * acts on — their lifetime total and the gap to the player directly above —
 * in place, so nothing navigates and no per-player screen is needed.
 */
const LeaderboardRow = React.memo(function LeaderboardRow({
  entry, isLast, expanded, onToggle, styles, copy,
}: {
  entry: LeaderboardEntry;
  isLast: boolean;
  expanded: boolean;
  onToggle: (playerId: string) => void;
  styles: ReturnType<typeof makeStyles>;
  copy: LeaderboardRowCopy;
}) {
  const detail = entry.rank === 1
    ? copy.topOfLadderLabel
    : entry.starsToNextRank === null
      ? null
      : entry.starsToNextRank === 0
        ? copy.gapLevelLabel
        : copy.gapToNext(entry.starsToNextRank);

  return (
    <TouchableOpacity
      style={[styles.lbRow, isLast && styles.lbRowLast, entry.isCurrentUser && styles.lbRowMe]}
      onPress={() => onToggle(entry.playerId)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`#${entry.rank} ${entry.displayName}${entry.isCurrentUser ? ` (${copy.youLabel})` : ''}, ${copy.lifetimeStars(entry.lifetimeStars)}${entry.currentStreak > 0 ? `, ${copy.streakDays(entry.currentStreak)}` : ''}`}
      accessibilityHint={expanded ? copy.collapseLabel : copy.expandLabel}
    >
      <Text style={[styles.lbRank, entry.rank <= 3 && styles.lbRankTop]} numberOfLines={1}>#{entry.rank}</Text>
      <View style={styles.lbInfo}>
        <Text style={styles.lbName} numberOfLines={1}>
          {entry.displayName}{entry.isCurrentUser ? ` (${copy.youLabel})` : ''}
        </Text>
        {/* Always visible, not gated behind the tap: this is the signal that a
            real person is behind the row, so it has to be the thing you see
            while scrolling. Hidden at 0 rather than shown as "0 days", which
            would read as abandoned. */}
        {entry.currentStreak > 0 && (
          <Text style={styles.lbStreak} numberOfLines={1}>{copy.streakDays(entry.currentStreak)}</Text>
        )}
        {expanded && (
          <Text style={styles.lbDetail} numberOfLines={2}>
            {copy.lifetimeStars(entry.lifetimeStars)}{detail ? ` · ${detail}` : ''}
          </Text>
        )}
      </View>
      <Text style={styles.lbStars} numberOfLines={1}>{Math.round(entry.lifetimeStars)} ★</Text>
    </TouchableOpacity>
  );
});

export const LeaderboardSection = React.memo(function LeaderboardSection({
  leaderboard, lbLoading, lbError, lbUnavailable, colors, youLabel, emptyNote, noSyncNote, currentUserEntry, copy,
}: LeaderboardSectionProps) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleRow = React.useCallback((playerId: string) => {
    setExpandedId(current => (current === playerId ? null : playerId));
  }, []);

  if (lbLoading) {
    return <View style={styles.lbEmpty}><ActivityIndicator color={colors.primary} /></View>;
  }
  // A missing Supabase build configuration is distinct from a confirmed empty
  // response. Never render the local placeholder row as if it were global data.
  if (lbUnavailable || lbError) {
    return <Text style={styles.lbEmptyTxt}>{noSyncNote}</Text>;
  }
  if (leaderboard.length === 0) {
    return (
      <>
        <View
          key={currentUserEntry.playerId}
          style={[styles.lbRow, styles.lbRowLast, styles.lbRowMe]}
        >
          <Text style={styles.lbRank} numberOfLines={1}>—</Text>
          <View style={styles.lbInfo}>
            <Text style={styles.lbName} numberOfLines={1}>
              {currentUserEntry.displayName} ({youLabel})
            </Text>
          </View>
          <Text style={styles.lbStars} numberOfLines={1}>{Math.round(currentUserEntry.lifetimeStars)} ★</Text>
        </View>
        <Text style={styles.lbEmptyTxt}>{emptyNote}</Text>
      </>
    );
  }
  // Cap rendered rows so this section (nested inside the screen's outer
  // ScrollView, so it can't be its own FlatList) never mounts an unbounded
  // number of rows -- always keep the current user visible even if they
  // rank outside the cap, and never drop the rank neighbourhood the server
  // deliberately returned below the top block.
  const visible = capLeaderboardRows(leaderboard, LEADERBOARD_ROW_CAP);
  const currentUserVisible = visible.some(entry => entry.isCurrentUser);
  const matchedCurrentUserRow = !currentUserVisible ? leaderboard.find(entry => entry.isCurrentUser) : undefined;
  // The synced leaderboard can omit users with zero lifetime stars entirely.
  // When that happens (not just "outside the render cap"), fall back to the
  // live currentUserEntry -- but its `rank: 1` placeholder is only valid for
  // the truly-empty-leaderboard case above, so show an honest "unranked"
  // label instead of a fabricated rank number.
  const unrankedCurrentUserRow = !currentUserVisible && !matchedCurrentUserRow ? currentUserEntry : undefined;
  const currentUserRow = matchedCurrentUserRow ?? unrankedCurrentUserRow;

  return (
    <>
      {visible.map((entry, idx) => {
        const isLast = idx === visible.length - 1 && !currentUserRow;
        // The payload is the top block plus the caller's ±5 window, so ranks
        // are not necessarily consecutive. Mark the break honestly instead of
        // letting two distant rows read as neighbours.
        const startsNeighborhood = hasRankGapBefore(entry, visible[idx - 1]);
        return (
          <React.Fragment key={entry.playerId}>
            {startsNeighborhood && (
              <View style={styles.lbGap}>
                <Text style={styles.lbGapText}>{copy.nearYouLabel}</Text>
              </View>
            )}
            <LeaderboardRow
              entry={entry}
              isLast={isLast}
              expanded={expandedId === entry.playerId}
              onToggle={toggleRow}
              styles={styles}
              copy={copy}
            />
          </React.Fragment>
        );
      })}
      {currentUserRow && (
        <View style={[styles.lbRow, styles.lbRowLast, styles.lbRowMe]}>
          <Text style={[styles.lbRank, !unrankedCurrentUserRow && currentUserRow.rank <= 3 && styles.lbRankTop]} numberOfLines={1}>
            {unrankedCurrentUserRow ? '—' : `#${currentUserRow.rank}`}
          </Text>
          <View style={styles.lbInfo}>
            <Text style={styles.lbName} numberOfLines={1}>
              {currentUserRow.displayName} ({youLabel})
            </Text>
          </View>
          <Text style={styles.lbStars} numberOfLines={1}>{Math.round(currentUserRow.lifetimeStars)} ★</Text>
        </View>
      )}
    </>
  );
});

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    lbRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 11, borderBottomWidth: 1, borderColor: C.line,
      // Rows became tappable (expand in place), so they must clear Android's
      // 48dp minimum touch target rather than the ~40dp the text alone gave.
      minHeight: 48,
    },
    lbRowLast: { borderBottomWidth: 0 },
    lbRowMe: { backgroundColor: C.primarySoft, marginHorizontal: -8, paddingHorizontal: 14, borderRadius: Radii.sm, borderBottomWidth: 0, marginVertical: 2 },
    lbRank: { minWidth: 32, flexShrink: 0, fontSize: 13, fontFamily: FontFamily.extraBold, color: C.muted, textAlign: 'center' },
    lbRankTop: { color: C.starGoldText },
    lbInfo: { flex: 1, minWidth: 0 },
    lbName: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.inkDark },
    lbStars: { fontSize: 13, fontFamily: FontFamily.extraBold, color: C.primaryText },
    lbDetail: { fontSize: 12, lineHeight: 16, color: C.ink2, marginTop: 3 },
    lbStreak: { fontSize: 11.5, lineHeight: 16, color: C.muted, fontFamily: FontFamily.semiBold, marginTop: 1 },
    lbGap: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 8, borderBottomWidth: 1, borderColor: C.line,
    },
    lbGapText: { fontSize: 11, fontFamily: FontFamily.semiBold, color: C.muted, letterSpacing: 0.4 },
    lbEmpty: { paddingVertical: 20, alignItems: 'center' },
    lbEmptyTxt: { fontSize: 13, color: C.muted, textAlign: 'center', paddingVertical: 12 },
  });
}
