import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { AppColors, FontFamily, Radii, Shadows, Spacing, Typography } from '../config/theme';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useChallengeById, useLogChallengeDay, useRestartChallenge, useSetChallengeAfterPhoto } from '../queries/useChallenge';
import { challengeDate } from '../lib/challenge';
import { ChallengeProgressRing } from '../components/ChallengeProgressRing';
import { ChallengeDayGrid } from '../components/ChallengeDayGrid';
import { PhotoSlot } from '../components/PhotoSlot';

export function ChallengeDetailScreen() {
  const { userId, colors, t, styles } = useScreenCommons(makeStyles);
  const navigation = useNavigation();
  const route = useRoute();
  const challengeId = (route.params as { challengeId: number } | undefined)?.challengeId ?? null;

  const { data: challenge, isLoading } = useChallengeById(userId, challengeId);
  const logDay = useLogChallengeDay(userId);
  const setAfterPhoto = useSetChallengeAfterPhoto(userId);
  const restartChallenge = useRestartChallenge(userId);
  const [capturing, setCapturing] = useState(false);
  const shareRef = useRef<View>(null);

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

  async function handleShare() {
    if (!shareRef.current) return;
    setCapturing(true);
    try {
      const uri = await captureRef(shareRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
    } catch {
      // share cancelled or failed — no-op
    } finally {
      setCapturing(false);
    }
  }

  if (isLoading || !challenge) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.loadingBox}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const canLogToday = challenge.status === 'active' && !challenge.loggedToday;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.name}>{challenge.name}</Text>

        {challenge.status === 'done' && <Text style={[styles.statusBanner, { color: colors.primary }]}>{t.challengeCompletedTitle}</Text>}
        {challenge.status === 'failed' && <Text style={[styles.statusBanner, { color: colors.danger }]}>{t.challengeFailedTitle}</Text>}

        <View style={styles.ringWrap}>
          <ChallengeProgressRing
            fraction={challenge.fraction}
            label={t.challengeDayOf(Math.min(challenge.dayIndex + 1, challenge.targetDays), challenge.targetDays)}
          />
        </View>

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{challenge.streak}</Text>
            <Text style={styles.statLabel}>{t.challengeStreakLabel}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{challenge.freezesLeft}</Text>
            <Text style={styles.statLabel}>{t.challengePhaoLabel}</Text>
          </View>
        </View>

        <ChallengeDayGrid
          targetDays={challenge.targetDays}
          startDate={challenge.startDate}
          log={challenge.log}
          today={today}
        />

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
            <Text style={styles.logBtnText}>{t.challengeRestartCta}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.photoSection}>
          <PhotoSlot uri={challenge.beforePhoto} label={t.challengeBeforePhotoLabel} actionLabel={t.challengeAddPhoto} />
          <PhotoSlot uri={challenge.afterPhoto} label={t.challengeAfterPhotoLabel}
            locked={challenge.status !== 'done'}
            actionLabel={challenge.status === 'done' ? t.challengeAddPhoto : t.challengeAfterPhotoLocked}
            onPress={challenge.status === 'done' ? pickAfterPhoto : undefined} />
        </View>

        <TouchableOpacity
          style={[styles.shareBtn, capturing && styles.logBtnDisabled]}
          onPress={handleShare}
          disabled={capturing}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t.challengeShareCta}
        >
          {capturing ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.shareBtnText}>{t.challengeShareCta}</Text>}
        </TouchableOpacity>

        {/* Off-screen share card */}
        <View style={styles.offscreen} pointerEvents="none">
          <View ref={shareRef} style={styles.shareCard} collapsable={false}>
            <Text style={styles.shareCardText}>{t.challengeShareTextNoPhoto(challenge.daysDone, challenge.targetDays)}</Text>
            <Text style={styles.shareCardName}>{challenge.name}</Text>
            {challenge.beforePhoto && challenge.afterPhoto && (
              <View style={styles.sharePhotos}>
                <Image source={{ uri: challenge.beforePhoto }} style={styles.sharePhoto} />
                <Text style={styles.shareArrow}>→</Text>
                <Image source={{ uri: challenge.afterPhoto }} style={styles.sharePhoto} />
              </View>
            )}
          </View>
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
    name: { ...Typography.title, color: C.inkDark, alignSelf: 'flex-start' },
    statusBanner: { ...Typography.bodyStrong, alignSelf: 'flex-start' },
    ringWrap: { paddingVertical: Spacing.md },
    statRow: { flexDirection: 'row', gap: Spacing.md, alignSelf: 'stretch' },
    statCard: {
      flex: 1, backgroundColor: C.surface, borderRadius: Radii.lg, paddingVertical: Spacing.md,
      alignItems: 'center', ...Shadows.light,
    },
    statValue: { ...Typography.title, color: C.inkDark },
    statLabel: { ...Typography.caption, color: C.ink2, marginTop: 2 },
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
    offscreen: { position: 'absolute', top: -9999, left: -9999 },
    shareCard: {
      width: 320, height: 320, backgroundColor: C.primary, borderRadius: Radii.xl,
      alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    shareCardText: { ...Typography.large, color: C.white },
    shareCardName: { ...Typography.body, color: C.white },
    sharePhotos: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    sharePhoto: { width: 100, height: 100, borderRadius: Radii.md },
    shareArrow: { ...Typography.subheading, color: C.white },
  });
}
