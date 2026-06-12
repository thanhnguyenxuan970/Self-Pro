import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity,
  Animated, StyleSheet, Dimensions,
} from 'react-native';
import { RankMascot } from './RankMascot';
import { RANKS } from '../config/ranks.config';
import { Radii, Spacing } from '../config/theme';
import { useTranslations } from '../hooks/useSettings';

const { width: W, height: H } = Dimensions.get('window');

const PARTICLE_COLORS = [
  '#A78BFA', '#818CF8', '#60A5FA', '#2DD4BF',
  '#F472B6', '#FB923C', '#F4C842', '#25B36E', '#E0A93B',
];
const N_PARTICLES = 30;

type Particle = {
  angle: number;
  dist: number;
  color: string;
  size: number;
  tx: Animated.Value;
  ty: Animated.Value;
  opacity: Animated.Value;
};

interface Props {
  visible: boolean;
  tierOrder: number;
  tierName: string;
  onDismiss: () => void;
}

export function LevelUpCelebrationModal({ visible, tierOrder, tierName, onDismiss }: Props) {
  const t = useTranslations();
  const cfg = RANKS[Math.min(Math.max(tierOrder - 1, 0), RANKS.length - 1)];

  const particlesRef = useRef<Particle[] | null>(null);
  if (!particlesRef.current) {
    particlesRef.current = Array.from({ length: N_PARTICLES }, (_, i) => ({
      angle: (i / N_PARTICLES) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
      dist: 70 + Math.random() * 130,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      size: 5 + Math.random() * 8,
      tx: new Animated.Value(0),
      ty: new Animated.Value(0),
      opacity: new Animated.Value(0),
    }));
  }
  const particles = particlesRef.current;

  const runningRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    runningRef.current = true;

    function burst() {
      if (!runningRef.current) return;
      particles.forEach(p => { p.tx.setValue(0); p.ty.setValue(0); p.opacity.setValue(1); });
      Animated.stagger(
        12,
        particles.map(p =>
          Animated.parallel([
            Animated.timing(p.tx, {
              toValue: Math.cos(p.angle) * p.dist,
              duration: 850,
              useNativeDriver: true,
            }),
            Animated.timing(p.ty, {
              toValue: Math.sin(p.angle) * p.dist,
              duration: 850,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.delay(280),
              Animated.timing(p.opacity, {
                toValue: 0,
                duration: 570,
                useNativeDriver: true,
              }),
            ]),
          ])
        )
      ).start(({ finished }) => {
        if (finished && runningRef.current) {
          setTimeout(burst, 450);
        }
      });
    }

    burst();
    return () => {
      runningRef.current = false;
      particles.forEach(p => {
        p.tx.stopAnimation();
        p.ty.stopAnimation();
        p.opacity.stopAnimation();
      });
    };
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.backdrop} onPress={onDismiss} activeOpacity={1}>
        {/* Firework particles — centered on screen */}
        {particles.map((p, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: W / 2 - p.size / 2,
              top: H / 2 - p.size / 2,
              width: p.size,
              height: p.size,
              borderRadius: p.size / 2,
              backgroundColor: p.color,
              opacity: p.opacity,
              transform: [{ translateX: p.tx }, { translateY: p.ty }],
            }}
          />
        ))}

        {/* Main celebration card */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          style={[styles.card, { borderColor: cfg.color + '99' }]}
        >
          <Text style={styles.fireworksEmoji}>🎉</Text>
          <Text style={[styles.levelUpTitle, { color: cfg.color }]}>{t.levelUpTitle}</Text>

          <View style={styles.mascotWrap}>
            <RankMascot tier={tierOrder - 1} size={88} loop reduceMotion={false} />
          </View>

          <Text style={styles.tierName}>{tierName}</Text>
          <Text style={[styles.descriptor, { color: cfg.color + 'CC' }]}>{cfg.descriptor}</Text>

          <Text style={styles.subtitle}>{t.levelUpSubtitle(tierName)}</Text>

          <TouchableOpacity
            style={[styles.dismissBtn, { backgroundColor: cfg.color }]}
            onPress={onDismiss}
            activeOpacity={0.85}
          >
            <Text style={styles.dismissBtnText}>{t.levelUpDismiss}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#141A17',
    borderRadius: Radii.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    marginHorizontal: 28,
    borderWidth: 1.5,
    maxWidth: 320,
    width: '100%',
  },
  fireworksEmoji: { fontSize: 48, marginBottom: 2 },
  levelUpTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: Spacing.md,
  },
  mascotWrap: { marginVertical: Spacing.sm },
  tierName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: Spacing.sm,
    letterSpacing: -0.5,
  },
  descriptor: {
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 4,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    color: '#8FA896',
    marginTop: Spacing.md,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: Spacing.sm,
  },
  dismissBtn: {
    marginTop: Spacing.lg,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: Radii.pill,
  },
  dismissBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
