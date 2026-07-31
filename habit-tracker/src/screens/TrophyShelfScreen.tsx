import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppColors, FontFamily, Radii, Shadows, Spacing, Typography } from '../config/theme';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useAllTimeStats } from '../queries/useProgress';
import { useRankData } from '../queries/useRank';
import { useAchievementActivityMetrics, useChallengeDaysTotal, useAchievementUnlocks, useRecordAchievementUnlock, useWeeklyOverachieverCount } from '../queries/useAchievements';
import { ACHIEVEMENTS, FILTERS, matchesFilter, type AchievementFilter } from '../config/achievements';
import { computeAchievementStatus, type AchievementStats } from '../lib/achievements';
import { Badge } from '../components/Badge';
import { BadgeDetailModal } from '../components/BadgeDetailModal';

export function TrophyShelfScreen() {
  const { userId, colors, t, styles } = useScreenCommons(makeStyles);
  const [filter, setFilter] = useState<AchievementFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: allTime, isLoading: allTimeLoading } = useAllTimeStats(userId);
  const { data: rank, isLoading: rankLoading } = useRankData(userId);
  const { data: challengeDaysDone, isLoading: challengeLoading } = useChallengeDaysTotal(userId);
  const { data: overachieveWeeks, isLoading: overachieveLoading } = useWeeklyOverachieverCount(userId);
  const { data: activityMetrics, isLoading: activityMetricsLoading } = useAchievementActivityMetrics(userId);
  const { data: unlocks = {}, isLoading: unlocksLoading } = useAchievementUnlocks(userId);
  const recordUnlock = useRecordAchievementUnlock(userId);

  const isLoading = allTimeLoading || rankLoading || challengeLoading || overachieveLoading || activityMetricsLoading || unlocksLoading;

  const stats: AchievementStats = useMemo(() => {
    const tiers = rank?.tiers ?? [];
    const currentTierId = rank?.currentTierId ?? null;
    const rankTierOrder = currentTierId == null ? 0 : (tiers.find(tr => tr.id === currentTierId)?.tier_order ?? 0);
    return {
      totalActivities: allTime?.totalActivities ?? 0,
      bestStreak: allTime?.bestStreak ?? 0,
      challengeDaysDone: challengeDaysDone ?? 0,
      rankTierOrder,
      weeklyOverachieveWeeks: overachieveWeeks ?? 0,
      activeDays: allTime?.activeDays ?? 0,
      morningLogs: activityMetrics?.morningLogs ?? 0,
      nightLogs: activityMetrics?.nightLogs ?? 0,
      totalStars: allTime?.totalStars ?? 0,
      activityTypes: activityMetrics?.activityTypes ?? 0,
    };
  }, [allTime, rank, challengeDaysDone, overachieveWeeks, activityMetrics]);

  const items = useMemo(
    () => ACHIEVEMENTS.map(a => ({ ...a, ...computeAchievementStatus(a, stats) })),
    [stats]
  );
  const earnedCount = items.filter(i => i.earned).length;
  const filteredItems = useMemo(() => items.filter(i => matchesFilter(i, filter)), [items, filter]);

  useEffect(() => {
    if (isLoading) return;
    for (const item of items) {
      if (item.earned && !unlocks[item.id]) recordUnlock.mutate(item.id);
    }
    // Only re-scan when the earned set or recorded set actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, items, unlocks]);

  const filterLabels: Record<AchievementFilter, string> = {
    all: t.trophyFilterAll,
    streak: t.trophyFilterStreak,
    challenge: t.trophyFilterChallenge,
    rank: t.trophyFilterRank,
  };

  const selected = items.find(i => i.id === selectedId) ?? null;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.loadingBox}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t.screenTrophyShelf}</Text>
        <View style={styles.counterCard}>
          <View style={styles.counterRow}>
            <Text style={styles.counterLabel}>{t.trophyUnlockedCount}</Text>
            <Text style={styles.counterValue}>
              <Text style={{ color: colors.primaryText }}>{earnedCount}</Text> / {items.length}
            </Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${(earnedCount / items.length) * 100}%` }]} />
          </View>
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.chip, filter === f && styles.chipSelected]}
              onPress={() => setFilter(f)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === f }}
            >
              <Text style={[styles.chipText, filter === f && styles.chipTextSelected]}>{filterLabels[f]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.grid}>
          {filteredItems.map(i => (
            <TouchableOpacity
              key={i.id}
              style={styles.cell}
              onPress={() => setSelectedId(i.id)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t[i.labelKey as keyof typeof t] as string}
            >
              <Badge
                tier={i.tier}
                emblem={i.emblem}
                locked={!i.earned}
                progress={i.earned ? undefined : i.progress}
                label={t[i.labelKey as keyof typeof t] as string}
                sub={i.earned ? undefined : `${i.current} / ${i.goal}`}
                colors={colors}
              />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <BadgeDetailModal
        visible={!!selected}
        achievement={selected}
        earnedDate={selected ? unlocks[selected.id] : undefined}
        onClose={() => setSelectedId(null)}
      />
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgBase },
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xl },
    title: { color: C.inkDark, fontFamily: FontFamily.extraBold, fontSize: 24, letterSpacing: -0.5, marginBottom: Spacing.md },
    counterCard: {
      backgroundColor: C.surface, borderRadius: Radii.lg, padding: Spacing.md,
      borderWidth: 1, borderColor: C.line, marginBottom: Spacing.lg, ...Shadows.light,
    },
    counterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 11 },
    counterLabel: { ...Typography.sectionLabel, color: C.ink2 },
    counterValue: { fontSize: 20, fontFamily: FontFamily.extraBold, color: C.inkDark },
    track: { height: 9, borderRadius: Radii.pill, overflow: 'hidden', backgroundColor: C.surface2 },
    trackFill: { height: '100%', borderRadius: Radii.pill, backgroundColor: C.primary },
    filterRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.lg },
    chip: {
      backgroundColor: C.surface, borderRadius: Radii.pill, borderWidth: 1, borderColor: C.line,
      flex: 1, paddingVertical: 7, paddingHorizontal: 5, minHeight: 44,
      alignItems: 'center', justifyContent: 'center',
    },
    chipSelected: { backgroundColor: C.primary, borderColor: C.primary },
    chipText: { fontSize: 11, fontFamily: FontFamily.semiBold, color: C.inkDark },
    chipTextSelected: { color: C.onAccent },
    grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: '3.5%' },
    cell: { width: '31%', marginBottom: Spacing.lg, minHeight: 44 },
  });
}
