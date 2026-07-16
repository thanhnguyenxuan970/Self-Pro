// Single source of truth for the rank system: thresholds, colors, pose geometry,
// per-tier animation keyframes, and bilingual rank labels.

export type Channel = [at: number, value: number][];

export interface RankAnim {
  duration: number;
  loop: boolean;
  channels: Partial<Record<
    'translateX' | 'translateY' | 'rotate' | 'scale' | 'scaleX' | 'scaleY' | 'skewX',
    Channel
  >>;
}

export interface SvgEl {
  t: 'path' | 'polygon' | 'circle' | 'rect' | 'ellipse' | 'line';
  d?: string;
  points?: string;
  cx?: number;
  cy?: number;
  r?: number;
  rx?: number;
  ry?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  fill?: string;
  stroke?: string;
  sw?: number;
  cap?: 'round' | 'butt';
  opacity?: number;
}

export interface Rank {
  tier: number; // 0-based index for UI animation/audio lookups
  name: string;
  nameVi: string;
  stars: number; // threshold to reach this rank
  descriptor: string;
  color: string;
  edge: string;
  glow?: string;
  glowOpacity?: number;
  band: 0 | 1 | 2 | 3 | 4;
  geometry: { outer: number; innerRatio: number; points?: number };
  back: SvgEl[];
  front: SvgEl[];
  bodyStyle?: 'flat' | 'luminous';
  face: SvgEl[];
  anim: RankAnim;
  sfx: string;
  haptic: 'success' | 'heavy-success';
}

export function starPoints(geometry: Rank['geometry']): string {
  const points: string[] = [];
  const count = geometry.points ?? 5;
  for (let index = 0; index < count * 2; index += 1) {
    const radius = index % 2 === 0 ? geometry.outer : geometry.outer * geometry.innerRatio;
    const angle = -Math.PI / 2 + index * Math.PI / count;
    points.push(`${(Math.cos(angle) * radius).toFixed(1)},${(Math.sin(angle) * radius).toFixed(1)}`);
  }
  return points.join(' ');
}

const FACE = (els: SvgEl[]): SvgEl[] => els;
const GOATED_TIER_ORDER = 7;
const GOATED_STARS = 320;

type BaseRank = Omit<Rank, 'band' | 'geometry' | 'back' | 'front' | 'bodyStyle'>;

