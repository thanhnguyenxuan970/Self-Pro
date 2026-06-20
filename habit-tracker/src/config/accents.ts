export type AccentKey = 'green' | 'indigo' | 'rose' | 'sky' | 'violet';

export type AccentPalette = {
  swatch: string;
  onAccent: string;
  light: { primary: string; primaryHover: string; primaryPress: string; primarySoft: string };
  dark:  { primary: string; primaryHover: string; primaryPress: string; primarySoft: string };
};

export const ACCENTS: Record<AccentKey, AccentPalette> = {
  green: {
    swatch: '#25B36E',
    onAccent: '#FFFFFF',
    light: { primary: '#25B36E', primaryHover: '#1E9B5E', primaryPress: '#177A49', primarySoft: '#C6E9D5' },
    dark:  { primary: '#25B36E', primaryHover: '#1E9B5E', primaryPress: '#5EC69A', primarySoft: '#1A3D2E' },
  },
  indigo: {
    swatch: '#6366F1',
    onAccent: '#FFFFFF',
    light: { primary: '#6366F1', primaryHover: '#4F46E5', primaryPress: '#3730A3', primarySoft: '#E0E7FF' },
    dark:  { primary: '#818CF8', primaryHover: '#6366F1', primaryPress: '#A5B4FC', primarySoft: '#1E1B4B' },
  },
  rose: {
    swatch: '#F43F5E',
    onAccent: '#FFFFFF',
    light: { primary: '#E11D48', primaryHover: '#BE123C', primaryPress: '#9F1239', primarySoft: '#FFE4E6' },
    dark:  { primary: '#FB7185', primaryHover: '#F43F5E', primaryPress: '#FDA4AF', primarySoft: '#4C0519' },
  },
  sky: {
    swatch: '#0EA5E9',
    onAccent: '#FFFFFF',
    light: { primary: '#0284C7', primaryHover: '#0369A1', primaryPress: '#075985', primarySoft: '#E0F2FE' },
    dark:  { primary: '#38BDF8', primaryHover: '#0EA5E9', primaryPress: '#7DD3FC', primarySoft: '#0C2A3E' },
  },
  violet: {
    swatch: '#8B5CF6',
    onAccent: '#FFFFFF',
    light: { primary: '#7C3AED', primaryHover: '#6D28D9', primaryPress: '#5B21B6', primarySoft: '#EDE9FE' },
    dark:  { primary: '#A78BFA', primaryHover: '#8B5CF6', primaryPress: '#C4B5FD', primarySoft: '#2E1065' },
  },
};

export const DEFAULT_ACCENT: AccentKey = 'green';
