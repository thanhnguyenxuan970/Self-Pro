import React from 'react';
import Svg, { G, Path, Text, TSpan } from 'react-native-svg';
import { useTheme } from '../hooks/useSettings';
import { useSettingsContext } from '../contexts/SettingsContext';
import { getColors } from '../config/theme';

type Props = {
  width?: number;
  height?: number;
};

export function Wordmark({ width = 200, height = 62 }: Props) {
  const { colors, isDark } = useTheme();
  const inkColor = isDark ? '#E8EDE9' : '#16201B';

  return (
    <Svg width={width} height={height} viewBox="0 0 640 200">
      <G transform="translate(72,100) scale(0.56) translate(-100,-100)">
        <Path
          d="M100,44 A56,56 0 1 1 44,100"
          fill="none"
          stroke={colors.primary}
          strokeWidth="22"
          strokeLinecap="round"
        />
        <Path
          d="M76,103 L94,121 L126,83"
          fill="none"
          stroke={colors.primary}
          strokeWidth="15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
      <Text
        x="150"
        y="124"
        fontFamily="Poppins Medium, Poppins, sans-serif"
        fontSize="74"
        letterSpacing="-1"
      >
        <TSpan fill={inkColor}>{'habit '}</TSpan>
        <TSpan fill={colors.primary}>ring</TSpan>
      </Text>
    </Svg>
  );
}
