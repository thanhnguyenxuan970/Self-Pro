export type ChallengeHubViewState = 'empty' | 'active' | 'history-only';

export function challengeHubViewState(hasActiveChallenge: boolean, historyCount: number): ChallengeHubViewState {
  if (hasActiveChallenge) return 'active';
  return historyCount > 0 ? 'history-only' : 'empty';
}
