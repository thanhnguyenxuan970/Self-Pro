import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontFamily } from '../config/theme';
import { useTranslations } from '../hooks/useSettings';

export const CARD_W = 400;
export const CARD_H = 711;

const ACCENT = '#35D68B';
const INK = '#F1F7F3';
const MUTED = 'rgba(241,247,243,0.6)';
const FAINT = 'rgba(241,247,243,0.25)';
const CARD_BG: readonly [string, string, string] = ['#123f2e', '#0E3527', '#0B2C20'];

export interface ShareCardProps {
  streakCount: number;
  daysDone: number;
  percentile: number;
  topHabitName: string;
  weeklyStars: number;
  tierName: string;
  beforeUri?: string;
  afterUri?: string;
}

export const ShareCard = React.forwardRef<View, ShareCardProps>(function ShareCard(
  { streakCount, daysDone, percentile, topHabitName, weeklyStars, tierName, beforeUri, afterUri },
  ref,
) {
  const t = useTranslations();
  const hasPhotos = !!(beforeUri || afterUri);
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

      {/* Hero: streak */}
      <View style={styles.heroSection}>
        <Text style={styles.heroEmoji}>🔥</Text>
        <Text style={styles.heroNumber}>{streakCount}</Text>
        <Text style={styles.heroLabel}>{t.shareStreakUnit}</Text>
        {weeklyStars > 0 && (
          <Text style={styles.starsRow}>{t.shareWeeklyStars(weeklyStars)}</Text>
        )}
      </View>

      {/* Before / After photos */}
      {hasPhotos && (
        <View style={styles.photoRow}>
          <View style={styles.photoSlot}>
            {beforeUri ? (
              <Image source={{ uri: beforeUri }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoEmpty]} />
            )}
            <Text style={styles.photoLabel}>{t.shareBefore}</Text>
          </View>
          <Text style={styles.photoArrow}>→</Text>
          <View style={styles.photoSlot}>
            {afterUri ? (
              <Image source={{ uri: afterUri }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoEmpty]} />
            )}
            <Text style={styles.photoLabel}>{t.shareAfter}</Text>
          </View>
        </View>
      )}

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
    color: '#E0A93B',
    fontFamily: FontFamily.semiBold,
    marginTop: 8,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  photoSlot: {
    alignItems: 'center',
    gap: 6,
  },
  photo: {
    width: 132,
    height: 132,
    borderRadius: 14,
  },
  photoEmpty: {
    backgroundColor: 'rgba(241,247,243,0.08)',
    borderWidth: 1,
    borderColor: FAINT,
  },
  photoLabel: {
    fontSize: 11,
    color: MUTED,
    fontFamily: FontFamily.medium,
  },
  photoArrow: {
    fontSize: 22,
    color: ACCENT,
    fontFamily: FontFamily.bold,
    marginTop: -20,
  },
  progressSection: {
    gap: 8,
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
