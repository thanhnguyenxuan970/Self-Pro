import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { AppColors, FontFamily, Radii, Shadows, Spacing, Typography } from '../config/theme';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useChallengeById, useDeleteChallenge, useLogChallengeDay, useRestartChallenge, useSetChallengeAfterPhoto } from '../queries/useChallenge';
import { useRankData } from '../queries/useRank';
import { challengeDate } from '../lib/challenge';
import { computeChallengeReward } from '../config/challenges.config';
import { ChallengeProgressRing } from '../components/ChallengeProgressRing';
import { ChallengeDayGrid, GRID_CELL_COUNT } from '../components/ChallengeDayGrid';
import { WeekStrip } from '../components/WeekStrip';
import { WeeklyPaceCard } from '../components/WeeklyPaceCard';
import { ConfettiBurst } from '../components/ConfettiBurst';
import { ShareCardStats } from '../components/ShareCardStats';
import { ShareCardBeforeAfter } from '../components/ShareCardBeforeAfter';
import { PhotoSlot } from '../components/PhotoSlot';

const STREAK_MILESTONES = [7, 14, 21];

export function ChallengeDetailScreen() {
  const { userId, colors, t, styles } = useScreenCommons(makeStyles);
  const navigation = useNavigation();
  const route = useRoute();
  const challengeId = (route.params as { challengeId: number } | undefined)?.challengeId ?? null;

  const { data: challenge, isLoading } = useChallengeById(userId, challengeId);
  const { data: rank } = useRankData(userId);
  const logDay = useLogChallengeDay(userId);
  const setAfterPhoto = useSetChallengeAfterPhoto(userId);
  const restartChallenge = useRestartChallenge(userId);
  const deleteChallenge = useDeleteChallenge(userId);
  const [capturing, setCapturing] = useState(false);
  const statsShareRef = useRef<View>(null);
  const beforeAfterShareRef = useRef<View>(null);

  const today = challengeDate();

  async function handleRestart() {
    const id = await restartChallenge.mutateAsync(challengeId!);
    (navigation as any).replace('ChallengeDetail', { challengeId: id });
  }

  async function handleLogToday() {
    try {
      await logDay.mutateAsync();
    } catch {
      // ALREADY_LOGGED_TODAY / NO_ACTIVE_CHALLENGE — surfaced via button disabled state
    }
  }

  async function pickAfterPhoto() {
    if (!challenge) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setAfterPhoto.mutate({ challengeId: challenge.id, uri: result.assets[0].uri });
    }
  }

  async function handleShare(useBeforeAfter: boolean) {
    const ref = useBeforeAfter ? beforeAfterShareRef : statsShareRef;
    if (!ref.current) return;
    setCapturing(true);
    try {
      const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
    } catch {
      // share cancelled or failed — no-op, matches the existing app-wide pattern
    } finally {
      setCapturing(false);
    }
  }

  function handleDelete() {
    if (challengeId == null) return;
    Alert.alert(
      t.challengeDeleteTitle,
      t.challengeDeleteMsg,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.delete,
          style: 'destructive',
          onPress: () => {
            deleteChallenge.mutateAsync(challengeId)
              .then(() => {
                if (navigation.canGoBack()) navigation.goBack();
                else (navigation as any).navigate('ChallengeHub');
              })
              .catch(() => Alert.alert(t.error, t.challengeDeleteFailed));
          },
        },
      ],
    );
  }

  const rankName = useMemo(() => {
    const tiers = rank?.tiers ?? [];
    return tiers.find(tr => tr.id === rank?.currentTierId)?.rank_name ?? '—';
  }, [rank]);

  if (isLoading || !challenge) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.loadingBox}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const isWeekly = challenge.mode === 'weekly';
  const canLogToday = challenge.status === 'active' && !challenge.loggedToday;

  const reward = isWeekly
    ? computeChallengeReward({ mode: 'weekly', weeklyTarget: challenge.weeklyTarget!, totalWeeks: challenge.totalWeeks! })
    : computeChallengeReward({ mode: 'streak', targetDays: challenge.targetDays });

  // What the share card + button should reflect right now: the challenge's
  // final result once done/failed, or -- while active -- whichever milestone
  // (streak day 7/14/21, or "this week is already perfect") just landed, so
  // the same button/card doubles as the milestone-share surface without a
  // separate banner.
  const shareNumerator = isWeekly ? (challenge.weekSessionsDone ?? 0) : challenge.daysDone;
  const shareDenominator = isWeekly ? (challenge.weeklyTarget ?? 0) : challenge.targetDays;
  const isStreakMilestone = !isWeekly && challenge.status === 'active' && STREAK_MILESTONES.includes(challenge.daysDone);
  const isWeeklyPerfectSoFar = isWeekly && challenge.status === 'active' && (challenge.weekSessionsDone ?? 0) >= (challenge.weeklyTarget ?? Infinity);
  const shareCta = challenge.status === 'done'
    ? t.challengeShareJourneyCta
    : challenge.status === 'failed'
    ? t.challengeShareCta
    : isWeeklyPerfectSoFar
    ? t.challengeShareWeekCta(challenge.weekIndex ?? 0)
    : isStreakMilestone
    ? t.challengeMilestoneShareCta(t.challengeMilestoneStreakLabel(challenge.daysDone))
    : t.challengeShareCta;

  const hasBothPhotos = !!(challenge.beforePhoto && challenge.afterPhoto);
  const useBeforeAfterCard = challenge.status === 'done' && hasBothPhotos;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {challenge.status === 'done' && <ConfettiBurst />}

        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={2}>{challenge.name}</Text>
          {challenge.status === 'active' && (
            <View style={styles.runningChip}>
              <View style={styles.runningDot} />
              <Text style={styles.runningChipText}>
                {isWeekly ? t.challengeWeekBadge(challenge.weekIndex ?? 0, challenge.totalWeeks ?? 0) : t.challengeRunningBadge}
              </Text>
            </View>
          )}
          {challenge.status === 'failed' && (
            <View style={[styles.runningChip, styles.mutedChip]}>
              <Text style={[styles.runningChipText, { color: colors.ink2 }]}>{t.challengeStatusEnded}</Text>
            </View>
          )}
        </View>

        {challenge.status === 'done' ? (
          <View style={styles.doneHero}>
            <View style={styles.trophyCircle}><Text style={styles.trophyEmoji}>🏆</Text></View>
            <Text style={styles.doneEyebrow}>{t.challengeDoneEyebrow}</Text>
            <Text style={styles.doneTitle}>{challenge.name}</Text>
            <Text style={styles.doneSub}>
              {isWeekly
                ? t.challengeDoneSubWeekly(challenge.perfectWeeks ?? 0, challenge.totalWeeks ?? 0)
                : t.challengeDoneSubStreak(challenge.targetDays)}
            </Text>
          </View>
        ) : challenge.status === 'failed' ? (
          <View style={styles.failedHero}>
            <View style={styles.mutedCircle}><Text style={styles.mutedEmoji}>🌱</Text></View>
            <Text style={styles.failedTitle}>{isWeekly ? t.challengeFailedWeeklyTitle : t.challengeFailedKindTitle}</Text>
            <Text style={styles.failedBody}>{isWeekly ? t.challengeFailedWeeklyBody : t.challengeFailedKindBody}</Text>
          </View>
        ) : (
          <View style={styles.ringWrap}>
            <ChallengeProgressRing
              fraction={isWeekly ? (challenge.weekSessionsDone ?? 0) / Math.max(1, challenge.weeklyTarget ?? 1) : challenge.fraction}
              label={isWeekly
                ? t.challengeSessionsThisWeek(challenge.weekSessionsDone ?? 0, challenge.weeklyTarget ?? 0)
                : t.challengeDayOf(Math.min(challenge.dayIndex + 1, challenge.targetDays), challenge.targetDays)}
            />
            {isWeekly && (
              <Text style={styles.weekSubLabel}>{t.challengeWeekOf(challenge.weekIndex ?? 0, challenge.totalWeeks ?? 0)}</Text>
            )}
          </View>
        )}

        {challenge.status === 'active' && !isWeekly && challenge.daysLeft > 0 && (
          <View style={styles.daysLeftPill}>
            <Text style={styles.daysLeftText}>⏳ {t.challengeDaysLeft(challenge.daysLeft)}</Text>
          </View>
        )}

        {challenge.status === 'done' && (
          <View style={styles.rewardCard}>
            <Text style={styles.rewardTitle}>{t.challengeRewardTitle}</Text>
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
        )}

        {challenge.status === 'active' && isWeekly && challenge.weeklyTarget != null && (
          <>
            <WeeklyPaceCard
              weeklyTarget={challenge.weeklyTarget}
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

        {challenge.status === 'active' && !isWeekly && (
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

        {challenge.status === 'failed' && (
          <>
            <Text style={styles.sectionLabel}>{t.challengeEarnedSoFarTitle}</Text>
            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{isWeekly ? (challenge.perfectWeeks ?? 0) : challenge.streak}</Text>
                <Text style={styles.statLabel}>{isWeekly ? t.challengePerfectWeeksLabel : t.challengeStreakLabel}</Text>
              </View>
            </View>
            <View style={styles.freezeNote}>
              <Text style={styles.freezeNoteText}>{t.challengeFreezeNoteBody}</Text>
            </View>
          </>
        )}

        {challenge.status === 'active' && !isWeekly && (
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

        {challenge.status === 'active' && (
          <TouchableOpacity
            style={[styles.logBtn, !canLogToday && styles.logBtnDisabled]}
            onPress={handleLogToday}
            disabled={!canLogToday || logDay.isPending}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={challenge.loggedToday ? t.challengeLoggedToday : t.challengeLogTodayCta}
          >
            {logDay.isPending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.logBtnText}>{challenge.loggedToday ? `✓ ${t.challengeLoggedToday}` : t.challengeLogTodayCta}</Text>
            )}
          </TouchableOpacity>
        )}

        {challenge.status !== 'active' && (
          <TouchableOpacity style={styles.logBtn} onPress={handleRestart} disabled={restartChallenge.isPending} accessibilityRole="button">
            <Text style={styles.logBtnText}>{challenge.status === 'failed' ? t.challengeRestartCta : t.challengeRestartCta}</Text>
          </TouchableOpacity>
        )}

        {challenge.status === 'done' && (
          <>
            <Text style={styles.sectionLabel}>{t.challengeJourneyTitle}</Text>
            <View style={styles.photoSection}>
              <PhotoSlot uri={challenge.beforePhoto} label={t.challengeBeforePhotoLabel} actionLabel={t.challengeAddPhoto} />
              <PhotoSlot uri={challenge.afterPhoto} label={t.challengeAfterPhotoLabel}
                actionLabel={t.challengeAddPhoto}
                onPress={pickAfterPhoto} />
            </View>
          </>
        )}
        {challenge.status === 'active' && !isWeekly && (
          <View style={styles.photoSection}>
            <PhotoSlot uri={challenge.beforePhoto} label={t.challengeBeforePhotoLabel} actionLabel={t.challengeAddPhoto} />
            <PhotoSlot uri={challenge.afterPhoto} label={t.challengeAfterPhotoLabel}
              locked
              actionLabel={t.challengeAfterPhotoLocked} />
          </View>
        )}

        <TouchableOpacity
          style={[styles.shareBtn, capturing && styles.logBtnDisabled]}
          onPress={() => handleShare(useBeforeAfterCard)}
          disabled={capturing}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={shareCta}
        >
          {capturing ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.shareBtnText}>{shareCta}</Text>}
        </TouchableOpacity>

        {challenge.status === 'active' && (
          <TouchableOpacity
            style={[styles.deleteBtn, deleteChallenge.isPending && styles.logBtnDisabled]}
            onPress={handleDelete}
            disabled={deleteChallenge.isPending}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t.challengeDeleteCta}
          >
            {deleteChallenge.isPending ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.deleteBtnText}>{t.challengeDeleteCta}</Text>}
          </TouchableOpacity>
        )}

        {/* Off-screen share cards, captured on demand */}
        <View style={styles.offscreen} pointerEvents="none">
          <ShareCardStats
            ref={statsShareRef}
            challengeTitle={challenge.name}
            numerator={shareNumerator}
            denominator={shareDenominator}
            variant={isWeekly ? 'weekly' : 'streak'}
            weekIndex={challenge.weekIndex ?? undefined}
            rewardStars={reward.stars}
            rankName={rankName}
          />
          {hasBothPhotos && (
            <ShareCardBeforeAfter
              ref={beforeAfterShareRef}
              challengeTitle={challenge.name}
              beforeUri={challenge.beforePhoto!}
              afterUri={challenge.afterPhoto!}
              rewardStars={reward.stars}
              numerator={shareNumerator}
              denominator={shareDenominator}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgBase },
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scrollContent: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xl, alignItems: 'center' },
    titleRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      alignSelf: 'stretch', gap: Spacing.sm,
    },
    name: { ...Typography.title, color: C.inkDark, flexShrink: 1 },
    runningChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: C.primarySoft, borderRadius: Radii.pill,
      paddingVertical: 5, paddingHorizontal: 11,
    },
    mutedChip: { backgroundColor: C.surface2 },
    runningDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary },
    runningChipText: { fontSize: 11.5, fontFamily: FontFamily.bold, color: C.primary },
    ringWrap: { paddingVertical: Spacing.md, alignItems: 'center' },
    weekSubLabel: { ...Typography.caption, color: C.ink2, marginTop: 4 },
    daysLeftPill: {
      alignSelf: 'center', backgroundColor: C.surface2, borderRadius: Radii.pill,
      paddingVertical: 6, paddingHorizontal: 14, marginTop: -Spacing.sm,
    },
    daysLeftText: { fontSize: 12.5, fontFamily: FontFamily.semiBold, color: C.ink2 },
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
    photoSection: { flexDirection: 'row', gap: Spacing.md, alignSelf: 'stretch' },
    shareBtn: {
      alignSelf: 'stretch', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      paddingVertical: 14, borderRadius: Radii.pill, alignItems: 'center',
    },
    shareBtnText: { ...Typography.bodyStrong, color: C.primary },
    deleteBtn: {
      alignSelf: 'stretch', backgroundColor: C.dangerSoft, borderWidth: 1, borderColor: C.danger,
      paddingVertical: 14, borderRadius: Radii.pill, alignItems: 'center',
    },
    deleteBtnText: { ...Typography.bodyStrong, color: C.danger },
    offscreen: { position: 'absolute', top: -9999, left: -9999 },

    // A6 — done + reward
    doneHero: { alignItems: 'center', gap: 6, alignSelf: 'stretch' },
    trophyCircle: {
      width: 88, height: 88, borderRadius: 44, backgroundColor: C.starSoft,
      alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    },
    trophyEmoji: { fontSize: 44 },
    doneEyebrow: { fontSize: 12, fontFamily: FontFamily.bold, color: C.primary, letterSpacing: 0.6 },
    doneTitle: { ...Typography.title, color: C.inkDark, textAlign: 'center' },
    doneSub: { ...Typography.secondary, color: C.ink2, textAlign: 'center' },
    rewardCard: {
      alignSelf: 'stretch', backgroundColor: C.surface, borderRadius: Radii.lg, padding: Spacing.md, ...Shadows.light,
    },
    rewardTitle: { ...Typography.sectionLabel, color: C.ink2, marginBottom: Spacing.sm },
    rewardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
    rewardIcon: { fontSize: 22, color: C.starGold },
    rewardTextCol: { flex: 1 },
    rewardValue: { ...Typography.bodyStrong, color: C.inkDark, fontSize: 18 },
    rewardLabel: { ...Typography.secondary, color: C.ink2 },
    rewardDivider: { height: 1, backgroundColor: C.line, marginVertical: 4 },

    // A7 — failed (kind)
    failedHero: { alignItems: 'center', gap: 8, alignSelf: 'stretch' },
    mutedCircle: {
      width: 76, height: 76, borderRadius: 38, backgroundColor: C.surface2,
      alignItems: 'center', justifyContent: 'center',
    },
    mutedEmoji: { fontSize: 36 },
    failedTitle: { ...Typography.title, color: C.inkDark, textAlign: 'center' },
    failedBody: { ...Typography.secondary, color: C.ink2, textAlign: 'center', paddingHorizontal: Spacing.md },
    freezeNote: { alignSelf: 'stretch', backgroundColor: C.surface2, borderRadius: Radii.lg, padding: Spacing.md },
    freezeNoteText: { ...Typography.secondary, color: C.ink2 },
  });
}
