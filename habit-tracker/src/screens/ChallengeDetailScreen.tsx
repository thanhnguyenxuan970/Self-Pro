import React, { useLayoutEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, TextInput, Share, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import Toast from 'react-native-toast-message';
import { pickSquareImage } from '../utils/pickImage';
import { AppColors, FontFamily, Radii, Shadows, Spacing, Typography } from '../config/theme';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useChallengeById, useLogChallengeDay, useRestartChallenge, useRetryChallengeReminder, useSetChallengeAfterPhoto, useSetChallengeBeforePhoto, useUpdateChallengeName } from '../queries/useChallenge';
import { useTodayTasks } from '../queries/useToday';
import { requestAddActivity } from '../hooks/useAddActivityIntent';
import { challengeDate, isComplete } from '../lib/challenge';
import { computeChallengeReward } from '../config/challenges.config';
import { ChallengeProgressRing } from '../components/ChallengeProgressRing';
import { ChallengeDayGrid, GRID_CELL_COUNT } from '../components/ChallengeDayGrid';
import { WeekStrip } from '../components/WeekStrip';
import { WeeklyPaceCard } from '../components/WeeklyPaceCard';
import { ConfettiBurst } from '../components/ConfettiBurst';
import { PhotoSlot } from '../components/PhotoSlot';

