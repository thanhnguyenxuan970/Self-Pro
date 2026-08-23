import React, { useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, useWindowDimensions, Alert,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { ShareCard, CARD_W, CARD_H } from '../components/ShareCard';
import { FontFamily, Radii, Spacing } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useProStatus } from '../hooks/useProStatus';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BOTTOM_TAB_BAR_HEIGHT } from '../config/layout';

interface Props {
  visible: boolean;
  onClose: () => void;
  streakCount: number;
  daysDone: number;
  percentile: number;
  topHabitName: string;
  weeklyStars: number;
  tierName: string;
}

export function ShareCardModal({
  visible, onClose,
  streakCount, daysDone, percentile, topHabitName, weeklyStars, tierName,
}: Props) {
  const { colors: C } = useTheme();
  const t = useTranslations();
  const reduceMotion = useReduceMotion();
  const { bottom } = useSafeAreaInsets();
  const { isPro } = useProStatus();
  const { width: screenW } = useWindowDimensions();
  const sheetW = Math.min(screenW, 480); // matches styles.sheet's maxWidth cap
  const previewScale = (sheetW - 48) / CARD_W;
  const marginH = CARD_W * (previewScale - 1) / 2;   // negative — shrinks layout
  const marginV = CARD_H * (previewScale - 1) / 2;   // negative — shrinks layout
  const [capturing, setCapturing] = useState(false);
  const cardRef = useRef<View>(null);

  async function handleShare() {
    if (!isPro) {
      Alert.alert(t.shareProFeatureTitle, t.shareProFeatureMsg);
      return;
    }
    if (!cardRef.current) return;
    setCapturing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
    } catch {
      // share cancelled or failed — no-op
    } finally {
      setCapturing(false);
    }
  }

  function handleClose() {
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={handleClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: C.scrim }]}>
        <View style={[styles.sheet, { backgroundColor: C.surface, paddingBottom: Spacing.xl + BOTTOM_TAB_BAR_HEIGHT + bottom }]} accessibilityViewIsModal>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: C.inkDark }]}>{t.shareTitle}</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel={t.close}
            >
              <Text style={[styles.closeIcon, { color: C.muted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Card preview — scaled to fit screen width */}
            <View style={[styles.previewContainer, { marginHorizontal: marginH, marginVertical: marginV, transform: [{ scale: previewScale }] }]}>
              <ShareCard
                ref={cardRef}
                streakCount={streakCount}
                daysDone={daysDone}
                percentile={percentile}
                topHabitName={topHabitName}
                weeklyStars={weeklyStars}
                tierName={tierName}
              />
            </View>
          </ScrollView>

          {/* Share CTA */}
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: C.primary }, capturing && styles.shareBtnDisabled]}
            onPress={handleShare}
            disabled={capturing}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={isPro ? t.shareBtn : t.shareBtnLocked}
          >
            {capturing ? (
              <ActivityIndicator color={C.onAccent} />
            ) : (
              <Text style={[styles.shareBtnText, { color: C.onAccent }]}>
                {isPro ? t.shareBtn : `🔒 ${t.shareBtn}`}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radii.xxl,
    borderTopRightRadius: Radii.xxl,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    maxHeight: '92%',
    alignSelf: 'center', width: '100%', maxWidth: 480,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
  },
  closeBtn: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 18,
    fontFamily: FontFamily.semiBold,
  },
  scrollContent: {
    gap: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  previewContainer: {
    // margin/scale are computed per-render from useWindowDimensions and applied inline
    alignSelf: 'center',
  },
  shareBtn: {
    marginTop: Spacing.sm,
    paddingVertical: 16,
    borderRadius: Radii.pill,
    alignItems: 'center',
  },
  shareBtnDisabled: {
    opacity: 0.65,
  },
  shareBtnText: {
    fontSize: 16,
    fontFamily: FontFamily.extraBold,
    letterSpacing: 0.2,
  },
});
