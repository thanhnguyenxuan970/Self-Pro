import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { FontFamily } from '../config/theme';
import { useTranslations } from '../hooks/useSettings';

const BA_CARD_W = 328;
const BA_CARD_H = 583;

const BG = '#0F1410';
const INK = '#F1F7F3';
const MUTED = 'rgba(241,247,243,0.65)';
const ACCENT = '#1E9E63';

export interface ShareCardBeforeAfterProps {
  challengeTitle: string;
  beforeUri: string;
  afterUri: string;
  rewardStars: number;
  numerator: number;
  denominator: number;
}

export const ShareCardBeforeAfter = React.forwardRef<View, ShareCardBeforeAfterProps>(function ShareCardBeforeAfter(
  { challengeTitle, beforeUri, afterUri, rewardStars, numerator, denominator },
  ref,
) {
  const t = useTranslations();
  return (
    <View ref={ref} style={styles.root} collapsable={false}>
      <View style={styles.photoRow}>
        <View style={styles.photoHalf}>
          <Image source={{ uri: beforeUri }} style={styles.photo} />
          <View style={[styles.tag, styles.tagLeft]}><Text style={styles.tagText}>{t.shareBefore}</Text></View>
        </View>
        <View style={styles.photoHalf}>
          <Image source={{ uri: afterUri }} style={styles.photo} />
          <View style={[styles.tag, styles.tagRight]}><Text style={styles.tagText}>{t.shareAfter}</Text></View>
        </View>
        <View style={styles.seamBadge}><Text style={styles.seamArrow}>→</Text></View>
      </View>

      <View style={styles.bottomPanel}>
        <View style={styles.header}>
          <View style={styles.brandCircle}><Text style={styles.brandSprout}>🌱</Text></View>
          <Text style={styles.wordmark}>Habi</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>{challengeTitle}</Text>
        <View style={styles.chipRow}>
          <View style={styles.chip}><Text style={styles.chipText}>★ +{rewardStars}</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>🔥 {numerator}/{denominator}</Text></View>
        </View>
        <Text style={styles.tagline}>{t.shareStatsTagline}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: BA_CARD_W, height: BA_CARD_H, borderRadius: 32, overflow: 'hidden', backgroundColor: BG,
  },
  photoRow: { flexDirection: 'row', height: BA_CARD_H * 0.58 },
  photoHalf: { flex: 1, position: 'relative' },
  photo: { width: '100%', height: '100%' },
  tag: {
    position: 'absolute', top: 16, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  tagLeft: { left: 16 },
  tagRight: { right: 16 },
  tagText: { fontSize: 12, fontFamily: FontFamily.semiBold, color: '#FFFFFF' },
  seamBadge: {
    position: 'absolute', top: '50%', left: '50%', marginLeft: -22, marginTop: -22,
    width: 44, height: 44, borderRadius: 22, backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  seamArrow: { fontSize: 20, color: '#FFFFFF', fontFamily: FontFamily.bold },
  bottomPanel: { flex: 1, padding: 24, gap: 8, justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandCircle: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  brandSprout: { fontSize: 13 },
  wordmark: { fontSize: 16, fontFamily: FontFamily.extraBold, color: ACCENT },
  title: { fontSize: 19, fontFamily: FontFamily.bold, color: INK, marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  chip: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingVertical: 7, paddingHorizontal: 12 },
  chipText: { fontSize: 13, fontFamily: FontFamily.semiBold, color: INK },
  tagline: { fontSize: 12, fontFamily: FontFamily.medium, color: MUTED, marginTop: 8 },
});
