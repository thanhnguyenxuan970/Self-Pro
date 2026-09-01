import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import Toast from 'react-native-toast-message';
import type { AppLanguage, Strings } from '../../config/i18n';
import { AppColors, FontFamily, Radii, Shadows, Spacing } from '../../config/theme';
import {
  buildFriendsSummary,
  formatAbsoluteDateTime,
  formatRelativeAgo,
  formatStarCount,
  friendSummaryStars,
  withCurrentUserAnalyticsYearStars,
  type FriendIncomingRow,
  type FriendLadderRow,
  type FriendMutationStatus,
  type FriendOutgoingRow,
} from '../../lib/friends';
import {
  useBlockFriend,
  useCancelFriendRequest,
  useFriendDashboard,
  useRemoveFriend,
  useRespondToFriendRequest,
} from '../../queries/useFriends';
import { FriendRow } from './FriendRow';
import { IncomingRequestRow, OutgoingRequestRow } from './FriendRequestRow';
import { ConfirmationSheet } from './ConfirmationSheet';

type PendingConfirmation =
  | { kind: 'remove'; relationshipId: string; displayName: string }
  | { kind: 'block'; relationshipId: string; displayName: string }
  | { kind: 'cancel'; relationshipId: string; sentLabel: string };

type Props = {
  active: boolean;
  currentUserEmail: string | null;
  accountSub: string;
  yearStars: number | null;
  colors: AppColors;
  t: Strings;
  lang: AppLanguage;
  onOpenAddFriend: () => void;
  onViewGlobal: () => void;
  addFriendTriggerRef: React.RefObject<View | null>;
};

