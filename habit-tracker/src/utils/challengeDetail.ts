import type { ChallengeStatus } from '../lib/challenge';

export type ChallengeDetailMenuAction = 'rename' | 'delete';

export function challengeDetailMenuActions(status: ChallengeStatus): ChallengeDetailMenuAction[] {
  return status === 'active' ? ['rename', 'delete'] : [];
}
