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
  limbs: string[];
  face: SvgEl[];
  anim: RankAnim;
  sfx: string;
  haptic: 'success' | 'heavy-success';
}

export const STAR_POINTS =
  '0,-22 5.41,-7.44 20.92,-6.8 8.75,2.84 12.93,17.8 0,9.2 -12.93,17.8 -8.75,2.84 -20.92,-6.8 -5.41,-7.44';

const FACE = (els: SvgEl[]): SvgEl[] => els;
const GOATED_TIER_ORDER = 7;
const GOATED_STARS = 320;

export const RANKS: Rank[] = [
  {
    tier: 0,
    name: 'Delulu',
    nameVi: 'Nhứt',
    stars: 5,
    descriptor: 'noodle mode',
    color: '#A78BFA',
    edge: '#7C5CE0',
    limbs: ['M-9,-8 Q-26,-4 -28,-22', 'M9,-8 Q26,-4 30,-20', 'M-6,14 Q-18,26 -22,18', 'M6,14 Q18,28 24,20'],
    face: FACE([
      { t: 'path', d: 'M-10,-7 q3,4 6,0', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'path', d: 'M2,-7 q3,4 6,0', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'ellipse', cx: 0, cy: 3, rx: 4, ry: 5, fill: '#2A2A2A' },
    ]),
    anim: { duration: 1400, loop: true, channels: {
      rotate: [[0, -18], [0.25, 14], [0.5, -10], [0.75, 16], [1, -18]],
      skewX: [[0, 8], [0.25, -10], [0.5, 12], [0.75, -8], [1, 8]],
      scaleY: [[0, 1], [0.25, 0.85], [0.5, 1.15], [0.75, 1], [1, 1]],
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
    limbs: ['M-10,14 Q-17,24 -11,28', 'M10,14 Q17,24 11,28', 'M-13,3 Q-23,8 -25,1', 'M13,3 Q23,8 25,1'],
    face: FACE([
      { t: 'path', d: 'M-10,-8 L-4,-6', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'path', d: 'M3,-6 L9,-8', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'path', d: 'M-3,3 q4,2 7,-1', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'path', d: 'M26,-17 h7 M29.5,-20.5 v7', stroke: '#F5EEFF', sw: 2, cap: 'round' },
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
    limbs: ['M-7,14 L-20,32', 'M7,14 L19,29', 'M-12,1 Q-26,0 -25,16', 'M12,0 Q26,8 31,16'],
    face: FACE([
      { t: 'circle', cx: -7, cy: -8, r: 2.2, fill: '#2A2A2A' },
      { t: 'path', d: 'M4,-8 h6', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'path', d: 'M-11,-14 h8', stroke: '#2A2A2A', sw: 3, cap: 'round' },
      { t: 'path', d: 'M-5,-1 q6,4 11,-2', stroke: '#2A2A2A', sw: 2, cap: 'round' },
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
    limbs: ['M-7,15 L-19,33', 'M7,15 L19,33', 'M-12,-4 Q-26,-6 -22,-20', 'M12,-4 Q26,-6 22,-20'],
    face: FACE([
      { t: 'circle', cx: -23, cy: -19, r: 6, fill: '#14B8A6' },
      { t: 'circle', cx: 23, cy: -19, r: 6, fill: '#14B8A6' },
      { t: 'path', d: 'M-10,-9 l5,3 l-5,3', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'path', d: 'M10,-9 l-5,3 l5,3', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'path', d: 'M-6,2 q6,4 12,0', stroke: '#2A2A2A', sw: 2.5, cap: 'round' },
    ]),
    anim: { duration: 1600, loop: true, channels: {
      scaleX: [[0, 1], [0.35, 1.05], [0.55, 1.45], [0.7, 1.5], [0.85, 0.92], [1, 1]],
      scaleY: [[0, 1], [0.35, 1.05], [0.55, 1.3], [0.7, 1.32], [0.85, 0.92], [1, 1]],
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
    limbs: ['M-7,14 Q-18,20 -24,15', 'M7,14 Q18,20 24,15', 'M-12,2 Q-25,0 -30,8', 'M12,2 Q25,0 30,8'],
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
    limbs: ['M2,15 L13,38', 'M-2,15 L-16,40', 'M11,0 L15,-34', 'M-12,0 Q-24,6 -29,-4'],
    face: FACE([
      { t: 'rect', x: -13, y: -10, width: 11, height: 6, fill: '#2A2A2A' },
      { t: 'rect', x: 2, y: -10, width: 11, height: 6, fill: '#2A2A2A' },
      { t: 'line', x1: -2, y1: -7.5, x2: 2, y2: -7.5, stroke: '#2A2A2A', sw: 2 },
      { t: 'path', d: 'M-4,2 q5,3 9,-1', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'path', d: 'M-8,-18 q-8,-9 -14,-7 M-4,-20 q-3,-10 -9,-13', stroke: '#EA7317', sw: 2.5, cap: 'round' },
      { t: 'circle', cx: 15, cy: -34, r: 5, fill: '#FB923C', stroke: '#EA7317', sw: 1.5 },
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
    limbs: ['M-6,14 Q-18,18 -14,28', 'M6,14 Q18,18 14,28', 'M-12,-4 L-26,-16', 'M12,-4 L26,-16'],
    face: FACE([
      { t: 'path', d: 'M-12,-23 L-12,-33 L-4,-27 L0,-36 L4,-27 L12,-33 L12,-23 Z', fill: '#FFE066', stroke: '#A87B12', sw: 1.5 },
      { t: 'circle', cx: -6, cy: -6, r: 2.2, fill: '#2A2A2A' },
      { t: 'circle', cx: 6, cy: -6, r: 2.2, fill: '#2A2A2A' },
      { t: 'path', d: 'M-7,-1 q7,7 14,0', stroke: '#2A2A2A', sw: 2, cap: 'round' },
    ]),
    anim: { duration: 1500, loop: true, channels: {
      translateY: [[0, 3], [0.2, 8], [0.45, -22], [0.7, -4], [0.85, 4], [1, 3]],
      rotate: [[0, 0], [0.45, -200], [0.7, -360], [1, -360]],
      scaleY: [[0, 1], [0.2, 0.85], [0.85, 0.92], [1, 1]],
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
    color: '#8B5CF6',
    edge: '#5B21B6',
    glow: '#8B5CF6',
    glowOpacity: 0.5,
    limbs: ['M-12,-4 Q-26,-10 -22,-24', 'M12,-4 Q26,-10 22,-24', 'M-7,15 L-17,35', 'M7,15 L17,35'],
    face: FACE([
      { t: 'path', d: 'M-16,-20 Q-25,-29 -20,-38 Q-12,-35 -10,-24 Z', fill: '#5B21B6' },
      { t: 'path', d: 'M16,-20 Q25,-29 20,-38 Q12,-35 10,-24 Z', fill: '#5B21B6' },
      { t: 'path', d: 'M-11,-13 q4,-3 8,0', stroke: '#2A2A2A', sw: 2.2, cap: 'round' },
      { t: 'path', d: 'M3,-13 q4,-3 8,0', stroke: '#2A2A2A', sw: 2.2, cap: 'round' },
      { t: 'circle', cx: -7, cy: -7, r: 2.8, fill: '#FDE047', stroke: '#2A2A2A', sw: 0.8 },
      { t: 'circle', cx: 7, cy: -7, r: 2.8, fill: '#FDE047', stroke: '#2A2A2A', sw: 0.8 },
      { t: 'path', d: 'M-4,4 q6,3 12,-2', stroke: '#2A2A2A', sw: 2, cap: 'round' },
    ]),
    anim: { duration: 1300, loop: true, channels: {
      translateY: [[0, 0], [0.25, -3], [0.5, 0], [0.75, -2], [1, 0]],
      rotate: [[0, -2.5], [0.25, 2.5], [0.5, -1.5], [0.75, 3], [1, -2.5]],
      scaleX: [[0, 1], [0.25, 1.04], [0.75, 1.05], [1, 1]],
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
    limbs: ['M-11,2 Q-25,-1 -27,-9', 'M11,2 Q25,-1 27,-9', 'M-6,15 Q-15,25 -5,27', 'M6,15 Q15,25 5,27'],
    face: FACE([
      { t: 'ellipse', cx: 0, cy: -30.5, rx: 15, ry: 4.6, stroke: '#E0A93B', sw: 2 },
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
