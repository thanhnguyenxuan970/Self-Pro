import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Radii, Spacing, Shadows, AppColors } from '../theme';
import { useRankData } from '../queries/useRank';
import { getCurrentTier, getStarsToNextTier } from '../logic/rankUtils';
import { useAuthUser } from '../hooks/useAuth';
import { useTheme, useTranslations } from '../hooks/useSettings';

const RANK_EMOJIS: Record<string, string> = {
  'Delulu':         '🫠',
  'Mewing':         '😤',
  'Rizz':           '💃',
  'Gigachad':       '💪',
  'Aura Farmer':    '✨',
  'Main Character': '🎬',
  'GOATED':         '🐐',
};

const RANK_EN: Record<string, string> = {
  'Delulu':         'noodle mode',
  'Mewing':         'max send',
  'Rizz':           'hit the griddy',
  'Gigachad':       'too swole',
  'Aura Farmer':    'spin to win',
  'Main Character': 'hair flip',
  'GOATED':         'infinite W',
};

const RANK_COLORS: Record<string, string> = {
  'Delulu':         '#A78BFA',
  'Mewing':         '#818CF8',
  'Rizz':           '#60A5FA',
  'Gigachad':       '#2DD4BF',
  'Aura Farmer':    '#F472B6',
  'Main Character': '#FB923C',
  'GOATED':         '#F4C842',
};

export function RankScreen() {
  const userId = useAuthUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data, isLoading } = useRankData(userId);

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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t.rankTitle}</Text>

        {/* Rankhero card */}
        <View style={styles.rankhero}>
          <View style={[styles.rankheroGlow, { backgroundColor: RANK_COLORS[currentTier.rank_name] ?? colors.primarySoft }]} />
          {currentStars >= 5 ? (
            <>
              <Text style={styles.rankEm}>{RANK_EMOJIS[currentTier.rank_name] ?? '🏆'}</Text>
              <Text style={styles.rankNm}>{currentTier.rank_name}</Text>
              <Text style={styles.rankEn}>{t.rankQuoteMap[currentTier.rank_name] ?? ''}</Text>
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
              {t.nextRank(starsToNext, nextTier?.rank_name ?? '')} {RANK_EMOJIS[nextTier?.rank_name ?? ''] ?? ''}
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
          {[...tiers].sort((a, b) => b.tier_order - a.tier_order).map((tier, idx, arr) => {
            const isCurrent = tier.id === currentTier.id;
            const isLast = idx === arr.length - 1;
            const range = idx > 0
              ? `${tier.stars_required}–${(arr[idx - 1]?.stars_required ?? 999) - 1} ★`
              : `${tier.stars_required}+ ★`;
            return (
              <View key={tier.id} style={[styles.rk, isCurrent && { ...styles.rkCur, backgroundColor: (RANK_COLORS[tier.rank_name] ?? colors.primary) + '22' }, isLast && styles.rkLast]}>
                <Text style={styles.rkEm}>{RANK_EMOJIS[tier.rank_name] ?? '•'}</Text>
                <View style={styles.rkInfo}>
                  <Text style={[styles.rkA, isCurrent && { color: RANK_COLORS[tier.rank_name] ?? colors.primaryPress }]}>{tier.rank_name}</Text>
                  <Text style={styles.rkB}>{RANK_EN[tier.rank_name] ?? ''}</Text>
                </View>
                <Text style={[styles.rkThr, isCurrent && { color: RANK_COLORS[tier.rank_name] ?? colors.primaryPress }]}>{range}</Text>
              </View>
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
                return (
                  <View key={week.week_start} style={[styles.rk, isLast && styles.rkLast]}>
                    <Text style={styles.rkEm}>{weekTier ? (RANK_EMOJIS[weekTier.rank_name] ?? '•') : '—'}</Text>
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
      backgroundColor: C.primarySoft, opacity: 0.6,
    },
    rankEm: { fontSize: 54, marginBottom: 2 },
    rankNm: { fontSize: 25, fontWeight: '800', letterSpacing: -0.5, color: C.inkDark, marginTop: 6 },
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
      paddingVertical: 12, borderBottomWidth: 1, borderColor: C.line,
    },
    rkCur: {
      backgroundColor: C.primarySoft,
      marginHorizontal: -8, paddingHorizontal: 14,
      borderRadius: Radii.md, borderBottomWidth: 0, marginVertical: 2,
    },
    rkLast: { borderBottomWidth: 0 },
    rkEm: { fontSize: 24, width: 32, textAlign: 'center', flexShrink: 0 },
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
