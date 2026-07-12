import type { RefObject } from 'react';
import type { RankMascotHandle } from '../components/RankMascot';

type RankUp = { tier_order: number; rank_name: string };

export const rankMascotBridge: {
  ref: RefObject<RankMascotHandle | null> | null;
  onRankUp: ((rank: RankUp) => void) | null;
} = { ref: null, onRankUp: null };