export function FriendsSection({ active, currentUserEmail, accountSub, yearStars, colors, t, lang, onOpenAddFriend, onViewGlobal, addFriendTriggerRef }: Props) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dashboard = useFriendDashboard(currentUserEmail, accountSub, t.leaderboardPlayer, active);
  const respondMutation = useRespondToFriendRequest(currentUserEmail, accountSub);
  const cancelMutation = useCancelFriendRequest(currentUserEmail, accountSub);
  const removeMutation = useRemoveFriend(currentUserEmail, accountSub);
  const blockMutation = useBlockFriend(currentUserEmail, accountSub);

  const [outgoingExpanded, setOutgoingExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);

  const hasData = dashboard.data !== undefined;
  const hasError = !!dashboard.error;

  const requestRowCopy = useMemo(() => ({
    accept: t.friendsAccept, reject: t.friendsReject, cancel: t.friendsCancel, cancelling: t.friendsCancelling,
    accepting: t.friendsAccepting, rejecting: t.friendsRejecting, blockMenuItem: t.friendsBlockMenuItem,
    overflowAria: t.friendsOverflowAria, dismissLabel: t.friendsConfirmDismiss,
    sentAgoExpiresIn: t.friendsSentAgoExpiresIn, pendingOrdinal: t.friendsPendingOrdinal, outgoingMeta: t.friendsOutgoingMeta,
  }), [t]);
  const friendRowCopy = useMemo(() => ({
    youChip: t.friendsYouChip, removeMenuItem: t.friendsRemoveMenuItem, blockMenuItemShort: t.friendsBlockMenuItemShort,
    overflowAria: t.friendsOverflowAria, dismissLabel: t.friendsConfirmDismiss,
    streakLine: t.friendsStreakLine, yearLine: t.friendsYearLine,
  }), [t]);

  const data = dashboard.data ?? { ladder: [], incoming: [], outgoing: [] };
  const displayLadder = useMemo(
    () => withCurrentUserAnalyticsYearStars(data.ladder, yearStars),
    [data.ladder, yearStars],
  );
  const summary = buildFriendsSummary(displayLadder);
  const selfOnly = displayLadder.length <= 1;
  const busyRespond = respondMutation.isPending ? respondMutation.variables : undefined;
  const busyCancelId = cancelMutation.isPending ? cancelMutation.variables : undefined;

  // `mutation.isPending` only reflects in a *later* render, so a fast
  // double-tap can fire mutateAsync twice before React ever disables the
  // control. This synchronous check closes that window; the server's pair
  // lock would handle the race safely either way, but this avoids sending
  // the redundant call and the confusing silent-discard outcome at all.
  function respondOnce(requestId: string, action: 'accept' | 'reject') {
    if (respondMutation.isPending) return;
    void respondMutation.mutateAsync({ requestId, action });
  }

  async function runConfirmedAction() {
    if (!confirmation) return;
    if (removeMutation.isPending || blockMutation.isPending || cancelMutation.isPending) return;
    let status: FriendMutationStatus;
    if (confirmation.kind === 'remove') status = await removeMutation.mutateAsync(confirmation.relationshipId);
    else if (confirmation.kind === 'block') status = await blockMutation.mutateAsync(confirmation.relationshipId);
    else status = await cancelMutation.mutateAsync(confirmation.relationshipId);
    if (status === 'OK') return setConfirmation(null);
    // NOT_FOUND on a confirmed Remove/Block/Cancel means the relationship is
    // already gone (actioned elsewhere, or the request already expired) —
    // that's a resolved state, not a failure, so dismiss quietly rather
    // than claiming the feature is unavailable and leaving the sheet stuck
    // open on a target that no longer exists.
    if (status === 'NOT_FOUND') return setConfirmation(null);
    Toast.show({ type: 'error', text1: t.friendsResultUnavailable });
  }

  if (!active) return null;

  if (!hasData && dashboard.isLoading) {
    return <SkeletonPanel t={t} styles={styles} />;
  }

  if (!hasData && hasError) {
    return dashboard.isUnavailable
      ? <UnavailablePanel t={t} styles={styles} onRetry={() => dashboard.refetch()} onViewGlobal={onViewGlobal} />
      : <ErrorPanel t={t} styles={styles} onRetry={() => dashboard.refetch()} />;
  }

  return (
    <>
      <FlatList
        data={selfOnly ? [] : displayLadder}
        keyExtractor={row => row.playerId}
        renderItem={({ item, index }) => (
          <FriendRow
            row={item}
            isLast={index === displayLadder.length - 1}
            playerLabel={t.leaderboardPlayer}
            lang={lang}
            colors={colors}
            copy={friendRowCopy}
            onRemove={(relationshipId, displayName) => setConfirmation({ kind: 'remove', relationshipId, displayName })}
            onBlock={(relationshipId, displayName) => setConfirmation({ kind: 'block', relationshipId, displayName })}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {hasError && (
              <StaleBanner t={t} styles={styles} updatedAt={dashboard.dataUpdatedAt} lang={lang} onRetry={() => dashboard.refetch()} />
            )}
            <CompetitionSummary
              colors={colors} t={t} lang={lang} styles={styles} yearStars={yearStars}
              ladder={displayLadder} summary={summary} selfOnly={selfOnly}
              onOpenAddFriend={onOpenAddFriend} triggerRef={addFriendTriggerRef}
            />
            {data.incoming.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.eyebrow}>{t.friendsIncomingSection(data.incoming.length)}</Text>
                <View style={styles.incomingStack}>
                  {data.incoming.map((row: FriendIncomingRow) => (
                    <IncomingRequestRow
                      key={row.relationshipId}
                      row={row}
                      playerLabel={t.leaderboardPlayer}
                      colors={colors}
                      copy={requestRowCopy}
                      onAccept={id => respondOnce(id, 'accept')}
                      onReject={id => respondOnce(id, 'reject')}
                      onBlock={(id, name) => setConfirmation({ kind: 'block', relationshipId: id, displayName: name })}
                      busyAction={busyRespond?.requestId === row.relationshipId ? busyRespond.action : null}
                    />
                  ))}
                </View>
              </View>
            )}
            {!selfOnly && <Text style={[styles.eyebrow, styles.ladderEyebrow]}>{t.friendsLadderSection(displayLadder.length)}</Text>}
            {!selfOnly && <View style={styles.ladderCardTop} />}
          </>
        }
        ListFooterComponent={
          <>
            {!selfOnly && <View style={styles.ladderCardBottom} />}
            {data.outgoing.length > 0 && (
              <View style={styles.section}>
                {outgoingExpanded ? (
                  <>
                    <Text style={styles.eyebrow}>{t.friendsOutgoingSection(data.outgoing.length)}</Text>
                    <View style={styles.card}>
                      {data.outgoing.map((row: FriendOutgoingRow, index: number) => (
                        <OutgoingRequestRow
                          key={row.relationshipId}
                          row={row}
                          isLast={index === data.outgoing.length - 1}
                          lang={lang}
                          colors={colors}
                          copy={requestRowCopy}
                          onCancel={id => setConfirmation({ kind: 'cancel', relationshipId: id, sentLabel: formatAbsoluteDateTime(row.createdAt, lang) })}
                          busy={busyCancelId === row.relationshipId}
                        />
                      ))}
                    </View>
                    <Text style={styles.outgoingFooter}>{t.friendsOutgoingFooter}</Text>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.outgoingCollapsed}
                    onPress={() => setOutgoingExpanded(true)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: false }}
                    accessibilityLabel={t.friendsOutgoingCollapsed(data.outgoing.length)}
                  >
                    <Text style={styles.outgoingCollapsedText}>{t.friendsOutgoingCollapsed(data.outgoing.length)}</Text>
                    <Text style={styles.outgoingChevron}>›</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          selfOnly ? <EmptyLadderPanel t={t} styles={styles} onOpenAddFriend={onOpenAddFriend} /> : null
        }
      />
      <ConfirmationSheet
        visible={confirmation !== null}
        colors={colors}
        tone={confirmation?.kind === 'cancel' ? 'primary' : 'destructive'}
        busy={removeMutation.isPending || blockMutation.isPending || cancelMutation.isPending}
        title={
          confirmation?.kind === 'remove' ? t.friendsRemoveTitle
          : confirmation?.kind === 'block' ? t.friendsBlockTitle
          : t.friendsCancelRequestTitle
        }
        body={
          confirmation?.kind === 'remove' ? t.friendsRemoveBody(confirmation.displayName)
          : confirmation?.kind === 'block' ? t.friendsBlockBody(confirmation.displayName)
          : confirmation?.kind === 'cancel' ? t.friendsCancelRequestBody(confirmation.sentLabel)
          : ''
        }
        confirmLabel={
          confirmation?.kind === 'remove' ? t.friendsRemoveConfirm
          : confirmation?.kind === 'block' ? t.friendsBlockConfirm
          : t.friendsCancelRequestConfirm
        }
        confirmBusyLabel={
          confirmation?.kind === 'remove' ? t.friendsRemoving
          : confirmation?.kind === 'block' ? t.friendsBlocking
          : t.friendsCancelling
        }
        dismissLabel={t.friendsConfirmDismiss}
        onConfirm={() => void runConfirmedAction()}
        onDismiss={() => setConfirmation(null)}
      />
    </>
  );
}

