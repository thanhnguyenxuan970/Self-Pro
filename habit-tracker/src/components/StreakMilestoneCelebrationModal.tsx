import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontFamily, Radii, type AppColors } from '../config/theme';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useTheme, useTranslations } from '../hooks/useSettings';
import type { StreakMilestone } from '../game/streakMilestones';

const CONFETTI = ['#A78BFA', '#60A5FA', '#2DD4BF', '#F472B6', '#FB923C', '#F4C842', '#25B36E', '#E0A93B'];
const CONFETTI_COUNT = 24;
const GLOW_SIZE = 390;

export function StreakMilestoneCelebrationModal({ milestone, onDismiss }: { milestone: StreakMilestone | null; onDismiss: () => void }) {
  const { colors } = useTheme();
  const t = useTranslations();
  const reduceMotion = useReduceMotion();
  const { bottom } = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, bottom), [colors, bottom]);
  const backdrop = useRef(new Animated.Value(0)).current;
  const hero = useRef(new Animated.Value(0)).current;
  const numeral = useRef(new Animated.Value(0)).current;
  const flame = useRef(new Animated.Value(0)).current;
  const confettiValues = useRef(Array.from({ length: CONFETTI_COUNT }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (!milestone) return;
    [backdrop, hero, numeral, flame, ...confettiValues].forEach(value => value.setValue(0));
    if (reduceMotion) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 150, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(hero, { toValue: 1, duration: 150, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(numeral, { toValue: 1, duration: 150, easing: Easing.ease, useNativeDriver: true }),
      ]).start();
      return;
    }
    const entrance = Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 250, easing: Easing.ease, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(hero, { toValue: 1.06, duration: 240, easing: Easing.bezier(0.34, 1.56, 0.64, 1), useNativeDriver: true }),
        Animated.timing(hero, { toValue: 1, duration: 100, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(60),
        Animated.timing(numeral, { toValue: 1, duration: 300, easing: Easing.bezier(0.34, 1.56, 0.64, 1), useNativeDriver: true }),
      ]),
    ]);
    const flameLoop = Animated.loop(Animated.sequence([
      Animated.timing(flame, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(flame, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const confettiLoops = confettiValues.map((value, index) => Animated.loop(Animated.sequence([
      Animated.delay((index % 8) * 140),
      Animated.timing(value, { toValue: 1, duration: 1700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ])));
    entrance.start();
    flameLoop.start();
    confettiLoops.forEach(loop => loop.start());
    return () => { entrance.stop(); flameLoop.stop(); confettiLoops.forEach(loop => loop.stop()); };
  }, [confettiValues, milestone, reduceMotion]);

  if (!milestone) return null;
  const visible = milestone !== null;
  const heroScale = reduceMotion ? hero : hero.interpolate({ inputRange: [0, 1.06], outputRange: [0.6, 1.06] });
  const flameStyle = { transform: [{ translateY: flame.interpolate({ inputRange: [0, 1], outputRange: [0, -9] }) }, { rotate: flame.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '3deg'] }) }] };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent navigationBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]} accessibilityViewIsModal>
        {!reduceMotion && confettiValues.map((value, index) => {
          const angle = (index / CONFETTI_COUNT) * Math.PI * 2;
          const distance = 68 + (index % 7) * 19;
          const translateX = Math.cos(angle) * distance;
          const translateY = Math.sin(angle) * distance;
          const progress = value.interpolate({ inputRange: [0, 0.12, 0.68, 1], outputRange: [0, 1, 1, 0] });
          return <Animated.View key={index} style={[styles.confetti, {
            backgroundColor: CONFETTI[index % CONFETTI.length],
            width: 6 + (index % 8), height: 6 + (index % 8), borderRadius: index % 3 === 0 ? 2 : 99,
            opacity: progress,
            transform: [{ translateX: value.interpolate({ inputRange: [0, 1], outputRange: [0, translateX] }) }, { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, translateY] }) }, { scale: value }],
          }]} />;
        })}
        <Animated.View style={[styles.hero, { opacity: hero.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }), transform: [{ scale: heroScale }] }]}>
          <View style={styles.iconStage}>
            <Animated.Text style={[styles.flame, flameStyle]}>🔥</Animated.Text>
            <View style={styles.numeralStage}>
              <Svg pointerEvents="none" width={GLOW_SIZE} height={GLOW_SIZE} style={styles.glow}>
                <Defs>
                  <RadialGradient id="streak-milestone-glow" cx="50%" cy="50%" r="50%">
                    <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.2} />
                    <Stop offset="62%" stopColor={colors.primary} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#streak-milestone-glow)" />
              </Svg>
              <Animated.Text style={[styles.numeral, { transform: [{ scale: numeral.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }]}>{milestone.days}</Animated.Text>
            </View>
          </View>
          <Text style={styles.eyebrow}>{t.streakMilestoneEyebrow}</Text>
          <Text style={styles.headline}>{t.streakMilestoneHeadline(milestone.days)}</Text>
          <View style={styles.boostChip}>
            <Text style={styles.boostText}>{t.streakMilestoneBoost(milestone.multiplier)}</Text>
          </View>
        </Animated.View>
        <TouchableOpacity style={styles.cta} onPress={onDismiss} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t.streakMilestoneCta}>
          <Text style={[styles.ctaText, { color: colors.onAccent }]}>{t.streakMilestoneCta}</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

function makeStyles(C: AppColors, bottom: number) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: C.bgBase, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 30 },
    iconStage: { position: 'relative', width: '100%', height: 190, alignItems: 'center', justifyContent: 'center' },
    numeralStage: { position: 'relative', width: GLOW_SIZE, height: 108, alignItems: 'center', justifyContent: 'center' },
    glow: { position: 'absolute', left: 0, top: '50%', marginTop: -GLOW_SIZE / 2, transform: [{ scaleX: 1.25 }] },
    confetti: { position: 'absolute', top: '42%', left: '50%' },
    hero: { alignItems: 'center', width: '100%' },
    flame: { fontSize: 58, marginBottom: 8 },
    numeral: { color: C.primaryText, fontFamily: FontFamily.extraBold, fontSize: 128, lineHeight: 108, letterSpacing: -6, includeFontPadding: false },
    eyebrow: { color: C.muted, fontFamily: FontFamily.extraBold, fontSize: 15, letterSpacing: 2, marginTop: 10, textAlign: 'center' },
    headline: { color: C.inkDark, fontFamily: FontFamily.extraBold, fontSize: 21, lineHeight: 28, letterSpacing: -0.3, marginTop: 22, textAlign: 'center' },
    boostChip: { backgroundColor: C.primarySoft, borderRadius: Radii.pill, marginTop: 16, paddingHorizontal: 18, paddingVertical: 8 },
    boostText: { color: C.primaryText, fontFamily: FontFamily.extraBold, fontSize: 16, lineHeight: 20, includeFontPadding: false },
    cta: { position: 'absolute', left: 26, right: 26, bottom: Math.max(30, bottom + 12), minHeight: 54, borderRadius: Radii.md, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
    ctaText: { fontFamily: FontFamily.extraBold, fontSize: 16 },
  });
}
