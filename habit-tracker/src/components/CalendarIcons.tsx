import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

function usePulse(delay = 0) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.35, duration: 550, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 550, useNativeDriver: true }),
        ]),
      ).start();
    }, delay);
    return () => clearTimeout(t);
  }, [scale]);
  return scale;
}

export function AnimatedFireIcon() {
  const scale = usePulse(0);
  return (
    <Animated.Text style={{ fontSize: 10, marginTop: 1, transform: [{ scale }] }}>
      {'🔥'}
    </Animated.Text>
  );
}

export function AnimatedStarIcon() {
  const scale = usePulse(200);
  return (
    <Animated.Text style={{ fontSize: 10, marginTop: 1, transform: [{ scale }] }}>
      {'⭐'}
    </Animated.Text>
  );
}

export function AnimatedBurningStarIcon() {
  const scale = usePulse(0);
  return (
    <Animated.Text style={{ fontSize: 10, marginTop: 1, transform: [{ scale }] }}>
      {'🌟'}
    </Animated.Text>
  );
}
