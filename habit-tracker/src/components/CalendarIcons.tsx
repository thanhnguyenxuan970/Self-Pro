import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

function useFlame() {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.22, duration: 90, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.88, duration: 75, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.18, duration: 110, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.85, duration: 85, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.25, duration: 100, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.92, duration: 95, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.1, duration: 120, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.0, duration: 130, useNativeDriver: true }),
      ])
    ).start();
  }, [scale]);
  return scale;
}

function useTwinkle(delay = 0) {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.2, duration: 350, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1.0, duration: 200, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.55, duration: 250, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1.0, duration: 400, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.2, duration: 350, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.85, duration: 250, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1.1, duration: 300, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1.0, duration: 300, useNativeDriver: true }),
          ]),
        ])
      ).start();
    }, delay);
    return () => clearTimeout(t);
  }, [opacity, scale]);
  return { opacity, scale };
}

export function AnimatedFireIcon({ size = 12 }: { size?: number }) {
  const scale = useFlame();
  return (
    <Animated.Text style={{ fontSize: size, transform: [{ scale }] }}>
      {'🔥'}
    </Animated.Text>
  );
}

export function AnimatedStarIcon({ size = 12 }: { size?: number }) {
  const { opacity, scale } = useTwinkle(200);
  return (
    <Animated.Text style={{ fontSize: size, opacity, transform: [{ scale }] }}>
      {'⭐'}
    </Animated.Text>
  );
}

export function AnimatedBurningStarIcon({ size = 12 }: { size?: number }) {
  const flameScale = useFlame();
  const { opacity } = useTwinkle(0);
  return (
    <Animated.Text style={{ fontSize: size, opacity, transform: [{ scale: flameScale }] }}>
      {'🌟'}
    </Animated.Text>
  );
}
