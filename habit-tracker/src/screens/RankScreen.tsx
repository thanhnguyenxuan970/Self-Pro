import React, { useRef, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Radii, Spacing, Shadows, AppColors } from '../theme';
import { useRankData } from '../queries/useRank';
import { getCurrentTier, getStarsToNextTier } from '../logic/rankUtils';
import { useAuthUser } from '../hooks/useAuth';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { RankMascot, type RankMascotHandle } from '../components/RankMascot';
import { RANKS } from '../config/ranks.config';

// tier_order (1-based DB) → RANKS index (0-based config)
function rankConfig(tierOrder: number) {
  return RANKS[Math.min(Math.max(tierOrder - 1, 0), RANKS.length - 1)];
}

export function RankScreen() {
  const userId = useAuthUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const mascotRef = useRef<RankMascotHandle>(null);
  const { data, isLoading } = useRankData(userId);

  const sortedTiers = useMemo(
    () => (data ? [...data.tiers].sort((a, b) => b.tier_order - a.tier_order) : []),
    [data],
  );

  const ladderAnims = useRef<{ tx: Animated.Value; op: Animated.Value }[]>([]);
  if (ladderAnims.current.length !== sortedTiers.length) {
    ladderAnims.current = sortedTiers.map(() => ({
      tx: new Animated.Value(-30),
      op: new Animated.Value(0),
    }));
  }

  const glowAnims = useRef<Animated.Value[]>([]);
  const scaleAnims = useRef<Animated.Value[]>([]);
  if (glowAnims.current.length !== sortedTiers.length) {
    glowAnims.current = sortedTiers.map(() => new Animated.Value(0.15));
    scaleAnims.current = sortedTiers.map(() => new Animated.Value(1));
  }

  const glowLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const hasAnimated = useRef(false);
  useEffect(() => {
    if (hasAnimated.current || sortedTiers.length === 0) return;
    hasAnimated.current = true;
    Animated.parallel(
      ladderAnims.current.map((anim, idx) =>
        Animated.parallel([
          Animated.timing(anim.tx, { toValue: 0, duration: 300, delay: idx * 50, useNativeDriver: true }),
          Animated.timing(anim.op, { toValue: 1, duration: 300, delay: idx * 50, useNativeDriver: true }),
        ]),
      ),
    ).start();
  }, [sortedTiers]);

  useEffect(() => {
    if (!data || sortedTiers.length === 0) return;
    const currentTierLocal = getCurrentTier(data.currentStars, data.tiers);
    const idx = sortedTiers.findIndex(t => t.id === currentTierLocal.id);
    if (idx < 0) return;

    const scaleAnim = scaleAnims.current[idx];
    if (scaleAnim) {
      Animated.sequence([
        Animated.spring(scaleAnim, { toValue: 1.04, tension: 200, friction: 8, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
      ]).start();
    }

    const glowAnim = glowAnims.current[idx];
    if (glowAnim) {
      glowLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 0.9, duration: 900, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.15, duration: 900, useNativeDriver: true }),
        ])
      );
      glowLoopRef.current.start();
    }
    return () => glowLoopRef.current?.stop();
  }, [data]);

  if (isLoading || !data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const { currentStars, tiers, history } = data;
  const currentTier = getCurrentTier(currentStars, tiers);
  const starsToNext = getStarsToNextTier(currentStars, tiers);
  const nextTier = tiers.find((tr) => tr.stars_required > currentStars);
  const prevTierStars = currentTier.stars_required;
  const nextTierStars = nextTier?.stars_required ?? prevTierStars;
  const progressPct = nextTier
    ? Math.min(1, (currentStars - prevTierStars) / Math.max(1, nextTierStars - prevTierStars))
    : 1;

  const cfg = rankConfig(currentTier.tier_order);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t.rankTitle}</Text>

        {/* Rankhero card */}
        <View style={styles.rankhero}>
          <View style={[styles.rankheroGlow, { backgroundColor: cfg.color }]} />
          {currentStars >= 5 ? (
            <>
              <RankMascot
                ref={mascotRef}
                tier={currentTier.tier_order - 1}
                size={100}
                loop
              />
              <Text style={styles.rankNm}>{currentTier.rank_name}</Text>
              <Text style={styles.rankEn}>{cfg.descriptor}</Text>
            </>
          ) : (
            <>
              <Text style={styles.rankEm}>❓</Text>
              <Text style={styles.rankNm}>{t.noRankTitle}</Text>
              <Text style={styles.rankEn}>{t.noRankDesc}</Text>
            </>
          )}
          <View style={styles.rankWk}>
            <Text style={styles.rankWkTxt}>{t.weekStars(currentStars)}</Text>
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.round(progressPct * 100)}%` as any }]} />
          </View>
          {starsToNext > 0 ? (
            <Text style={styles.nextCap}>
              {t.nextRank(starsToNext, nextTier?.rank_name ?? '')}
            </Text>
          ) : (
            <Text style={styles.nextCap}>{t.maxRank}</Text>
          )}
        </View>

        {/* Reset chip */}
        <View style={styles.resetChip}>
          <Text style={styles.resetChipTxt}>{t.resetChip}</Text>
        </View>

        {/* Rank ladder */}
        <Text style={styles.sectionLabel}>{t.rankLadder}</Text>
        <View style={styles.card}>
          {sortedTiers.map((tier, idx, arr) => {
            const isCurrent = tier.id === currentTier.id;
            const isLast = idx === arr.length - 1;
            const rc = rankConfig(tier.tier_order);
            const range = idx > 0
              ? `${tier.stars_required}–${(arr[idx - 1]?.stars_required ?? 999) - 1} ★`
              : `${tier.stars_required}+ ★`;
            const anim = ladderAnims.current[idx];
            const scalAnim = scaleAnims.current[idx];
            const glowAnim = glowAnims.current[idx];
            return (
              <Animated.View
                key={tier.id}
                style={[
                  styles.rk,
                  isCurrent && { ...styles.rkCur, backgroundColor: rc.color + '22' },
                  isLast && styles.rkLast,
                  anim && {
                    opacity: anim.op,
                    transform: [
                      { translateX: anim.tx },
                      ...(isCurrent && scalAnim ? [{ scale: scalAnim as any }] : []),
                    ],
                  },
                ]}
              >
                {isCurrent && glowAnim && (
                  <Animated.View
                    style={[StyleSheet.absoluteFill, { borderRadius: Radii.md, borderWidth: 1.5, borderColor: rc.color, opacity: glowAnim }]}
                    pointerEvents="none"
                  />
                )}
                <View style={styles.rkMascot}>
                  <RankMascot tier={tier.tier_order - 1} size={36} loop={isCurrent} />
                </View>
                <View style={styles.rkInfo}>
                  <Text style={[styles.rkA, isCurrent && { color: rc.color }]}>
                    {tier.rank_name}
                  </Text>
                  <Text style={styles.rkB}>{rc.descriptor}</Text>
                </View>
                <Text style={[styles.rkThr, isCurrent && { color: rc.color }]}>{range}</Text>
              </Animated.View>
            );
          })}
        </View>

        {/* Philosophy card */}
        <LinearGradient
          colors={['#1B1F1D', '#3F4642']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.philo}
        >
          <Text style={styles.philoQ}>{t.philoQuote}</Text>
          <Text style={styles.philoA}>{t.philoCaption}</Text>
        </LinearGradient>

        {/* Weekly history */}
        {history.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t.weeklyHistory}</Text>
            <View style={styles.card}>
              {history.map((week, idx) => {
                const weekTier = week.current_tier_id
                  ? tiers.find((tr) => tr.id === week.current_tier_id)
                  : null;
                const isLast = idx === history.length - 1;
                const wrc = weekTier ? rankConfig(weekTier.tier_order) : null;
                return (
                  <View key={week.week_start} style={[styles.rk, isLast && styles.rkLast]}>
                    <View style={styles.rkMascot}>
                      {wrc ? (
                        <RankMascot
                          tier={weekTier!.tier_order - 1}
                          size={36}
                          loop={false}
                        />
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
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.bgBase },
    content: { paddingBottom: 40 },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bgBase },
    title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: C.inkDark, marginHorizontal: Spacing.lg, marginTop: 10, marginBottom: 14 },

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
    rankNm: { fontSize: 25, fontWeight: '800', letterSpacing: -0.5, color: C.inkDark, marginTop: 8 },
    rankEn: { fontSize: 12.5, color: C.muted, marginTop: 2, fontStyle: 'italic' },
    rankWk: {
      marginTop: 12, backgroundColor: C.starSoft,
      paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radii.pill,
    },
    rankWkTxt: { fontSize: 13, fontWeight: '800', color: C.starGold },
    bar: { width: '100%', height: 8, backgroundColor: C.surface2, borderRadius: Radii.pill, marginTop: 14, overflow: 'hidden' },
    barFill: { height: '100%', backgroundColor: C.primary, borderRadius: Radii.pill },
    nextCap: { fontSize: 12, color: C.muted, marginTop: 13, fontWeight: '600', textAlign: 'center' },

    resetChip: {
      marginHorizontal: Spacing.lg, marginTop: 12,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface2, borderRadius: Radii.md, padding: 11,
    },
    resetChipTxt: { fontSize: 12, fontWeight: '700', color: C.ink2, textAlign: 'center' },

    sectionLabel: {
      fontSize: 11, fontWeight: '700', color: C.muted,
      textTransform: 'uppercase', letterSpacing: 0.7,
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
    rkCur: {
      backgroundColor: C.primarySoft,
      marginHorizontal: -8, paddingHorizontal: 14,
      borderRadius: Radii.md, borderBottomWidth: 0, marginVertical: 2,
    },
    rkLast: { borderBottomWidth: 0 },
    rkMascot: { width: 36, height: 36, flexShrink: 0 },
    rkEm: { fontSize: 20, width: 36, textAlign: 'center', flexShrink: 0 },
    rkInfo: { flex: 1 },
    rkA: { fontSize: 14, fontWeight: '800', color: C.inkDark },
    rkB: { fontSize: 11.5, color: C.muted, marginTop: 2 },
    rkThr: { fontSize: 11.5, fontWeight: '800', color: C.muted },

    philo: {
      marginHorizontal: Spacing.lg, marginTop: 8,
      borderRadius: Radii.lg, padding: 18, ...Shadows.light,
    },
    philoQ: { fontSize: 14, lineHeight: 22, fontWeight: '600', color: '#fff' },
    philoA: { fontSize: 11.5, opacity: 0.65, marginTop: 8, fontWeight: '600', color: '#fff' },
  });
}
