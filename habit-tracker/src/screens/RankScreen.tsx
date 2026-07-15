import React, { useRef, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import { useRankData } from '../queries/useRank';
import { useLeaderboard } from '../queries/useLeaderboard';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { RankMascot, type RankMascotHandle } from '../components/RankMascot';
import { getRankConfigByTierOrder } from '../config/ranks.config';
import { rankMascotBridge } from '../lib/rankMascotBridge';
import { RankInfoSheet } from '../components/RankInfoSheet';
import { RankEmptyState } from '../components/RankEmptyState';
import { SkeletonRow } from '../components/SkeletonRow';
import { getTimeUntilWeeklyReset } from '../utils/weekReset';

type LBEntry = NonNullable<ReturnType<typeof useLeaderboard>['data']>[number];

type LeaderboardSectionProps = {
  leaderboard: LBEntry[];
  lbLoading: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  youLabel: string;
  emptyNote: string;
  currentUserEntry: LBEntry;
};

function ResetCountdownChip({
  styles,
  label,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
}) {
  return (
    <View style={styles.resetChip}>
      <Text style={styles.resetChipLabel}>{label}</Text>
    </View>
  );
}

function LeaderboardSection({ leaderboard, lbLoading, styles, colors, youLabel, emptyNote, currentUserEntry }: LeaderboardSectionProps) {
  if (lbLoading) {
    return <View style={styles.lbEmpty}><ActivityIndicator color={colors.primary} /></View>;
  }
  const entries = leaderboard.length ? leaderboard : [currentUserEntry];
  return (
    <>
      {entries.map((entry, idx) => {
        const isLast = idx === entries.length - 1;
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
            <Text style={styles.lbStars}>{entry.weeklyStars} ★</Text>
          </View>
        );
      })}
      {leaderboard.length === 0 ? <Text style={styles.lbEmptyTxt}>{emptyNote}</Text> : null}
    </>
  );
}

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

  const currentTierOrder = data
    ? (data.currentTierId ? (data.tiers.find(t => t.id === data.currentTierId)?.tier_order ?? 0) : 0)
    : 0;
  const { data: leaderboard = [], isLoading: lbLoading } = useLeaderboard(
    googleUser?.email ?? null,
    currentTierOrder,
    data?.tiers ?? [],
  );

  const [infoVisible, setInfoVisible] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (isLoading || !data) {
    return (
      <View style={[styles.loading, { justifyContent: 'flex-start', paddingTop: Spacing.xl }]}>
        {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} colors={colors} />)}
      </View>
    );
  }

  const { currentStars, currentTierId, tiers } = data;
  // Rank is authoritative from current_tier_id (carry-over + cap system), not derived from star count
  const currentTier = currentTierId ? tiers.find(t => t.id === currentTierId) : undefined;
  const nextTier = currentTier ? tiers.find(t => t.tier_order === currentTier.tier_order + 1) : tiers.find(t => t.stars_required > currentStars);
  const firstTierStars = tiers[0]?.stars_required ?? 5;
  const prevTierStars = currentTier?.stars_required ?? 0;
  const nextTierStars = nextTier?.stars_required ?? prevTierStars;
  const starsToNext = nextTier ? Math.max(0, nextTierStars - currentStars) : 0;
  const progressPct = nextTier
    ? Math.min(1, Math.max(0, (currentStars - prevTierStars) / Math.max(1, nextTierStars - prevTierStars)))
    : 1;
  const cfg = getRankConfigByTierOrder(currentTier?.tier_order ?? 1);
  const nextCfg = nextTier ? getRankConfigByTierOrder(nextTier.tier_order) : null;
  const rankLabel = t.rankNameMap[cfg.name] ?? cfg.name;
  const nextRankLabel = nextCfg ? (t.rankNameMap[nextCfg.name] ?? nextCfg.name) : (t.rankNameMap[nextTier?.rank_name ?? ''] ?? nextTier?.rank_name ?? '');
  const resetCountdown = getTimeUntilWeeklyReset(now);
  const currentUserEntry: LBEntry = {
    userEmail: googleUser?.email ?? 'current-user',
    displayName: googleUser?.name ?? t.leaderboardYou,
    weeklyStars: currentStars,
    rank: 1,
    isCurrentUser: true,
  };

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
            <RankMascot ref={mascotRef} tier={(currentTier?.tier_order ?? 1) - 1} size={100} loop reduceMotion={reduceMotion} />
            <Text style={styles.rankNm} numberOfLines={2}>{rankLabel}</Text>
            <Text style={styles.rankEn} numberOfLines={2}>{t.rankQuoteMap[currentTier?.rank_name ?? ''] ?? cfg.descriptor}</Text>
            <View style={styles.rankWk}>
              <Text style={styles.rankWkTxt}>{t.weekStars(currentStars)}</Text>
            </View>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${Math.round(progressPct * 100)}%` as `${number}%` }]} />
            </View>
            {starsToNext > 0 ? (
              <Text style={styles.nextCap}>{t.nextRank(starsToNext, nextRankLabel)}</Text>
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

        <ResetCountdownChip styles={styles} label={t.resetCountdownLabel(resetCountdown.days, resetCountdown.hours, resetCountdown.minutes)} />

        {currentTierOrder > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t.leaderboardSection}</Text>
            <View style={styles.card}>
              <LeaderboardSection
                leaderboard={leaderboard}
                lbLoading={lbLoading}
                styles={styles}
                colors={colors}
                youLabel={t.leaderboardYou}
                emptyNote={t.leaderboardEmpty}
                currentUserEntry={currentUserEntry}
              />
            </View>
          </>
        )}

      </ScrollView>
      <RankInfoSheet
        visible={infoVisible}
        tiers={tiers}
        currentTierId={currentTier?.id ?? null}
        onClose={() => setInfoVisible(false)}
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
    rankhero: {
      marginHorizontal: Spacing.lg, backgroundColor: C.surface,
      borderRadius: Radii.xl, padding: 22, alignItems: 'center',
      borderWidth: 1, borderColor: C.line, ...Shadows.light, overflow: 'hidden',
    },
    rankheroGlow: {
      position: 'absolute', top: 0, left: 0, right: 0, height: '60%',
      opacity: 0.4,
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
    resetChip: {
      marginHorizontal: Spacing.lg, marginTop: 12,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface2, borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: 16,
    },
    resetChipLabel: { fontSize: 12, fontFamily: FontFamily.semiBold, color: C.ink2 },
    resetChipCountdown: { fontSize: 22, fontFamily: FontFamily.extraBold, color: C.inkDark, letterSpacing: 1, marginTop: 4, fontVariant: ['tabular-nums'] },

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
