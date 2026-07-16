import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RankMascot } from './RankMascot';
import { getRankConfigByTierOrder } from '../config/ranks.config';
import { AppColors, FontFamily, Radii, Spacing } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { shouldRunCelebrationBurst } from '../lib/rankPresentation';

interface Props {
  visible: boolean;
  tierOrder: number;
  tierName: string;
  weeklyStars?: number;
  onDismiss: () => void;
}

export function LevelUpCelebrationModal({ visible, tierOrder, tierName, weeklyStars, onDismiss }: Props) {
  const t = useTranslations();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reduceMotion = useReduceMotion();
  const cfg = getRankConfigByTierOrder(tierOrder);
  const rankLabel = t.rankNameMap[cfg.name] ?? tierName;
  const eyebrow = useRef(new Animated.Value(0)).current;
  const mascot = useRef(new Animated.Value(0)).current;
  const title = useRef(new Animated.Value(0)).current;
  const starChip = useRef(new Animated.Value(0)).current;
  const cta = useRef(new Animated.Value(0)).current;
  const waveOne = useRef(new Animated.Value(0)).current;
  const waveTwo = useRef(new Animated.Value(0)).current;
  const floatY = useRef(new Animated.Value(0)).current;
  const evolution = useRef(new Animated.Value(0)).current;
  const floatLoop = useRef<Animated.CompositeAnimation | null>(null);
  const [displayTier, setDisplayTier] = useState(Math.max(0, tierOrder - 2));

  useEffect(() => {
    if (!visible) return;
    const values = [eyebrow, mascot, title, starChip, cta, waveOne, waveTwo, floatY, evolution];
    values.forEach(value => value.setValue(0));
    setDisplayTier(Math.max(0, tierOrder - 2));
    if (!shouldRunCelebrationBurst(visible, reduceMotion)) {
      setDisplayTier(tierOrder - 1);
      [eyebrow, mascot, title, starChip, cta].forEach(value => value.setValue(1));
      return;
    }

    const rise = (value: Animated.Value, delay: number) => Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    const wave = (value: Animated.Value, delay: number) => Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    const swapTimer = setTimeout(() => setDisplayTier(tierOrder - 1), 1_850);
    const entrance = Animated.parallel([
      rise(eyebrow, 2_000),
      Animated.sequence([
        Animated.delay(1_850),
        Animated.spring(mascot, { toValue: 1, friction: 5, tension: 110, useNativeDriver: true }),
      ]),
      wave(waveOne, 2_050),
      wave(waveTwo, 2_280),
      rise(title, 2_180),
      rise(starChip, 2_420),
      rise(cta, 2_560),
      Animated.timing(evolution, { toValue: 1, duration: 2_050, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
    ]);
    entrance.start(({ finished }) => {
      if (!finished) return;
      floatLoop.current = Animated.loop(Animated.sequence([
        Animated.timing(floatY, { toValue: -5, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 5, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      floatLoop.current.start();
    });
    return () => {
      entrance.stop();
      floatLoop.current?.stop();
      clearTimeout(swapTimer);
    };
  }, [visible, reduceMotion, tierOrder]);

  const riseStyle = (value: Animated.Value) => ({
    opacity: value,
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  });
  const waveStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 0.72, 1], outputRange: [0, 0.45, 0] }),
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.5, 3.1] }) }],
  });
  const flashStyle = {
    opacity: evolution.interpolate({ inputRange: [0, 0.44, 0.66, 1], outputRange: [0, 0, 0.95, 0] }),
  };

  return (
    <Modal visible={visible} animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onDismiss}>
      <View style={styles.screen} accessibilityViewIsModal>
        <View style={[styles.wash, { backgroundColor: cfg.color }]} pointerEvents="none" />
        {!reduceMotion && <Animated.View pointerEvents="none" style={[styles.flash, flashStyle]} />}
        <Animated.View style={[styles.eyebrow, { backgroundColor: `${cfg.color}24` }, riseStyle(eyebrow)]}>
          <Text style={[styles.eyebrowText, { color: cfg.color }]}>✦ {t.levelUpTitle}</Text>
        </Animated.View>
        <View style={styles.mascotStage}>
          {!reduceMotion && <Animated.View style={[styles.wave, { borderColor: cfg.color }, waveStyle(waveOne)]} />}
          {!reduceMotion && <Animated.View style={[styles.wave, { borderColor: cfg.color }, waveStyle(waveTwo)]} />}
          <Animated.View style={{ transform: [
            { translateX: evolution.interpolate({ inputRange: [0, 0.22, 0.4, 1], outputRange: [0, 5, -5, 0] }) },
            { scale: mascot.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
            { translateY: floatY },
          ] }}>
            <RankMascot tier={displayTier} size={168} loop reduceMotion={reduceMotion} />
          </Animated.View>
        </View>
        <Animated.View style={[styles.copy, riseStyle(title)]}>
          <Text style={styles.rankName} numberOfLines={2}>{rankLabel}</Text>
          <Text style={[styles.descriptor, { color: cfg.color }]} numberOfLines={2}>{cfg.descriptor}</Text>
        </Animated.View>
        <Animated.View style={[styles.starChip, riseStyle(starChip)]}>
          <Text style={styles.starChipText}>{t.weekStars(Math.round(weeklyStars ?? cfg.stars))}</Text>
        </Animated.View>
        <Animated.View style={[styles.ctaWrap, riseStyle(cta)]}>
          <TouchableOpacity style={styles.cta} onPress={onDismiss} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={t.levelUpContinueCta}>
            <Text style={styles.ctaText}>{t.levelUpContinueCta}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#0F1410', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, overflow: 'hidden' },
    wash: { position: 'absolute', width: 420, height: 420, borderRadius: 210, top: '9%', opacity: 0.2 },
    flash: { ...StyleSheet.absoluteFill, backgroundColor: '#FFFFFF' },
    eyebrow: { borderRadius: Radii.pill, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 18 },
    eyebrowText: { fontFamily: FontFamily.extraBold, fontSize: 12, letterSpacing: 0.7 },
    mascotStage: { width: 220, height: 190, alignItems: 'center', justifyContent: 'center' },
    wave: { position: 'absolute', width: 84, height: 84, borderRadius: 42, borderWidth: 2 },
    copy: { alignItems: 'center', maxWidth: '100%' },
    rankName: { color: '#F5F6F5', fontFamily: FontFamily.extraBold, fontSize: 40, lineHeight: 47, letterSpacing: -1.8, textAlign: 'center' },
    descriptor: { fontFamily: FontFamily.semiBold, fontSize: 15, fontStyle: 'italic', marginTop: 5, textAlign: 'center' },
    starChip: { backgroundColor: `${C.starGold}24`, borderWidth: 1, borderColor: `${C.starGold}4D`, borderRadius: Radii.pill, marginTop: Spacing.lg, paddingHorizontal: 16, paddingVertical: 8 },
    starChipText: { color: C.starGold, fontFamily: FontFamily.extraBold, fontSize: 13 },
    ctaWrap: { alignSelf: 'stretch', marginTop: 30 },
    cta: { minHeight: 54, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
    ctaText: { color: C.onAccent, fontFamily: FontFamily.extraBold, fontSize: 16 },
  });
}
