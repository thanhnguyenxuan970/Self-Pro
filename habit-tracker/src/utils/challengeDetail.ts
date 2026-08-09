import type { ChallengeStatus } from '../lib/challenge';

export type ChallengeDetailMenuAction = 'rename' | 'delete';

export type ChallengeDeletePromptButton = {
  text: string;
  style: 'cancel' | 'destructive';
  onPress?: () => void;
};

type ChallengeDeletePromptLabels = {
  title: string;
  message: string;
  cancel: string;
  delete: string;
};

export function challengeDetailMenuActions(status: ChallengeStatus): ChallengeDetailMenuAction[] {
  return status === 'active' ? ['rename', 'delete'] : [];
}

export function canRequestChallengeDelete(challengeId: number | null, isPending: boolean): challengeId is number {
  return challengeId != null && !isPending;
}

export function challengeDeletePrompt(
  labels: ChallengeDeletePromptLabels,
  onConfirm: () => void,
): { title: string; message: string; buttons: ChallengeDeletePromptButton[] } {
  return {
    title: labels.title,
    message: labels.message,
    buttons: [
      { text: labels.cancel, style: 'cancel' },
      { text: labels.delete, style: 'destructive', onPress: onConfirm },
    ],
  };
}

export async function deleteChallengeAndExit(
  challengeId: number,
  deleteChallenge: (id: number) => Promise<unknown>,
  navigateBack: () => void,
  showError: () => void,
): Promise<void> {
  try {
    await deleteChallenge(challengeId);
  } catch {
    showError();
    return;
  }

  try {
    navigateBack();
  } catch {
    // The challenge is already deleted; do not misreport a navigation failure as a delete failure.
  }
}