function CompetitionSummary({ colors, t, lang, styles, yearStars, ladder, summary, selfOnly, onOpenAddFriend, triggerRef }: {
  colors: AppColors; t: Strings; lang: AppLanguage; styles: ReturnType<typeof makeStyles>;
  yearStars: number | null;
  ladder: FriendLadderRow[]; summary: ReturnType<typeof buildFriendsSummary>; selfOnly: boolean;
  onOpenAddFriend: () => void; triggerRef: React.RefObject<View | null>;
}) {
  const self = ladder.find(row => row.isCurrentUser);
  let summaryLine: string | null = null;
  if (selfOnly) {
    summaryLine = t.friendsEmptyRankNote;
  } else if (summary) {
    if (summary.kind === 'leadingSolo') summaryLine = t.friendsLeadingSolo;
    else if (summary.kind === 'tied') summaryLine = t.friendsTiedAt(summary.rank, summary.tiedWithCount);
    else if (summary.kind === 'catch') summaryLine = t.friendsCatchTarget(summary.catchStars, summary.catchRank);
    else summaryLine = `${t.friendsTiedAt(summary.rank, summary.tiedWithCount)} · ${t.friendsCatchTarget(summary.catchStars, summary.catchRank)}`;
  }
  // The signed-in row uses the local Analytics Year KPI shared with Home and
  // Rank; rival rows retain their own annual server totals. Rank metadata and
  // the server ladder ordering stay untouched by this display correction.
  const summaryStars = self ? friendSummaryStars(self.yearStars) : friendSummaryStars(yearStars);
  const statsLine = self
    ? [t.friendsYearLine(formatStarCount(summaryStars, lang)), self.effectiveStreak > 0 ? t.friendsStreakLine(self.effectiveStreak) : null]
        .filter(Boolean).join(' · ')
    : null;

  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryLeft}>
        <View style={styles.summaryRankRow}>
          <Text style={[styles.summaryRank, selfOnly && { color: colors.muted }]}>#{self?.friendRank ?? 1}</Text>
          <Text style={styles.summaryOf}>{t.friendsRankOfTotal(ladder.length || 1)}</Text>
        </View>
        {summaryLine && <Text style={styles.summaryLine} numberOfLines={2}>{summaryLine}</Text>}
        {statsLine && <Text style={styles.summaryStats} numberOfLines={1}>{statsLine}</Text>}
      </View>
      <TouchableOpacity
        ref={triggerRef}
        style={styles.addFriendCta}
        onPress={onOpenAddFriend}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t.friendsAddFriendAria}
      >
        <Text style={styles.addFriendCtaText}>{t.friendsAddFriendCta}</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyLadderPanel({ t, styles, onOpenAddFriend }: { t: Strings; styles: ReturnType<typeof makeStyles>; onOpenAddFriend: () => void }) {
  return (
    <View style={styles.emptyPanel}>
      <Text style={styles.emptyHeadline}>{t.friendsEmptyHeadline}</Text>
      <Text style={styles.emptyBody}>{t.friendsEmptyBody}</Text>
      <TouchableOpacity style={styles.emptyCta} onPress={onOpenAddFriend} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t.friendsAddFriendAria}>
        <Text style={styles.emptyCtaText}>{t.friendsAddFriendCta}</Text>
      </TouchableOpacity>
      <Text style={styles.privacyLine}>{t.friendsPrivacyLine}</Text>
    </View>
  );
}