export function ChallengeDetailScreen() {
  const { userId, colors, t, styles } = useScreenCommons(makeStyles);
  const headerHeight = useHeaderHeight();
  const reduceMotion = useReduceMotion();
  const navigation = useNavigation();
  const route = useRoute();
  const challengeId = (route.params as { challengeId: number } | undefined)?.challengeId ?? null;

  const { data: challenge, isLoading } = useChallengeById(userId, challengeId);
  const { data: tasks = [] } = useTodayTasks(userId);
  const logDay = useLogChallengeDay(userId);
  const setAfterPhoto = useSetChallengeAfterPhoto(userId);
  const setBeforePhoto = useSetChallengeBeforePhoto(userId);
  const restartChallenge = useRestartChallenge(userId);
  const retryReminder = useRetryChallengeReminder(userId);
  const updateChallengeName = useUpdateChallengeName(userId);
  const [menuVisible, setMenuVisible] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const completedBeforeRender = challenge != null && (
    challenge.status === 'done' || (challenge.mode === 'streak' && isComplete(challenge.daysDone, challenge.targetDays))
  );
  const today = challengeDate();

  async function handleRestart() {
    const { id, notificationDenied } = await restartChallenge.mutateAsync(challengeId!);
    if (notificationDenied) {
      Toast.show({ type: 'error', text1: t.reminderScheduleFailed, visibilityTime: 3500 });
    }
    (navigation as any).replace('ChallengeDetail', { challengeId: id });
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
      await logDay.mutateAsync();
    } catch {
      // ALREADY_LOGGED_TODAY / NO_ACTIVE_CHALLENGE — surfaced via button disabled state
    }
  }

  function handleLogNow(name: string) {
    requestAddActivity({ name });
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

  async function pickChallengePhoto(slot: 'before' | 'after') {
    if (!challenge) return;
    const uri = await pickSquareImage();
    if (!uri) return;
    if (slot === 'before') setBeforePhoto.mutate({ challengeId: challenge.id, uri });
    else setAfterPhoto.mutate({ challengeId: challenge.id, uri });
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
      Alert.alert(t.error, t.editNameLabel);
    }
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: challenge?.status !== 'active' || completedBeforeRender ? undefined : () => (
        <TouchableOpacity
          onPress={handleMenu}
          disabled={challengeId == null}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t.challengeMenuOptions}
          style={styles.headerMenuButton}
        >
          <Text style={styles.headerMenuText}>⋯</Text>
        </TouchableOpacity>
      ),
    });
  }, [challenge?.name, challenge?.status, challengeId, completedBeforeRender, navigation, styles, t]);

  if (isLoading || !challenge) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.loadingBox}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const isWeekly = challenge.mode === 'weekly';
  const completed = challenge.status === 'done' || (!isWeekly && isComplete(challenge.daysDone, challenge.targetDays));
  const failed = !completed && challenge.status === 'failed';
  const active = !completed && !failed;
  const canLogToday = active && !challenge.loggedToday;
  const calendarDaysLeft = Math.max(0, challenge.targetDays - (challenge.dayIndex + 1));
  const linkedTaskName = challenge.taskTypeId != null
    ? tasks.find(task => task.id === challenge.taskTypeId)?.name ?? null
    : null;

  const reward = isWeekly
    ? computeChallengeReward({ mode: 'weekly', weeklyTarget: challenge.weeklyTarget!, totalWeeks: challenge.totalWeeks! })
    : computeChallengeReward({ mode: 'streak', targetDays: challenge.targetDays });

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {completed && <ConfettiBurst />}

        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={3}>{challenge.name}</Text>
          {active && (
            <View style={styles.runningChip}>
              <View style={styles.runningDot} />
              <Text style={styles.runningChipText} numberOfLines={1}>
                {isWeekly ? t.challengeWeekBadge(challenge.weekIndex ?? 0, challenge.totalWeeks ?? 0) : t.challengeRunningBadge}
              </Text>
            </View>
          )}
          {failed && (
            <View style={[styles.runningChip, styles.mutedChip]}>
              <Text style={[styles.runningChipText, { color: colors.ink2 }]} numberOfLines={1}>{t.challengeResetBadge(challenge.daysDone)}</Text>
            </View>
          )}
        </View>

        {!isWeekly && (
          <View style={styles.ringWrap}>
            <ChallengeProgressRing
              fraction={challenge.fraction}
              label={`${challenge.daysDone}/${challenge.targetDays} ${t.challengeProgressLabel.toLowerCase()}`}
              muted={failed}
              glowing={completed}
            />
          </View>
        )}
        {isWeekly && active && (
          <View style={styles.ringWrap}>
            <ChallengeProgressRing
              fraction={(challenge.weekSessionsDone ?? 0) / Math.max(1, challenge.weekSessionsRequired ?? 1)}
              label={t.challengeSessionsThisWeek(challenge.weekSessionsDone ?? 0, challenge.weekSessionsRequired ?? 0)}
            />
            <Text style={styles.weekSubLabel}>{t.challengeWeekOf(challenge.weekIndex ?? 0, challenge.totalWeeks ?? 0)}</Text>
          </View>
        )}

        {active && challenge.notificationsEnabled && (
          challenge.notificationId ? (
            <Text style={styles.reminderOkText}>{t.challengeReminderOnLabel}</Text>
          ) : (
            <TouchableOpacity
              style={styles.reminderFailedChip}
              onPress={handleRetryReminder}
              disabled={retryReminder.isPending}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.challengeReminderFailedLabel}
            >
              {retryReminder.isPending
                ? <ActivityIndicator size="small" color={colors.danger} />
                : <Text style={styles.reminderFailedText}>{t.challengeReminderFailedLabel}</Text>}
            </TouchableOpacity>
          )
        )}

        {active && !isWeekly && calendarDaysLeft > 0 && (
          <View style={styles.daysLeftPill}>
            <Text style={styles.daysLeftText}>⏳ {t.challengeDaysLeft(calendarDaysLeft)}</Text>
          </View>
        )}

        {completed && (
          <>
            <View style={styles.outcomeCopy}>
              <Text style={styles.doneTitle}>{t.challengeCompletedHeadline}</Text>
              <Text style={styles.outcomeBody}>{t.challengeCompletedBody(challenge.daysDone)}</Text>
            </View>
            <View style={[styles.rewardCard, styles.rewardClaimed]}>
              <View style={styles.rewardHeader}>
                <Text style={styles.rewardTitle}>{t.challengeRewardTitle}</Text>
                <Text style={styles.claimedChip}>{t.challengeRewardClaimed}</Text>
              </View>
            <View style={styles.rewardRow}>
              <Text style={styles.rewardIcon}>★</Text>
              <View style={styles.rewardTextCol}>
                <Text style={styles.rewardValue}>+{reward.stars}</Text>
                <Text style={styles.rewardLabel}>{t.challengeRewardStarsLabel}</Text>
              </View>
            </View>
            <View style={styles.rewardDivider} />
            <View style={styles.rewardRow}>
              <Text style={styles.rewardIcon}>🏅</Text>
              <Text style={styles.rewardLabel}>{t.challengeRewardBadgeLabel}</Text>
            </View>
            </View>
          </>
        )}

        {active && isWeekly && challenge.weeklyTarget != null && (
          <>
            <WeeklyPaceCard
              weeklyTarget={challenge.weekSessionsRequired ?? challenge.weeklyTarget}
              sessionsDone={challenge.weekSessionsDone ?? 0}
              sessionsRemaining={challenge.weekSessionsRemaining ?? 0}
              daysRemaining={challenge.weekDaysRemaining ?? 0}
              paceState={challenge.weekPaceState ?? 'on_pace'}
            />

            <Text style={styles.sectionLabel}>{t.challengeWeekStripTitle(challenge.weekIndex ?? 0, challenge.totalWeeks ?? 0)}</Text>
            <WeekStrip
              weekStart={challenge.weekStart ?? today}
              doneDates={new Set(challenge.log.filter(l => l.state === 'done').map(l => l.date))}
              today={today}
            />

            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{challenge.daysDone}</Text>
                <Text style={styles.statLabel}>{t.challengeTotalSessionsLabel}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>🔥 {challenge.perfectWeeks ?? 0}</Text>
                <Text style={styles.statLabel}>{t.challengePerfectWeeksLabel}</Text>
              </View>
            </View>

            {challenge.overachieverThisWeek && (
              <View style={styles.overachieverBanner}>
                <Text style={styles.overachieverText}>{t.challengeOverachieverHint}</Text>
              </View>
            )}
          </>
        )}

        {active && !isWeekly && (
          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>🔥 {challenge.streak}</Text>
              <Text style={styles.statLabel}>{t.challengeStreakLabel}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>🛟 {challenge.freezesLeft}</Text>
              <Text style={styles.statLabel}>{t.challengePhaoLabel}</Text>
            </View>
          </View>
        )}

        {failed && (
          <>
            <View style={styles.outcomeCopy}>
              <Text style={styles.failedTitle}>{t.challengeFailedHeadline}</Text>
              <Text style={styles.outcomeBody}>{t.challengeFailedBody(challenge.daysDone)}</Text>
            </View>
            <View style={styles.encouragement}>
              <Text style={styles.encouragementText}>{t.challengeFailedEncouragement}</Text>
            </View>
            <View style={[styles.rewardCard, styles.rewardLocked]}>
              <View style={styles.rewardHeader}>
                <Text style={styles.rewardTitle}>{t.challengeRewardTitle}</Text>
                <Text style={styles.lockedChip}>{t.challengeRewardLocked}</Text>
              </View>
              <View style={styles.rewardRow}>
                <Text style={styles.rewardIcon}>★</Text>
                <Text style={styles.rewardLabel}>+{reward.stars} {t.challengeRewardStarsLabel} 🔒</Text>
              </View>
              <View style={styles.rewardDivider} />
              <View style={styles.rewardRow}>
                <Text style={styles.rewardIcon}>🏅</Text>
                <Text style={styles.rewardLabel}>{t.challengeRewardBadgeLabel} 🔒</Text>
              </View>
            </View>
          </>
        )}

        {active && !isWeekly && (
          <>
            <Text style={styles.sectionLabel}>{t.challengeLogSection(Math.min(challenge.targetDays, GRID_CELL_COUNT))}</Text>
            <ChallengeDayGrid
              targetDays={challenge.targetDays}
              startDate={challenge.startDate}
              log={challenge.log}
              today={today}
            />
          </>
        )}

        {active && linkedTaskName != null && (
          <Text style={styles.linkedHint}>
            {t.challengeLinkedHint(linkedTaskName)}
            {(challenge.minDuration != null || challenge.minCount != null) && (
              ` ${t.challengeLinkedHintThreshold(challenge.minDuration, challenge.minCount)}`
            )}
          </Text>
        )}

        {completed && (
          <>
            <Text style={styles.sectionLabel}>{t.challengeJourneyTitle}</Text>
            <View style={styles.photoSection}>
              <PhotoSlot uri={challenge.beforePhoto} label={t.challengeBeforePhotoLabel} actionLabel={t.challengeAddPhoto} onPress={() => pickChallengePhoto('before')} />
              <PhotoSlot uri={challenge.afterPhoto} label={t.challengeAfterPhotoLabel}
                actionLabel={t.challengeAddPhoto}
                onPress={() => pickChallengePhoto('after')} />
            </View>
          </>
        )}
        {failed && (
          <>
            <Text style={styles.sectionLabel}>{t.challengeJourneyTitle}</Text>
            <View style={styles.photoSection}>
              <PhotoSlot uri={challenge.beforePhoto} label={t.challengeBeforePhotoLabel} actionLabel={t.challengeAddPhoto} />
              <PhotoSlot uri={challenge.afterPhoto} label={t.challengeAfterPhotoLabel} locked actionLabel={t.challengeAfterPhotoLocked} />
            </View>
          </>
        )}
        {active && !isWeekly && (
          <View style={styles.photoSection}>
            <PhotoSlot uri={challenge.beforePhoto} label={t.challengeBeforePhotoLabel} actionLabel={t.challengeAddPhoto} onPress={() => pickChallengePhoto('before')} />
            <PhotoSlot uri={challenge.afterPhoto} label={t.challengeAfterPhotoLabel}
              locked
              actionLabel={t.challengeAfterPhotoLocked} />
          </View>
        )}

      </ScrollView>
      <Modal visible={menuVisible && active} transparent animationType="none" onRequestClose={() => setMenuVisible(false)} statusBarTranslucent navigationBarTranslucent>
        <View style={styles.menuModalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setMenuVisible(false)}
            accessibilityRole="button"
            accessibilityLabel={t.cancel}
          />
          <View style={[styles.menu, { top: headerHeight + Spacing.xs }]} accessibilityViewIsModal>
            {active && (
              <TouchableOpacity style={styles.menuRow} onPress={openNameEditor} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t.editActivity}>
                <Text style={styles.menuEdit}>🖊️ {t.editActivity}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
      {active && (
        <View style={styles.stickyCta}>
          <TouchableOpacity
            style={[styles.logBtn, (!canLogToday || logDay.isPending) && styles.logBtnDisabled]}
            onPress={linkedTaskName == null ? handleLogToday : () => handleLogNow(linkedTaskName)}
            disabled={!canLogToday || logDay.isPending}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={challenge.loggedToday ? t.challengeLoggedToday : linkedTaskName == null ? t.challengeLogTodayCta : t.challengeLogNowCta}
          >
            {logDay.isPending ? <ActivityIndicator color={colors.white} /> : (
              <Text style={styles.logBtnText}>{challenge.loggedToday ? `✓ ${t.challengeLoggedToday}` : linkedTaskName == null ? t.challengeLogTodayCta : t.challengeLogNowCta}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
      {!active && (
        <View style={styles.stickyCta}>
          <TouchableOpacity
            style={[styles.logBtn, restartChallenge.isPending && styles.logBtnDisabled]}
            onPress={completed ? handleShare : handleRestart}
            disabled={restartChallenge.isPending}
            accessibilityRole="button"
            accessibilityLabel={completed ? t.challengeShareJourneyCta : t.challengeRestartCta}
          >
            <Text style={styles.logBtnText}>{completed ? t.challengeShareJourneyCta : t.challengeRestartCta}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryCta}
            onPress={completed ? () => (navigation as any).navigate('ChallengeHub') : handleShare}
            accessibilityRole="button"
            accessibilityLabel={completed ? t.challengeHarderCta : t.challengeShareEffortCta}
          >
            <Text style={styles.secondaryCtaText}>{completed ? t.challengeHarderCta : t.challengeShareEffortCta}</Text>
          </TouchableOpacity>
        </View>
      )}
      <Modal visible={editingName} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setEditingName(false)} statusBarTranslucent navigationBarTranslucent>
        <KeyboardAvoidingView style={styles.editOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.editCard}>
            <Text style={styles.editTitle}>{t.editActivity}</Text>
            <TextInput value={nameDraft} onChangeText={setNameDraft} style={styles.editInput} autoFocus maxLength={80} selectTextOnFocus accessibilityLabel={t.editActivity} />
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.editAction} onPress={() => setEditingName(false)} accessibilityRole="button" accessibilityLabel={t.cancel}><Text style={styles.editCancel}>{t.cancel}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.editAction} onPress={saveName} disabled={updateChallengeName.isPending} accessibilityRole="button" accessibilityLabel={t.editSave}><Text style={styles.editSave}>{t.editSave}</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgBase },
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scrollContent: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xl, alignItems: 'center' },
    stickyCta: { alignSelf: 'stretch', backgroundColor: C.bgBase, borderTopWidth: 1, borderTopColor: C.line, padding: Spacing.md },
    headerMenuButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    headerMenuText: { ...Typography.title, color: C.inkDark, fontFamily: FontFamily.bold, lineHeight: 24 },
    menuModalRoot: { flex: 1 },
    menu: {
      position: 'absolute', right: Spacing.lg, width: 190,
      backgroundColor: C.surface, borderRadius: Radii.lg, paddingVertical: Spacing.xs, ...Shadows.medium,
    },
    menuRow: { minHeight: 48, justifyContent: 'center', paddingHorizontal: Spacing.md },
    menuEdit: { ...Typography.bodyStrong, color: C.inkDark },
    editOverlay: { flex: 1, backgroundColor: C.scrim, justifyContent: 'center', padding: Spacing.lg },
    editCard: { backgroundColor: C.surface, borderRadius: Radii.lg, padding: Spacing.lg, gap: Spacing.md, alignSelf: 'center', width: '100%', maxWidth: 480 },
    editTitle: { ...Typography.subheading, color: C.inkDark },
    editInput: { ...Typography.body, color: C.inkDark, borderWidth: 1, borderColor: C.line, borderRadius: Radii.md, minHeight: 48, paddingHorizontal: Spacing.md },
    editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
    editAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.sm },
    editCancel: { ...Typography.bodyStrong, color: C.ink2 },
    editSave: { ...Typography.bodyStrong, color: C.primary },
    titleRow: { alignSelf: 'stretch', gap: Spacing.xs },
    name: { ...Typography.title, color: C.inkDark, flexShrink: 1 },
    runningChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: C.primarySoft, borderRadius: Radii.pill,
      paddingVertical: 5, paddingHorizontal: 11,
    },
    mutedChip: { backgroundColor: C.surface2 },
    runningDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary },
    runningChipText: { ...Typography.caption, fontFamily: FontFamily.bold, color: C.primary },
    ringWrap: { paddingVertical: Spacing.md, alignItems: 'center' },
    weekSubLabel: { ...Typography.caption, color: C.ink2, marginTop: 4 },
    reminderOkText: { ...Typography.caption, color: C.ink2, alignSelf: 'center' },
    reminderFailedChip: {
      alignSelf: 'center', minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.dangerSoft, borderRadius: Radii.pill, paddingVertical: 6, paddingHorizontal: 14,
    },
    reminderFailedText: { ...Typography.caption, fontFamily: FontFamily.semiBold, color: C.danger },
    daysLeftPill: {
      alignSelf: 'center', backgroundColor: C.surface2, borderRadius: Radii.pill,
      paddingVertical: 6, paddingHorizontal: 14, marginTop: -Spacing.sm,
    },
    daysLeftText: { ...Typography.caption, fontFamily: FontFamily.semiBold, color: C.ink2 },
    sectionLabel: { ...Typography.sectionLabel, color: C.ink2, alignSelf: 'flex-start' },
    statRow: { flexDirection: 'row', gap: Spacing.md, alignSelf: 'stretch' },
    statCard: {
      flex: 1, backgroundColor: C.surface, borderRadius: Radii.lg, paddingVertical: Spacing.md,
      alignItems: 'center', ...Shadows.light,
    },
    statValue: { ...Typography.title, color: C.inkDark },
    statLabel: { ...Typography.caption, color: C.ink2, marginTop: 2 },
    overachieverBanner: {
      alignSelf: 'stretch', backgroundColor: C.starSoft, borderRadius: Radii.lg, padding: Spacing.md,
    },
    overachieverText: { ...Typography.secondary, color: C.inkDark },
    logBtn: {
      alignSelf: 'stretch', backgroundColor: C.primary, paddingVertical: 16, borderRadius: Radii.pill,
      alignItems: 'center', ...Shadows.medium,
    },
    logBtnDisabled: { opacity: 0.6 },
    logBtnText: { ...Typography.bodyStrong, color: C.white, fontSize: 16 },
    linkedHint: { ...Typography.secondary, color: C.ink2, marginBottom: Spacing.sm, lineHeight: 19 },
    photoSection: { flexDirection: 'row', gap: Spacing.md, alignSelf: 'stretch' },
    doneTitle: { ...Typography.title, color: C.inkDark, textAlign: 'center' },
    outcomeCopy: { alignSelf: 'stretch', alignItems: 'center', gap: Spacing.xs },
    outcomeBody: { ...Typography.secondary, color: C.ink2, textAlign: 'center', paddingHorizontal: Spacing.md },
    encouragement: { alignSelf: 'stretch', backgroundColor: C.starSoft, borderRadius: Radii.lg, padding: Spacing.md },
    encouragementText: { ...Typography.bodyStrong, color: C.inkDark, textAlign: 'center' },
    rewardCard: {
      alignSelf: 'stretch', backgroundColor: C.surface, borderRadius: Radii.lg, padding: Spacing.md, ...Shadows.light,
    },
    rewardClaimed: { borderWidth: 1, borderColor: C.primary },
    rewardLocked: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2, opacity: 0.72 },
    rewardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
    rewardTitle: { ...Typography.sectionLabel, color: C.ink2 },
    claimedChip: { ...Typography.caption, color: C.primary, backgroundColor: C.primarySoft, borderRadius: Radii.pill, paddingHorizontal: Spacing.sm, paddingVertical: 2, fontFamily: FontFamily.semiBold },
    lockedChip: { ...Typography.caption, color: C.muted, backgroundColor: C.surface2, borderRadius: Radii.pill, paddingHorizontal: Spacing.sm, paddingVertical: 2, fontFamily: FontFamily.semiBold },
    rewardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
    rewardIcon: { fontSize: 22, color: C.starGoldText },
    rewardTextCol: { flex: 1 },
    rewardValue: { ...Typography.bodyStrong, color: C.inkDark, fontSize: 18 },
    rewardLabel: { ...Typography.secondary, color: C.ink2 },
    rewardDivider: { height: 1, backgroundColor: C.line, marginVertical: 4 },

    failedTitle: { ...Typography.title, color: C.inkDark, textAlign: 'center' },
    secondaryCta: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xs },
    secondaryCtaText: { ...Typography.bodyStrong, color: C.ink2 },
  });
}
