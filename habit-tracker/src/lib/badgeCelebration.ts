import type { Tier } from '../config/achievements';

export type BadgeRarity = 'common' | 'rare' | 'veryRare' | 'legendary';

const RARITY_META: Record<BadgeRarity, { percent: number; color: string }> = {
  common: { percent: 62, color: '#8A9490' },
  rare: { percent: 12, color: '#60A5FA' },
  veryRare: { percent: 5, color: '#FB923C' },
  legendary: { percent: 1, color: '#A78BFA' },
};

export function badgeCelebrationFormat(tier: Tier): 'sheet' | 'takeover' {
  return tier === 'iron' || tier === 'bronze' ? 'sheet' : 'takeover';
}

export function getBadgeRarity(tier: Tier): { kind: BadgeRarity; percent: number; color: string } {
  const kind: BadgeRarity = tier === 'silver'
    ? 'rare'
    : tier === 'gold'
      ? 'veryRare'
      : tier === 'platinum' || tier === 'diamond'
        ? 'legendary'
        : 'common';
  return { kind, ...RARITY_META[kind] };
}

export function getBadgeConfettiCount(tier: Tier): number {
  if (tier === 'platinum' || tier === 'diamond') return 46;
  if (tier === 'gold') return 34;
  if (tier === 'silver') return 24;
  return 14;
}
