import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontFamily, Radii, Shadows, Spacing } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { boostPalette, type BoostPhase, type BoostSummary } from '../game/boost';
import type { TodayBoost } from '../queries/useToday';

type Props = {
  event: TodayBoost;
  phase: BoostPhase;
  summary?: BoostSummary;
  activatePending: boolean;
  dismissPending: boolean;
  onActivate: () => void;
  onDismiss: () => void;
};

export function BoostExperience({ event, phase, summary, activatePending, dismissPending, onActivate, onDismiss }: Props) {
  const { colors } = useTheme();
  const t = useTranslations();
  const reduceMotion = useReduceMotion();
  const { bottom } = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const palette = useMemo(() => boostPalette(colors), [colors]);
  const [sheetClosed, setSheetClosed] = useState(false);
  const sheetY = useRef(new Animated.Value(1)).current;
  const showSheet = phase === 'expired' && event.dismissed_at === null && !sheetClosed;
  const displaySummary = summary ?? { boostStars: 0, boostLogs: 0, baseStars: 0, bonusStars: 0, totalStars: 0 };

  useEffect(() => {
    setSheetClosed(false);
  }, [event.id]);

  useEffect(() => {
    if (!showSheet) {
      sheetY.setValue(1);
      return;
    }
    if (reduceMotion) {
      sheetY.setValue(0);
      return;
    }
    sheetY.setValue(1);
    const animation = Animated.spring(sheetY, { toValue: 0, tension: 120, friction: 14, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, showSheet, sheetY]);

  if (phase === 'none' || phase === 'active' || phase === 'expiring' || (phase === 'expired' && !showSheet)) return null;

  const dismissSheet = () => {
    setSheetClosed(true);
    onDismiss();
  };

  return (
    <>
      {phase === 'available' ? (
        <View style={[styles.claimCard, { borderColor: palette.border }]}>
          <Svg pointerEvents="none" style={styles.cardGlow} width="100%" height={130}>
            <Defs><RadialGradient id={`boost-claim-${event.id}`} cx="100%" cy="0%" r="90%"><Stop offset="0" stopColor={palette.fill} stopOpacity={0.28} /><Stop offset="1" stopColor={palette.fill} stopOpacity={0} /></RadialGradient></Defs>
            <Rect width="100%" height="100%" fill={`url(#boost-claim-${event.id})`} />
          </Svg>
          <View style={styles.claimTop}>
            <View style={[styles.multiplierTile, { backgroundColor: palette.fill }]}><Text style={[styles.multiplierTileText, { color: palette.ink }]}>{'\u00d7'}{event.multiplier}</Text></View>
            <View style={styles.claimCopy}>
              <Text style={[styles.eyebrow, { color: palette.border }]}>{t.boostAvailableEyebrow}</Text>
              <Text style={styles.claimTitle} numberOfLines={2}>{t.boostAvailableTitle(event.multiplier)}</Text>
              <Text style={styles.claimMeta} numberOfLines={1}>{t.boostAvailableWindow}</Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.claimButton, { backgroundColor: palette.fill }]} onPress={onActivate} disabled={activatePending} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t.boostActivateNow(event.multiplier)}>
            <Text style={[styles.claimButtonText, { color: palette.ink }]}>{t.boostActivateNow(event.multiplier)}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showSheet ? (
        <Modal visible transparent animationType="none" onRequestClose={dismissSheet} statusBarTranslucent navigationBarTranslucent>
          <View style={styles.modalRoot}>
            <TouchableOpacity style={styles.modalScrim} activeOpacity={1} onPress={dismissSheet} accessibilityRole="button" accessibilityLabel={t.close} />
            <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY.interpolate({ inputRange: [0, 1], outputRange: [0, 520] }) }] }]}>
              <ScrollView contentContainerStyle={{ paddingBottom: bottom + Spacing.lg }} showsVerticalScrollIndicator={false}>
              <View style={styles.grabber} />
              <View style={styles.sheetHeader}>
                <View style={styles.sheetCopy}>
                  <Text style={[styles.eyebrow, { color: colors.dangerText }]}>{t.boostEndedEyebrow}</Text>
                  <Text style={styles.sheetTitle} numberOfLines={2}>{t.boostEndedTitle}</Text>
                </View>
                <TouchableOpacity style={styles.closeButton} onPress={dismissSheet} disabled={dismissPending} accessibilityRole="button" accessibilityLabel={t.close}><Text style={styles.closeGlyph}>{'\u00d7'}</Text></TouchableOpacity>
              </View>
              <Text style={styles.summaryTotal}>{displaySummary.totalStars} <Text style={{ color: colors.starGold }}>{'\u2605'}</Text></Text>
              <Text style={styles.summaryLogs}>{t.boostBoostedLogs(displaySummary.boostLogs)}</Text>
              <View style={styles.breakdownBar}>
                <View style={[styles.baseSegment, { width: displaySummary.totalStars > 0 ? `${(displaySummary.baseStars / displaySummary.totalStars) * 100}%` : '0%' }]} />
                <View style={[styles.bonusSegment, { width: displaySummary.totalStars > 0 ? `${(displaySummary.bonusStars / displaySummary.totalStars) * 100}%` : '0%' }]} />
              </View>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.primary }]} /><Text style={styles.legendText}>{t.boostBaseStars(displaySummary.baseStars)}</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.starGold }]} /><Text style={styles.legendText}>{t.boostBonusStars(displaySummary.bonusStars, event.multiplier)}</Text></View>
              </View>
              <TouchableOpacity style={[styles.closeCta, { backgroundColor: colors.primary }]} onPress={dismissSheet} disabled={dismissPending} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t.close}>
                <Text style={[styles.closeCtaText, { color: colors.onAccent }]}>{t.close}</Text>
              </TouchableOpacity>
              </ScrollView>
            </Animated.View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    claimCard: { marginHorizontal: Spacing.lg, marginTop: 12, marginBottom: 12, padding: Spacing.md, borderRadius: Radii.lg, borderWidth: 1.5, backgroundColor: C.surface, ...Shadows.light, overflow: 'hidden' },
    cardGlow: { position: 'absolute', top: 0, right: 0 },
    claimTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    multiplierTile: { width: 52, height: 52, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center' },
    multiplierTileText: { fontSize: 20, fontFamily: FontFamily.extraBold },
    claimCopy: { flex: 1, minWidth: 0 },
    eyebrow: { fontSize: 11, letterSpacing: 1, fontFamily: FontFamily.extraBold },
    claimTitle: { color: C.inkDark, fontSize: 15, lineHeight: 21, fontFamily: FontFamily.extraBold, marginTop: 2 },
    claimMeta: { color: C.muted, fontSize: 11.5, fontFamily: FontFamily.semiBold, marginTop: 2 },
    claimButton: { minHeight: 44, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md },
    claimButtonText: { fontSize: 14, fontFamily: FontFamily.extraBold },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    modalScrim: { ...StyleSheet.absoluteFill, backgroundColor: C.scrim },
    sheet: { maxHeight: '85%', backgroundColor: C.surface, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, paddingHorizontal: Spacing.lg, paddingTop: 12, ...Shadows.medium },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.line2, marginBottom: Spacing.md },
    sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
    sheetCopy: { flex: 1, minWidth: 0 },
    sheetTitle: { color: C.inkDark, fontSize: 18, lineHeight: 25, fontFamily: FontFamily.extraBold, marginTop: 4 },
    closeButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
    closeGlyph: { color: C.muted, fontSize: 27, lineHeight: 29 },
    summaryTotal: { color: C.inkDark, fontSize: 46, lineHeight: 54, letterSpacing: -1.5, fontFamily: FontFamily.extraBold, textAlign: 'center', marginTop: 17 },
    summaryLogs: { color: C.muted, fontSize: 12, fontFamily: FontFamily.semiBold, textAlign: 'center', marginTop: 2 },
    breakdownBar: { height: 12, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', backgroundColor: C.surface3, marginTop: 20 },
    baseSegment: { height: '100%', backgroundColor: C.primary },
    bonusSegment: { height: '100%', backgroundColor: C.starGold },
    legendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.sm, marginTop: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { color: C.ink2, fontSize: 12, fontFamily: FontFamily.semiBold },
    closeCta: { minHeight: 52, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
    closeCtaText: { fontSize: 15, fontFamily: FontFamily.extraBold },
  });
}
