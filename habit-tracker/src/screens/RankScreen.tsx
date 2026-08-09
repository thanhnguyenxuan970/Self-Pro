import React, { useRef, useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import { useRankData } from '../queries/useRank';
import { useLeaderboard, capLeaderboardRows, hasRankGapBefore, LEADERBOARD_TOP_LIMIT } from '../queries/useLeaderboard';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useLanguage } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { RankMascot, type RankMascotHandle } from '../components/RankMascot';
import { LevelUpCelebrationModal } from '../components/LevelUpCelebrationModal';
import { getRankConfigByTierOrder, RANKS } from '../config/ranks.config';
import { rankMascotBridge } from '../lib/rankMascotBridge';
import { RankInfoSheet } from '../components/RankInfoSheet';
import { RankEmptyState } from '../components/RankEmptyState';
import { SkeletonRow } from '../components/SkeletonRow';

type LBEntry = NonNullable<ReturnType<typeof useLeaderboard>['data']>[number];

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
  leaderboard: LBEntry[];
  lbLoading: boolean;
  lbError: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  youLabel: string;
  emptyNote: string;
  noSyncNote: string;
  currentUserEntry: LBEntry;
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
  entry: LBEntry;
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
      <Text style={[styles.lbRank, entry.rank <= 3 && styles.lbRankTop]}>#{entry.rank}</Text>
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
      <Text style={styles.lbStars}>{entry.lifetimeStars} ★</Text>
    </TouchableOpacity>
  );
});

const LeaderboardSection = React.memo(function LeaderboardSection({ leaderboard, lbLoading, lbError, styles, colors, youLabel, emptyNote, noSyncNote, currentUserEntry, copy }: LeaderboardSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleRow = React.useCallback((playerId: string) => {
    setExpandedId(current => (current === playerId ? null : playerId));
  }, []);

  if (lbLoading) {
    return <View style={styles.lbEmpty}><ActivityIndicator color={colors.primary} /></View>;
  }
  // Loading and error are distinct from "confirmed zero global entries" — never
  // fabricate the current user's rank as #1 on a fetch failure.
  if (lbError) {
    return <Text style={styles.lbEmptyTxt}>{noSyncNote}</Text>;
  }
  if (leaderboard.length === 0) {
    return (
      <>
        <View
          key={currentUserEntry.playerId}
          style={[styles.lbRow, styles.lbRowLast, styles.lbRowMe]}
        >
          <Text style={[styles.lbRank, styles.lbRankTop]}>#{currentUserEntry.rank}</Text>
          <View style={styles.lbInfo}>
            <Text style={styles.lbName} numberOfLines={1}>
              {currentUserEntry.displayName} ({youLabel})
            </Text>
          </View>
          <Text style={styles.lbStars}>{currentUserEntry.lifetimeStars} ★</Text>
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
          <Text style={[styles.lbRank, !unrankedCurrentUserRow && currentUserRow.rank <= 3 && styles.lbRankTop]}>
            {unrankedCurrentUserRow ? '—' : `#${currentUserRow.rank}`}
          </Text>
          <View style={styles.lbInfo}>
            <Text style={styles.lbName} numberOfLines={1}>
              {currentUserRow.displayName} ({youLabel})
            </Text>
          </View>
          <Text style={styles.lbStars}>{currentUserRow.lifetimeStars} ★</Text>
        </View>
      )}
    </>
  );
});

