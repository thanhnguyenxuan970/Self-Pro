import { RANKS, getRankConfigByTierOrder, getRankThreshold, starPoints } from '../src/config/ranks.config';

describe('rank config', () => {
  test('includes Cosmic at the top of the ladder', () => {
    expect(RANKS[RANKS.length - 2]?.name).toBe('Ascended');
    expect(RANKS[RANKS.length - 1]?.name).toBe('Cosmic');
    expect(getRankConfigByTierOrder(8).nameVi).toBe('Trùm Cuối');
    expect(getRankConfigByTierOrder(9).nameVi).toBe('Đỉnh Của Chóp');
    expect(getRankConfigByTierOrder(10).nameVi).toBe('Ngoài Vùng Phủ Sóng');
  });

  test('switches to doubling thresholds after GOATED', () => {
    expect(getRankThreshold(7)).toBe(320);
    expect(getRankThreshold(8)).toBe(640);
    expect(getRankThreshold(9)).toBe(1280);
    expect(getRankThreshold(10)).toBe(2560);
    expect(getRankThreshold(0.5)).toBe(0);
  });

  test('keeps the planned glow tiers and readable Mewing tilt', () => {
    expect(getRankConfigByTierOrder(4).glow).toBe('#2DD4BF');
    expect(getRankConfigByTierOrder(5).glow).toBe('#F472B6');
    expect(getRankConfigByTierOrder(7).glow).toBe('#FFE066');
    expect(getRankConfigByTierOrder(8).glow).toBe('#8B5CF6');
    expect(getRankConfigByTierOrder(2).anim.channels.rotate).toEqual([[0, -9], [0.5, -6], [1, -9]]);
    expect(getRankConfigByTierOrder(5).face.filter(el => el.t === 'line')).toHaveLength(8);
    expect(getRankConfigByTierOrder(9).glowOpacity).toBe(0.6);
  });

  test('uses the rarity ladder and keeps Ascended luminous', () => {
    expect(RANKS.map(rank => rank.band)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(getRankConfigByTierOrder(7).front).not.toHaveLength(0);
    expect(getRankConfigByTierOrder(8).back).not.toHaveLength(0);
    expect(getRankConfigByTierOrder(8).color).toBe('#6D28D9');
    expect(getRankConfigByTierOrder(8).front.some(el => el.t === 'circle' && el.fill === '#EF4444')).toBe(true);
    expect(getRankConfigByTierOrder(9).bodyStyle).toBe('luminous');
    expect(starPoints(getRankConfigByTierOrder(9).geometry).split(' ')).toHaveLength(10);
    expect(getRankConfigByTierOrder(10)).toMatchObject({ color: '#5B4BC4', edge: '#2E2378', sfx: 'cosmic' });
    // Ring only — the orbiting moon lives in RankMascot (COSMIC_ORBIT overlay), not config.
    expect(getRankConfigByTierOrder(10).back).toHaveLength(1);
  });

  test('keeps every static mascot silhouette', () => {
    expect(RANKS.map((rank) => ({
  tier: rank.tier,
  band: rank.band,
  face: rank.face.map((element) => element.t),
  back: rank.back.map((element) => element.t),
  front: rank.front.map((element) => element.t)
}))).toMatchInlineSnapshot(`
[
  {
    "back": [],
    "band": 0,
    "face": [
      "path",
      "path",
      "path",
    ],
    "front": [
      "path",
      "path",
      "path",
    ],
    "tier": 0,
  },
  {
    "back": [],
    "band": 0,
    "face": [
      "line",
      "line",
      "path",
    ],
    "front": [
      "path",
      "path",
    ],
    "tier": 1,
  },
  {
    "back": [],
    "band": 1,
    "face": [
      "rect",
      "rect",
      "line",
      "path",
    ],
    "front": [
      "path",
      "path",
      "path",
    ],
    "tier": 2,
  },
  {
    "back": [],
    "band": 1,
    "face": [
      "path",
      "circle",
      "circle",
      "rect",
      "line",
      "line",
    ],
    "front": [
      "path",
      "path",
    ],
    "tier": 3,
  },
  {
    "back": [
      "line",
      "line",
      "line",
    ],
    "band": 2,
    "face": [
      "circle",
      "circle",
      "path",
      "line",
      "line",
      "line",
      "line",
      "line",
      "line",
      "line",
      "line",
    ],
    "front": [],
    "tier": 4,
  },
  {
    "back": [
      "path",
    ],
    "band": 2,
    "face": [
      "path",
      "path",
      "circle",
      "circle",
      "path",
    ],
    "front": [
      "path",
      "path",
      "path",
    ],
    "tier": 5,
  },
  {
    "back": [
      "path",
      "path",
    ],
    "band": 3,
    "face": [
      "path",
      "circle",
      "circle",
      "path",
    ],
    "front": [
      "path",
    ],
    "tier": 6,
  },
  {
    "back": [
      "path",
    ],
    "band": 3,
    "face": [
      "path",
      "path",
      "path",
      "path",
    ],
    "front": [
      "path",
      "circle",
    ],
    "tier": 7,
  },
  {
    "back": [],
    "band": 4,
    "face": [
      "path",
      "path",
      "circle",
      "circle",
      "path",
    ],
    "front": [
      "ellipse",
      "ellipse",
      "line",
      "line",
      "line",
      "line",
    ],
    "tier": 8,
  },
  {
    "back": [
      "path",
    ],
    "band": 4,
    "face": [
      "path",
      "path",
      "circle",
      "circle",
      "path",
    ],
    "front": [
      "path",
      "path",
      "path",
    ],
    "tier": 9,
  },
]
`);
  });
});
