import React from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radii, Spacing, Shadows } from '../theme';
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
  'Toang Rồi Ông Giáo': '💀',
};

const RANK_EN: Record<string, string> = {
  'NPC': 'NPC',
  'Non Tơ': 'Rookie',
  'Tấu Hài': 'Clown Arc',
  'Cuốn Phết': 'On a Roll',
  'Xịn Sò': 'Certified Fresh',
  'Đỉnh Chóp': 'Goated',
  'U Là Trời': 'Main Character',
  'Toang Rồi Ông Giáo': 'Game Over',
};

const RANK_QUOTE: Record<string, string> = {
  'NPC': '"bắt đầu hành trình"',
  'Non Tơ': '"mới chập chững thôi"',
  'Tấu Hài': '"đang tấu hài nhẹ"',
  'Cuốn Phết': '"đang cuốn lắm rồi!"',
  'Xịn Sò': '"xịn sò vkl"',
  'Đỉnh Chóp': '"đỉnh của chóp rồi đó"',
  'U Là Trời': '"peak of the peak"',
  'Toang Rồi Ông Giáo': '"game over bro"',
};

export function RankScreen() {
  const userId = useAuthUser();
  const { data, isLoading } = useRankData(userId);

  if (isLoading || !data) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const { currentStars, tiers, history } = data;
  const currentTier = getCurrentTier(currentStars, tiers);
  const starsToNext = getStarsToNextTier(currentStars, tiers);
  const nextTier = tiers.find((t) => t.stars_required > currentStars);
  const prevTierStars = currentTier.stars_required;
  const nextTierStars = nextTier?.stars_required ?? prevTierStars;
  const progressPct = nextTier
    ? Math.min(1, (currentStars - prevTierStars) / Math.max(1, nextTierStars - prevTierStars))
    : 1;

  return (
    <SafeAreaView style={s.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Bảng Rank</Text>

        {/* Rankhero card */}
        <View style={s.rankhero}>
          <View style={s.rankheroGlow} />
          {currentStars >= 5 ? (
            <>
              <Text style={s.rankEm}>{RANK_EMOJIS[currentTier.rank_name] ?? '🏆'}</Text>
              <Text style={s.rankNm}>{currentTier.rank_name}</Text>
              <Text style={s.rankEn}>{RANK_QUOTE[currentTier.rank_name] ?? ''}</Text>
            </>
          ) : (
            <>
              <Text style={s.rankEm}>❓</Text>
              <Text style={s.rankNm}>Chưa có rank</Text>
              <Text style={s.rankEn}>Tích đủ 5 ★ để mở rank đầu tiên</Text>
            </>
          )}
          <View style={s.rankWk}>
            <Text style={s.rankWkTxt}>★ {currentStars} · Tuần này</Text>
          </View>
          <View style={s.bar}>
            <View style={[s.barFill, { width: `${Math.round(progressPct * 100)}%` as any }]} />
          </View>
          {starsToNext > 0 ? (
            <Text style={s.nextCap}>
              Còn {starsToNext} ★ → {nextTier?.rank_name ?? ''} {RANK_EMOJIS[nextTier?.rank_name ?? ''] ?? ''}
            </Text>
          ) : (
            <Text style={s.nextCap}>Đã đạt hạng cao nhất 🎉</Text>
          )}
        </View>

        {/* Reset chip */}
        <View style={s.resetChip}>
          <Text style={s.resetChipTxt}>♻  Reset T2 · 00:00 — Sao tuần về ngưỡng sàn hạng (rank retention)</Text>
        </View>

        {/* Rank ladder */}
        <Text style={s.sectionLabel}>Thang bậc Rank</Text>
        <View style={s.card}>
          {[...tiers].sort((a, b) => b.tier_order - a.tier_order).map((tier, idx, arr) => {
            const isCurrent = tier.id === currentTier.id;
            const isLast = idx === arr.length - 1;
            const range = idx > 0
              ? `${tier.stars_required}–${(arr[idx - 1]?.stars_required ?? 999) - 1} ★`
              : `${tier.stars_required}+ ★`;
            return (
              <View key={tier.id} style={[s.rk, isCurrent && s.rkCur, isLast && s.rkLast]}>
                <Text style={s.rkEm}>{RANK_EMOJIS[tier.rank_name] ?? '•'}</Text>
                <View style={s.rkInfo}>
                  <Text style={[s.rkA, isCurrent && s.rkACur]}>{tier.rank_name}</Text>
                  <Text style={s.rkB}>{RANK_EN[tier.rank_name] ?? ''}</Text>
                </View>
                <Text style={[s.rkThr, isCurrent && s.rkThrCur]}>{range}</Text>
              </View>
            );
          })}
        </View>

        {/* Philosophy card */}
        <LinearGradient
          colors={['#1B1F1D', '#3F4642']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.philo}
        >
          <Text style={s.philoQ}>
            "Không có bảng xếp hạng người khác. Bạn chỉ đua với chính mình của hôm qua."
          </Text>
          <Text style={s.philoA}>Triết lý: process-focused · zero FOMO · zero so sánh độc hại</Text>
        </LinearGradient>

        {/* Weekly history */}
        {history.length > 0 && (
          <>
            <Text style={s.sectionLabel}>Lịch sử các tuần</Text>
            <View style={s.card}>
              {history.map((week, idx) => {
                const weekTier = week.current_tier_id
                  ? tiers.find((t) => t.id === week.current_tier_id)
                  : null;
                const isLast = idx === history.length - 1;
                return (
                  <View key={week.week_start} style={[s.rk, isLast && s.rkLast]}>
                    <Text style={s.rkEm}>{weekTier ? (RANK_EMOJIS[weekTier.rank_name] ?? '•') : '—'}</Text>
                    <View style={s.rkInfo}>
                      <Text style={s.rkA}>Tuần {week.week_start}</Text>
                      <Text style={s.rkB}>{weekTier?.rank_name ?? '—'}</Text>
                    </View>
                    <Text style={s.rkThr}>{week.weekly_stars} ★</Text>
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

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bgBase },
  content: { paddingBottom: 40 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: Colors.inkDark, marginHorizontal: Spacing.lg, marginTop: 10, marginBottom: 14 },

  rankhero: {
    marginHorizontal: Spacing.lg, backgroundColor: Colors.surface,
    borderRadius: Radii.xl, padding: 22, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.line, ...Shadows.light, overflow: 'hidden',
  },
  rankheroGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '60%',
    backgroundColor: Colors.primarySoft, opacity: 0.6,
  },
  rankEm: { fontSize: 54, marginBottom: 2 },
  rankNm: { fontSize: 25, fontWeight: '800', letterSpacing: -0.5, color: Colors.inkDark, marginTop: 6 },
  rankEn: { fontSize: 12.5, color: Colors.muted, marginTop: 2, fontStyle: 'italic' },
  rankWk: {
    marginTop: 12, backgroundColor: Colors.starSoft,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radii.pill,
  },
  rankWkTxt: { fontSize: 13, fontWeight: '800', color: Colors.starGold },
  bar: { width: '100%', height: 8, backgroundColor: Colors.surface2, borderRadius: Radii.pill, marginTop: 14, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: Radii.pill },
  nextCap: { fontSize: 12, color: Colors.muted, marginTop: 13, fontWeight: '600', textAlign: 'center' },

  resetChip: {
    marginHorizontal: Spacing.lg, marginTop: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface2, borderRadius: Radii.md, padding: 11,
  },
  resetChipTxt: { fontSize: 12, fontWeight: '700', color: Colors.ink2, textAlign: 'center' },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.7,
    marginHorizontal: Spacing.lg, marginTop: 20, marginBottom: 9,
  },
  card: {
    marginHorizontal: Spacing.lg, backgroundColor: Colors.surface,
    borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.line,
    paddingHorizontal: 15, ...Shadows.light,
  },
  rk: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderColor: Colors.line,
  },
  rkCur: {
    backgroundColor: Colors.primarySoft,
    marginHorizontal: -8, paddingHorizontal: 14,
    borderRadius: Radii.md, borderBottomWidth: 0, marginVertical: 2,
  },
  rkLast: { borderBottomWidth: 0 },
  rkEm: { fontSize: 24, width: 32, textAlign: 'center', flexShrink: 0 },
  rkInfo: { flex: 1 },
  rkA: { fontSize: 14, fontWeight: '800', color: Colors.inkDark },
  rkACur: { color: Colors.primaryPress },
  rkB: { fontSize: 11.5, color: Colors.muted, marginTop: 2 },
  rkThr: { fontSize: 11.5, fontWeight: '800', color: Colors.muted },
  rkThrCur: { color: Colors.primaryPress },

  philo: {
    marginHorizontal: Spacing.lg, marginTop: 8,
    borderRadius: Radii.lg, padding: 18, ...Shadows.light,
  },
  philoQ: { fontSize: 14, lineHeight: 22, fontWeight: '600', color: '#fff' },
  philoA: { fontSize: 11.5, opacity: 0.65, marginTop: 8, fontWeight: '600', color: '#fff' },
});
