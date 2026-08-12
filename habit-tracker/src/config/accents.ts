export type AccentKey = 'green' | 'indigo' | 'rose' | 'sky' | 'violet' | 'honey';

export type AccentPalette = {
  swatch: string;
  // Ink color for text/icons painted on top of this accent's `primary` fill,
  // computed per light/dark theme (the same accent's primary differs between
  // themes, so a single flat value can't clear 4.5:1 in both). Values are
  // either white or the app's dark-ink stopgap (#141816, the same value
  // StreakMilestoneCelebrationModal/BadgeUnlockCelebration used as a
  // per-component workaround before this token existed), whichever clears
  // WCAG AA against that theme's actual primary hex.
  onAccent: { light: string; dark: string };
  light: { primary: string; primaryHover: string; primaryPress: string; primarySoft: string };
  dark:  { primary: string; primaryHover: string; primaryPress: string; primarySoft: string };
};

export const ACCENTS: Record<AccentKey, AccentPalette> = {
  green: {
    swatch: '#25B36E',
    onAccent: { light: '#FFFFFF', dark: '#141816' }, // white clears 4.53:1 on the light fill; dark ink clears 6.61:1
    light: { primary: '#1A8752', primaryHover: '#14663C', primaryPress: '#0F5231', primarySoft: '#C6E9D5' },
    dark:  { primary: '#25B36E', primaryHover: '#1E9B5E', primaryPress: '#5EC69A', primarySoft: '#1A3D2E' },
  },
  indigo: {
    swatch: '#6366F1',
    onAccent: { light: '#FFFFFF', dark: '#141816' },
    light: { primary: '#5B5FEA', primaryHover: '#4F46E5', primaryPress: '#3730A3', primarySoft: '#E0E7FF' },
    dark:  { primary: '#818CF8', primaryHover: '#6366F1', primaryPress: '#A5B4FC', primarySoft: '#1E1B4B' },
  },
  rose: {
    swatch: '#F43F5E',
    onAccent: { light: '#FFFFFF', dark: '#141816' }, // light: white clears 4.70:1; dark: ink clears 6.66:1
    light: { primary: '#E11D48', primaryHover: '#BE123C', primaryPress: '#9F1239', primarySoft: '#FFE4E6' },
    dark:  { primary: '#FB7185', primaryHover: '#F43F5E', primaryPress: '#FDA4AF', primarySoft: '#4C0519' },
  },
  sky: {
    swatch: '#0EA5E9',
    onAccent: { light: '#FFFFFF', dark: '#141816' },
    light: { primary: '#0277BD', primaryHover: '#0369A1', primaryPress: '#075985', primarySoft: '#E0F2FE' },
    dark:  { primary: '#38BDF8', primaryHover: '#0EA5E9', primaryPress: '#7DD3FC', primarySoft: '#0C2A3E' },
  },
  violet: {
    swatch: '#8B5CF6',
    onAccent: { light: '#FFFFFF', dark: '#141816' }, // light: white clears 5.70:1; dark: ink clears 6.58:1
    light: { primary: '#7C3AED', primaryHover: '#6D28D9', primaryPress: '#5B21B6', primarySoft: '#EDE9FE' },
    dark:  { primary: '#A78BFA', primaryHover: '#8B5CF6', primaryPress: '#C4B5FD', primarySoft: '#2E1065' },
  },
  honey: {
    swatch: '#F59E0B',
    onAccent: { light: '#141816', dark: '#141816' }, // white fails both themes (~1.44-3.19:1); ink clears 5.62-12.43:1
    light: { primary: '#D97706', primaryHover: '#B45309', primaryPress: '#92400E', primarySoft: '#FEF3C7' },
    dark:  { primary: '#FCD34D', primaryHover: '#F59E0B', primaryPress: '#FDE68A', primarySoft: '#451A03' },
  },
};

export const DEFAULT_ACCENT: AccentKey = 'green';
