// Habit Tracker +1% — Tailwind / NativeWind config
// Sage Green design system · Light + Dark · semantic tokens
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Sage Green scale (50 → 900)
        sage: {
          50:  '#EEF7F2', 100: '#D5EDE0', 200: '#ADDBC4',
          300: '#7DC4A1', 400: '#4FAC82', 500: '#2E9C6A',
          600: '#248057', 700: '#1E6646', 800: '#1A5039', 900: '#15402E',
        },
        // Semantic — Light
        bg:       { DEFAULT: '#F5F6F5', dark: '#0E1311' },
        surface:  { DEFAULT: '#FFFFFF', alt: '#F4F5F4', alt2: '#ECEEEC',
                    dark: '#161B18', 'dark-alt': '#1D231F', 'dark-alt2': '#252C28' },
        ink:      { DEFAULT: '#1B1F1D', '2': '#3F4642', muted: '#6E7672', faint: '#A5ABA7',
                    dark: '#ECEEEC', 'dark-2': '#C7CCC9', 'dark-muted': '#8B928F', 'dark-faint': '#5F6663' },
        line:     { DEFAULT: '#E5E8E6', '2': '#D5D9D6', dark: '#262C29', 'dark-2': '#323933' },
        primary:  { DEFAULT: '#2E9C6A', hover: '#248057', press: '#1E6646',
                    soft: '#DCEDE3', ink: '#1E6646',
                    dark: '#4FAC82', 'dark-hover': '#7DC4A1', 'dark-press': '#ADDBC4',
                    'dark-soft': '#1F3D2D', 'dark-ink': '#ADDBC4' },
        star:     { DEFAULT: '#D9952B', soft: '#FBEFD3', dark: '#F0BD5A', 'dark-soft': '#3A2F18' },
        danger:   { DEFAULT: '#D74045', soft: '#FBE2E3', dark: '#F26F73', 'dark-soft': '#3A1E20' },
        warning:  { DEFAULT: '#E0892B', dark: '#F0A248' },
      },
      borderRadius: {
        xs: 6, sm: 10, md: 14, lg: 18, xl: 22, '2xl': 26, pill: 999,
      },
      fontSize: {
        display: ['22px', { lineHeight: '26px', fontWeight: '800' }],
        title:   ['18px', { lineHeight: '22px', fontWeight: '700' }],
        body:    ['14px', { lineHeight: '20px' }],
        caption: ['12px', { lineHeight: '16px', fontWeight: '600' }],
        micro:   ['11px', { lineHeight: '14px', fontWeight: '700' }],
      },
      spacing: { 'safe-bottom': 34 },
    },
  },
  plugins: [],
};
