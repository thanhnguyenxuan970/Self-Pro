// Shared domain types — habit tracker
export type Category = 'study' | 'sports' | 'family' | 'work' | 'other';
export type TaskKind = 'good' | 'bad';

export interface Task {
  id: string;
  name: string;
  category: Category;
  durationMin?: number;   // undefined when kind === 'bad'
  kind: TaskKind;
  done: boolean;
  loggedAt: string;       // ISO
}

export type RankTier =
  | 'debt' | 'npc' | 'rookie' | 'clown' | 'roll' | 'fresh' | 'goated' | 'main';

export interface RankInfo {
  tier: RankTier;
  vi: string;
  en: string;
  emoji: string;
  min: number;   // weekly stars floor (used for retention)
}

export interface RewardMilestone {
  stars: number;
  vnd: number;
}

export interface LedgerEntry {
  id: string;
  date: string;
  type: 'milestone_in' | 'spend_out';
  label: string;
  amount: number;          // positive = in, negative = out
  balanceAfter: number;
  refWeek?: number;
}

export type Lang = 'vi' | 'en';
