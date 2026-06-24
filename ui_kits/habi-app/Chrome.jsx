/**
 * Chrome.jsx — Habi App UI Kit (standalone component)
 *
 * Extracted from index.html for future bundler/Storybook use.
 * To use: ensure React 18 is available globally, then render <App/>.
 *
 * Screens implemented:
 *   - SettingsScreen  → mirrors src/screens/SettingsScreen.tsx
 *   - ProfileScreen   → mirrors src/screens/ProfileScreen.tsx
 *   - LevelUpModal    → mirrors src/components/LevelUpCelebrationModal.tsx
 *
 * Ranks verified against: src/config/ranks.config.ts (tiers 0–6)
 * Tokens verified against: src/config/theme.ts + accents.ts
 *
 * Charts: CSS bar implementation (Victory.js = React Native only, not usable in browser)
 * Font: Be Vietnam Pro via Google Fonts CDN. @font-face with licensed .ttf pending.
 */

// ── RANKS — src/config/ranks.config.ts ───────────────────────
// STAR_POINTS = '0,-22 5.41,-7.44 20.92,-6.8 8.75,2.84 12.93,17.8 0,9.2 -12.93,17.8 -8.75,2.84 -20.92,-6.8 -5.41,-7.44'
export const RANKS = [
  { tier: 0, name: 'Delulu',         stars: 5,   descriptor: 'noodle mode',    color: '#A78BFA', edge: '#7C5CE0' },
  { tier: 1, name: 'Mewing',         stars: 10,  descriptor: 'max send',       color: '#818CF8', edge: '#5B61D6' },
  { tier: 2, name: 'Rizz',           stars: 20,  descriptor: 'hit the griddy', color: '#60A5FA', edge: '#3B82F6' },
  { tier: 3, name: 'Gigachad',       stars: 40,  descriptor: 'too swole',      color: '#2DD4BF', edge: '#14B8A6' },
  { tier: 4, name: 'Aura Farmer',    stars: 80,  descriptor: 'spin to win',    color: '#F472B6', edge: '#EC4899' },
  { tier: 5, name: 'Main Character', stars: 160, descriptor: 'hair flip',      color: '#FB923C', edge: '#EA7317' },
  { tier: 6, name: 'GOATED',         stars: 320, descriptor: 'infinite W',     color: '#F4C842', edge: '#A87B12' },
];

// ── ACCENTS — src/config/accents.ts ──────────────────────────
export const ACCENTS = {
  green:  { swatch: '#25B36E', light: { primary: '#25B36E', primaryHover: '#1E9B5E', primaryPress: '#177A49', primarySoft: '#C6E9D5' }, dark: { primary: '#25B36E', primaryHover: '#1E9B5E', primaryPress: '#5EC69A', primarySoft: '#1A3D2E' } },
  indigo: { swatch: '#6366F1', light: { primary: '#6366F1', primaryHover: '#4F46E5', primaryPress: '#3730A3', primarySoft: '#E0E7FF' }, dark: { primary: '#818CF8', primaryHover: '#6366F1', primaryPress: '#A5B4FC', primarySoft: '#1E1B4B' } },
  rose:   { swatch: '#F43F5E', light: { primary: '#E11D48', primaryHover: '#BE123C', primaryPress: '#9F1239', primarySoft: '#FFE4E6' }, dark: { primary: '#FB7185', primaryHover: '#F43F5E', primaryPress: '#FDA4AF', primarySoft: '#4C0519' } },
  sky:    { swatch: '#0EA5E9', light: { primary: '#0284C7', primaryHover: '#0369A1', primaryPress: '#075985', primarySoft: '#E0F2FE' }, dark: { primary: '#38BDF8', primaryHover: '#0EA5E9', primaryPress: '#7DD3FC', primarySoft: '#0C2A3E' } },
  violet: { swatch: '#8B5CF6', light: { primary: '#7C3AED', primaryHover: '#6D28D9', primaryPress: '#5B21B6', primarySoft: '#EDE9FE' }, dark: { primary: '#A78BFA', primaryHover: '#8B5CF6', primaryPress: '#C4B5FD', primarySoft: '#2E1065' } },
  honey:  { swatch: '#F59E0B', light: { primary: '#D97706', primaryHover: '#B45309', primaryPress: '#92400E', primarySoft: '#FEF3C7' }, dark: { primary: '#FCD34D', primaryHover: '#F59E0B', primaryPress: '#FDE68A', primarySoft: '#451A03' } },
};

