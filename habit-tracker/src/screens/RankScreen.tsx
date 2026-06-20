import React, { useRef, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import { useRankData } from '../queries/useRank';
import { useLeaderboard } from '../queries/useLeaderboard';
import { getCurrentTier } from '../game/tierLookup';
import { getStarsToNextTier } from '../game/tierProgress';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { RankMascot, type RankMascotHandle } from '../components/RankMascot';
import { RANKS } from '../config/ranks.config';
import { rankMascotBridge } from '../lib/rankMascotBridge';
import { RankInfoSheet } from '../components/RankInfoSheet';
import { RankEmptyState } from '../components/RankEmptyState';
import { SkeletonRow } from '../components/SkeletonRow';

function rankConfig(tierOrder: number) {
  return RANKS[Math.min(Math.max(tierOrder - 1, 0), RANKS.length - 1)];
}

function getNextMonday(): Date {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMon = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntilMon);
  next.setHours(0, 0, 0, 0);
  return next;
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}


type LBEntry = NonNullable<ReturnType<typeof useLeaderboard>['data']>[number];

type LeaderboardSectionProps = {
  leaderboard: LBEntry[];
  lbLoading: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  youLabel: string;
  emptyLabel: string;
};

function LeaderboardSection({ leaderboard, lbLoading, styles, colors, youLabel, emptyLabel }: LeaderboardSectionProps) {
  if (lbLoading) {
    return <View style={styles.lbEmpty}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (leaderboard.length === 0) {
    return <View style={styles.lbEmpty}><Text style={styles.lbEmptyTxt}>{emptyLabel}</Text></View>;
  }
  return (
    <>
      {leaderboard.map((entry, idx) => {
        const isLast = idx === leaderboard.length - 1;
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
    </>
  );
}

// fallow-ignore-next-line complexity
export function RankScreen() {
  const { userId, googleUser, colors, t, styles } = useScreenCommons(makeStyles);
  const mascotRef = useRef<RankMascotHandle>(null);
  const { data, isLoading } = useRankData(userId);

  const reduceMotion = useReduceMotion();

  const [countdownMs, setCountdownMs] = useState(() => getNextMonday().getTime() - Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCountdownMs(getNextMonday().getTime() - Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    rankMascotBridge.ref = mascotRef;
    return () => { rankMascotBridge.ref = null; };
  }, []);

  const currentTierOrder = data ? (getCurrentTier(data.currentStars, data.tiers)?.tier_order ?? 0) : 0;
  const { data: leaderboard = [], isLoading: lbLoading } = useLeaderboard(
    googleUser?.email ?? null,
    currentTierOrder,
    data?.tiers ?? [],
  );

  const [infoVisible, setInfoVisible] = useState(false);

  if (isLoading || !data) {
    return (
      <View style={[styles.loading, { justifyContent: 'flex-start', paddingTop: Spacing.xl }]}>
        {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} colors={colors} />)}
      </View>
    );
  }

  const { currentStars, tiers, history } = data;
  const currentTier = getCurrentTier(currentStars, tiers);
  const starsToNext = getStarsToNextTier(currentStars, tiers);
  const nextTier = tiers.find((tr) => tr.stars_required > currentStars);
  const prevTierStars = currentTier?.stars_required ?? 0;
  const nextTierStars = nextTier?.stars_required ?? prevTierStars;
  const progressPct = nextTier
    ? Math.min(1, Math.max(0, (currentStars - prevTierStars) / Math.max(1, nextTierStars - prevTierStars)))
    : 1;
  const cfg = rankConfig(currentTier?.tier_order ?? 1);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t.rankTitle}</Text>
          <TouchableOpacity onPress={() => setInfoVisible(true)} hitSlop={10} style={styles.infoBtn} accessibilityLabel={t.rankInfo} accessibilityRole="button">
            <Text style={styles.infoBtnText}>?</Text>
          </TouchableOpacity>
        </View>

        {currentStars >= 5 ? (
          <View style={styles.rankhero}>
            <View style={[styles.rankheroGlow, { backgroundColor: cfg.color }]} importantForAccessibility="no" />
            <RankMascot ref={mascotRef} tier={(currentTier?.tier_order ?? 1) - 1} size={100} loop reduceMotion={reduceMotion} />
            <Text style={styles.rankNm}>{currentTier?.rank_name}</Text>
            <Text style={styles.rankEn}>{cfg.descriptor}</Text>
            <View style={styles.rankWk}>
              <Text style={styles.rankWkTxt}>{t.weekStars(currentStars)}</Text>
            </View>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${Math.round(progressPct * 100)}%` as `${number}%` }]} />
            </View>
            {starsToNext > 0 ? (
              <Text style={styles.nextCap}>{t.nextRank(starsToNext, nextTier?.rank_name ?? '')}</Text>
            ) : (
              <Text style={styles.nextCap}>{t.maxRank}</Text>
            )}
          </View>
        ) : (
          <View style={styles.rankEmptyWrap}>
            <RankEmptyState currentStars={currentStars} nextRankName={nextTier?.rank_name ?? 'Delulu'} />
          </View>
        )}

        <View style={styles.resetChip}>
          <Text style={styles.resetChipLabel}>{t.resetCountdownLabel}</Text>
          <Text style={styles.resetChipCountdown}>{fmtCountdown(countdownMs)}</Text>
        </View>

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
                emptyLabel={t.leaderboardEmpty}
              />
            </View>
          </>
        )}

        {history.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t.weeklyHistory}</Text>
            <View style={styles.card}>
              {history.map((week, idx) => {
                const weekTier = week.current_tier_id ? tiers.find((tr) => tr.id === week.current_tier_id) : null;
                const isLast = idx === history.length - 1;
                const wrc = weekTier ? rankConfig(weekTier.tier_order) : null;
                return (
                  <View key={week.week_start} style={[styles.rk, isLast && styles.rkLast]}>
                    <View style={styles.rkMascot}>
                      {wrc ? (
                        <RankMascot tier={weekTier!.tier_order - 1} size={36} loop={false} reduceMotion={reduceMotion} />
                      ) : (
                        <Text style={styles.rkEm}>—</Text>
                      )}
                    </View>
                    <View style={styles.rkInfo}>
                      <Text style={styles.rkA}>{t.weekItem(week.week_start)}</Text>
                      <Text style={styles.rkB}>{weekTier?.rank_name ?? '—'}</Text>
                    </View>
                    <Text style={styles.rkThr}>{week.weekly_stars} ★</Text>
                  </View>
                );
              })}
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
    rankWkTxt: { fontSize: 13, fontFamily: FontFamily.extraBold, color: C.starGold },
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
    rk: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line,
    },
    rkLast: { borderBottomWidth: 0 },
    rkMascot: { width: 36, height: 36, flexShrink: 0 },
    rkEm: { fontSize: 20, width: 36, textAlign: 'center', flexShrink: 0 },
    rkInfo: { flex: 1 },
    rkA: { fontSize: 14, fontFamily: FontFamily.extraBold, color: C.inkDark },
    rkB: { fontSize: 11.5, color: C.ink2, marginTop: 2 },
    rkThr: { fontSize: 11.5, fontFamily: FontFamily.extraBold, color: C.muted },

    lbRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 11, borderBottomWidth: 1, borderColor: C.line,
    },
    lbRowLast: { borderBottomWidth: 0 },
    lbRowMe: { backgroundColor: C.primarySoft, marginHorizontal: -8, paddingHorizontal: 14, borderRadius: Radii.sm, borderBottomWidth: 0, marginVertical: 2 },
    lbRank: { width: 32, fontSize: 13, fontFamily: FontFamily.extraBold, color: C.muted, textAlign: 'center' },
    lbRankTop: { color: C.starGold },
    lbInfo: { flex: 1, minWidth: 0 },
    lbName: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.inkDark },
    lbStars: { fontSize: 13, fontFamily: FontFamily.extraBold, color: C.primary },
    lbEmpty: { paddingVertical: 20, alignItems: 'center' },
    lbEmptyTxt: { fontSize: 13, color: C.muted },
  });
}
