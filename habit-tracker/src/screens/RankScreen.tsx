import React, { useRef, useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import { useRankData } from '../queries/useRank';
import { useLeaderboard } from '../queries/useLeaderboard';
import { useScreenCommons } from '../hooks/useScreenCommons';
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
const LEADERBOARD_ROW_CAP = 50;

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
};

const LeaderboardSection = React.memo(function LeaderboardSection({ leaderboard, lbLoading, lbError, styles, colors, youLabel, emptyNote, noSyncNote, currentUserEntry }: LeaderboardSectionProps) {
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
          key={currentUserEntry.userEmail}
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
  // rank outside the cap.
  const visible = leaderboard.length > LEADERBOARD_ROW_CAP ? leaderboard.slice(0, LEADERBOARD_ROW_CAP) : leaderboard;
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
        return (
          <View
            key={entry.userEmail}
            style={[styles.lbRow, isLast && styles.lbRowLast, entry.isCurrentUser && styles.lbRowMe]}
          >
            <Text style={[styles.lbRank, entry.rank <= 3 && styles.lbRankTop]}>#{entry.rank}</Text>
            <View style={styles.lbInfo}>
              <Text style={styles.lbName} numberOfLines={1}>
                {entry.displayName}{entry.isCurrentUser ? ` (${youLabel})` : ''}
              </Text>
            </View>
            <Text style={styles.lbStars}>{entry.lifetimeStars} ★</Text>
          </View>
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
  const { data: leaderboard = [], isLoading: lbLoading, isError: lbError } = useLeaderboard(
    googleUser?.email ?? null,
  );

  const [infoVisible, setInfoVisible] = useState(false);
  const [previewTier, setPreviewTier] = useState<number | null>(null);

  if (isLoading || !data) {
    return (
      <View style={[styles.loading, { justifyContent: 'flex-start', paddingTop: Spacing.xl }]}>
        {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} colors={colors} />)}
      </View>
    );
  }

  const { currentStars, tiers } = data;
  // Rank is authoritative from current_tier_id (carry-over + cap system), not derived from star count
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
  const currentUserEntry: LBEntry = useMemo(() => ({
    userEmail: googleUser?.email ?? 'current-user',
    displayName: googleUser?.name ?? t.leaderboardYou,
    lifetimeStars: currentStars,
    rank: 1,
    isCurrentUser: true,
  }), [googleUser?.email, googleUser?.name, currentStars, t.leaderboardYou]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t.rankTitle}</Text>
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
          <Text style={styles.progressionTitle}>{t.rankRoadmap}</Text>
          <View style={styles.previewGrid}>
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
                  {unlocked ? <RankMascot tier={rank.tier} size={76} loop={false} reduceMotion={reduceMotion} /> : <Text style={styles.lockedMark}>🔒</Text>}
                  <Text style={[styles.previewTierText, { color: unlocked ? colors.inkDark : colors.muted }]} numberOfLines={2}>{rank.tier + 1} · {displayName}</Text>
                  {!unlocked && <Text style={styles.lockedRequirement}>{rank.stars} ★</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
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
    title: { fontSize: 24, fontFamily: FontFamily.extraBold, letterSpacing: -0.5, color: C.inkDark, flex: 1 },
    infoBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: C.faint, alignItems: 'center', justifyContent: 'center' },
    infoBtnText: { fontSize: 15, fontFamily: FontFamily.bold, color: C.muted },

    rankEmptyWrap: { marginHorizontal: Spacing.lg },
    progression: { marginHorizontal: Spacing.lg, marginTop: 12, padding: 12, borderRadius: Radii.lg, backgroundColor: C.surface2 },
    progressionTitle: { fontSize: 12, fontFamily: FontFamily.extraBold, color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.7, textAlign: 'center', marginBottom: 10 },
    progressionTier: { width: '31%', minHeight: 118, borderRadius: Radii.md, borderWidth: 1.5, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
    lockedTier: { backgroundColor: C.surface2 },
    lockedMark: { fontSize: 28, marginBottom: 10 },
    lockedRequirement: { fontSize: 10, fontFamily: FontFamily.extraBold, color: C.muted, marginTop: 2 },
    previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
    rankEm: { fontSize: 54, marginBottom: 2 },
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
    },
    lbRowLast: { borderBottomWidth: 0 },
    lbRowMe: { backgroundColor: C.primarySoft, marginHorizontal: -8, paddingHorizontal: 14, borderRadius: Radii.sm, borderBottomWidth: 0, marginVertical: 2 },
    lbRank: { width: 32, fontSize: 13, fontFamily: FontFamily.extraBold, color: C.muted, textAlign: 'center' },
    lbRankTop: { color: C.starGoldText },
    lbInfo: { flex: 1, minWidth: 0 },
    lbName: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.inkDark },
    lbStars: { fontSize: 13, fontFamily: FontFamily.extraBold, color: C.primary },
    lbEmpty: { paddingVertical: 20, alignItems: 'center' },
    lbEmptyTxt: { fontSize: 13, color: C.muted, textAlign: 'center', paddingVertical: 12 },
  });
}
