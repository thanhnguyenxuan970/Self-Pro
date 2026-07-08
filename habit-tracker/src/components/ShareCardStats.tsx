import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontFamily } from '../config/theme';
import { useTranslations } from '../hooks/useSettings';

export const STATS_CARD_W = 328;
export const STATS_CARD_H = 583;

const BG = '#1E9E63'; // --primary, solid per C1 spec
const GLOW = 'rgba(255,255,255,0.10)';
const INK = '#FFFFFF';
const MUTED = 'rgba(255,255,255,0.75)';
const CHIP_BG = 'rgba(255,255,255,0.16)';

export interface ShareCardStatsProps {
  challengeTitle: string;
  /** e.g. "30/30" for streak, "4/4" for a perfect weekly week */
  numerator: number;
  denominator: number;
  /** "streak" -> "N/target 🔥"; "weekly" -> "Tuần k hoàn hảo" */
  variant: 'streak' | 'weekly';
  weekIndex?: number;
  rewardStars: number;
  rankName: string;
}

export const ShareCardStats = React.forwardRef<View, ShareCardStatsProps>(function ShareCardStats(
  { challengeTitle, numerator, denominator, variant, weekIndex, rewardStars, rankName },
  ref,
) {
  const t = useTranslations();
  return (
    <View ref={ref} style={styles.root} collapsable={false}>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.glowWash} />
      </View>

      <View style={styles.header}>
        <View style={styles.brandCircle}><Text style={styles.brandSprout}>🌱</Text></View>
        <Text style={styles.wordmark}>Habi</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.eyebrow}>{t.shareStatsEyebrow}</Text>
        <Text style={styles.title} numberOfLines={2}>{challengeTitle}</Text>

        <View style={styles.numberRow}>
          <Text style={styles.number}>{numerator}/{denominator}</Text>
          <Text style={styles.numberEmoji}>🔥</Text>
        </View>
        <Text style={styles.tagline}>
          {variant === 'streak' ? t.shareStatsNoStreakBody(denominator) : t.shareWeeklyPerfect(weekIndex ?? 0)}
        </Text>

        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>★ {rewardStars}</Text>
            <Text style={styles.chipLabel}>{t.shareStarsLabel}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{rankName}</Text>
            <Text style={styles.chipLabel}>{t.shareRankLabel}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.footer}>{t.shareStatsTagline}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: STATS_CARD_W, height: STATS_CARD_H, borderRadius: 32, overflow: 'hidden',
    backgroundColor: BG, paddingHorizontal: 28, paddingTop: 32, paddingBottom: 28,
    justifyContent: 'space-between',
  },
  glowWash: {
    position: 'absolute', top: -80, right: -60, width: 260, height: 260, borderRadius: 130,
    backgroundColor: GLOW,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandCircle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  brandSprout: { fontSize: 16 },
  wordmark: { fontSize: 20, fontFamily: FontFamily.extraBold, color: INK, letterSpacing: -0.3 },
  body: { gap: 10 },
  eyebrow: { fontSize: 12, fontFamily: FontFamily.bold, color: MUTED, letterSpacing: 0.6 },
  title: { fontSize: 20, fontFamily: FontFamily.bold, color: INK },
  numberRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 6 },
  number: { fontSize: 64, fontFamily: FontFamily.extraBold, color: INK, letterSpacing: -2, lineHeight: 66 },
  numberEmoji: { fontSize: 36, marginBottom: 6 },
  tagline: { fontSize: 15, fontFamily: FontFamily.medium, color: MUTED },
  chipRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  chip: { backgroundColor: CHIP_BG, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, flex: 1 },
  chipText: { fontSize: 16, fontFamily: FontFamily.bold, color: INK },
  chipLabel: { fontSize: 11, fontFamily: FontFamily.medium, color: MUTED, marginTop: 2 },
  footer: { fontSize: 12, fontFamily: FontFamily.medium, color: MUTED, textAlign: 'center' },
});
