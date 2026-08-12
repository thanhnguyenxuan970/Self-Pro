import React, { useRef, useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, AccessibilityInfo, findNodeHandle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import type { Strings } from '../config/i18n';
import { useRankData } from '../queries/useRank';
import { useLeaderboard } from '../queries/useLeaderboard';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useLanguage } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { RankMascot, type RankMascotHandle } from '../components/RankMascot';
import { LevelUpCelebrationModal } from '../components/LevelUpCelebrationModal';
import { getRankConfigByTierOrder, RANKS } from '../config/ranks.config';
import { rankMascotBridge } from '../lib/rankMascotBridge';
import { RankInfoSheet } from '../components/RankInfoSheet';
import { RankEmptyState } from '../components/RankEmptyState';
import { SkeletonRow } from '../components/SkeletonRow';
import { LeaderboardSection } from '../components/LeaderboardSection';
import { FriendsSection } from '../components/friends/FriendsSection';
import { AddFriendSheet, type AddFriendSheetCopy } from '../components/friends/AddFriendSheet';
import { useFriendCode, useFriendDashboard, useFriendPendingCount, useRequestFriendByCode, useRotateFriendCode } from '../queries/useFriends';
import type { FriendActionResult } from '../lib/friends';

type LBEntry = NonNullable<ReturnType<typeof useLeaderboard>['data']>[number];
type RankSegment = 'global' | 'friends';

function friendResultMessage(result: FriendActionResult, t: Strings): string | null {
  switch (result.status) {
    case 'PENDING': return t.friendsResultPending;
    case 'ACCEPTED': return null; // sheet closes + toast, no inline banner
    case 'NOT_FOUND': return t.friendsResultNotFound;
    case 'SELF': return t.friendsResultSelf;
    case 'ALREADY_PENDING': return t.friendsResultAlreadyPending;
    case 'ALREADY_FRIENDS': return t.friendsResultAlreadyFriends;
    case 'RATE_LIMITED': return t.friendsResultRateLimited(Math.ceil((result.retryAfterSeconds ?? 60) / 60));
    case 'FRIEND_LIMIT_REACHED': return t.friendsResultFriendLimit;
    case 'PENDING_LIMIT_REACHED': return t.friendsResultPendingLimit;
    case 'FORBIDDEN': return null; // recoverable session expiry retries silently once; unrecoverable exits via the auth gate
    case 'UNAVAILABLE': return t.friendsResultUnavailable;
    default: return t.friendsResultUnavailable;
  }
}

