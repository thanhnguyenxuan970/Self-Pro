// ranks.config.ts
// Single source of truth for the rank system: thresholds, colors, pose geometry,
// per-tier "absurd" animation keyframes, and sound/haptic mapping.
// Consumed by RankMascot.tsx — add or reorder ranks here, nothing else changes.

export type Channel = [at: number, value: number][]; // keyframe stops, at in 0..1

export interface RankAnim {
  duration: number;        // ms per loop
  loop: boolean;
  channels: Partial<Record<
    'translateX' | 'translateY' | 'rotate' | 'scale' | 'scaleX' | 'scaleY' | 'skewX',
    Channel
  >>;
}

export interface SvgEl {
  // minimal descriptor RankMascot maps to react-native-svg primitives
  t: 'path' | 'polygon' | 'circle' | 'rect' | 'ellipse' | 'line';
  d?: string; points?: string;
  cx?: number; cy?: number; r?: number; rx?: number; ry?: number;
  x?: number; y?: number; width?: number; height?: number;
  x1?: number; y1?: number; x2?: number; y2?: number;
  fill?: string; stroke?: string; sw?: number; cap?: 'round' | 'butt';
}

export interface Rank {
  tier: number;            // 0..6
  name: string;
  stars: number;           // threshold to reach this rank
  descriptor: string;
  color: string;           // body fill
  edge: string;            // limb + outline
  limbs: string[];         // path `d` strings, stroked in `edge`
  face: SvgEl[];           // eyes / mouth / extras (crown etc.)
  anim: RankAnim;          // looping "absurd" signature
  sfx: string;             // bundled audio asset key (see assets/sfx)
  haptic: 'success' | 'heavy-success'; // expo-haptics pattern
}

// shared star body (R22) — same silhouette for every rank
export const STAR_POINTS =
  '0,-22 5.41,-7.44 20.92,-6.8 8.75,2.84 12.93,17.8 0,9.2 -12.93,17.8 -8.75,2.84 -20.92,-6.8 -5.41,-7.44';

const FACE = (els: SvgEl[]): SvgEl[] => els;

