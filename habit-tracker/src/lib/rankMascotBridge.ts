import type { RefObject } from 'react';
import type { RankMascotHandle } from '../components/RankMascot';
import type { LifetimeTierCrossing } from '../game/lifetimeRank';

export const rankMascotBridge: {
  ref: RefObject<RankMascotHandle | null> | null;
  onRankUp: ((crossings: LifetimeTierCrossing[]) => void) | null;
} = { ref: null, onRankUp: null };