function SkeletonPanel({ t, styles }: { t: Strings; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View accessibilityLiveRegion="polite" accessibilityLabel={t.friendsLoadingAnnounce}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <View key={i} style={styles.skeletonRow} importantForAccessibility="no" accessibilityElementsHidden>
          <View style={styles.skeletonRank} />
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonLines}>
            <View style={styles.skeletonLine1} />
            <View style={styles.skeletonLine2} />
          </View>
        </View>
      ))}
    </View>
  );
}

function ErrorPanel({ t, styles, onRetry }: { t: Strings; styles: ReturnType<typeof makeStyles>; onRetry: () => void }) {
  return (
    <View style={styles.centerPanel}>
      <View style={styles.centerIcon}><Text style={styles.centerIconText}>↻</Text></View>
      <Text style={styles.centerHeadline}>{t.friendsErrorHeadline}</Text>
      <Text style={styles.centerBody}>{t.friendsErrorBody}</Text>
      <TouchableOpacity style={styles.centerCta} onPress={onRetry} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t.friendsRetry}>
        <Text style={styles.centerCtaText}>{t.friendsRetry}</Text>
      </TouchableOpacity>
    </View>
  );
}

function UnavailablePanel({ t, styles, onRetry, onViewGlobal }: { t: Strings; styles: ReturnType<typeof makeStyles>; onRetry: () => void; onViewGlobal: () => void }) {
  return (
    <View style={styles.centerPanel}>
      <View style={styles.centerIcon}><Text style={styles.centerIconText}>⚠</Text></View>
      <Text style={styles.centerHeadline}>{t.friendsUnavailableHeadline}</Text>
      <Text style={styles.centerBody}>{t.friendsUnavailableBody}</Text>
      <TouchableOpacity style={styles.centerCta} onPress={onRetry} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t.friendsRetry}>
        <Text style={styles.centerCtaText}>{t.friendsRetry}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onViewGlobal} accessibilityRole="button" accessibilityLabel={t.friendsViewGlobal} style={styles.centerLinkBtn}>
        <Text style={styles.centerLink}>{t.friendsViewGlobal}</Text>
      </TouchableOpacity>
    </View>
  );
}

