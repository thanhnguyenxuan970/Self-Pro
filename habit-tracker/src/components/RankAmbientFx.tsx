import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { getRankConfigByTier } from '../config/ranks.config';

type Props = { tier: number; size: number; reduceMotion: boolean };
const POSITIONS = [[0.14, 0.2], [0.72, 0.15], [0.82, 0.57], [0.2, 0.68], [0.5, 0.08], [0.5, 0.82]];

export function RankAmbientFx({ tier, size, reduceMotion }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const rank = getRankConfigByTier(tier);

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    if (reduceMotion) return;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration: [2200, 2000, 1100, 1500, 2200, 1800, 2600, 3600, 3000][rank.tier],
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [rank.tier, reduceMotion]);

  if (reduceMotion) return null;
  const item = (symbol: string, index: number, color = rank.glow ?? rank.color) => {
    const [left, top] = POSITIONS[index];
    const fall = tier === 0 || tier >= 6;
    return <Animated.Text key={`${symbol}-${index}`} pointerEvents="none" style={[styles.symbol, { left: left * size, top: top * size, color, fontSize: Math.max(11, size * 0.13), opacity: progress.interpolate({ inputRange: [0, 0.25, 0.8, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [fall ? size * 0.18 : 0, fall ? -size * 0.35 : 0] }) }, { scale: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.15, 0.7] }) }, { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', tier === 8 ? '360deg' : '24deg'] }) }] }]}>{symbol}</Animated.Text>;
  };
  const ring = (index: number) => <Animated.View key={`ring-${index}`} pointerEvents="none" style={[styles.ring, { width: size * 0.32, height: size * 0.32, borderRadius: size * 0.16, borderColor: rank.glow ?? rank.color, opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.5 + index * 0.3, 2.2 + index * 0.2] }) }] }]} />;
  const symbols = tier === 0 ? ['♥', '♥', '♥', '♥'] : tier === 1 ? ['—', '—', '—', '—'] : tier === 2 ? ['ϟ', 'ϟ', 'ϟ', 'ϟ'] : tier === 3 ? [] : tier === 4 ? ['●', '●', '●'] : tier === 5 ? ['✦', '✦', '✦', '✦'] : tier === 6 ? ['★', '★', '★', '★', '★', '★'] : tier === 7 ? ['·', '·', '·', '·', '·', '·'] : ['✦', '✦', '✦', '✦'];
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'visible' }]}>{tier === 3 ? [ring(0), ring(1)] : symbols.map((symbol, index) => item(symbol, index, tier === 7 ? '#C084FC' : undefined))}</View>;
}

const styles = StyleSheet.create({ symbol: { position: 'absolute', fontWeight: '900', textAlign: 'center' }, ring: { position: 'absolute', left: '34%', top: '34%', borderWidth: 1.5 } });