// fallow-ignore-next-line complexity
export function RankScreen() {
  const { userId, googleUser, colors, t, styles } = useScreenCommons(makeStyles);
  const mascotRef = useRef<RankMascotHandle>(null);
  const { data, isLoading } = useRankData(userId);

  const reduceMotion = useReduceMotion();

  useEffect(() => {
    rankMascotBridge.ref = mascotRef;
    return () => { rankMascotBridge.ref = null; };
  }, []);

  const storedTierOrder = data
    ? (data.currentTierId ? (data.tiers.find(t => t.id === data.currentTierId)?.tier_order ?? 0) : 0)
    : 0;
  const currentTierOrder = storedTierOrder;
  const [lang] = useLanguage();
  const { data: leaderboard = [], isLoading: lbLoading, isError: lbError } = useLeaderboard(
    googleUser?.email ?? null,
    googleUser?.name ?? null,
    t.leaderboardPlayer,
    lang,
  );

  const currentUserEntry: LBEntry = useMemo(() => ({
    playerId: googleUser?.sub ?? 'current-user',
    displayName: googleUser?.name ?? t.leaderboardYou,
    lifetimeStars: data?.currentStars ?? 0,
    rank: 1,
    isCurrentUser: true,
    // Local fallback for the not-yet-synced user; there is no server list to
    // measure a gap against, so never invent one.
    starsToNextRank: null,
    // Streak is a server field on this surface. This fallback row exists
    // precisely because the server has no row for the user yet, so there is
    // nothing to show -- 0 suppresses the line rather than faking a streak.
    currentStreak: 0,
  }), [googleUser?.sub, googleUser?.name, data?.currentStars, t.leaderboardYou]);

  const leaderboardCopy = useMemo(() => ({
    youLabel: t.leaderboardYou,
    nearYouLabel: t.leaderboardNearYou,
    gapToNext: t.leaderboardGapToNext,
    gapLevelLabel: t.leaderboardGapLevel,
    topOfLadderLabel: t.leaderboardTopOfLadder,
    lifetimeStars: t.leaderboardLifetimeStars,
    expandLabel: t.leaderboardExpandRow,
    collapseLabel: t.leaderboardCollapseRow,
    streakDays: t.leaderboardStreakDays,
  }), [t]);

  const [infoVisible, setInfoVisible] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [previewTier, setPreviewTier] = useState<number | null>(null);

  if (isLoading || !data) {
    return (
      <View style={[styles.loading, { justifyContent: 'flex-start', paddingTop: Spacing.xl }]}>
        {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} colors={colors} />)}
      </View>
    );
  }

  const { currentStars, tiers } = data;
  // Lifetime rank is authoritative from users.current_tier_id, not weekly rows.
  const currentTier = tiers.find(t => t.tier_order === currentTierOrder);
  const nextTier = currentTier ? tiers.find(t => t.tier_order === currentTier.tier_order + 1) : tiers.find(t => t.stars_required > currentStars);
  const firstTierStars = tiers[0]?.stars_required ?? 5;
  const prevTierStars = currentTier?.stars_required ?? 0;
  const nextTierStars = nextTier?.stars_required ?? prevTierStars;
  const starsToNext = nextTier ? Math.max(0, nextTierStars - currentStars) : 0;
  const displayStarsToNext = Math.round(starsToNext);
  const progressPct = nextTier
    ? Math.min(1, Math.max(0, (currentStars - prevTierStars) / Math.max(1, nextTierStars - prevTierStars)))
    : 1;
  const cfg = getRankConfigByTierOrder(currentTier?.tier_order ?? 1);
  const nextCfg = nextTier ? getRankConfigByTierOrder(nextTier.tier_order) : null;
  const rankLabel = t.rankNameMap[cfg.name] ?? cfg.name;
  const nextRankLabel = nextCfg ? (t.rankNameMap[nextCfg.name] ?? nextCfg.name) : (t.rankNameMap[nextTier?.rank_name ?? ''] ?? nextTier?.rank_name ?? '');
  const unlockedRankCount = RANKS.filter(rank => rank.tier < currentTierOrder).length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t.rankTitle}</Text>
          <TouchableOpacity onPress={() => setInfoVisible(true)} hitSlop={10} style={styles.infoBtn} accessibilityLabel={t.rankInfo} accessibilityRole="button">
            <Text style={styles.infoBtnText}>?</Text>
          </TouchableOpacity>
        </View>

        {currentStars >= firstTierStars ? (
          <View style={styles.rankhero}>
            <View style={[styles.rankheroGlow, { backgroundColor: cfg.glow ?? cfg.color }]} importantForAccessibility="no" />
            <RankMascot ref={mascotRef} tier={(currentTier?.tier_order ?? 1) - 1} size={100} loop reduceMotion={reduceMotion} ambient />
            <Text style={styles.rankNm} numberOfLines={2}>{rankLabel}</Text>
            <Text style={styles.rankEn} numberOfLines={2}>{t.rankQuoteMap[currentTier?.rank_name ?? ''] ?? cfg.descriptor}</Text>
            <View style={styles.rankWk}>
              <Text style={styles.rankWkTxt}>{t.starsTotal(currentStars)}</Text>
            </View>
            <View
              style={styles.bar}
              accessibilityRole="progressbar"
              accessibilityLabel={starsToNext > 0 ? t.rankProgress(Math.round(currentStars), Math.round(nextTierStars), nextRankLabel) : t.maxRank}
              accessibilityValue={{ min: 0, max: 100, now: Math.round(progressPct * 100) }}
            >
              <View style={[styles.barFill, { width: `${Math.round(progressPct * 100)}%` as `${number}%` }]} />
            </View>
            {starsToNext > 0 ? (
              <Text style={styles.nextCap}>{t.nextRank(displayStarsToNext, nextRankLabel)}</Text>
            ) : (
              <Text style={styles.nextCap}>{t.maxRank}</Text>
            )}
          </View>
        ) : (
          <View style={styles.rankEmptyWrap}>
            <RankEmptyState
              currentStars={currentStars}
              unlockStars={firstTierStars}
              nextRankName={nextRankLabel}
            />
          </View>
        )}

        <View style={styles.progression}>
          <TouchableOpacity
            style={styles.galleryTrigger}
            onPress={() => setGalleryVisible(value => !value)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ expanded: galleryVisible }}
            accessibilityLabel={`${t.rankRoadmap}, ${unlockedRankCount}/${RANKS.length}`}
          >
            <View style={styles.galleryIcon} importantForAccessibility="no">
              <Text style={styles.galleryIconText}>✦</Text>
            </View>
            <View style={styles.galleryCopy} importantForAccessibility="no">
              <Text style={styles.progressionTitle}>{t.rankRoadmap}</Text>
              <Text style={styles.galleryCount}>{unlockedRankCount}/{RANKS.length}</Text>
            </View>
            <View style={[styles.galleryChevron, galleryVisible && styles.galleryChevronOpen]} importantForAccessibility="no">
              <Text style={styles.galleryChevronText}>›</Text>
            </View>
          </TouchableOpacity>
          {galleryVisible && <View style={styles.previewGrid}>
            {RANKS.map(rank => {
              const unlocked = rank.tier < currentTierOrder;
              const displayName = t.rankNameMap[rank.name] ?? rank.name;
              return (
                <TouchableOpacity
                  key={rank.tier}
                  disabled={!unlocked}
                  onPress={() => setPreviewTier(rank.tier)}
                  style={[styles.progressionTier, { borderColor: unlocked ? rank.edge : colors.line }, !unlocked && styles.lockedTier]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !unlocked }}
                  accessibilityLabel={unlocked ? t.rankPreviewLabel(displayName) : t.rankLockedLabel(displayName, rank.stars)}
                >
                  {unlocked ? <RankMascot tier={rank.tier} size={76} loop reduceMotion={reduceMotion} ambient /> : <Text style={styles.lockedMark}>🔒</Text>}
                  <Text style={[styles.previewTierText, { color: unlocked ? colors.inkDark : colors.muted }]} numberOfLines={2}>{rank.tier + 1} · {displayName}</Text>
                  {!unlocked && <Text style={styles.lockedRequirement}>{rank.stars} ★</Text>}
                </TouchableOpacity>
              );
            })}
          </View>}
        </View>

        <Text style={styles.sectionLabel}>{t.leaderboardSection}</Text>
        <View style={styles.card}>
          <LeaderboardSection
            leaderboard={leaderboard}
            lbLoading={lbLoading}
            lbError={lbError}
            styles={styles}
            colors={colors}
            youLabel={t.leaderboardYou}
            emptyNote={t.leaderboardEmpty}
            noSyncNote={t.leaderboardNoSync}
            currentUserEntry={currentUserEntry}
            copy={leaderboardCopy}
          />
        </View>

      </ScrollView>
      <RankInfoSheet
        visible={infoVisible}
        tiers={tiers}
        currentTierId={currentTier?.id ?? null}
        onClose={() => setInfoVisible(false)}
      />
      <LevelUpCelebrationModal
        visible={previewTier !== null}
        tierOrder={(previewTier ?? 0) + 1}
        tierName={previewTier === null ? '' : RANKS[previewTier].name}
        onDismiss={() => setPreviewTier(null)}
      />
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.bgBase },
    content: { paddingBottom: 40 },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bgBase },
    titleRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg, marginTop: 10, marginBottom: 14 },
    title: { fontSize: 24, fontFamily: FontFamily.extraBold, letterSpacing: -0.5, color: C.inkDark, flex: 1, flexShrink: 1 },
    infoBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: C.faint, alignItems: 'center', justifyContent: 'center' },
    infoBtnText: { fontSize: 15, fontFamily: FontFamily.bold, color: C.muted },

    rankEmptyWrap: { marginHorizontal: Spacing.lg },
    progression: { marginHorizontal: Spacing.lg, marginTop: 12 },
    galleryTrigger: {
      minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 12, borderRadius: Radii.lg,
      backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primaryLine,
      ...Shadows.light,
    },
    galleryIcon: { width: 32, height: 32, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary },
    galleryIconText: { fontSize: 18, fontFamily: FontFamily.bold, color: C.onAccent },
    galleryCopy: { flex: 1, minWidth: 0 },
    progressionTitle: { fontSize: 13, fontFamily: FontFamily.extraBold, color: C.primaryText, letterSpacing: 0.5 },
    galleryCount: { fontSize: 10, fontFamily: FontFamily.semiBold, color: C.primaryText, marginTop: 1 },
    galleryChevron: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
    galleryChevronOpen: { transform: [{ rotate: '90deg' }] },
    galleryChevronText: { fontSize: 23, lineHeight: 25, fontFamily: FontFamily.bold, color: C.primaryText, marginTop: -2 },
    progressionTier: { width: '31%', minHeight: 118, borderRadius: Radii.md, borderWidth: 1.5, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
    lockedTier: { backgroundColor: C.surface2 },
    lockedMark: { fontSize: 28, marginBottom: 10 },
    lockedRequirement: { fontSize: 10, fontFamily: FontFamily.extraBold, color: C.muted, marginTop: 2 },
    previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    previewTierText: { fontSize: 10, fontFamily: FontFamily.extraBold, maxWidth: '100%', paddingHorizontal: 4, textAlign: 'center' },
    rankhero: {
      marginHorizontal: Spacing.lg, backgroundColor: C.surface,
      borderRadius: Radii.xl, padding: 22, alignItems: 'center',
      borderWidth: 1, borderColor: C.line, ...Shadows.light, overflow: 'hidden',
    },
    rankheroGlow: {
      position: 'absolute', top: 0, left: 0, right: 0, height: '60%',
      opacity: 0.12,
    },
    rankNm: { fontSize: 25, fontFamily: FontFamily.extraBold, letterSpacing: -0.5, color: C.inkDark, marginTop: 8 },
    rankEn: { fontSize: 12.5, color: C.muted, marginTop: 2, fontStyle: 'italic' },
    rankWk: {
      marginTop: 12, backgroundColor: C.starSoft,
      paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radii.pill,
    },
    rankWkTxt: { fontSize: 13, fontFamily: FontFamily.extraBold, color: C.starGoldText },
    bar: { width: '100%', height: 8, backgroundColor: C.surface2, borderRadius: Radii.pill, marginTop: 14, overflow: 'hidden' },
    barFill: { height: '100%', backgroundColor: C.primary, borderRadius: Radii.pill },
    nextCap: { fontSize: 12, color: C.muted, marginTop: 13, fontFamily: FontFamily.semiBold, textAlign: 'center' },

    sectionLabel: {
      fontSize: 12, fontFamily: FontFamily.semiBold, color: C.ink2,
      marginHorizontal: Spacing.lg, marginTop: 20, marginBottom: 9,
    },
    card: {
      marginHorizontal: Spacing.lg, backgroundColor: C.surface,
      borderRadius: Radii.lg, borderWidth: 1, borderColor: C.line,
      paddingHorizontal: 15, ...Shadows.light,
    },
    lbRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 11, borderBottomWidth: 1, borderColor: C.line,
      // Rows became tappable (expand in place), so they must clear Android's
      // 48dp minimum touch target rather than the ~40dp the text alone gave.
      minHeight: 48,
    },
    lbRowLast: { borderBottomWidth: 0 },
    lbRowMe: { backgroundColor: C.primarySoft, marginHorizontal: -8, paddingHorizontal: 14, borderRadius: Radii.sm, borderBottomWidth: 0, marginVertical: 2 },
    lbRank: { width: 32, fontSize: 13, fontFamily: FontFamily.extraBold, color: C.muted, textAlign: 'center' },
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
