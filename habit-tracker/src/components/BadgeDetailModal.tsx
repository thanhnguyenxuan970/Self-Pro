import React, { useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { AppColors, FontFamily, Radii, Spacing, Typography } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge } from './Badge';
import type { Achievement, Tier } from '../config/achievements';
import type { Strings } from '../config/i18n';
import { BOTTOM_TAB_BAR_HEIGHT } from '../config/layout';

const TIER_NAME_KEY: Record<Tier, keyof Strings> = {
  iron: 'trophyTierIron',
  bronze: 'trophyTierBronze',
  silver: 'trophyTierSilver',
  gold: 'trophyTierGold',
  platinum: 'trophyTierPlatinum',
  diamond: 'trophyTierDiamond',
};

interface Props {
  visible: boolean;
  achievement: (Achievement & { earned: boolean; current: number }) | null;
  earnedDate?: string;
  onClose: () => void;
}

export function BadgeDetailModal({ visible, achievement, earnedDate, onClose }: Props) {
  const { colors } = useTheme();
  const t = useTranslations();
  const { bottom } = useSafeAreaInsets();
  const styles = React.useMemo(() => makeStyles(colors, bottom), [colors, bottom]);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);

  if (!achievement) return null;
  const a = achievement;

  async function handleShare() {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
    } catch {
      // share cancelled or failed — no-op
    } finally {
      setSharing(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t.close} />
        <View style={styles.sheet}>
          <View style={styles.grip} />

          <View ref={cardRef} collapsable={false} style={styles.captureArea}>
            <Badge tier={a.tier} emblem={a.emblem} locked={!a.earned} size={110} colors={colors} />
            <Text style={styles.title}>{t[a.labelKey as keyof Strings] as string}</Text>
            <View style={styles.tierChip}>
              <View style={styles.dot} />
              <Text style={styles.tierTxt}>{t[TIER_NAME_KEY[a.tier]] as string}</Text>
            </View>
          </View>

          <Text style={styles.desc}>{t[`${a.labelKey}Desc` as keyof Strings] as string}</Text>

          {a.earned ? (
            <Text style={styles.date}>{t.trophyEarnedOn(earnedDate ?? '')}</Text>
          ) : (
            <Text style={styles.date}>{t.trophyRemaining(Math.max(0, a.goal - a.current))}</Text>
          )}

          <TouchableOpacity
            style={[styles.shareBtn, !a.earned && styles.shareBtnDisabled]}
            onPress={handleShare}
            disabled={!a.earned || sharing}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t.trophyShareBadge}
          >
            {sharing
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.shareBtnText}>{t.trophyShareBadge}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(C: AppColors, bottomInset: number) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
      backgroundColor: C.surface, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl,
      paddingHorizontal: Spacing.xl, paddingTop: 12, paddingBottom: Spacing.xl + BOTTOM_TAB_BAR_HEIGHT + bottomInset, alignItems: 'center',
    },
    grip: { width: 40, height: 5, borderRadius: Radii.pill, backgroundColor: C.line2, marginBottom: Spacing.lg },
    captureArea: { alignItems: 'center', backgroundColor: C.surface },
    title: { fontSize: 23, fontFamily: FontFamily.extraBold, color: C.inkDark, marginTop: Spacing.md, textAlign: 'center' },
    tierChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm,
      paddingHorizontal: 13, paddingVertical: 5, borderRadius: Radii.pill,
      borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2,
    },
    dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary },
    tierTxt: { fontSize: 12, fontFamily: FontFamily.extraBold, color: C.inkDark },
    desc: { ...Typography.body, color: C.muted, textAlign: 'center', marginTop: Spacing.md, maxWidth: 280 },
    date: { fontSize: 13, fontFamily: FontFamily.bold, color: C.ink2, marginTop: Spacing.lg, marginBottom: Spacing.lg },
    shareBtn: {
      width: '100%', paddingVertical: 15, borderRadius: Radii.md,
      alignItems: 'center', backgroundColor: C.primary,
    },
    shareBtnDisabled: { backgroundColor: C.surface3 },
    shareBtnText: { color: C.white, fontSize: 15, fontFamily: FontFamily.bold },
  });
}
