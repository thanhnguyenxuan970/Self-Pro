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
  spark: '#E0A93B',
  flame: '#EF7A32',
  book: '#3B82F6',
  calcheck: '#12B0A6',
  mountain: '#5B7CB0',
  anchor: '#4F6BED',
  ringcheck: '#25B36E',
  clock: '#F2A93B',
  moon: '#6366F1',
  bolt: '#EAB308',
  target: '#E0453F',
  medal: '#B4793C',
  aura: '#8B5CF6',
  constellation: '#38BDF8',
  crown: '#E0A93B',
  chevrons: '#A855F7',
};

export const EMBLEM_PATH: Record<Emblem, string> = {
  sprout: 'M16 27V16 M16 16c-4.5 0-8-3.5-8-8 4.5 0 8 3.5 8 8zm0 0c0-5 4-9 9-9 0 5-4 9-9 9z', spark: 'M16 5l2.2 8.8L27 16l-8.8 2.2L16 27l-2.2-8.8L5 16l8.8-2.2z', flame: 'M16 4c2 5 7 7 7 13a7 7 0 0 1-14 0c0-4 2-6 4-9 0 3 1 4 3 5 1-3 0-6 0-9z M16 27v-5',
  book: 'M16 9c-3-2-6-3-10-2v16c4-1 7 0 10 2 3-2 6-3 10-2V7c-4-1-7 0-10 2z M16 9v16', calcheck: 'M6 8h20v19H6z M6 13h20 M11 5v6 M21 5v6 M11 20l3 3 7-7', mountain: 'M4 25l9-13 4 6 4-8 7 15 M17 18l2-3 2 3', anchor: 'M16 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M16 11v16 M9 13h14 M5 18c2 6 6 9 11 9s9-3 11-9 M8 24l-3-2 M24 24l3-2', ringcheck: 'M25 12a10 10 0 1 0 2 7 M8 9h.1 M12 17l3 3 7-7',
  clock: 'M16 5a11 11 0 1 0 0 22 11 11 0 0 0 0-22z M16 10v7l5 3', moon: 'M22 6a11 11 0 1 0 4 17A12 12 0 0 1 22 6z', bolt: 'M18 4L8 18h7l-1 10 10-15h-7z', target: 'M16 5a11 11 0 1 0 0 22 11 11 0 0 0 0-22z M16 10a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M16 15.5v1', medal: 'M11 5l5 7 5-7 M16 12a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M13 20l2 2 4-4', aura: 'M16 11a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M16 3v4 M16 25v4 M3 16h4 M25 16h4 M7 7l3 3 M22 22l3 3 M25 7l-3 3 M10 22l-3 3', constellation: 'M16 5l3 7 8 .5-6 5 2 8-7-4-7 4 2-8-6-5 8-.5z M8 10h.1 M24 12h.1 M21 23h.1 M11 23h.1 M16 5h.1', crown: 'M5 10l6 6 5-9 5 9 6-6-2 15H7z M7 25h18', chevrons: 'M8 11l8 7 8-7 M8 18l8 7 8-7',
};
