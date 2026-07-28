import React, { useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Dimensions, Alert,
} from 'react-native';
import { pickSquareImage } from '../utils/pickImage';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { ShareCard, CARD_W, CARD_H } from '../components/ShareCard';
import { FontFamily, Radii, Spacing } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useProStatus } from '../hooks/useProStatus';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BOTTOM_TAB_BAR_HEIGHT } from '../config/layout';

const { width: SCREEN_W } = Dimensions.get('window');
const PREVIEW_SCALE = (SCREEN_W - 48) / CARD_W;
const MARGIN_H = CARD_W * (PREVIEW_SCALE - 1) / 2;   // negative — shrinks layout
const MARGIN_V = CARD_H * (PREVIEW_SCALE - 1) / 2;   // negative — shrinks layout

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
  const { bottom } = useSafeAreaInsets();
  const { isPro } = useProStatus();
  const [beforeUri, setBeforeUri] = useState<string | undefined>();
  const [afterUri, setAfterUri] = useState<string | undefined>();
  const [capturing, setCapturing] = useState(false);
  const cardRef = useRef<View>(null);

  async function pickPhoto(slot: 'before' | 'after') {
    const uri = await pickSquareImage();
    if (!uri) return;
    if (slot === 'before') setBeforeUri(uri);
    else setAfterUri(uri);
  }

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
    setBeforeUri(undefined);
    setAfterUri(undefined);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.backdrop, { backgroundColor: C.scrim }]}>
        <View style={[styles.sheet, { backgroundColor: C.surface, paddingBottom: Spacing.xl + BOTTOM_TAB_BAR_HEIGHT + bottom }]}>
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
            <View style={styles.previewContainer}>
              <ShareCard
                ref={cardRef}
                streakCount={streakCount}
                daysDone={daysDone}
                percentile={percentile}
                topHabitName={topHabitName}
                weeklyStars={weeklyStars}
                tierName={tierName}
                beforeUri={beforeUri}
                afterUri={afterUri}
              />
            </View>

            {/* Photo pickers */}
            <View style={styles.photoPickerRow}>
              <TouchableOpacity
                style={[
                  styles.photoPickerBtn,
                  { backgroundColor: C.surface2, borderColor: beforeUri ? C.primary : C.line },
                ]}
                onPress={() => pickPhoto('before')}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={t.shareBefore}
              >
                <Text style={[styles.photoPickerIcon, { color: beforeUri ? C.primary : C.muted }]}>
                  {beforeUri ? '✓' : '📷'}
                </Text>
                <Text style={[styles.photoPickerLabel, { color: C.ink2 }]}>{t.shareBefore}</Text>
              </TouchableOpacity>

              <Text style={[styles.photoPickerArrow, { color: C.muted }]}>→</Text>

              <TouchableOpacity
                style={[
                  styles.photoPickerBtn,
                  { backgroundColor: C.surface2, borderColor: afterUri ? C.primary : C.line },
                ]}
                onPress={() => pickPhoto('after')}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={t.shareAfter}
              >
                <Text style={[styles.photoPickerIcon, { color: afterUri ? C.primary : C.muted }]}>
                  {afterUri ? '✓' : '📷'}
                </Text>
                <Text style={[styles.photoPickerLabel, { color: C.ink2 }]}>{t.shareAfter}</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.hint, { color: C.muted }]}>{t.sharePhotoHint}</Text>
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
              <ActivityIndicator color={C.white} />
            ) : (
              <Text style={[styles.shareBtnText, { color: C.white }]}>
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
    minWidth: 44,
    minHeight: 44,
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
    // negative margins absorb the layout space the transform leaves behind
    marginHorizontal: MARGIN_H,
    marginVertical: MARGIN_V,
    transform: [{ scale: PREVIEW_SCALE }],
    alignSelf: 'center',
  },
  photoPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    justifyContent: 'center',
  },
  photoPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
  },
  photoPickerIcon: {
    fontSize: 18,
  },
  photoPickerLabel: {
    fontSize: 14,
    fontFamily: FontFamily.semiBold,
  },
  photoPickerArrow: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
  },
  hint: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: 17,
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
