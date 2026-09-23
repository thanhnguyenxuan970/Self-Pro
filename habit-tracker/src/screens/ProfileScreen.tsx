import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useDailySummary } from '../queries/useToday';
import { useAllTimeStats } from '../queries/useProgress';
import { useRankData } from '../queries/useRank';
import { useAchievementActivityMetrics, useChallengeDaysTotal, useWeeklyOverachieverCount } from '../queries/useAchievements';
import { ACHIEVEMENTS } from '../config/achievements';
import { computeAchievementStatus } from '../lib/achievements';
import { Badge } from '../components/Badge';
import { Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import { useAuthUser } from '../hooks/useAuth';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { isQaSandboxBuildAvailable, isQaSandboxIdentity } from '../qa/qaSandbox';
import { GOOGLE_PICTURE_PLACEHOLDER } from '../lib/googleUserStorage';
import { FeedbackSheet } from './FeedbackSheet';

type Props = {
  googleUser: { sub: string; email: string; name: string; picture: string };
  onEnterQaSandbox: () => Promise<boolean>;
  onResetQaSandbox: () => Promise<void>;
  onSignOut: () => Promise<void>;
};

export function ProfileScreen({ googleUser, onEnterQaSandbox, onResetQaSandbox, onSignOut }: Props) {
  const userId = useAuthUser();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const ph = useMemo(() => makePhStyles(colors), [colors]);
  const { data: daily } = useDailySummary(userId);
  const { data: allTime } = useAllTimeStats(userId);
  const { data: rank } = useRankData(userId);
  const { data: challengeDaysDone } = useChallengeDaysTotal(userId);
  const { data: overachieveWeeks } = useWeeklyOverachieverCount(userId);
  const { data: activityMetrics } = useAchievementActivityMetrics(userId);
  const currentTier = rank?.tiers.find(tier => tier.id === rank.currentTierId);
  const nextTier = rank?.tiers.find(tier => tier.stars_required > (rank?.currentStars ?? 0));
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const trophies = useMemo(() => ACHIEVEMENTS.map(achievement => ({
    ...achievement,
    ...computeAchievementStatus(achievement, {
      totalActivities: allTime?.totalActivities ?? 0,
      bestStreak: allTime?.bestStreak ?? 0,
      challengeDaysDone: challengeDaysDone ?? 0,
      rankTierOrder: currentTier?.tier_order ?? 0,
      weeklyOverachieveWeeks: overachieveWeeks ?? 0,
      activeDays: allTime?.activeDays ?? 0,
      morningLogs: activityMetrics?.morningLogs ?? 0,
      nightLogs: activityMetrics?.nightLogs ?? 0,
      totalStars: allTime?.totalStars ?? 0,
      activityTypes: activityMetrics?.activityTypes ?? 0,
    }),
  })), [allTime?.totalActivities, allTime?.bestStreak, allTime?.activeDays, allTime?.totalStars, challengeDaysDone, currentTier?.tier_order, overachieveWeeks, activityMetrics]);
  const earnedTrophies = useMemo(() => trophies.filter(trophy => trophy.earned), [trophies]);
  const rankProgress = nextTier
    ? t.rankProgress(Math.round(rank?.currentStars ?? 0), nextTier.stars_required, nextTier.rank_name)
    : t.rankMaxed;
  const handleQaSandbox = async () => {
    try {
      await onEnterQaSandbox();
    } catch (error: unknown) {
      Alert.alert(t.error, error instanceof Error ? error.message : String(error));
    }
  };
  const handleQaSandboxReset = () => {
    Alert.alert(t.qaSandboxResetTitle, t.qaSandboxResetBody, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.qaSandboxResetConfirm,
        style: 'destructive',
        onPress: () => {
          void onResetQaSandbox().catch((error: unknown) => {
            Alert.alert(t.error, error instanceof Error ? error.message : String(error));
          });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={ph.head}>
          {googleUser.picture && googleUser.picture !== GOOGLE_PICTURE_PLACEHOLDER && !isQaSandboxIdentity(googleUser) ? <Image source={{ uri: googleUser.picture }} style={ph.avatar} importantForAccessibility="no" accessibilityElementsHidden /> : (
            <View style={[ph.avatar, ph.avatarFallback]}><Text style={ph.avatarInitial}>{(googleUser.name.charAt(0) || '?').toUpperCase()}</Text></View>
          )}
          <Text style={ph.name} numberOfLines={1}>{googleUser.name}</Text>
          <Text style={ph.sub} numberOfLines={1}>{googleUser.email}</Text>
        </View>

        <View style={ph.lifeRow}>
          <View style={ph.lifeCell}><Text style={ph.lifeV} numberOfLines={1}>{currentTier?.rank_name ?? t.rankUnranked}</Text><Text style={ph.lifeL}>{t.statRank}</Text></View>
          <View style={[ph.lifeCell, ph.lifeDivider]}><Text style={ph.lifeV}>{daily?.streak_count ?? 0}</Text><Text style={ph.lifeL}>{t.statStreak}</Text></View>
          <View style={ph.lifeCell}><Text style={ph.lifeV}>{allTime?.activeDays ?? 0}</Text><Text style={ph.lifeL}>{t.statDaysLogged}</Text></View>
        </View>
        <Text style={ph.rankProgress} numberOfLines={1}>{rankProgress}</Text>

        <TouchableOpacity style={ph.trophyRow} onPress={() => (navigation as any).navigate('TrophyShelf')} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={t.screenTrophyShelf}>
          <View style={ph.trophyCopy}><Text style={ph.trophyLabel}>{t.screenTrophyShelf}</Text><Text style={ph.trophyCount}>{earnedTrophies.length} / {trophies.length}</Text></View>
          <View style={ph.trophyBadges}>{trophies.slice(0, 3).map(trophy => <View key={trophy.id} style={ph.trophyBadge}><Badge tier={trophy.tier} emblem={trophy.emblem} locked={!trophy.earned} size={40} colors={colors} /></View>)}</View>
          <Text style={ph.trophyChevron}>{'>'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={ph.feedbackCard}
          onPress={() => setFeedbackVisible(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t.reportBugLabel}
          accessibilityHint={t.feedbackPromptBody}
          testID="profile-feedback-card"
        >
          <View style={ph.feedbackIconWrap} importantForAccessibility="no">
            <Text style={ph.feedbackIcon}>💬</Text>
          </View>
          <View style={ph.feedbackCopy}>
            <Text style={ph.feedbackTitle} numberOfLines={1}>{t.feedbackPromptTitle}</Text>
            <Text style={ph.feedbackBody} numberOfLines={2}>{t.feedbackPromptBody}</Text>
          </View>
          <Text style={ph.feedbackChevron} importantForAccessibility="no">›</Text>
        </TouchableOpacity>

        {isQaSandboxBuildAvailable() && !isQaSandboxIdentity(googleUser) && (
          <TouchableOpacity
            style={styles.qaSwitchBtn}
            onPress={() => { void handleQaSandbox(); }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t.qaSandboxSwitch}
            testID="qa-sandbox-switch-button"
          >
            <Text style={styles.qaSwitchBtnText}>{t.qaSandboxSwitch}</Text>
          </TouchableOpacity>
        )}
        {isQaSandboxBuildAvailable() && isQaSandboxIdentity(googleUser) && (
          <TouchableOpacity
            style={styles.qaResetBtn}
            onPress={handleQaSandboxReset}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t.qaSandboxReset}
            accessibilityHint={t.qaSandboxResetBody}
            testID="qa-sandbox-reset-button"
          >
            <Text style={styles.qaResetBtnText} numberOfLines={1}>{t.qaSandboxReset}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.logoutBtn} onPress={onSignOut} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t.signOut}><Text style={styles.logoutBtnText}>{t.signOut}</Text></TouchableOpacity>
      </ScrollView>
      <FeedbackSheet
        visible={feedbackVisible}
        onClose={() => setFeedbackVisible(false)}
        context={{ screen: 'Profile', route: 'Profile' }}
      />
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bgBase },
    scroll: { paddingBottom: 40 },
    logoutBtn: { marginHorizontal: Spacing.lg, marginTop: 32, marginBottom: 12, paddingVertical: 15, borderRadius: Radii.md, borderWidth: 1.5, borderColor: C.line2, alignItems: 'center' },
    logoutBtnText: { color: C.ink2, fontSize: 15, fontFamily: FontFamily.bold },
    qaSwitchBtn: { marginHorizontal: Spacing.lg, marginTop: 24, minHeight: 44, paddingHorizontal: Spacing.md, borderRadius: Radii.md, borderWidth: 1, borderColor: C.primaryLine, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
    qaSwitchBtnText: { color: C.primaryText, fontSize: 14, fontFamily: FontFamily.semiBold, textAlign: 'center' },
    qaResetBtn: { marginHorizontal: Spacing.lg, marginTop: 24, minHeight: 44, paddingHorizontal: Spacing.md, borderRadius: Radii.md, borderWidth: 1, borderColor: C.dangerText, backgroundColor: C.dangerSoft, alignItems: 'center', justifyContent: 'center' },
    qaResetBtnText: { color: C.dangerText, fontSize: 14, fontFamily: FontFamily.semiBold, textAlign: 'center' },
  });
}

function makePhStyles(C: AppColors) {
  return StyleSheet.create({
    head: { paddingVertical: 14, paddingHorizontal: Spacing.lg, alignItems: 'center' },
    avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.line, ...Shadows.medium, shadowColor: C.primary },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontSize: 32, fontFamily: FontFamily.extraBold, color: C.primaryPress },
    name: { fontSize: 20, fontFamily: FontFamily.extraBold, letterSpacing: -0.3, color: C.inkDark, marginTop: 10 },
    sub: { fontSize: 12.5, color: C.ink2, marginTop: 3 },
    lifeRow: { flexDirection: 'row', marginHorizontal: Spacing.lg, marginTop: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: Radii.md, overflow: 'hidden', ...Shadows.light },
    lifeCell: { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 6 },
    lifeDivider: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.line },
    lifeV: { fontSize: 15, fontFamily: FontFamily.extraBold, color: C.inkDark },
    lifeL: { fontSize: 12, color: C.ink2, fontFamily: FontFamily.semiBold, marginTop: 3 },
    rankProgress: { color: C.muted, fontSize: 12, marginHorizontal: Spacing.lg, marginTop: 7, textAlign: 'center' },
    trophyRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg, marginTop: 14, backgroundColor: C.surface, borderRadius: Radii.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 15, paddingVertical: 10, ...Shadows.light },
    trophyCopy: { flex: 1 },
    trophyLabel: { fontSize: 15, fontFamily: FontFamily.semiBold, color: C.inkDark },
    trophyCount: { color: C.muted, fontSize: 12, marginTop: 2 },
    trophyBadges: { flexDirection: 'row', gap: 3, marginRight: 5 },
    trophyBadge: { height: 40, width: 40 },
    trophyChevron: { fontSize: 20, color: C.faint, fontFamily: FontFamily.bold },
    feedbackCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg, marginTop: 18, padding: 14, minHeight: 74, backgroundColor: C.primarySoft, borderRadius: Radii.md, borderWidth: 1, borderColor: C.primaryLine, ...Shadows.light },
    feedbackIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
    feedbackIcon: { fontSize: 20 },
    feedbackCopy: { flex: 1, marginLeft: 12, marginRight: 8 },
    feedbackTitle: { color: C.primaryText, fontFamily: FontFamily.bold, fontSize: 14 },
    feedbackBody: { color: C.ink2, fontSize: 12, lineHeight: 17, marginTop: 2 },
    feedbackChevron: { color: C.primaryText, fontSize: 24, fontFamily: FontFamily.bold, lineHeight: 26 },
  });
}
