import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Colors, Typography, Radii, Spacing, Shadows } from '../theme';
import { useRankData } from '../queries/useRank';
import { getCurrentTier, getStarsToNextTier } from '../logic/rankUtils';
import { useAuthUser } from '../hooks/useAuth';

const RANK_EMOJIS: Record<string, string> = {
  'NPC': '🎮',
  'Non Tơ': '🐣',
  'Tấu Hài': '🤡',
  'Cuốn Phết': '🌀',
  'Xịn Sò': '✨',
  'Đỉnh Chóp': '🔥',
  'U Là Trời': '👑',
};

export function RankScreen() {
  const userId = useAuthUser();
  const { data, isLoading } = useRankData(userId);

  if (isLoading || !data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const { currentStars, tiers, history } = data;
  const currentTier = getCurrentTier(currentStars, tiers);
  const starsToNext = getStarsToNextTier(currentStars, tiers);
  const nextTier = tiers.find((t) => t.stars_required > currentStars);
  const progressPct = nextTier
    ? Math.min(1, (currentStars - currentTier.stars_required) / (nextTier.stars_required - currentTier.stars_required))
    : 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero */}
      <View style={styles.heroCard}>
        <Text style={styles.rankEmoji}>{RANK_EMOJIS[currentTier.rank_name] ?? '🏆'}</Text>
        <Text style={styles.rankName}>{currentTier.rank_name}</Text>
        <Text style={styles.rankStars}>{currentStars} ★</Text>
        {starsToNext > 0 ? (
          <Text style={styles.rankNext}>Cần thêm {starsToNext} ★ để lên hạng tiếp</Text>
        ) : (
          <Text style={styles.rankNext}>Đã đạt hạng cao nhất 🎉</Text>
        )}

        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${Math.round(progressPct * 100)}%` }]} />
        </View>
      </View>

      {/* Philosophy */}
      <View style={styles.philosophyCard}>
        <Text style={styles.philosophyText}>
          Không có bảng xếp hạng người khác.{'\n'}
          Bạn chỉ đua với chính mình của hôm qua.
        </Text>
        <Text style={styles.philosophyMeta}>
          Tập trung vào quá trình · Zero FOMO · Zero so sánh độc hại
        </Text>
      </View>

      {/* Tier ladder */}
      <Text style={styles.sectionLabel}>BẢNG HẠNG</Text>
      {[...tiers].sort((a, b) => b.tier_order - a.tier_order).map((tier) => {
        const isCurrent = tier.id === currentTier.id;
        const isUnlocked = currentStars >= tier.stars_required;
        return (
          <View key={tier.id} style={[styles.tierRow, isCurrent && styles.tierRowActive]}>
            <Text style={styles.tierEmoji}>{RANK_EMOJIS[tier.rank_name] ?? '•'}</Text>
            <View style={styles.tierInfo}>
              <Text style={[styles.tierName, isCurrent && styles.tierNameActive]}>
                {tier.rank_name}
              </Text>
              <Text style={styles.tierReq}>{tier.stars_required}+ ★</Text>
            </View>
            <Text style={[styles.tierLock, isUnlocked && styles.tierUnlocked]}>
              {isUnlocked ? '✓' : '🔒'}
            </Text>
          </View>
        );
      })}

      {/* Weekly history */}
      {history.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>LỊCH SỬ TUẦN</Text>
          {history.map((week) => {
            const weekTier = week.current_tier_id
              ? tiers.find((t) => t.id === week.current_tier_id)
              : null;
            return (
              <View key={week.week_start} style={styles.historyRow}>
                <Text style={styles.historyDate}>Tuần {week.week_start}</Text>
                <Text style={styles.historyStars}>{week.weekly_stars} ★</Text>
                {weekTier && (
                  <Text style={styles.historyRank}>
                    {RANK_EMOJIS[weekTier.rank_name] ?? ''} {weekTier.rank_name}
                  </Text>
                )}
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgBase },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.md,
    ...Shadows.medium,
  },
  rankEmoji: { fontSize: 52, marginBottom: 8 },
  rankName: { ...Typography.title, color: Colors.inkDark },
  rankStars: { fontSize: 20, color: Colors.starGold, fontWeight: '700', marginTop: 4 },
  rankNext: { ...Typography.caption, color: Colors.muted, marginTop: 6, textAlign: 'center' },
  progressBg: {
    width: '100%',
    height: 8,
    backgroundColor: Colors.surface3,
    borderRadius: Radii.pill,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radii.pill,
  },
  philosophyCard: {
    backgroundColor: Colors.primarySoft,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  philosophyText: {
    ...Typography.bodyStrong,
    color: Colors.primaryPress,
    textAlign: 'center',
    lineHeight: 22,
  },
  philosophyMeta: {
    ...Typography.caption,
    color: Colors.primaryHover,
    textAlign: 'center',
    marginTop: 6,
  },
  sectionLabel: { ...Typography.sectionLabel, color: Colors.muted, marginBottom: Spacing.sm },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  tierRowActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  tierEmoji: { fontSize: 24, marginRight: Spacing.sm },
  tierInfo: { flex: 1 },
  tierName: { ...Typography.bodyStrong, color: Colors.ink2 },
  tierNameActive: { color: Colors.primaryPress },
  tierReq: { ...Typography.caption, color: Colors.muted },
  tierLock: { fontSize: 16, color: Colors.faint },
  tierUnlocked: { color: Colors.primary },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radii.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  historyDate: { ...Typography.caption, color: Colors.muted, flex: 1 },
  historyStars: { ...Typography.bodyStrong, color: Colors.starGold },
  historyRank: { ...Typography.caption, color: Colors.ink2 },
});
