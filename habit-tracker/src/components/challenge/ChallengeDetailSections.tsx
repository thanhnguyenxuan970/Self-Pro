import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import type { AppColors } from '../../config/theme';
import { Spacing } from '../../config/theme';
import type { Strings } from '../../config/i18n';
import type { ActiveChallenge } from '../../queries/useChallenge';
import type { ChallengeDetailStyles } from '../../screens/ChallengeDetailScreen';
import type { ChallengeDetailMenuAction } from '../../utils/challengeDetail';
import type { computeChallengeReward } from '../../config/challenges.config';

type ChallengeReward = ReturnType<typeof computeChallengeReward>;
import { ChallengeProgressRing } from '../ChallengeProgressRing';
import { ChallengeDayGrid, GRID_CELL_COUNT } from '../ChallengeDayGrid';
import { WeekStrip } from '../WeekStrip';
import { WeeklyPaceCard } from '../WeeklyPaceCard';
import { PhotoSlot } from '../PhotoSlot';

type SectionProps = {
  challenge: ActiveChallenge;
  styles: ChallengeDetailStyles;
  t: Strings;
};

/** Extracted from ChallengeDetailScreen to keep the render function's complexity in check.
 *  Every prop combination below mirrors the JSX branch it replaced 1:1. */

// --- Title row, progress ring(s), reminder line, days-left pill ------------

export function ChallengeDetailHeader({
  challenge, isWeekly, active, failed, completed, calendarDaysLeft,
  retryReminderPending, onRetryReminder, colors, styles, t,
}: SectionProps & {
  isWeekly: boolean;
  active: boolean;
  failed: boolean;
  completed: boolean;
  calendarDaysLeft: number;
  retryReminderPending: boolean;
  onRetryReminder: () => void;
  colors: AppColors;
}) {
  return (
    <>
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
            onPress={onRetryReminder}
            disabled={retryReminderPending}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t.challengeReminderFailedLabel}
          >
            {retryReminderPending
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
    </>
  );
}

// --- Shared reward card (claimed on completion, locked on failure) ---------

export function ChallengeRewardCard({ variant, stars, styles, t }: {
  variant: 'claimed' | 'locked';
  stars: number;
  styles: ChallengeDetailStyles;
  t: Strings;
}) {
  const claimed = variant === 'claimed';
  return (
    <View style={[styles.rewardCard, claimed ? styles.rewardClaimed : styles.rewardLocked]}>
      <View style={styles.rewardHeader}>
        <Text style={styles.rewardTitle}>{t.challengeRewardTitle}</Text>
        <Text style={claimed ? styles.claimedChip : styles.lockedChip}>
          {claimed ? t.challengeRewardClaimed : t.challengeRewardLocked}
        </Text>
      </View>
      <View style={styles.rewardRow}>
        <Text style={styles.rewardIcon}>★</Text>
        {claimed ? (
          <View style={styles.rewardTextCol}>
            <Text style={styles.rewardValue}>+{stars}</Text>
            <Text style={styles.rewardLabel}>{t.challengeRewardStarsLabel}</Text>
          </View>
        ) : (
          <Text style={styles.rewardLabel}>+{stars} {t.challengeRewardStarsLabel} 🔒</Text>
        )}
      </View>
      <View style={styles.rewardDivider} />
      <View style={styles.rewardRow}>
        <Text style={styles.rewardIcon}>🏅</Text>
        <Text style={styles.rewardLabel}>{t.challengeRewardBadgeLabel}{claimed ? '' : ' 🔒'}</Text>
      </View>
    </View>
  );
}

// --- Completed outcome: copy + reward + photos ------------------------------

export function ChallengeCompletedSection({ challenge, reward, onPickPhoto, styles, t }: SectionProps & {
  reward: ChallengeReward;
  onPickPhoto: (slot: 'before' | 'after') => void;
}) {
  return (
    <>
      <View style={styles.outcomeCopy}>
        <Text style={styles.doneTitle}>{t.challengeCompletedHeadline}</Text>
        <Text style={styles.outcomeBody}>{t.challengeCompletedBody(challenge.daysDone)}</Text>
      </View>
      <ChallengeRewardCard variant="claimed" stars={reward.stars} styles={styles} t={t} />
      <Text style={styles.sectionLabel}>{t.challengeJourneyTitle}</Text>
      <ChallengeDetailPhotos variant="completed" challenge={challenge} onPickPhoto={onPickPhoto} styles={styles} t={t} />
    </>
  );
}