const RANK_DATA: BaseRank[] = [
  {
    tier: 0,
    name: 'Delulu',
    nameVi: 'Nhứt',
    stars: 5,
    descriptor: 'noodle mode',
    color: '#A78BFA',
    edge: '#7C5CE0',
    face: FACE([
      { t: 'path', d: 'M-10,1 C-14,-3 -12,-7 -9,-4 C-6,-7 -3,-3 -7,1 Z', fill: '#F472B6' },
      { t: 'path', d: 'M10,1 C6,-3 8,-7 11,-4 C14,-7 17,-3 13,1 Z', fill: '#F472B6' },
      { t: 'path', d: 'M-6,7 q6,5 12,0', stroke: '#2A2540', sw: 2.4, cap: 'round' },
    ]),
    anim: { duration: 1900, loop: true, channels: {
      rotate: [[0, -7], [0.25, 6], [0.5, -5], [0.75, 7], [1, -7]],
      scaleY: [[0, 1], [0.25, 0.96], [0.5, 1.05], [1, 1]],
    }},
    sfx: 'delulu',
    haptic: 'success',
  },
  {
    tier: 1,
    name: 'Mewing',
    nameVi: 'Chuẩn',
    stars: 10,
    descriptor: 'max send',
    color: '#818CF8',
    edge: '#5B61D6',
    face: FACE([
      { t: 'line', x1: -14, y1: -2, x2: -6, y2: -2, stroke: '#2A2540', sw: 2.6, cap: 'round' },
      { t: 'line', x1: 6, y1: -2, x2: 14, y2: -2, stroke: '#2A2540', sw: 2.6, cap: 'round' },
      { t: 'path', d: 'M-6,8 q7,4 12,-2', stroke: '#2A2540', sw: 2.6, cap: 'round' },
    ]),
    anim: { duration: 2000, loop: true, channels: {
      rotate: [[0, -14], [0.5, -11], [1, -14]],
    }},
    sfx: 'mewing',
    haptic: 'success',
  },
  {
    tier: 2,
    name: 'Rizz',
    nameVi: 'Hào Quang',
    stars: 20,
    descriptor: 'hit the griddy',
    color: '#60A5FA',
    edge: '#3B82F6',
    face: FACE([
      { t: 'rect', x: -16, y: -7, width: 12, height: 8, fill: '#2A2540' },
      { t: 'rect', x: 4, y: -7, width: 12, height: 8, fill: '#2A2540' },
      { t: 'line', x1: -4, y1: -4, x2: 4, y2: -4, stroke: '#2A2540', sw: 2.4 },
      { t: 'path', d: 'M-6,9 q6,4 12,-2', stroke: '#2A2540', sw: 2.6, cap: 'round' },
    ]),
    anim: { duration: 550, loop: true, channels: {
      rotate: [[0, -7], [1, 7]],
      translateX: [[0, -3], [1, 3]],
    }},
    sfx: 'rizz',
    haptic: 'success',
  },
  {
    tier: 3,
    name: 'Gigachad',
    nameVi: 'Nét',
    stars: 40,
    descriptor: 'too swole',
    color: '#2DD4BF',
    edge: '#14B8A6',
    glow: '#2DD4BF',
    glowOpacity: 0.4,
    face: FACE([
      { t: 'path', d: 'M-15,-6 l9,3 M15,-6 l-9,3', stroke: '#2A2540', sw: 2.8, cap: 'round' },
      { t: 'circle', cx: -10, cy: -1, r: 2.2, fill: '#2A2540' },
      { t: 'circle', cx: 10, cy: -1, r: 2.2, fill: '#2A2540' },
      { t: 'rect', x: -8, y: 6, width: 16, height: 6, fill: '#2A2540' },
      { t: 'line', x1: -3, y1: 6, x2: -3, y2: 12, stroke: '#2DD4BF', sw: 1.4 },
      { t: 'line', x1: 3, y1: 6, x2: 3, y2: 12, stroke: '#2DD4BF', sw: 1.4 },
    ]),
    anim: { duration: 1700, loop: true, channels: {
      scale: [[0, 1], [0.35, 1.13], [0.55, 1.07], [0.85, 0.95], [1, 1]],
    }},
    sfx: 'gigachad',
    haptic: 'heavy-success',
  },
  {
    tier: 4,
    name: 'Aura Farmer',
    nameVi: 'Khao Khát Center',
    stars: 80,
    descriptor: 'spin to win',
    color: '#F472B6',
    edge: '#EC4899',
    glow: '#F472B6',
    glowOpacity: 0.4,
    face: FACE([
      { t: 'circle', cx: -6, cy: -6, r: 2, fill: '#2A2A2A' },
      { t: 'circle', cx: 6, cy: -6, r: 2, fill: '#2A2A2A' },
      { t: 'path', d: 'M-6,1 q6,5 12,0', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'line', x1: -33, y1: 0, x2: -25, y2: 0, stroke: '#F9A8D4', sw: 2, cap: 'round' },
      { t: 'line', x1: 33, y1: 0, x2: 25, y2: 0, stroke: '#F9A8D4', sw: 2, cap: 'round' },
      { t: 'line', x1: -24, y1: -24, x2: -18, y2: -18, stroke: '#F9A8D4', sw: 2, cap: 'round' },
      { t: 'line', x1: 24, y1: -24, x2: 18, y2: -18, stroke: '#F9A8D4', sw: 2, cap: 'round' },
      { t: 'line', x1: -24, y1: 24, x2: -18, y2: 18, stroke: '#F9A8D4', sw: 2, cap: 'round' },
      { t: 'line', x1: 24, y1: 24, x2: 18, y2: 18, stroke: '#F9A8D4', sw: 2, cap: 'round' },
      { t: 'line', x1: 0, y1: -33, x2: 0, y2: -25, stroke: '#F9A8D4', sw: 2, cap: 'round' },
      { t: 'line', x1: 0, y1: 33, x2: 0, y2: 25, stroke: '#F9A8D4', sw: 2, cap: 'round' },
    ]),
    anim: { duration: 1300, loop: true, channels: {
      translateY: [[0, 1], [0.5, -2], [1, 1]],
    }},
    sfx: 'aura-farmer',
    haptic: 'heavy-success',
  },
  {
    tier: 5,
    name: 'Main Character',
    nameVi: 'Hào Quang Nhân Vật Chính',
    stars: 160,
    descriptor: 'hair flip',
    color: '#FB923C',
    edge: '#EA7317',
    face: FACE([
      { t: 'path', d: 'M-10,-8 C-9,-4 -9,-4 -5,-3 C-9,-2 -9,-2 -10,2 C-11,-2 -11,-2 -15,-3 C-11,-4 -11,-4 -10,-8 Z', fill: '#2A2540' },
      { t: 'path', d: 'M10,-8 C11,-4 11,-4 15,-3 C11,-2 11,-2 10,2 C9,-2 9,-2 5,-3 C9,-4 9,-4 10,-8 Z', fill: '#2A2540' },
      { t: 'circle', cx: -18, cy: 5, r: 3, fill: '#EA7317', opacity: 0.45 },
      { t: 'circle', cx: 18, cy: 5, r: 3, fill: '#EA7317', opacity: 0.45 },
      { t: 'path', d: 'M-7,7 q7,6 14,0', stroke: '#2A2540', sw: 2.6, cap: 'round' },
    ]),
    anim: { duration: 1800, loop: true, channels: {
      translateY: [[0, 2], [0.5, -3], [1, 2]],
    }},
    sfx: 'main-character',
    haptic: 'heavy-success',
  },
  {
    tier: 6,
    name: 'GOATED',
    nameVi: 'Vượt Mức Pickleball',
    stars: 320,
    descriptor: 'infinite W',
    color: '#F4C842',
    edge: '#A87B12',
    glow: '#FFE066',
    glowOpacity: 0.4,
    face: FACE([
      { t: 'path', d: 'M-15,-5 l9,2 M15,-5 l-9,2', stroke: '#2A2540', sw: 2.8, cap: 'round' },
      { t: 'circle', cx: -10, cy: 0, r: 2.3, fill: '#2A2540' },
      { t: 'circle', cx: 10, cy: 0, r: 2.3, fill: '#2A2540' },
      { t: 'path', d: 'M-8,7 q8,7 16,0', stroke: '#2A2540', sw: 2.6, cap: 'round' },
    ]),
    anim: { duration: 2600, loop: true, channels: {
      translateY: [[0, 0], [0.3, -11], [0.5, 0], [0.7, -5], [1, 0]],
      rotate: [[0, 0], [0.7, 7], [0.84, 0], [1, 0]],
      scaleY: [[0, 1], [0.5, 0.93], [1, 1]],
    }},
    sfx: 'goated',
    haptic: 'heavy-success',
  },
  {
    tier: 7,
    name: 'Final Boss',
    nameVi: 'Trùm Cuối',
    stars: 640,
    descriptor: 'boss music on',
    color: '#6D28D9',
    edge: '#5B21B6',
    glow: '#8B5CF6',
    glowOpacity: 0.5,
    face: FACE([
      { t: 'path', d: 'M-15,-5 l9,3 M15,-5 l-9,3', stroke: '#2A2540', sw: 3, cap: 'round' },
      { t: 'path', d: 'M-14,0 q4,-3 8,0 M6,0 q4,-3 8,0', stroke: '#8B5CF6', sw: 3, cap: 'round' },
      { t: 'path', d: 'M-8,7 q8,6 16,0', stroke: '#2A2540', sw: 2.6, cap: 'round' },
      { t: 'path', d: 'M-4,9 l1.4,3 l1.4,-3 M1.2,9 l1.4,3 l1.4,-3', fill: '#FFFFFF' },
    ]),
    anim: { duration: 3600, loop: true, channels: {
      translateY: [[0, 0], [0.4, -5], [0.7, -2], [1, 0]],
      rotate: [[0, -1], [0.4, 0.5], [0.7, 1.5], [1, -1]],
      scale: [[0, 1], [0.4, 1.05], [0.7, 1.02], [1, 1]],
    }},
    sfx: 'final-boss',
    haptic: 'heavy-success',
  },
  {
    tier: 8,
    name: 'Ascended',
    nameVi: 'Đỉnh Của Chóp',
    stars: 1280,
    descriptor: 'god mode: on',
    color: '#F5EEFF',
    edge: '#C9A227',
    glow: '#E0A93B',
    glowOpacity: 0.6,
    face: FACE([
      { t: 'path', d: 'M-10,-7 q3,3 6,0', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'path', d: 'M2,-7 q3,3 6,0', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'circle', cx: -10, cy: -1, r: 2.1, fill: '#F9A8D4' },
      { t: 'circle', cx: 10, cy: -1, r: 2.1, fill: '#F9A8D4' },
      { t: 'path', d: 'M-6,4 q6,5 12,0', stroke: '#2A2A2A', sw: 2, cap: 'round' },
    ]),
    anim: { duration: 2600, loop: true, channels: {
      translateY: [[0, 2.5], [0.5, -4.5], [1, 2.5]],
      scaleX: [[0, 1], [0.5, 1.03], [1, 1]],
      scaleY: [[0, 1], [0.5, 1.03], [1, 1]],
    }},
    sfx: 'ascended',
    haptic: 'heavy-success',
  },
];