export const RANKS: Rank[] = [
  {
    tier: 0, name: 'Delulu', stars: 5, descriptor: 'noodle mode',
    color: '#A78BFA', edge: '#7C5CE0',
    limbs: ['M-9,-8 Q-26,-4 -28,-22', 'M9,-8 Q26,-4 30,-20', 'M-6,14 Q-18,26 -22,18', 'M6,14 Q18,28 24,20'],
    face: FACE([
      { t: 'path', d: 'M-10,-7 q3,4 6,0', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'path', d: 'M2,-7 q3,4 6,0', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'ellipse', cx: 0, cy: 3, rx: 4, ry: 5, fill: '#2A2A2A' },
    ]),
    anim: { duration: 1400, loop: true, channels: {
      rotate: [[0, -18], [.25, 14], [.5, -10], [.75, 16], [1, -18]],
      skewX:  [[0, 8], [.25, -10], [.5, 12], [.75, -8], [1, 8]],
      scaleY: [[0, 1], [.25, .85], [.5, 1.15], [.75, 1], [1, 1]],
    }},
    sfx: 'delulu', haptic: 'success',
  },
  {
    tier: 1, name: 'Mewing', stars: 10, descriptor: 'max send',
    color: '#818CF8', edge: '#5B61D6',
    limbs: ['M-13,12 Q-20,20 -14,24', 'M13,12 Q20,20 14,24', 'M-12,0 L-20,-4', 'M12,0 L20,-4'],
    face: FACE([
      { t: 'path', d: 'M-9,-7 L-3,-5', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'path', d: 'M9,-7 L3,-5', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'circle', cx: 0, cy: 2, r: 3, fill: '#2A2A2A' },
    ]),
    anim: { duration: 2000, loop: true, channels: {
      translateY: [[0, 0], [.5, 4], [.62, -34], [.8, 0], [1, 0]],
      scaleY:     [[0, 1], [.5, .6], [.62, 1.4], [.8, .9], [1, 1]],
      scaleX:     [[0, 1], [.5, 1.3], [.62, .7], [.8, 1.1], [1, 1]],
    }},
    sfx: 'mewing', haptic: 'success',
  },
  {
    tier: 2, name: 'Rizz', stars: 20, descriptor: 'hit the griddy',
    color: '#60A5FA', edge: '#3B82F6',
    limbs: ['M-6,15 L-16,32', 'M6,15 L16,30', 'M-13,1 Q-24,-6 -28,-14', 'M13,-1 Q24,-8 28,-16'],
    face: FACE([
      { t: 'circle', cx: -7, cy: -8, r: 2.2, fill: '#2A2A2A' },
      { t: 'path', d: 'M4,-8 h6', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'path', d: 'M-5,-1 q6,4 11,-2', stroke: '#2A2A2A', sw: 2, cap: 'round' },
    ]),
    anim: { duration: 550, loop: true, channels: {
      rotate:     [[0, -7], [1, 7]],
      translateX: [[0, -3], [1, 3]],
    }},
    sfx: 'rizz', haptic: 'success',
  },
  {
    tier: 3, name: 'Gigachad', stars: 40, descriptor: 'too swole',
    color: '#2DD4BF', edge: '#14B8A6',
    limbs: ['M-7,15 L-19,33', 'M7,15 L19,33', 'M-12,-4 Q-26,-6 -22,-20', 'M12,-4 Q26,-6 22,-20'],
    face: FACE([
      { t: 'circle', cx: -23, cy: -19, r: 6, fill: '#14B8A6' },
      { t: 'circle', cx: 23, cy: -19, r: 6, fill: '#14B8A6' },
      { t: 'path', d: 'M-10,-9 l5,3 l-5,3', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'path', d: 'M10,-9 l-5,3 l5,3', stroke: '#2A2A2A', sw: 2, cap: 'round' },
      { t: 'path', d: 'M-6,2 q6,4 12,0', stroke: '#2A2A2A', sw: 2.5, cap: 'round' },
    ]),
    anim: { duration: 1600, loop: true, channels: {
      scaleX: [[0, 1], [.35, 1.05], [.55, 1.45], [.7, 1.5], [.85, .92], [1, 1]],
      scaleY: [[0, 1], [.35, 1.05], [.55, 1.3], [.7, 1.32], [.85, .92], [1, 1]],
    }},
    sfx: 'gigachad', haptic: 'heavy-success',
  },
  {
    tier: 4, name: 'Aura Farmer', stars: 80, descriptor: 'spin to win',
    color: '#F472B6', edge: '#EC4899',
    limbs: ['M-6,14 Q-16,22 -12,30', 'M6,14 Q16,22 12,30', 'M-12,1 L-24,-6', 'M12,1 L24,-6'],
    face: FACE([
      { t: 'circle', cx: -6, cy: -6, r: 2, fill: '#2A2A2A' },
      { t: 'circle', cx: 6, cy: -6, r: 2, fill: '#2A2A2A' },
      { t: 'path', d: 'M-6,1 q6,5 12,0', stroke: '#2A2A2A', sw: 2, cap: 'round' },
    ]),
    anim: { duration: 1300, loop: true, channels: {
      rotate: [[0, 0], [.45, 180], [.55, 200], [1, 360]],
      scaleX: [[0, 1], [.45, .7], [.55, .7], [1, 1]],
    }},
    sfx: 'aura-farmer', haptic: 'heavy-success',
  },
  {
    tier: 5, name: 'Main Character', stars: 160, descriptor: 'hair flip',
    color: '#FB923C', edge: '#EA7317',
    limbs: ['M2,15 L13,38', 'M-2,15 L-16,40', 'M11,0 Q24,-2 26,-14', 'M-12,0 Q-22,4 -26,-6'],
    face: FACE([
      { t: 'rect', x: -13, y: -10, width: 11, height: 6, fill: '#2A2A2A' },
      { t: 'rect', x: 2, y: -10, width: 11, height: 6, fill: '#2A2A2A' },
      { t: 'line', x1: -2, y1: -7.5, x2: 2, y2: -7.5, stroke: '#2A2A2A', sw: 2 },
      { t: 'path', d: 'M-4,2 q5,3 9,-1', stroke: '#2A2A2A', sw: 2, cap: 'round' },
    ]),
    anim: { duration: 1800, loop: true, channels: {
      rotate:     [[0, 0], [.2, -4], [.4, 28], [.55, 30], [.75, -6], [1, 0]],
      translateX: [[0, 0], [.4, 8], [.55, 8], [.75, 0], [1, 0]],
    }},
    sfx: 'main-character', haptic: 'heavy-success',
  },
  {
    tier: 6, name: 'GOATED', stars: 320, descriptor: 'infinite W',
    color: '#F4C842', edge: '#A87B12',
    limbs: ['M-6,14 Q-18,18 -14,28', 'M6,14 Q18,18 14,28', 'M-12,-4 L-26,-16', 'M12,-4 L26,-16'],
    face: FACE([
      { t: 'path', d: 'M-12,-23 L-12,-33 L-4,-27 L0,-36 L4,-27 L12,-33 L12,-23 Z', fill: '#FFE066', stroke: '#A87B12', sw: 1.5 },
      { t: 'circle', cx: -6, cy: -6, r: 2.2, fill: '#2A2A2A' },
      { t: 'circle', cx: 6, cy: -6, r: 2.2, fill: '#2A2A2A' },
      { t: 'path', d: 'M-7,-1 q7,7 14,0', stroke: '#2A2A2A', sw: 2, cap: 'round' },
    ]),
    anim: { duration: 1500, loop: true, channels: {
      translateY: [[0, 3], [.2, 8], [.45, -22], [.7, -4], [.85, 4], [1, 3]],
      rotate:     [[0, 0], [.45, -200], [.7, -360], [1, -360]],
      scaleY:     [[0, 1], [.2, .85], [.85, .92], [1, 1]],
    }},
    sfx: 'goated', haptic: 'heavy-success',
  },
];

const rankForStars = (total: number): Rank => {
  let r = RANKS[0];
  for (const x of RANKS) if (total >= x.stars) r = x;
  return r;
};
