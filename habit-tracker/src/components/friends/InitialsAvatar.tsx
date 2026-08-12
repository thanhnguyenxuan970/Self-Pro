import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppColors, FontFamily } from '../../config/theme';
import { avatarPaletteSlot, initialsFromName } from '../../lib/friends';

const AVATAR_BG_KEYS = ['avatar0Bg', 'avatar1Bg', 'avatar2Bg', 'avatar3Bg', 'avatar4Bg', 'avatar5Bg'] as const;
const AVATAR_INK_KEYS = ['avatar0Ink', 'avatar1Ink', 'avatar2Ink', 'avatar3Ink', 'avatar4Ink', 'avatar5Ink'] as const;

type Props = {
  name: string | null;
  playerId: string;
  fallbackLabel: string;
  colors: AppColors;
  size?: number;
};

/**
 * Themed palette-slot initials circle. Purely decorative — every call site
 * renders this next to the person's name, so it's hidden from the
 * accessibility tree rather than read as a redundant "two letters" node.
 */
export function InitialsAvatar({ name, playerId, fallbackLabel, colors, size = 36 }: Props) {
  const slot = avatarPaletteSlot(playerId);
  const bg = colors[AVATAR_BG_KEYS[slot]];
  const ink = colors[AVATAR_INK_KEYS[slot]];
  const initials = initialsFromName(name, fallbackLabel);
  return (
    <View
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}
      importantForAccessibility="no"
      accessibilityElementsHidden
    >
      <Text style={[styles.initials, { color: ink, fontSize: Math.round(size * 0.36) }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: FontFamily.bold },
});
