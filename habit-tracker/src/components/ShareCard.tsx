import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontFamily } from '../config/theme';
import { useTranslations } from '../hooks/useSettings';

export const CARD_W = 400;
export const CARD_H = 711;

// Fixed, not theme tokens: this card is exported as a shareable image (Instagram/
// Zalo story), so it must render identically regardless of the viewer's or even
// the sharer's own app theme -- a dark-green gradient card is the export's brand,
// not app chrome that should follow the user's light/dark or accent setting.
const ACCENT = '#35D68B';
const INK = '#F1F7F3';
const MUTED = 'rgba(241,247,243,0.6)';
const FAINT = 'rgba(241,247,243,0.25)';
const GOLD = '#E0A93B';
const CARD_BG: readonly [string, string, string] = ['#123f2e', '#0E3527', '#0B2C20'];

interface ShareCardProps {
  streakCount: number;
  daysDone: number;
  percentile: number;
  topHabitName: string;
  weeklyStars: number;
  tierName: string;
}

export const ShareCard = React.forwardRef<View, ShareCardProps>(function ShareCard(
  { streakCount, daysDone, percentile, topHabitName, weeklyStars, tierName },
  ref,
) {
  const t = useTranslations();
  const journeyPct = Math.min(1, daysDone / 90);

  return (
    <View ref={ref} style={styles.root} collapsable={false}>
      <LinearGradient colors={CARD_BG} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>habi</Text>
        <View style={styles.rankBadge}>
          <Text style={styles.rankBadgeText} numberOfLines={1}>{tierName}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* Hero: streak */}
        <View style={styles.heroSection}>
          <Text style={styles.heroEmoji}>🔥</Text>
          <Text style={styles.heroNumber}>{streakCount}</Text>
          <Text style={styles.heroLabel}>{t.shareStreakUnit}</Text>
          {weeklyStars > 0 && (
            <Text style={styles.starsRow}>{t.shareWeeklyStars(Math.round(weeklyStars))}</Text>
          )}
        </View>

        {/* Progress + top habit */}
        <View style={styles.progressSection}>
          {topHabitName !== '' && (
            <>
              <Text style={styles.habitSectionLabel}>{t.shareTopHabitLabel}</Text>
              <Text style={styles.habitName} numberOfLines={1}>{topHabitName}</Text>
            </>
          )}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(journeyPct * 100)}%` as `${number}%` }]} />
          </View>
          <Text style={styles.progressText}>{t.shareDaysLabel(daysDone)}</Text>
        </View>

        {/* Percentile */}
        <View style={styles.percentileChip}>
          <Text style={styles.percentileText} numberOfLines={1}>🏆 {t.sharePercentileLabel(percentile)}</Text>
        </View>
      </View>

      {/* Watermark */}
      <View style={styles.watermark}>
        <Text style={styles.watermarkText}>{t.shareWatermark}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: CARD_W,
    height: CARD_H,
    overflow: 'hidden',
    borderRadius: 32,
    paddingHorizontal: 36,
    paddingTop: 40,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  wordmark: {
    fontSize: 26,
    color: ACCENT,
    fontFamily: FontFamily.extraBold,
    letterSpacing: -0.5,
    flexShrink: 0,
  },
  rankBadge: {
    flexShrink: 1,
    backgroundColor: 'rgba(53,214,139,0.15)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(53,214,139,0.35)',
  },
  rankBadgeText: {
    color: ACCENT,
    fontSize: 13,
    fontFamily: FontFamily.semiBold,
  },
  heroSection: {
    alignItems: 'center',
  },
  heroEmoji: {
    fontSize: 44,
    marginBottom: 2,
  },
  heroNumber: {
    fontSize: 88,
    color: INK,
    fontFamily: FontFamily.extraBold,
    lineHeight: 94,
    letterSpacing: -4,
  },
  heroLabel: {
    fontSize: 17,
    color: MUTED,
    fontFamily: FontFamily.medium,
    marginTop: 4,
  },
  starsRow: {
    fontSize: 15,
    color: GOLD,
    fontFamily: FontFamily.semiBold,
    marginTop: 8,
  },
  progressSection: {
    gap: 8,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: 40,
  },
  habitSectionLabel: {
    fontSize: 11,
    color: MUTED,
    fontFamily: FontFamily.semiBold,
    letterSpacing: 0.4,
  },
  habitName: {
    fontSize: 20,
    color: INK,
    fontFamily: FontFamily.bold,
  },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(241,247,243,0.12)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: ACCENT,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 13,
    color: MUTED,
    fontFamily: FontFamily.medium,
  },
  percentileChip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: 'rgba(241,247,243,0.08)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: FAINT,
  },
  percentileText: {
    fontSize: 14,
    color: INK,
    fontFamily: FontFamily.semiBold,
  },
  watermark: {
    alignItems: 'center',
  },
  watermarkText: {
    fontSize: 11,
    color: 'rgba(241,247,243,0.3)',
    fontFamily: FontFamily.regular,
    letterSpacing: 0.3,
  },
});