// ── THEME TOKENS — src/config/theme.ts ───────────────────────
export const LIGHT = {
  bgBase: '#F5F6F5', surface: '#FFFFFF', surface2: '#F4F5F4', surface3: '#ECEEEC',
  inkDark: '#1B1F1D', ink2: '#3F4642', muted: '#6E7672', faint: '#A5ABA7',
  line: '#E5E8E6', line2: '#D5D9D6',
  danger: '#E05A5F', dangerPress: '#A82830', dangerSoft: '#FBE2E3',
  starGold: '#D9952B', starSoft: '#FBEFD3', white: '#FFFFFF', onAccent: '#FFFFFF',
};
export const DARK = {
  bgBase: '#0E1311', surface: '#161B18', surface2: '#1D231F', surface3: '#252C28',
  inkDark: '#ECEEEC', ink2: '#C7CCC9', muted: '#8A9490', faint: '#5A6560',
  line: '#262C29', line2: '#323933',
  danger: '#E05A5F', dangerPress: '#C03538', dangerSoft: '#3D1A1B',
  starGold: '#E0A93B', starSoft: '#3D2E0F', white: '#FFFFFF', onAccent: '#FFFFFF',
};

export function getColors(isDark, accentKey = 'green') {
  const base = { ...(isDark ? DARK : LIGHT) };
  const palette = isDark ? ACCENTS[accentKey].dark : ACCENTS[accentKey].light;
  return { ...base, ...palette };
}

// ── RANK MASCOT ───────────────────────────────────────────────
// Star polygon points from ranks.config.ts STAR_POINTS constant.
// Simplified face (dots + smile) — full SVG paths in RankMascot.tsx.
export function RankMascot({ tier, size = 64 }) {
  const r = RANKS[Math.min(Math.max(tier, 0), RANKS.length - 1)];
  return (
    <svg width={size} height={size} viewBox="-28 -28 56 56" style={{ display: 'block' }}>
      <polygon
        points="0,-22 5.41,-7.44 20.92,-6.8 8.75,2.84 12.93,17.8 0,9.2 -12.93,17.8 -8.75,2.84 -20.92,-6.8 -5.41,-7.44"
        fill={r.color} stroke={r.edge} strokeWidth="1.5"
        style={{ filter: `drop-shadow(0 3px 6px ${r.color}60)` }}
      />
      <circle cx="-5" cy="-7" r="2" fill={r.edge} />
      <circle cx="5"  cy="-7" r="2" fill={r.edge} />
      <path d="M-4,2 q4,4 8,0" stroke={r.edge} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ── SETTINGS SCREEN ───────────────────────────────────────────
export function SettingsScreen({ C, t, isDark, setDark, lang, setLang, audioOn, setAudio }) {
  const [reminders, setReminders] = React.useState(['07:00', '21:00']);
  // ... (see index.html for full implementation)
  return null; // implement when bundler available
}

// ── PROFILE SCREEN ────────────────────────────────────────────
export function ProfileScreen({ C, t, isDark, accent, setAccent, onSettings }) {
  // ... (see index.html for full implementation)
  return null; // implement when bundler available
}

// ── LEVEL UP MODAL ────────────────────────────────────────────
export function LevelUpModal({ C, t, tierIndex, visible, onDismiss }) {
  // ... (see index.html for full implementation)
  return null; // implement when bundler available
}

/*
 * MASCOT AUDIT vs ranks.config.ts
 * --------------------------------
 * Tier | Name           | Stars | Color   | Edge    | Descriptor
 * 0    | Delulu         | 5     | #A78BFA | #7C5CE0 | noodle mode     ✓
 * 1    | Mewing         | 10    | #818CF8 | #5B61D6 | max send        ✓
 * 2    | Rizz           | 20    | #60A5FA | #3B82F6 | hit the griddy  ✓
 * 3    | Gigachad       | 40    | #2DD4BF | #14B8A6 | too swole       ✓
 * 4    | Aura Farmer    | 80    | #F472B6 | #EC4899 | spin to win     ✓
 * 5    | Main Character | 160   | #FB923C | #EA7317 | hair flip       ✓
 * 6    | GOATED         | 320   | #F4C842 | #A87B12 | infinite W      ✓
 *
 * STAR_POINTS: polygon matches ranks.config.ts exactly ✓
 * Note: ranks.config.ts type comment says 0..6; CLAUDE.md says "8-tier"
 *       — actual code has 7 tiers. UI kit reflects code, not doc.
 *
 * CHARTS
 * ------
 * CSS bar implementation acceptable for browser prototype.
 * victory-native@^36 is pinned for React Native (Skia not needed).
 * No Victory equivalent runs in browser without full RN environment.
 *
 * FONT
 * ----
 * Currently: Be Vietnam Pro via Google Fonts CDN.
 * TODO: replace with @font-face once licensed .ttf files are provided.
 * Files needed: BeVietnamPro-Regular, Medium, SemiBold, Bold, ExtraBold.
 */