// --- Failed outcome: copy + encouragement + locked reward + photos ---------

export function ChallengeFailedSection({ challenge, reward, styles, t }: SectionProps & {
  reward: ChallengeReward;
}) {
  return (
    <>
      <View style={styles.outcomeCopy}>
        <Text style={styles.failedTitle}>{t.challengeFailedHeadline}</Text>
        <Text style={styles.outcomeBody}>{t.challengeFailedBody(challenge.daysDone)}</Text>
      </View>
      <View style={styles.encouragement}>
        <Text style={styles.encouragementText}>{t.challengeFailedEncouragement}</Text>
      </View>
      <ChallengeRewardCard variant="locked" stars={reward.stars} styles={styles} t={t} />
      <Text style={styles.sectionLabel}>{t.challengeJourneyTitle}</Text>
      <ChallengeDetailPhotos variant="failed" challenge={challenge} styles={styles} t={t} />
    </>
  );
}

// --- Active + weekly mode: pace card, week strip, stats, overachiever ------

export function ChallengeWeeklyActiveSection({ challenge, today, styles, t }: SectionProps & { today: string }) {
  return (
    <>
      <WeeklyPaceCard
        weeklyTarget={challenge.weekSessionsRequired ?? challenge.weeklyTarget!}
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
  );
}

// --- Active + streak mode: stats, rule note, day grid, linked hint, photos -

export function ChallengeStreakActiveSection({
  challenge, atRisk, today, linkedTaskName, onPickPhoto, styles, t,
}: SectionProps & {
  atRisk: boolean;
  today: string;
  linkedTaskName: string | null;
  onPickPhoto: (slot: 'before' | 'after') => void;
}) {
  return (
    <>
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

      {challenge.freezesLeft > 0 && (
        <Text style={styles.ruleNote}>{t.challengeRulesBody(challenge.freezesLeft)}</Text>
      )}

      <Text style={styles.sectionLabel}>{t.challengeLogSection(Math.min(challenge.targetDays, GRID_CELL_COUNT))}</Text>
      <ChallengeDayGrid
        targetDays={challenge.targetDays}
        startDate={challenge.startDate}
        log={challenge.log}
        today={today}
        atRisk={atRisk}
      />

      {linkedTaskName != null && (
        <Text style={styles.linkedHint}>
          {t.challengeLinkedHint(linkedTaskName)}
          {(challenge.minDuration != null || challenge.minCount != null) && (
            ` ${t.challengeLinkedHintThreshold(challenge.minDuration, challenge.minCount)}`
          )}
        </Text>
      )}

      <View style={styles.photoSection}>
        <PhotoSlot uri={challenge.beforePhoto} label={t.challengeBeforePhotoLabel} actionLabel={t.challengeAddPhoto} onPress={() => onPickPhoto('before')} />
        <PhotoSlot uri={challenge.afterPhoto} label={t.challengeAfterPhotoLabel} locked actionLabel={t.challengeAfterPhotoLocked} />
      </View>
    </>
  );
}

// --- Journey photo pair: variant differs by outcome -------------------------

export function ChallengeDetailPhotos({ variant, challenge, onPickPhoto, styles, t }: {
  variant: 'completed' | 'failed';
  challenge: ActiveChallenge;
  onPickPhoto?: (slot: 'before' | 'after') => void;
  styles: ChallengeDetailStyles;
  t: Strings;
}) {
  const completed = variant === 'completed';
  return (
    <View style={styles.photoSection}>
      <PhotoSlot
        uri={challenge.beforePhoto}
        label={t.challengeBeforePhotoLabel}
        actionLabel={t.challengeAddPhoto}
        onPress={completed ? () => onPickPhoto?.('before') : undefined}
      />
      <PhotoSlot
        uri={challenge.afterPhoto}
        label={t.challengeAfterPhotoLabel}
        actionLabel={completed ? t.challengeAddPhoto : t.challengeAfterPhotoLocked}
        locked={!completed}
        onPress={completed ? () => onPickPhoto?.('after') : undefined}
      />
    </View>
  );
}

// --- Options menu (rename / delete) -----------------------------------------