const BACK: Record<number, SvgEl[]> = {
  4: [
    { t: 'line', x1: -42, y1: 0, x2: -31, y2: 0, stroke: '#F9A8D4', sw: 2, cap: 'round' },
    { t: 'line', x1: 42, y1: 0, x2: 31, y2: 0, stroke: '#F9A8D4', sw: 2, cap: 'round' },
    { t: 'line', x1: 0, y1: -42, x2: 0, y2: -31, stroke: '#F9A8D4', sw: 2, cap: 'round' },
  ],
  5: [{ t: 'path', d: 'M0,-56 L-34,2 L34,2 Z', fill: '#FFFFFF', opacity: 0.12 }],
  6: [
    { t: 'path', d: 'M-29,15 q-11,-13 -4,-31 M29,15 q11,-13 4,-31', stroke: '#8FBF6B', sw: 3.4, cap: 'round' },
    { t: 'path', d: 'M-33,6 l-5,-2 M-32,-3 l-5,-2 M33,6 l5,-2 M32,-3 l5,-2', stroke: '#8FBF6B', sw: 2.4, cap: 'round' },
  ],
  7: [{ t: 'path', d: 'M-28,-6 q-12,26 2,44 L-10,26 Z M28,-6 q12,26 -2,44 L10,26 Z', fill: '#B91C1C', opacity: 0.85 }],
};

