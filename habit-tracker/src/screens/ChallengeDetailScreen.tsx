import React, { useLayoutEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { AppColors, FontFamily, Radii, Shadows, Spacing, Typography } from '../config/theme';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useChallengeById, useDeleteChallenge, useLogChallengeDay, useRestartChallenge, useRetryChallengeReminder, useSetChallengeAfterPhoto, useSetChallengeBeforePhoto, useUpdateChallengeName } from '../queries/useChallenge';
import { useTodayTasks } from '../queries/useToday';
import { useChallengeDetailActions } from '../hooks/useChallengeDetailActions';
import { challengeDate, isAtRisk, isComplete } from '../lib/challenge';
import { canRequestChallengeDelete, challengeDeletePrompt, challengeDetailMenuActions, deleteChallengeAndExit } from '../utils/challengeDetail';
import { computeChallengeReward } from '../config/challenges.config';
import { ConfettiBurst } from '../components/ConfettiBurst';
import {
  ChallengeDetailHeader,
  ChallengeCompletedSection,
  ChallengeFailedSection,
  ChallengeWeeklyActiveSection,
  ChallengeStreakActiveSection,
  ChallengeOptionsMenu,
  ChallengeStickyCta,
  ChallengeNameEditorModal,
} from '../components/challenge/ChallengeDetailSections';

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
  const deleteChallenge = useDeleteChallenge(userId);
  const [menuVisible, setMenuVisible] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const completedBeforeRender = challenge != null && (
    challenge.status === 'done' || (challenge.mode === 'streak' && isComplete(challenge.daysDone, challenge.targetDays))
  );
  const today = challengeDate();

  const actions = useChallengeDetailActions({
    challenge, challengeId, navigation, t,
    restartChallenge, retryReminder, logDay, updateChallengeName, deleteChallenge,
    setBeforePhoto, setAfterPhoto,
    nameDraft, setNameDraft, setMenuVisible, setEditingName,
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: challenge?.status !== 'active' || completedBeforeRender ? undefined : () => (
        <TouchableOpacity
          onPress={actions.handleMenu}
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
  }, [challenge?.name, challenge?.status, challengeId, completedBeforeRender, navigation, styles, t]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const atRisk = isAtRisk(challenge.mode, challenge.freezesLeft);
  const menuActions = challengeDetailMenuActions(challenge.status);
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

        <ChallengeDetailHeader
          challenge={challenge}
          isWeekly={isWeekly}
          active={active}
          failed={failed}
          completed={completed}
          calendarDaysLeft={calendarDaysLeft}
          retryReminderPending={retryReminder.isPending}
          onRetryReminder={actions.handleRetryReminder}
          colors={colors}
          styles={styles}
          t={t}
        />

        {completed && (
          <ChallengeCompletedSection challenge={challenge} reward={reward} onPickPhoto={actions.pickChallengePhoto} styles={styles} t={t} />
        )}

        {isWeekly && active && challenge.weeklyTarget != null && (
          <ChallengeWeeklyActiveSection challenge={challenge} today={today} styles={styles} t={t} />
        )}

        {!isWeekly && active && (
          <ChallengeStreakActiveSection
            challenge={challenge}
            atRisk={atRisk}
            today={today}
            linkedTaskName={linkedTaskName}
            onPickPhoto={actions.pickChallengePhoto}
            styles={styles}
            t={t}
          />
        )}

        {failed && <ChallengeFailedSection challenge={challenge} reward={reward} styles={styles} t={t} />}
      </ScrollView>

      <ChallengeOptionsMenu
        menuVisible={menuVisible}
        active={active}
        menuTop={headerHeight}
        menuActions={menuActions}
        deleting={deleteChallenge.isPending}
        onDismiss={() => setMenuVisible(false)}
        onEdit={actions.openNameEditor}
        onDelete={actions.confirmDelete}
        styles={styles}
        t={t}
      />

      <ChallengeStickyCta
        active={active}
        completed={completed}
        canLogToday={canLogToday}
        loggedToday={challenge.loggedToday}
        logPending={logDay.isPending}
        linkedTaskName={linkedTaskName}
        taskTypeId={challenge.taskTypeId}
        restartPending={restartChallenge.isPending}
        onLogToday={actions.handleLogToday}
        onLogNow={actions.handleLogNow}
        onShare={actions.handleShare}
        onRestart={actions.handleRestart}
        onHarder={() => (navigation as any).navigate('ChallengeHub')}
        colors={colors}
        styles={styles}
        t={t}
      />

      <ChallengeNameEditorModal
        visible={editingName}
        reduceMotion={reduceMotion}
        nameDraft={nameDraft}
        onChangeDraft={setNameDraft}
        onCancel={() => setEditingName(false)}
        onSave={actions.saveName}
        saving={updateChallengeName.isPending}
        styles={styles}
        t={t}
      />
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
    menuDelete: { ...Typography.bodyStrong, color: C.dangerText },
    editOverlay: { flex: 1, backgroundColor: C.scrim, justifyContent: 'center', padding: Spacing.lg },
    editCard: { backgroundColor: C.surface, borderRadius: Radii.lg, padding: Spacing.lg, gap: Spacing.md, alignSelf: 'center', width: '100%', maxWidth: 480 },
    editTitle: { ...Typography.subheading, color: C.inkDark },
    editInput: { ...Typography.body, color: C.inkDark, borderWidth: 1, borderColor: C.line, borderRadius: Radii.md, minHeight: 48, paddingHorizontal: Spacing.md },
    editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
    editAction: { minHeight: 48, justifyContent: 'center', paddingHorizontal: Spacing.sm },
    editCancel: { ...Typography.bodyStrong, color: C.ink2 },
    editSave: { ...Typography.bodyStrong, color: C.primaryText },
    titleRow: { alignSelf: 'stretch', gap: Spacing.xs },
    name: { ...Typography.title, color: C.inkDark, flexShrink: 1 },
    runningChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: C.primarySoft, borderRadius: Radii.pill,
      paddingVertical: 5, paddingHorizontal: 11,
    },
    mutedChip: { backgroundColor: C.surface2 },
    runningDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary },
    runningChipText: { ...Typography.caption, fontFamily: FontFamily.bold, color: C.primaryText },
    ringWrap: { paddingVertical: Spacing.md, alignItems: 'center' },
    weekSubLabel: { ...Typography.caption, color: C.ink2, marginTop: 4 },
    reminderOkText: { ...Typography.caption, color: C.ink2, alignSelf: 'center' },
    reminderFailedChip: {
      alignSelf: 'center', minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.dangerSoft, borderRadius: Radii.pill, paddingVertical: 6, paddingHorizontal: 14,
    },
    reminderFailedText: { ...Typography.caption, fontFamily: FontFamily.semiBold, color: C.dangerText },
    daysLeftPill: {
      alignSelf: 'center', backgroundColor: C.surface2, borderRadius: Radii.pill,
      paddingVertical: 6, paddingHorizontal: 14, marginTop: -Spacing.sm,
    },
    daysLeftText: { ...Typography.caption, fontFamily: FontFamily.semiBold, color: C.ink2 },
    ruleNote: { ...Typography.secondary, color: C.ink2, textAlign: 'center', paddingHorizontal: Spacing.md },
    sectionLabel: { ...Typography.sectionLabel, color: C.ink2, alignSelf: 'flex-start' },
    statRow: { flexDirection: 'row', gap: Spacing.md, alignSelf: 'stretch' },
    statCard: {
      flex: 1, backgroundColor: C.surface, borderRadius: Radii.lg, paddingVertical: Spacing.md,
      alignItems: 'center', ...Shadows.light,
    },
    statValue: { ...Typography.title, color: C.inkDark },
    statLabel: {
      ...Typography.caption,
      color: C.ink2,
      marginTop: 2,
      alignSelf: 'stretch',
      paddingHorizontal: Spacing.xs,
      textAlign: 'center',
    },
    overachieverBanner: {
      alignSelf: 'stretch', backgroundColor: C.starSoft, borderRadius: Radii.lg, padding: Spacing.md,
    },
    overachieverText: { ...Typography.secondary, color: C.inkDark },
    logBtn: {
      alignSelf: 'stretch', backgroundColor: C.primary, paddingVertical: 16, borderRadius: Radii.pill,
      alignItems: 'center', ...Shadows.medium,
    },
    logBtnDisabled: { opacity: 0.6 },
    logBtnText: { ...Typography.bodyStrong, color: C.onAccent, fontSize: 16 },
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
    claimedChip: { ...Typography.caption, color: C.primaryText, backgroundColor: C.primarySoft, borderRadius: Radii.pill, paddingHorizontal: Spacing.sm, paddingVertical: 2, fontFamily: FontFamily.semiBold },
    lockedChip: { ...Typography.caption, color: C.muted, backgroundColor: C.surface2, borderRadius: Radii.pill, paddingHorizontal: Spacing.sm, paddingVertical: 2, fontFamily: FontFamily.semiBold },
    rewardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
    rewardIcon: { fontSize: 22, color: C.starGoldText },
    rewardTextCol: { flex: 1 },
    rewardValue: { ...Typography.bodyStrong, color: C.inkDark, fontSize: 18 },
    rewardLabel: { ...Typography.secondary, color: C.ink2 },
    rewardDivider: { height: 1, backgroundColor: C.line, marginVertical: 4 },

    failedTitle: { ...Typography.title, color: C.inkDark, textAlign: 'center' },
    secondaryCta: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xs },
    secondaryCtaText: { ...Typography.bodyStrong, color: C.ink2 },
  });
}

export type ChallengeDetailStyles = ReturnType<typeof makeStyles>;