export function ChallengeOptionsMenu({
  menuVisible, active, menuTop, menuActions, deleting, onDismiss, onEdit, onDelete, styles, t,
}: {
  menuVisible: boolean;
  active: boolean;
  menuTop: number;
  menuActions: ChallengeDetailMenuAction[];
  deleting: boolean;
  onDismiss: () => void;
  onEdit: () => void;
  onDelete: () => void;
  styles: ChallengeDetailStyles;
  t: Strings;
}) {
  return (
    <Modal visible={menuVisible && active} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.menuModalRoot}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={t.cancel}
        />
        <View style={[styles.menu, { top: menuTop + Spacing.xs }]} accessibilityViewIsModal>
          {menuActions.includes('rename') && (
            <TouchableOpacity style={styles.menuRow} onPress={onEdit} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t.editActivity}>
              <Text style={styles.menuEdit}>🖊️ {t.editActivity}</Text>
            </TouchableOpacity>
          )}
          {menuActions.includes('delete') && (
            <TouchableOpacity
              style={styles.menuRow}
              onPress={onDelete}
              disabled={deleting}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.challengeDeleteCta}
              accessibilityState={{ disabled: deleting }}
            >
              <Text style={styles.menuDelete}>{t.challengeDeleteCta}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

// --- Sticky bottom CTA: log/share while active, restart/share otherwise ----

export function ChallengeStickyCta({
  active, completed, canLogToday, loggedToday, logPending, linkedTaskName, taskTypeId,
  restartPending, onLogToday, onLogNow, onShare, onRestart, onHarder, colors, styles, t,
}: {
  active: boolean;
  completed: boolean;
  canLogToday: boolean;
  loggedToday: boolean;
  logPending: boolean;
  linkedTaskName: string | null;
  taskTypeId: number | null;
  restartPending: boolean;
  onLogToday: () => void;
  onLogNow: (name: string, taskTypeId: number | null) => void;
  onShare: () => void;
  onRestart: () => void;
  onHarder: () => void;
  colors: AppColors;
  styles: ChallengeDetailStyles;
  t: Strings;
}) {
  if (active) {
    const disabled = !canLogToday || logPending;
    const label = loggedToday ? t.challengeLoggedToday : linkedTaskName == null ? t.challengeLogTodayCta : t.challengeLogNowCta;
    return (
      <View style={styles.stickyCta}>
        <TouchableOpacity
          style={[styles.logBtn, disabled && styles.logBtnDisabled]}
          onPress={linkedTaskName == null ? onLogToday : () => onLogNow(linkedTaskName, taskTypeId)}
          disabled={disabled}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          {logPending ? <ActivityIndicator color={colors.onAccent} /> : (
            <Text style={styles.logBtnText}>{loggedToday ? `✓ ${t.challengeLoggedToday}` : label}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.stickyCta}>
      <TouchableOpacity
        style={[styles.logBtn, restartPending && styles.logBtnDisabled]}
        onPress={completed ? onShare : onRestart}
        disabled={restartPending}
        accessibilityRole="button"
        accessibilityLabel={completed ? t.challengeShareJourneyCta : t.challengeRestartCta}
      >
        <Text style={styles.logBtnText}>{completed ? t.challengeShareJourneyCta : t.challengeRestartCta}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondaryCta}
        onPress={completed ? onHarder : onShare}
        accessibilityRole="button"
        accessibilityLabel={completed ? t.challengeHarderCta : t.challengeShareEffortCta}
      >
        <Text style={styles.secondaryCtaText}>{completed ? t.challengeHarderCta : t.challengeShareEffortCta}</Text>
      </TouchableOpacity>
    </View>
  );
}

// --- Rename modal -------------------------------------------------------------

export function ChallengeNameEditorModal({
  visible, reduceMotion, nameDraft, onChangeDraft, onCancel, onSave, saving, styles, t,
}: {
  visible: boolean;
  reduceMotion: boolean;
  nameDraft: string;
  onChangeDraft: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  styles: ChallengeDetailStyles;
  t: Strings;
}) {
  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onCancel} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={styles.editOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.editCard} accessibilityViewIsModal>
          <Text style={styles.editTitle}>{t.editActivity}</Text>
          <TextInput value={nameDraft} onChangeText={onChangeDraft} style={styles.editInput} autoFocus maxLength={80} selectTextOnFocus accessibilityLabel={t.editActivity} />
          <View style={styles.editActions}>
            <TouchableOpacity style={styles.editAction} onPress={onCancel} accessibilityRole="button" accessibilityLabel={t.cancel}><Text style={styles.editCancel}>{t.cancel}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.editAction} onPress={onSave} disabled={saving} accessibilityRole="button" accessibilityLabel={t.editSave}><Text style={styles.editSave}>{t.editSave}</Text></TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