function StaleBanner({ t, styles, updatedAt, lang, onRetry }: { t: Strings; styles: ReturnType<typeof makeStyles>; updatedAt: number; lang: AppLanguage; onRetry: () => void }) {
  return (
    <View style={styles.staleBanner}>
      <View style={styles.staleDot} importantForAccessibility="no" />
      <Text style={styles.staleText}>{t.friendsStaleBanner(formatRelativeAgo(updatedAt, lang))}</Text>
      <TouchableOpacity style={styles.staleRetryButton} onPress={onRetry} accessibilityRole="button" accessibilityLabel={t.friendsRetry}>
        <Text style={styles.staleRetry}>{t.friendsRetry}</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    listContent: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
    section: { marginTop: 14 },
    eyebrow: { fontSize: 12, fontFamily: FontFamily.semiBold, letterSpacing: 0.8, color: C.muted, marginBottom: 9 },
    ladderEyebrow: { marginTop: 14 },
    incomingStack: { gap: 10 },
    card: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      borderRadius: Radii.lg, paddingHorizontal: 2, ...Shadows.light,
    },
    ladderCardTop: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderBottomWidth: 0,
      borderTopLeftRadius: Radii.lg, borderTopRightRadius: Radii.lg, paddingHorizontal: 15, ...Shadows.light,
    },
    ladderCardBottom: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderTopWidth: 0,
      borderBottomLeftRadius: Radii.lg, borderBottomRightRadius: Radii.lg, paddingHorizontal: 15,
    },

    summaryCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      borderRadius: Radii.lg, padding: 16, ...Shadows.light, marginTop: 14,
    },
    summaryLeft: { flex: 1, minWidth: 0 },
    summaryRankRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    summaryRank: { fontSize: 30, fontFamily: FontFamily.extraBold, letterSpacing: -1.4, color: C.inkDark },
    summaryOf: { fontSize: 13, fontFamily: FontFamily.regular, color: C.muted },
    summaryLine: { fontSize: 13, lineHeight: 18, fontFamily: FontFamily.semiBold, color: C.ink2, marginTop: 4 },
    summaryStats: { fontSize: 12, fontFamily: FontFamily.regular, color: C.muted, marginTop: 4 },
    addFriendCta: {
      flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0,
      backgroundColor: C.primary, borderRadius: Radii.pill, minHeight: 44,
      paddingHorizontal: 16, paddingVertical: 13,
    },
    addFriendCtaText: { fontSize: 14, fontFamily: FontFamily.bold, color: C.onAccent },

    outgoingCollapsed: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      minHeight: 48, borderWidth: 1, borderColor: C.line, borderRadius: Radii.md,
      backgroundColor: C.surface2, paddingHorizontal: 13, paddingVertical: 11,
    },
    outgoingCollapsedText: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.ink2 },
    outgoingChevron: { fontSize: 20, fontFamily: FontFamily.bold, color: C.muted },
    outgoingFooter: { fontSize: 12, fontFamily: FontFamily.regular, color: C.muted, marginTop: 10 },

    emptyPanel: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: Radii.lg,
      alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, marginTop: 14, ...Shadows.light,
    },
    emptyHeadline: { fontSize: 20, fontFamily: FontFamily.extraBold, letterSpacing: -0.5, color: C.inkDark, textAlign: 'center' },
    emptyBody: { fontSize: 14, lineHeight: 20, color: C.muted, textAlign: 'center', marginTop: 8, maxWidth: 250 },
    emptyCta: { marginTop: 16, backgroundColor: C.primary, borderRadius: Radii.md, paddingHorizontal: 20, paddingVertical: 13 },
    emptyCtaText: { fontSize: 14, fontFamily: FontFamily.bold, color: C.onAccent },
    privacyLine: { fontSize: 12, color: C.disabledInk, textAlign: 'center', marginTop: 14, maxWidth: 240 },

    skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    skeletonRank: { width: 34, height: 19, borderRadius: Radii.xs, backgroundColor: C.surface2 },
    skeletonAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface2 },
    skeletonLines: { flex: 1, gap: 6 },
    skeletonLine1: { height: 14, width: '55%', borderRadius: Radii.xs, backgroundColor: C.surface2 },
    skeletonLine2: { height: 11, width: '35%', borderRadius: Radii.xs, backgroundColor: C.surface2 },

    centerPanel: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
    centerIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
    centerIconText: { fontSize: 22, color: C.muted },
    centerHeadline: { fontSize: 18.5, fontFamily: FontFamily.extraBold, letterSpacing: -0.4, color: C.inkDark, marginTop: 14, textAlign: 'center' },
    centerBody: { fontSize: 14, lineHeight: 20, color: C.muted, textAlign: 'center', marginTop: 8, maxWidth: 262 },
    centerCta: { marginTop: 18, backgroundColor: C.primary, borderRadius: Radii.pill, paddingHorizontal: 20, paddingVertical: 13 },
    centerCtaText: { fontSize: 15, fontFamily: FontFamily.bold, color: C.onAccent },
    centerLinkBtn: { marginTop: 12, minHeight: 44, justifyContent: 'center' },
    centerLink: { fontSize: 14, fontFamily: FontFamily.bold, color: C.ink2, textAlign: 'center' },

    staleBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line2, borderRadius: Radii.md,
      paddingHorizontal: 13, paddingVertical: 11, marginTop: 12,
    },
    staleDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.starGold },
    staleText: { flex: 1, minWidth: 0, fontSize: 12.5, fontFamily: FontFamily.semiBold, color: C.ink2 },
    staleRetryButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    staleRetry: { fontSize: 12.5, fontFamily: FontFamily.bold, color: C.primaryText },
  });
}