// fallow-ignore-next-line complexity
export function RankScreen() {
  const { userId, googleUser, colors, t, styles } = useScreenCommons(makeStyles);
  const mascotRef = useRef<RankMascotHandle>(null);
  const { data, isLoading } = useRankData(userId);
  const [lang] = useLanguage();
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    rankMascotBridge.ref = mascotRef;
    return () => { rankMascotBridge.ref = null; };
  }, []);

  const [segment, setSegment] = useState<RankSegment>('global');
  const [infoVisible, setInfoVisible] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [previewTier, setPreviewTier] = useState<number | null>(null);
  const [addFriendVisible, setAddFriendVisible] = useState(false);
  const addFriendTriggerRef = useRef<View>(null);

  const currentUserEmail = googleUser?.email ?? null;
  // Matches the 'anon' fallback the query hooks themselves use internally
  // (friendKeys.*) — queries are disabled whenever this is the fallback
  // anyway, but a consistent placeholder avoids ['friends', ''] and
  // ['friends', 'anon'] both existing as distinct, equally-inert cache keys.
  const accountSub = googleUser?.sub ?? 'anon';

  const { data: leaderboard = [], isLoading: lbLoading, isError: lbError } = useLeaderboard(
    currentUserEmail,
    googleUser?.name ?? null,
    t.leaderboardPlayer,
    lang,
  );

  const currentUserEntry: LBEntry = useMemo(() => ({
    playerId: googleUser?.sub ?? 'current-user',
    displayName: googleUser?.name ?? t.leaderboardYou,
    lifetimeStars: data?.currentStars ?? 0,
    rank: 1,
    isCurrentUser: true,
    starsToNextRank: null,
    currentStreak: 0,
  }), [googleUser?.sub, googleUser?.name, data?.currentStars, t.leaderboardYou]);

  const leaderboardCopy = useMemo(() => ({
    youLabel: t.leaderboardYou,
    nearYouLabel: t.leaderboardNearYou,
    gapToNext: t.leaderboardGapToNext,
    gapLevelLabel: t.leaderboardGapLevel,
    topOfLadderLabel: t.leaderboardTopOfLadder,
    lifetimeStars: t.leaderboardLifetimeStars,
    expandLabel: t.leaderboardExpandRow,
    collapseLabel: t.leaderboardCollapseRow,
    streakDays: t.leaderboardStreakDays,
  }), [t]);

  // App-level pending count (also driven at authenticated app entry by
  // RootNavigator) — reading the same cached query here just for the badge.
  const { data: pendingCount = 0 } = useFriendPendingCount(currentUserEmail, googleUser?.sub ?? null);

  // Shares its cache with FriendsSection's own dashboard call (same query
  // key) — only read here for the rotate-confirmation's outgoing count.
  const friendsDashboard = useFriendDashboard(currentUserEmail, accountSub, t.leaderboardPlayer, segment === 'friends' || addFriendVisible);
  const codeQuery = useFriendCode(currentUserEmail, googleUser?.sub ?? null, addFriendVisible);
  const rotateMutation = useRotateFriendCode(currentUserEmail, accountSub);
  const requestByCodeMutation = useRequestFriendByCode(currentUserEmail, accountSub);

  function closeAddFriendSheet() {
    setAddFriendVisible(false);
    // Best-effort focus restoration to the trigger that opened the sheet.
    requestAnimationFrame(() => {
      const handle = addFriendTriggerRef.current && findNodeHandle(addFriendTriggerRef.current);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    });
  }

  async function handleSubmitCode(code: string): Promise<FriendActionResult> {
    const result = await requestByCodeMutation.mutateAsync(code);
    if (result.status === 'ACCEPTED') {
      setAddFriendVisible(false);
      Toast.show({ type: 'success', text1: t.friendsResultAccepted });
    }
    return result;
  }

  const addFriendCopy: AddFriendSheetCopy = useMemo(() => ({
    title: t.friendsSheetTitle,
    close: t.close,
    yourCodeEyebrow: t.friendsYourCodeEyebrow,
    copy: t.friendsCopy,
    copied: t.friendsCopied,
    share: t.friendsShare,
    rotate: t.friendsRotate,
    overflowAria: t.friendsOverflowAria,
    enterCodeLabel: t.friendsEnterCodeLabel,
    codeHelper: t.friendsCodeHelper,
    codeFiltered: t.friendsCodeFiltered,
    submit: t.friendsSubmit,
    resultMessage: result => friendResultMessage(result, t),
    rotateTitle: t.friendsRotateTitle,
    rotateBody: t.friendsRotateBody(friendsDashboard.data?.outgoing.length ?? 0),
    rotateConfirm: t.friendsRotateConfirm,
    rotateConfirming: t.friendsRotating,
    confirmDismiss: t.friendsConfirmDismiss,
    shareMessage: t.friendsShareMessage,
  }), [t, friendsDashboard.data?.outgoing.length]);

  const storedTierOrder = data
    ? (data.currentTierId ? (data.tiers.find(t => t.id === data.currentTierId)?.tier_order ?? 0) : 0)
    : 0;
  const currentTierOrder = storedTierOrder;

  function renderGlobalContent() {
    if (isLoading || !data) {
      return (
        <View style={[styles.loading, { justifyContent: 'flex-start', paddingTop: Spacing.xl }]}>
          {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} colors={colors} />)}
        </View>
      );
    }

    const { currentStars, tiers } = data;
    // Lifetime rank is authoritative from users.current_tier_id, not weekly rows.
    const currentTier = tiers.find(t => t.tier_order === currentTierOrder);
    const nextTier = currentTier ? tiers.find(t => t.tier_order === currentTier.tier_order + 1) : tiers.find(t => t.stars_required > currentStars);
    const firstTierStars = tiers[0]?.stars_required ?? 5;
    const prevTierStars = currentTier?.stars_required ?? 0;
    const nextTierStars = nextTier?.stars_required ?? prevTierStars;
    const starsToNext = nextTier ? Math.max(0, nextTierStars - currentStars) : 0;
    const displayStarsToNext = Math.round(starsToNext);
    const progressPct = nextTier
      ? Math.min(1, Math.max(0, (currentStars - prevTierStars) / Math.max(1, nextTierStars - prevTierStars)))
      : 1;
    const cfg = getRankConfigByTierOrder(currentTier?.tier_order ?? 1);
    const nextCfg = nextTier ? getRankConfigByTierOrder(nextTier.tier_order) : null;
    const rankLabel = t.rankNameMap[cfg.name] ?? cfg.name;
    const nextRankLabel = nextCfg ? (t.rankNameMap[nextCfg.name] ?? nextCfg.name) : (t.rankNameMap[nextTier?.rank_name ?? ''] ?? nextTier?.rank_name ?? '');
    const unlockedRankCount = RANKS.filter(rank => rank.tier < currentTierOrder).length;

    return (
      <ScrollView contentContainerStyle={styles.content}>
        {currentStars >= firstTierStars ? (
          <View style={styles.rankhero}>
            <View style={[styles.rankheroGlow, { backgroundColor: cfg.glow ?? cfg.color }]} importantForAccessibility="no" />
            <RankMascot ref={mascotRef} tier={(currentTier?.tier_order ?? 1) - 1} size={100} loop reduceMotion={reduceMotion} ambient />
            <Text style={styles.rankNm} numberOfLines={2}>{rankLabel}</Text>
            <Text style={styles.rankEn} numberOfLines={2}>{t.rankQuoteMap[currentTier?.rank_name ?? ''] ?? cfg.descriptor}</Text>
            <View style={styles.rankWk}>
              <Text style={styles.rankWkTxt}>{t.starsTotal(currentStars)}</Text>
            </View>
            <View
              style={styles.bar}
              accessibilityRole="progressbar"
              accessibilityLabel={starsToNext > 0 ? t.rankProgress(Math.round(currentStars), Math.round(nextTierStars), nextRankLabel) : t.maxRank}
              accessibilityValue={{ min: 0, max: 100, now: Math.round(progressPct * 100) }}
            >
              <View style={[styles.barFill, { width: `${Math.round(progressPct * 100)}%` as `${number}%` }]} />
            </View>
            {starsToNext > 0 ? (
              <Text style={styles.nextCap}>{t.nextRank(displayStarsToNext, nextRankLabel)}</Text>
            ) : (
              <Text style={styles.nextCap}>{t.maxRank}</Text>
            )}
          </View>
        ) : (
          <View style={styles.rankEmptyWrap}>
            <RankEmptyState
              currentStars={currentStars}
              unlockStars={firstTierStars}
              nextRankName={nextRankLabel}
            />
          </View>
        )}

        <View style={styles.progression}>
          <TouchableOpacity
            style={styles.galleryTrigger}
            onPress={() => setGalleryVisible(value => !value)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ expanded: galleryVisible }}
            accessibilityLabel={`${t.rankRoadmap}, ${unlockedRankCount}/${RANKS.length}`}
          >
            <View style={styles.galleryIcon} importantForAccessibility="no">
              <Text style={styles.galleryIconText}>✦</Text>
            </View>
            <View style={styles.galleryCopy} importantForAccessibility="no">
              <Text style={styles.progressionTitle}>{t.rankRoadmap}</Text>
              <Text style={styles.galleryCount}>{unlockedRankCount}/{RANKS.length}</Text>
            </View>
            <View style={[styles.galleryChevron, galleryVisible && styles.galleryChevronOpen]} importantForAccessibility="no">
              <Text style={styles.galleryChevronText}>›</Text>
            </View>
          </TouchableOpacity>
          {galleryVisible && <View style={styles.previewGrid}>
            {RANKS.map(rank => {
              const unlocked = rank.tier < currentTierOrder;
              const displayName = t.rankNameMap[rank.name] ?? rank.name;
              return (
                <TouchableOpacity
                  key={rank.tier}
                  disabled={!unlocked}
                  onPress={() => setPreviewTier(rank.tier)}
                  style={[styles.progressionTier, { borderColor: unlocked ? rank.edge : colors.line }, !unlocked && styles.lockedTier]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !unlocked }}
                  accessibilityLabel={unlocked ? t.rankPreviewLabel(displayName) : t.rankLockedLabel(displayName, rank.stars)}
                >
                  {unlocked ? <RankMascot tier={rank.tier} size={76} loop reduceMotion={reduceMotion} ambient /> : <Text style={styles.lockedMark}>🔒</Text>}
                  <Text style={[styles.previewTierText, { color: unlocked ? colors.inkDark : colors.muted }]} numberOfLines={2}>{rank.tier + 1} · {displayName}</Text>
                  {!unlocked && <Text style={styles.lockedRequirement}>{rank.stars} ★</Text>}
                </TouchableOpacity>
              );
            })}
          </View>}
        </View>

        <Text style={styles.sectionLabel}>{t.leaderboardSection}</Text>
        <View style={styles.card}>
          <LeaderboardSection
            leaderboard={leaderboard}
            lbLoading={lbLoading}
            lbError={lbError}
            colors={colors}
            youLabel={t.leaderboardYou}
            emptyNote={t.leaderboardEmpty}
            noSyncNote={t.leaderboardNoSync}
            currentUserEntry={currentUserEntry}
            copy={leaderboardCopy}
          />
        </View>
      </ScrollView>
    );
  }

  const currentTier = data?.tiers.find(tier => tier.tier_order === currentTierOrder);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t.rankTitle}</Text>
        <TouchableOpacity onPress={() => setInfoVisible(true)} hitSlop={10} style={styles.infoBtn} accessibilityLabel={t.rankInfo} accessibilityRole="button">
          <Text style={styles.infoBtnText}>?</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segmentBtn, segment === 'global' && styles.segmentBtnActive]}
          onPress={() => setSegment('global')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ selected: segment === 'global' }}
        >
          <Text style={[styles.segmentText, segment === 'global' && styles.segmentTextActive]}>{t.friendsGlobalTab}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, segment === 'friends' && styles.segmentBtnActive]}
          onPress={() => setSegment('friends')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ selected: segment === 'friends' }}
          accessibilityLabel={pendingCount > 0 ? `${t.friendsFriendsTab}, ${t.friendsPendingBadgeLabel(pendingCount)}` : t.friendsFriendsTab}
        >
          <Text style={[styles.segmentText, segment === 'friends' && styles.segmentTextActive]}>{t.friendsFriendsTab}</Text>
          {pendingCount > 0 && (
            <View style={styles.segmentBadge} importantForAccessibility="no">
              <Text style={styles.segmentBadgeText}>{pendingCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {segment === 'global' ? renderGlobalContent() : (
        <FriendsSection
          active={segment === 'friends'}
          currentUserEmail={currentUserEmail}
          accountSub={accountSub}
          colors={colors}
          t={t}
          lang={lang}
          onOpenAddFriend={() => setAddFriendVisible(true)}
          onViewGlobal={() => setSegment('global')}
          addFriendTriggerRef={addFriendTriggerRef}
        />
      )}

      <RankInfoSheet
        visible={infoVisible}
        tiers={data?.tiers ?? []}
        currentTierId={currentTier?.id ?? null}
        onClose={() => setInfoVisible(false)}
      />
      <LevelUpCelebrationModal
        visible={previewTier !== null}
        tierOrder={(previewTier ?? 0) + 1}
        tierName={previewTier === null ? '' : RANKS[previewTier].name}
        onDismiss={() => setPreviewTier(null)}
      />
      <AddFriendSheet
        visible={addFriendVisible}
        colors={colors}
        copy={addFriendCopy}
        code={codeQuery.data ?? null}
        codeLoading={codeQuery.isLoading}
        codeUnavailable={codeQuery.isUnavailable}
        onRotateCode={() => rotateMutation.mutateAsync()}
        rotating={rotateMutation.isPending}
        onSubmitCode={handleSubmitCode}
        submitting={requestByCodeMutation.isPending}
        onClose={closeAddFriendSheet}
      />
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.bgBase },
    content: { paddingBottom: 40 },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bgBase },
    titleRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg, marginTop: 10, marginBottom: 12 },
    title: { fontSize: 24, fontFamily: FontFamily.extraBold, letterSpacing: -0.5, color: C.inkDark, flex: 1, flexShrink: 1 },
    infoBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: C.faint, alignItems: 'center', justifyContent: 'center' },
    infoBtnText: { fontSize: 15, fontFamily: FontFamily.bold, color: C.muted },

    segmentRow: {
      flexDirection: 'row', marginHorizontal: Spacing.lg, marginBottom: 14,
      backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: Radii.pill, padding: 4,
    },
    segmentBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      minHeight: 40, borderRadius: Radii.pill,
    },
    segmentBtnActive: { backgroundColor: C.surface, ...Shadows.light },
    segmentText: { fontSize: 14, fontFamily: FontFamily.semiBold, color: C.muted },
    segmentTextActive: { color: C.inkDark, fontFamily: FontFamily.bold },
    segmentBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: C.dangerPress, alignItems: 'center', justifyContent: 'center' },
    // White ink on dangerPress (not onAccent — this is a danger fill, not an
    // accent fill; see the spec's "Not an accent" note on this exact badge).
    segmentBadgeText: { fontSize: 11, fontFamily: FontFamily.bold, color: C.white },

    rankEmptyWrap: { marginHorizontal: Spacing.lg },
    progression: { marginHorizontal: Spacing.lg, marginTop: 12 },
    galleryTrigger: {
      minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 12, borderRadius: Radii.lg,
      backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primaryLine,
      ...Shadows.light,
    },
    galleryIcon: { width: 32, height: 32, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary },
    galleryIconText: { fontSize: 18, fontFamily: FontFamily.bold, color: C.onAccent },
    galleryCopy: { flex: 1, minWidth: 0 },
    progressionTitle: { fontSize: 13, fontFamily: FontFamily.extraBold, color: C.primaryText, letterSpacing: 0.5 },
    galleryCount: { fontSize: 10, fontFamily: FontFamily.semiBold, color: C.primaryText, marginTop: 1 },
    galleryChevron: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
    galleryChevronOpen: { transform: [{ rotate: '90deg' }] },
    galleryChevronText: { fontSize: 23, lineHeight: 25, fontFamily: FontFamily.bold, color: C.primaryText, marginTop: -2 },
    progressionTier: { width: '31%', minHeight: 118, borderRadius: Radii.md, borderWidth: 1.5, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
    lockedTier: { backgroundColor: C.surface2 },
    lockedMark: { fontSize: 28, marginBottom: 10 },
    lockedRequirement: { fontSize: 10, fontFamily: FontFamily.extraBold, color: C.muted, marginTop: 2 },
    previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    previewTierText: { fontSize: 10, fontFamily: FontFamily.extraBold, maxWidth: '100%', paddingHorizontal: 4, textAlign: 'center' },
    rankhero: {
      marginHorizontal: Spacing.lg, backgroundColor: C.surface,
      borderRadius: Radii.xl, padding: 22, alignItems: 'center',
      borderWidth: 1, borderColor: C.line, ...Shadows.light, overflow: 'hidden',
    },
    rankheroGlow: {
      position: 'absolute', top: 0, left: 0, right: 0, height: '60%',
      opacity: 0.12,
    },
    rankNm: { fontSize: 25, fontFamily: FontFamily.extraBold, letterSpacing: -0.5, color: C.inkDark, marginTop: 8 },
    rankEn: { fontSize: 12.5, color: C.muted, marginTop: 2, fontStyle: 'italic' },
    rankWk: {
      marginTop: 12, backgroundColor: C.starSoft,
      paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radii.pill,
    },
    rankWkTxt: { fontSize: 13, fontFamily: FontFamily.extraBold, color: C.starGoldText },
    bar: { width: '100%', height: 8, backgroundColor: C.surface2, borderRadius: Radii.pill, marginTop: 14, overflow: 'hidden' },
    barFill: { height: '100%', backgroundColor: C.primary, borderRadius: Radii.pill },
    nextCap: { fontSize: 12, color: C.muted, marginTop: 13, fontFamily: FontFamily.semiBold, textAlign: 'center' },

    sectionLabel: {
      fontSize: 12, fontFamily: FontFamily.semiBold, color: C.ink2,
      marginHorizontal: Spacing.lg, marginTop: 20, marginBottom: 9,
    },
    card: {
      marginHorizontal: Spacing.lg, backgroundColor: C.surface,
      borderRadius: Radii.lg, borderWidth: 1, borderColor: C.line,
      paddingHorizontal: 15, ...Shadows.light,
    },
  });
}