const FRONT: Record<number, SvgEl[]> = {
  0: [
    { t: 'path', d: 'M-20,-16 C-25,-20 -22,-25 -18,-21 C-14,-25 -11,-20 -16,-16 Z', fill: '#F9A8D4' },
    { t: 'path', d: 'M24,-20 C20,-25 26,-28 29,-23 C33,-26 37,-21 32,-18 Z', fill: '#F472B6' },
    { t: 'path', d: 'M24,2 C20,-2 26,-5 29,0 C33,-3 37,2 32,5 Z', fill: '#F9A8D4' },
  ],
  1: [
    { t: 'path', d: 'M-14,14 Q0,24 14,14', stroke: '#5B61D6', sw: 2.6, cap: 'round' },
    { t: 'path', d: 'M18,-12 q7,-1 9,-7 M20,-6 q8,0 11,-5', stroke: '#818CF8', sw: 2, cap: 'round', opacity: 0.8 },
  ],
  2: [
    { t: 'path', d: 'M24,-4 l-5,9 h4 l-3,8 l9,-11 h-4 l4,-6 Z', fill: '#60A5FA', stroke: '#3B82F6', sw: 0.8 },
    { t: 'path', d: 'M24,-27 C25,-21 25,-21 31,-20 C25,-19 25,-19 24,-13 C23,-19 23,-19 17,-20 C23,-21 23,-21 24,-27 Z', fill: '#FFFFFF' },
    { t: 'path', d: 'M-30,4 C-29,8 -29,8 -25,9 C-29,10 -29,10 -30,14 C-31,10 -31,10 -35,9 C-31,8 -31,8 -30,4 Z', fill: '#60A5FA' },
  ],
  3: [
    { t: 'path', d: 'M-40,-12 l-9,-4 M-42,0 l-9,0 M-40,12 l-9,4 M40,-12 l9,-4 M42,0 l9,0 M40,12 l9,4', stroke: '#14B8A6', sw: 2.6, cap: 'round' },
    { t: 'path', d: 'M0,-42 C1,-36 1,-36 7,-35 C1,-34 1,-34 0,-28 C-1,-34 -1,-34 -7,-35 C-1,-36 -1,-36 0,-42 Z', fill: '#2DD4BF' },
  ],
  5: [
    { t: 'path', d: 'M-30,-24 H30', stroke: '#FFFFFF', sw: 1.4, opacity: 0.5 },
    { t: 'path', d: 'M26,-28 C27,-21 27,-21 34,-20 C27,-19 27,-19 26,-12 C25,-19 25,-19 18,-20 C25,-21 25,-21 26,-28 Z', fill: '#FFFFFF' },
    { t: 'path', d: 'M-26,0 C-25,5 -25,5 -20,6 C-25,7 -25,7 -26,12 C-27,7 -27,7 -32,6 C-27,5 -27,5 -26,0 Z', fill: '#FFFFFF' },
  ],
  6: [{ t: 'path', d: 'M-12,-29 l2.5,-9 l5,5 l4.5,-8 l4.5,8 l5,-5 l2.5,9 Z', fill: '#FFE066', stroke: '#A87B12', sw: 1.6 }],
  7: [
    { t: 'path', d: 'M-15,-31 l3.5,-12 l5.5,7 l6,-11 l6,11 l5.5,-7 l3.5,12 Z', fill: '#2B1D46', stroke: '#8B5CF6', sw: 1.4 },
    { t: 'circle', cx: 0, cy: -38, r: 2, fill: '#EF4444' },
  ],
  8: [
    { t: 'ellipse', cx: 0, cy: -43, rx: 17, ry: 5.4, stroke: '#E0A93B', sw: 3 },
    { t: 'ellipse', cx: 0, cy: -43, rx: 17, ry: 5.4, stroke: '#FFFFFF', sw: 1, opacity: 0.6 },
    { t: 'line', x1: 0, y1: -48, x2: 0, y2: -55, stroke: '#E0A93B', sw: 1.4, cap: 'round' },
    { t: 'line', x1: 48, y1: 0, x2: 55, y2: 0, stroke: '#E0A93B', sw: 1.4, cap: 'round' },
    { t: 'line', x1: 0, y1: 48, x2: 0, y2: 55, stroke: '#E0A93B', sw: 1.4, cap: 'round' },
    { t: 'line', x1: -48, y1: 0, x2: -55, y2: 0, stroke: '#E0A93B', sw: 1.4, cap: 'round' },
  ],
};

export const RANKS: Rank[] = RANK_DATA.map((rank) => ({
  ...rank,
  band: Math.min(4, Math.floor(rank.tier / 2)) as Rank['band'],
  geometry: { outer: 26 + rank.tier * 1.5, innerRatio: 0.62 - rank.tier * 0.028 },
  back: BACK[rank.tier] ?? [],
  front: FRONT[rank.tier] ?? [],
  ...(rank.tier === 8 ? { bodyStyle: 'luminous' as const } : {}),
}));

export function getRankThreshold(tierOrder: number): number {
  if (tierOrder <= 0) return 0;
  if (tierOrder <= GOATED_TIER_ORDER) return RANKS[tierOrder - 1]?.stars ?? 0;
  return GOATED_STARS * 2 ** (tierOrder - GOATED_TIER_ORDER);
}

export function getRankConfigByTier(tier: number): Rank {
  return RANKS[Math.min(Math.max(tier, 0), RANKS.length - 1)];
}

export function getRankConfigByTierOrder(tierOrder: number): Rank {
  return getRankConfigByTier(tierOrder - 1);
}
