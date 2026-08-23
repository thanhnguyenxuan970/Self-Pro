import { Alert, Share } from 'react-native';
import Toast from 'react-native-toast-message';
import { requestAddActivity } from './useAddActivityIntent';
import { canRequestChallengeDelete, challengeDeletePrompt, deleteChallengeAndExit } from '../utils/challengeDetail';
import type { Strings } from '../config/i18n';
import type {
  ActiveChallenge,
  useRestartChallenge,
  useRetryChallengeReminder,
  useLogChallengeDay,
  useUpdateChallengeName,
  useDeleteChallenge,
} from '../queries/useChallenge';

type Params = {
  challenge: ActiveChallenge | null | undefined;
  challengeId: number | null;
  navigation: any;
  t: Strings;
  restartChallenge: ReturnType<typeof useRestartChallenge>;
  retryReminder: ReturnType<typeof useRetryChallengeReminder>;
  logDay: ReturnType<typeof useLogChallengeDay>;
  updateChallengeName: ReturnType<typeof useUpdateChallengeName>;
  deleteChallenge: ReturnType<typeof useDeleteChallenge>;
  nameDraft: string;
  setNameDraft: (value: string) => void;
  setMenuVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setEditingName: (value: boolean) => void;
};

/** Extracted from ChallengeDetailScreen to keep the render function's complexity in check. */
export function useChallengeDetailActions(params: Params) {
  const {
    challenge, challengeId, navigation, t,
    restartChallenge, retryReminder, logDay, updateChallengeName, deleteChallenge,
    nameDraft, setNameDraft, setMenuVisible, setEditingName,
  } = params;

  async function handleRestart() {
    try {
      const { id, notificationDenied } = await restartChallenge.mutateAsync(challengeId!);
      if (notificationDenied) {
        Toast.show({ type: 'error', text1: t.reminderScheduleFailed, visibilityTime: 3500 });
      }
      (navigation as any).replace('ChallengeDetail', { challengeId: id });
    } catch (e: any) {
      Alert.alert(t.error, e?.message === 'LINKED_TASK_ARCHIVED' ? t.challengeRestartLinkedTaskArchived : t.challengeRestartFailed);
    }
  }

  async function handleRetryReminder() {
    if (challengeId == null) return;
    const ok = await retryReminder.mutateAsync(challengeId);
    Toast.show({
      type: ok ? 'success' : 'error',
      text1: ok ? t.challengeReminderRetrySuccess : t.challengeReminderRetryFailed,
      visibilityTime: 3000,
    });
  }

  async function handleLogToday() {
    try {
      if (challengeId == null) return;
      await logDay.mutateAsync(challengeId);
    } catch {
      // ALREADY_LOGGED_TODAY / NO_ACTIVE_CHALLENGE — surfaced via button disabled state
    }
  }

  function handleLogNow(name: string, taskTypeId: number | null) {
    requestAddActivity({ name, taskTypeId });
  }

  async function handleShare() {
    if (!challenge) return;
    try {
      await Share.share({
        message: challenge.status === 'done'
          ? `${challenge.name}\n${t.challengeCompletedBody(challenge.daysDone)}`
          : `${challenge.name}\n${t.challengeFailedBody(challenge.daysDone)}`,
      });
    } catch {
      // Sharing is optional; a cancelled or unavailable system sheet is a no-op.
    }
  }

  function handleMenu() {
    setMenuVisible(visible => !visible);
  }

  function openNameEditor() {
    if (!challenge) return;
    setMenuVisible(false);
    setNameDraft(challenge.name);
    setEditingName(true);
  }

  async function saveName() {
    if (challengeId == null) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      Alert.alert(t.error, t.challengeNameRequired);
      return;
    }
    try {
      await updateChallengeName.mutateAsync({ challengeId, name: trimmed });
      setEditingName(false);
    } catch {
      Alert.alert(t.error, t.challengeRenameFailed);
    }
  }

  function confirmDelete() {
    if (!canRequestChallengeDelete(challengeId, deleteChallenge.isPending)) return;
    setMenuVisible(false);
    const prompt = challengeDeletePrompt(
      {
        title: t.challengeDeleteTitle,
        message: t.challengeDeleteMsg,
        cancel: t.cancel,
        delete: t.delete,
      },
      () => {
        void deleteChallengeAndExit(
          challengeId,
          id => deleteChallenge.mutateAsync(id),
          () => navigation.goBack(),
          () => Alert.alert(t.error, t.challengeDeleteFailed),
        );
      },
    );
    Alert.alert(prompt.title, prompt.message, prompt.buttons);
  }

  return {
    handleRestart, handleRetryReminder, handleLogToday, handleLogNow, handleShare,
    handleMenu, openNameEditor, saveName, confirmDelete,
  };
}
