// src/theme.ts
import { AccentKey, ACCENTS, DEFAULT_ACCENT } from './accents';

export const Colors = {
  primary: '#25B36E',
  primaryHover: '#1E9B5E',
  primaryPress: '#177A49',
  primarySoft: '#C6E9D5',
  bgBase: '#F5F6F5',
  surface: '#FFFFFF',
  surface2: '#F4F5F4',
  surface3: '#ECEEEC',
  inkDark: '#1B1F1D',
  ink2: '#3F4642',
  muted: '#6E7672',
  faint: '#6B716D',
  starGold: '#E0A93B',
  heatmapGold1: '#F5C15A',
  heatmapGold2: '#EC9A29',
  heatmapGold3: '#D0740F',
  heatmapGold4: '#8F4E0C',
  starGoldText: '#8A6110',
  starGoldMuted: '#76672A',
  rewardCta: '#FFD54F',
  starSoft: '#FBEFD3',
  chartBar: '#E57D00',
  chartBarSoft: '#EAA061',
  danger: '#D74045',
  dangerPress: '#A82830',
  dangerSoft: '#FBE2E3',
  scrim: '#00000088',
  line: '#E5E8E6',
  line2: '#D5D9D6',
  onAccent: '#FFFFFF',
  white: '#FFFFFF',
};

export const DarkColors = {
  primary: '#25B36E',
  primaryHover: '#1E9B5E',
  primaryPress: '#5EC69A',
  primarySoft: '#1A3D2E',
  bgBase: '#0F1410',
  surface: '#1A1F1C',
  surface2: '#232820',
  surface3: '#2B3028',
  inkDark: '#E8EDE9',
  ink2: '#B5BDB7',
  muted: '#8A9490',
  faint: '#8A9490',
  starGold: '#E0A93B',
  heatmapGold1: '#F5C15A',
  heatmapGold2: '#F2A52B',
  heatmapGold3: '#D97C13',
  heatmapGold4: '#A25B0A',
  starGoldText: '#E0A93B',
  starGoldMuted: '#C9A227',
  rewardCta: '#FFD54F',
  starSoft: '#3D2E0F',
  chartBar: '#E57D00',
  chartBarSoft: '#EAA061',
  danger: '#E05A5F',
  dangerPress: '#C03538',
  dangerSoft: '#3D1A1B',
  scrim: '#00000088',
  line: '#2B3028',
  line2: '#3A403C',
  onAccent: '#FFFFFF',
  white: '#FFFFFF',
};

export type AppColors = typeof Colors & { primaryLine: string };

function withAlpha(hex: string, alphaHex: string): string {
  return `${hex}${alphaHex}`;
}

export function getColors(isDark: boolean, accent: AccentKey = DEFAULT_ACCENT): AppColors {
  const base = isDark ? DarkColors : Colors;
  const palette = ACCENTS[accent];
  const p = isDark ? palette.dark : palette.light;
  return { ...base, ...p, onAccent: palette.onAccent, primaryLine: withAlpha(p.primary, '55') };
}

export const Radii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 26,
  pill: 999,
};

export const FontFamily = {
  regular:   'BeVietnamPro_400Regular',
  medium:    'BeVietnamPro_500Medium',
  semiBold:  'BeVietnamPro_600SemiBold',
  bold:      'BeVietnamPro_700Bold',
  extraBold: 'BeVietnamPro_800ExtraBold',
};

export const Typography = {
  display:    { fontFamily: FontFamily.extraBold, fontSize: 48, letterSpacing: -1.5, lineHeight: 56 },
  xlarge:     { fontFamily: FontFamily.extraBold, fontSize: 42, letterSpacing: -2,   lineHeight: 50 },
  large:      { fontFamily: FontFamily.extraBold, fontSize: 32, letterSpacing: -1,   lineHeight: 40 },
  title:      { fontFamily: FontFamily.bold,      fontSize: 24, letterSpacing: -0.5, lineHeight: 30 },
  subheading: { fontFamily: FontFamily.semiBold,  fontSize: 18, letterSpacing: -0.2, lineHeight: 24 },
  body:       { fontFamily: FontFamily.regular,   fontSize: 15,                      lineHeight: 22 },
  bodyStrong: { fontFamily: FontFamily.semiBold,  fontSize: 15,                      lineHeight: 22 },
  secondary:  { fontFamily: FontFamily.regular,   fontSize: 13,                      lineHeight: 18 },
  caption:    { fontFamily: FontFamily.regular,   fontSize: 12,                      lineHeight: 17 },
  sectionLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    lineHeight: 17,
  },
};

export const Shadows = {
  light: {
    shadowColor: '#14231A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  medium: {
    shadowColor: '#14231A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  hero: {
    shadowColor: '#14231A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
};

export const Spacing = {
  xs: 6,
  sm: 10,
  md: 15,
  lg: 20,
  xl: 28,
};
