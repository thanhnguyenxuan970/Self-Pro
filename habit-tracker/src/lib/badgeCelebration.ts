import type { Tier } from '../config/achievements';

export function badgeCelebrationFormat(tier: Tier): 'sheet' | 'takeover' {
  return tier === 'iron' || tier === 'bronze' ? 'sheet' : 'takeover';
}
