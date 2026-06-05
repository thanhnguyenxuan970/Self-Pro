// src/theme.ts

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
  faint: '#A5ABA7',
  starGold: '#E0A93B',
  starSoft: '#FBEFD3',
  danger: '#D74045',
  dangerSoft: '#FBE2E3',
  line: '#E5E8E6',
  line2: '#D5D9D6',
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
  faint: '#5A6560',
  starGold: '#E0A93B',
  starSoft: '#3D2E0F',
  danger: '#E05A5F',
  dangerSoft: '#3D1A1B',
  line: '#2B3028',
  line2: '#3A403C',
  white: '#FFFFFF',
};

export type AppColors = typeof Colors;

export function getColors(isDark: boolean): AppColors {
  return isDark ? DarkColors : Colors;
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

export const Typography = {
  title: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.5 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.7,
  },
  body: { fontSize: 14, lineHeight: 20 },
  bodyStrong: { fontSize: 14, fontWeight: '600' as const },
  caption: { fontSize: 12 },
  large: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -1 },
  xlarge: { fontSize: 42, fontWeight: '800' as const, letterSpacing: -2 },
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
    shadowColor: '#177A49',
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
