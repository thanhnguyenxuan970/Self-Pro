import type { Tier, Emblem } from './achievements';

/** [hi, light, mid, dark, deep, edge, discHi, discMid, discLo] — metallic coin ramp per tier. */
export const TIER_COINS: Record<Tier, [string, string, string, string, string, string, string, string, string]> = {
  iron:     ['#ffffff', '#dfe6eb', '#a9b2bb', '#767f88', '#4c545c', '#cfd6dc', '#fbfdff', '#e4eaef', '#c3ccd3'],
  bronze:   ['#ffe6cb', '#edc188', '#cf8a44', '#9a5b20', '#6b3d12', '#d9a463', '#fcefd9', '#f0d6ac', '#e0bd87'],
  silver:   ['#ffffff', '#eef2f6', '#c1cbd4', '#8b96a0', '#5c666f', '#dbe1e7', '#ffffff', '#e9eef2', '#cfd6dd'],
  gold:     ['#fffdf2', '#fbe38a', '#e6b52e', '#b07d15', '#7f560a', '#f0cf6a', '#fffbe6', '#fbeaad', '#f2d574'],
  platinum: ['#ffffff', '#eaf6fa', '#bfdae4', '#8aabb8', '#5c7e8b', '#d3e7ee', '#ffffff', '#e6f2f6', '#cfe2e9'],
  diamond:  ['#f4feff', '#cef3fb', '#7fd6e8', '#37a7c3', '#217f9f', '#aae6f2', '#f0fdff', '#d3f4fb', '#a9e8f4'],
};

export const EMBLEM_TINT: Record<Emblem, string> = {
  sprout: '#3FB56E',
  book: '#C77A3A',
  flame: '#F2802E',
  flame2: '#EF5A2B',
  rankup: '#7A5CE0',
  crown: '#E0A93B',
  trophy: '#E0A93B',
  calcheck: '#2FA3E0',
};

export const EMBLEM_PATH: Record<Emblem, string> = {
  sprout: 'M12 21v-8 M12 13c0-2.8-2.2-5-5-5 0 2.8 2.2 5 5 5z M12 13c0-3.3 2.7-6 6-6 0 3.3-2.7 6-6 6z',
  book: 'M12 6.5C10.5 5.3 8.5 4.7 6 4.7c-1 0-1.8.1-2.5.3v13c.7-.2 1.5-.3 2.5-.3 2.5 0 4.5.6 6 1.8 1.5-1.2 3.5-1.8 6-1.8 1 0 1.8.1 2.5.3v-13c-.7-.2-1.5-.3-2.5-.3-2.5 0-4.5.6-6 1.8z M12 6.5v12.3',
  flame: 'M12 3c1.5 3 4.5 4.8 4.5 8.5A4.5 4.5 0 0 1 12 16a4.5 4.5 0 0 1-4.5-4.5C7.5 9 9 7.5 9 7.5s.5 1.5 1.5 2C11 8 11 5 12 3z M12 20.5c2.2 0 4-1.6 4-3.6 0-1.4-1-2.6-2-3.4.2 1.6-.8 2.6-2 2.6s-2.2-1-2-2.6c-1 .8-2 2-2 3.4 0 2 1.8 3.6 4 3.6z',
  flame2: 'M12 2c1.7 3.4 5 5.4 5 9.6A5 5 0 0 1 12 16.6a5 5 0 0 1-5-5C7 8.9 8.7 7.2 8.7 7.2s.6 1.7 1.7 2.2C11.6 8 11 4.4 12 2z M8 22h8 M12 16.6V22',
  rankup: 'M6 13l6-6 6 6 M6 18l6-6 6 6',
  crown: 'M4 8l3.5 4L12 6l4.5 6L20 8l-1.5 10H5.5z M5.5 18h13',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0z M8 5H5v1.5A3.5 3.5 0 0 0 8.5 10 M16 5h3v1.5A3.5 3.5 0 0 1 15.5 10 M10 14h4l-.5 3h-3z M8.5 20h7 M12 17v3',
  calcheck: 'M4.5 6.5h15v13h-15z M4.5 10h15 M8 4v4 M16 4v4 M9 15l2 2 4-4',
};
