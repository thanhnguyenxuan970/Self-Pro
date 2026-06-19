import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ACCENTS, AccentKey } from '../config/accents';
import { AppColors } from '../config/theme';

type Props = {
  accent: AccentKey;
  onSelect: (key: AccentKey) => void;
  colors: AppColors;
};

export function AccentPicker({ accent, onSelect, colors }: Props) {
  return (
    <View style={styles.row}>
      {(Object.keys(ACCENTS) as AccentKey[]).map((key) => {
        const isActive = accent === key;
        return (
          <TouchableOpacity
            key={key}
            activeOpacity={0.75}
            onPress={() => onSelect(key)}
            style={[
              styles.swatch,
              { backgroundColor: ACCENTS[key].swatch },
              isActive && { borderColor: colors.inkDark, borderWidth: 3 },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 2,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
});
