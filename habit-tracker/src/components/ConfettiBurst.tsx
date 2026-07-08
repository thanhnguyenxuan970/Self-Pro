import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useSettings';

/** Static (non-animated) decorative confetti chips scattered above a celebration
 *  hero. No motion at all, so there's nothing to gate on reduced-motion. */
export function ConfettiBurst() {
  const { colors: C } = useTheme();
  const chips = useMemo(() => {
    const palette = [C.primary, C.starGold, C.primarySoft, C.starSoft];
    return Array.from({ length: 14 }, (_, i) => ({
      key: i,
      left: `${(i * 37) % 100}%`,
      top: `${(i * 53) % 70}%`,
      rotate: `${(i * 47) % 360}deg`,
      color: palette[i % palette.length],
      size: 6 + (i % 3) * 3,
    }));
  }, [C]);

  return (
    <View style={styles.root} pointerEvents="none">
      {chips.map(chip => (
        <View
          key={chip.key}
          style={[
            styles.chip,
            {
              left: chip.left as any,
              top: chip.top as any,
              width: chip.size,
              height: chip.size,
              backgroundColor: chip.color,
              transform: [{ rotate: chip.rotate }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  chip: { position: 'absolute', borderRadius: 2 },
});
