import type { RefObject } from 'react';
import type { RankMascotHandle } from '../components/RankMascot';

export const rankMascotBridge: { ref: RefObject<RankMascotHandle | null> | null } = { ref: null };
