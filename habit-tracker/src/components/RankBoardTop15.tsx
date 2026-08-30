import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import type { Strings } from '../config/i18n';
import { initialsForName, type LeaderboardEntry } from '../queries/useLeaderboard';
import { requestAddActivity } from '../hooks/useAddActivityIntent';
import { SkeletonRow } from './SkeletonRow';
import { countPending, isRowStillAhead, passedRowRange } from '../lib/leaderboardPromotion';

/**
 * Fallback row pitches used before the first real `onLayout` measurement
 * lands. A normal row has no vertical margin; the caller's own row adds
 * `ROW_ME_MARGIN` above and below (see `rowMe` below), which `onLayout`
 * cannot report on its own since margins sit outside the measured box.
 */
const ROW_ME_MARGIN = 6;
const FALLBACK_PITCH = { normal: 66, you: 66 + ROW_ME_MARGIN * 2 };

type Medal = { fill: string; glow: string; ink: string; tintDark: string; tintLight: string; edgeDark: string; edgeLight: string };

// Podium metals — same family as the metal on both fill and border so a
// medal row never accidentally reads as a warning/danger surface.
const MEDALS: Record<1 | 2 | 3, Medal> = {
  1: { fill: '#E0A93B', glow: 'rgba(224,169,59,0.22)', ink: '#231803', tintDark: '#2E2415', tintLight: '#F7EFDD', edgeDark: '#4A3A1E', edgeLight: '#E7D6B4' },
  2: { fill: '#AFB6BB', glow: 'rgba(175,182,187,0.24)', ink: '#1B2124', tintDark: '#22282B', tintLight: '#EFF1F3', edgeDark: '#3A4348', edgeLight: '#D8DDE1' },
  3: { fill: '#BE7B45', glow: 'rgba(190,123,69,0.22)', ink: '#2A1608', tintDark: '#2A2019', tintLight: '#F2EAE3', edgeDark: '#453227', edgeLight: '#DFD2C7' },
};
const LIGHT_MEDAL_INK: Record<1 | 2 | 3, string> = { 1: '#8A5F12', 2: '#5A6166', 3: '#8A4F1E' };

function medalFor(rank: number): Medal | null {
  return rank === 1 || rank === 2 || rank === 3 ? MEDALS[rank] : null;
}

function medalInk(rank: 1 | 2 | 3, isDark: boolean): string {
  return isDark ? MEDALS[rank].fill : LIGHT_MEDAL_INK[rank];
}

/** The disambiguating `#NN` jersey-number suffix `generatePlayerName` appends, if any. */
function nameSuffix(displayName: string): string {
  return displayName.match(/#\S+$/)?.[0] ?? '';
}

function nameWithoutSuffix(displayName: string): string {
  return displayName.replace(/\s*#\S+$/, '').trim();
}

type Props = {
  rows: LeaderboardEntry[];
  lbLoading: boolean;
  lbError: boolean;
  lbUnavailable: boolean;
  isZero: boolean;
  /** The local total is known, but the server returned no ranked rows yet. */
  localOnlyFallback: boolean;
  colors: AppColors;
  isDark: boolean;
  t: Strings;
  youRowRef?: React.RefObject<View | null>;
  /** Caller's animated star total mid-climb; equals their real total when no promotion is playing. */
  displayStars: number;
  /** Rank positions the active promotion climbed — 0 when there is none, or it didn't move the caller's rank. */
  climbed: number;
  canReplay: boolean;
  onReplay: () => void;
  onRetry: () => void;
  reduceMotion: boolean;
};

export function RankBoardTop15({ rows, lbLoading, lbError, lbUnavailable, isZero, localOnlyFallback, colors, isDark, t, youRowRef, displayStars, climbed, canReplay, onReplay, onRetry, reduceMotion }: Props) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pitch, setPitch] = useState(FALLBACK_PITCH);
  const rowAnims = useRef(new Map<string, Animated.Value>()).current;
  const moveBadgeAnim = useRef(new Animated.Value(1)).current;

  function getRowAnim(playerId: string): Animated.Value {
    let v = rowAnims.get(playerId);
    if (!v) { v = new Animated.Value(0); rowAnims.set(playerId, v); }
    return v;
  }

  function handleRowLayout(e: LayoutChangeEvent, isYou: boolean) {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h <= 0) return;
    setPitch(p => {
      if (isYou) {
        const outer = h + ROW_ME_MARGIN * 2;
        return outer === p.you ? p : { ...p, you: outer };
      }
      return h === p.normal ? p : { ...p, normal: h };
    });
  }

  const youIndex = rows.findIndex(r => r.isCurrentUser);
  const promoRange = passedRowRange(youIndex, climbed, rows.length);
  const pending = countPending(promoRange, displayStars, i => rows[i]?.yearStars ?? 0);
  const promoted = pending === 0;

  useEffect(() => {
    rows.forEach((row, i) => {
      const anim = getRowAnim(row.playerId);
      const target = row.isCurrentUser
        ? pending * pitch.normal
        : (isRowStillAhead(i, promoRange, displayStars, row.yearStars) ? -pitch.you : 0);
      Animated.timing(anim, {
        toValue: target,
        duration: reduceMotion ? 0 : (row.isCurrentUser ? 820 : 760),
        easing: row.isCurrentUser ? Easing.bezier(0.31, 1.18, 0.4, 1) : Easing.bezier(0.32, 1.02, 0.36, 1),
        useNativeDriver: true,
      }).start();
    });
    Animated.timing(moveBadgeAnim, {
      toValue: promoted ? 1 : 0,
      duration: reduceMotion ? 0 : (promoted ? 520 : 300),
      easing: promoted ? Easing.elastic(0.9) : Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, displayStars, climbed, pitch.normal, pitch.you, reduceMotion]);

  if (lbLoading) {
    return (
      <View style={styles.listCard}>
        {[0, 1, 2, 3].map(i => <SkeletonRow key={i} colors={colors} />)}
      </View>
    );
  }
  if (lbUnavailable || lbError) {
    return (
      <View style={styles.noteWrap}>
        <Text style={styles.note}>{lbUnavailable ? t.leaderboardUnavailable : t.leaderboardNoSync}</Text>
        {lbError && !lbUnavailable && (
          <TouchableOpacity
            style={styles.retryBtn}
            activeOpacity={0.8}
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={t.leaderboardRetry}
          >
            <Text style={styles.retryText}>{t.leaderboardRetry}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
  if (isZero) {
    return (
      <View style={styles.zeroCard}>
        <Text style={styles.zeroEyebrow}>{t.leaderboardZeroEyebrow}</Text>
        <Text style={styles.zeroHeadline}>{t.leaderboardZeroHeadline}</Text>
        <TouchableOpacity
          style={styles.zeroCta}
          activeOpacity={0.8}
          onPress={() => requestAddActivity({ name: '' })}
          accessibilityRole="button"
          accessibilityLabel={t.leaderboardZeroCta}
        >
          <Text style={styles.zeroCtaPlus}>＋</Text>
          <Text style={styles.zeroCtaText}>{t.leaderboardZeroCta}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (localOnlyFallback) {
    return <View style={styles.noteWrap}><Text style={styles.note}>{t.leaderboardPending}</Text></View>;
  }
  if (rows.length === 0) {
    return <Text style={styles.note}>{t.leaderboardEmpty}</Text>;
  }

  const champion = rows[0];
  const championMedal = MEDALS[1];
  const championInitials = initialsForName(champion.displayName);
  const championName = champion.isCurrentUser ? champion.displayName : nameWithoutSuffix(champion.displayName);
  const championRank = champion.rank > 0 ? champion.rank : '—';

  return (
    <>
      <View style={styles.champCard}>
        <LinearGradient
          colors={[`${championMedal.fill}55`, `${championMedal.fill}00`]}
          style={styles.champWash}
          pointerEvents="none"
        />
        <View style={styles.champContent}>
          <Svg width={34} height={19} viewBox="-13.5 -37.5 27 16" style={styles.champCrown}>
            <Path
              d="M-12,-23 L-12,-33 L-4,-27 L0,-36 L4,-27 L12,-33 L12,-23 Z"
              fill="#FFE066"
              stroke="#A87B12"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          </Svg>
          <View style={styles.champRingWrap}>
            <View style={[styles.champRing, { borderColor: championMedal.fill }]}>
              <Text style={styles.champRingText} numberOfLines={1} allowFontScaling={false}>{championInitials}</Text>
            </View>
            <View style={[styles.champDisc, { backgroundColor: championMedal.fill, borderColor: colors.surface }]}>
              <Text style={[styles.champDiscText, { color: championMedal.ink }]} allowFontScaling={false}>{championRank}</Text>
            </View>
          </View>
          <Text style={[styles.champLabel, { color: isDark ? '#F4DEB0' : '#8A5F12' }]}>{t.leaderboardChampion}</Text>
          <Text style={styles.champName} numberOfLines={2}>{championName}</Text>
          {champion.isCurrentUser && (
            <View style={styles.youChip}><Text style={styles.youChipText}>{t.friendsYouChip}</Text></View>
          )}
          <Text style={styles.champStars} numberOfLines={1}>{Math.round(champion.yearStars)} ★</Text>
        </View>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>{t.leaderboardBoardLabel(rows.length)}</Text>
        {canReplay && (
          <TouchableOpacity
            style={styles.replayBtn}
            activeOpacity={0.8}
            onPress={onReplay}
            accessibilityRole="button"
            accessibilityLabel={t.leaderboardReplay}
          >
            <Text style={styles.replayIcon}>↻</Text>
            <Text style={styles.replayText}>{t.leaderboardReplay}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.listCard}>
        <View style={styles.headRow}>
          <View style={styles.headRank} />
          <View style={styles.headAvatar} />
          <View style={{ flex: 1 }} />
          <Text style={styles.headMove}>{t.leaderboardMoveHeader}</Text>
          <Text style={styles.headStars}>{t.leaderboardStarsHeader}</Text>
        </View>

        {rows.map((row, idx) => {
          const medal = medalFor(row.rank);
          const strong = !!medal || row.isCurrentUser;
          const suffix = row.isCurrentUser ? '' : nameSuffix(row.displayName);
          // The current user's row shows their real (Google) display name verbatim —
          // stripping never applies here, since a name that happens to end in
          // "#something" is theirs, not a generated jersey-number suffix.
          const name = row.isCurrentUser ? row.displayName : nameWithoutSuffix(row.displayName);
          const initials = initialsForName(row.displayName);
          const delta = row.rankDelta7d;
          const moveLabel = delta == null || delta === 0 ? '—' : delta > 0 ? `▲ ${delta}` : `▼ ${Math.abs(delta)}`;
          const moveColor = delta == null || delta === 0 ? colors.muted : delta > 0 ? colors.successText : colors.dangerText;
          const rankLabel = row.rank > 0 ? `#${row.rank}` : '—';
          const a11yLabel = `${rankLabel} ${name}${row.isCurrentUser ? ` (${t.leaderboardYou})` : ''}, ${t.friendsYearLine(Math.round(row.yearStars))}, ${t.leaderboardMoveA11y(delta)}`;

          return (
            <Animated.View
              key={row.playerId}
              ref={row.isCurrentUser ? youRowRef : undefined}
              onLayout={e => handleRowLayout(e, row.isCurrentUser)}
              accessible
              accessibilityLabel={a11yLabel}
              style={[
                styles.row,
                idx === rows.length - 1 && styles.rowLast,
                row.isCurrentUser && styles.rowMe,
                { transform: [{ translateY: getRowAnim(row.playerId) }] },
              ]}
            >
              <Text
                style={[
                  styles.rowRank,
                  { color: medal ? medalInk(row.rank as 1 | 2 | 3, isDark) : row.isCurrentUser ? colors.primaryText : colors.muted },
                ]}
                numberOfLines={1}
              >
                {row.rank > 0 ? row.rank : '—'}
              </Text>
              <View
                style={[
                  styles.rowAvatar,
                  {
                    backgroundColor: row.isCurrentUser ? colors.surface : medal ? (isDark ? medal.tintDark : medal.tintLight) : colors.surface2,
                    borderColor: medal ? medal.fill : row.isCurrentUser ? colors.primary : colors.line2,
                    borderWidth: medal ? 1.5 : 1,
                  },
                ]}
              >
                <Text style={styles.rowAvatarText} numberOfLines={1} allowFontScaling={false}>{initials}</Text>
              </View>
              <View style={styles.rowNameWrap}>
                {row.isCurrentUser ? (
                  <View style={styles.rowNameLine}>
                    <Text style={[styles.rowName, styles.rowNameStrong]} numberOfLines={2}>{name}</Text>
                    <View style={styles.youChipInline}><Text style={styles.youChipText}>{t.friendsYouChip}</Text></View>
                  </View>
                ) : (
                  <Text style={[styles.rowName, strong && styles.rowNameStrong]} numberOfLines={2}>
                    {name}
                    {suffix ? <Text style={styles.rowSuffix}> {suffix}</Text> : null}
                  </Text>
                )}
              </View>
              {row.isCurrentUser && climbed > 0 ? (
                <Animated.Text
                  style={[
                    styles.rowMove,
                    { color: moveColor },
                    {
                      opacity: moveBadgeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                      transform: [{ scale: moveBadgeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
                    },
                  ]}
                  numberOfLines={1}
                >
                  {moveLabel}
                </Animated.Text>
              ) : (
                <Text style={[styles.rowMove, { color: moveColor }]} numberOfLines={1}>{moveLabel}</Text>
              )}
              <Text style={[styles.rowVal, row.isCurrentUser && styles.rowValMe]} numberOfLines={1}>
                {Math.round(row.isCurrentUser ? displayStars : row.yearStars)}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    noteWrap: { alignItems: 'center', paddingVertical: 12 },
    note: { fontSize: 13, color: C.muted, textAlign: 'center' },
    retryBtn: {
      minHeight: 48, marginTop: 8, paddingHorizontal: 16, paddingVertical: 10,
      borderRadius: Radii.pill, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primaryPress,
      alignItems: 'center', justifyContent: 'center',
    },
    retryText: { fontSize: 12, fontFamily: FontFamily.extraBold, color: C.primaryText },

    champCard: {
      position: 'relative', marginHorizontal: Spacing.lg, marginBottom: 20,
      borderRadius: Radii.xl, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      paddingTop: 24, paddingBottom: 22, paddingHorizontal: 18, overflow: 'hidden', ...Shadows.light,
    },
    champWash: { position: 'absolute', left: 0, right: 0, top: 0, height: '64%' },
    champContent: { alignItems: 'center' },
    champCrown: { marginBottom: 8 },
    champRingWrap: { position: 'relative' },
    champRing: {
      width: 84, height: 84, borderRadius: 999, borderWidth: 4,
      alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, ...Shadows.light,
    },
    champRingText: { fontSize: 27, fontFamily: FontFamily.extraBold, letterSpacing: -1.2, color: C.inkDark },
    champDisc: {
      position: 'absolute', bottom: -12, left: '50%', marginLeft: -17,
      width: 34, height: 34, borderRadius: 999, borderWidth: 3,
      alignItems: 'center', justifyContent: 'center',
    },
    champDiscText: { fontSize: 17, fontFamily: FontFamily.extraBold, lineHeight: 17 },
    champLabel: { fontSize: 10, fontFamily: FontFamily.extraBold, letterSpacing: 1.6, marginTop: 20 },
    champName: { fontSize: 19, fontFamily: FontFamily.extraBold, letterSpacing: -0.8, color: C.inkDark, textAlign: 'center', marginTop: 7 },
    champStars: { fontSize: 25, fontFamily: FontFamily.extraBold, letterSpacing: -1.4, color: C.inkDark, marginTop: 4 },

    sectionHeaderRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      marginHorizontal: Spacing.lg, marginBottom: 9,
    },
    sectionLabel: { fontSize: 12, fontFamily: FontFamily.semiBold, color: C.ink2, letterSpacing: 0.4 },
    replayBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0,
      minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.pill,
      backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primaryPress,
    },
    replayIcon: { fontSize: 11, lineHeight: 11, fontFamily: FontFamily.extraBold, color: C.primaryText },
    replayText: { fontSize: 10, fontFamily: FontFamily.extraBold, letterSpacing: 0.4, color: C.primaryText },

    listCard: {
      marginHorizontal: Spacing.lg, borderRadius: Radii.xl, backgroundColor: C.surface,
      borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingBottom: 8, ...Shadows.light,
    },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: C.line },
    headRank: { width: 26, flexShrink: 0 },
    headAvatar: { width: 28, flexShrink: 0 },
    headMove: { minWidth: 50, flexShrink: 0, textAlign: 'right', fontSize: 11, fontFamily: FontFamily.extraBold, letterSpacing: 0.4, color: C.muted },
    headStars: { fontSize: 11, fontFamily: FontFamily.extraBold, letterSpacing: 0.4, color: C.muted },

    row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 54, paddingVertical: 6 },
    rowLast: {},
    rowMe: {
      backgroundColor: C.primarySoft, borderRadius: Radii.md, marginVertical: 6,
      marginHorizontal: -14, paddingHorizontal: 14, borderLeftWidth: 3, borderLeftColor: C.primary,
    },
    rowRank: { width: 26, flexShrink: 0, fontSize: 11.5, fontFamily: FontFamily.extraBold, textAlign: 'left' },
    rowAvatar: { width: 28, height: 28, borderRadius: 999, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
    rowAvatarText: { fontSize: 10.5, fontFamily: FontFamily.extraBold, color: C.inkDark },
    rowNameWrap: { flex: 1, minWidth: 0 },
    rowNameLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
    rowName: { fontSize: 13.5, fontFamily: FontFamily.semiBold, color: C.ink2, lineHeight: 18 },
    rowNameStrong: { fontFamily: FontFamily.extraBold, color: C.inkDark },
    rowSuffix: { fontSize: 11.5, fontFamily: FontFamily.bold, color: C.muted },
    rowMove: { minWidth: 50, flexShrink: 0, textAlign: 'right', fontSize: 12, fontFamily: FontFamily.extraBold, letterSpacing: -0.2 },
    youChipInline: { backgroundColor: C.primary, borderRadius: Radii.pill, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 4 },
    youChip: { backgroundColor: C.primary, borderRadius: Radii.pill, paddingHorizontal: 9, paddingVertical: 3, marginTop: 7 },
    youChipText: { fontSize: 9.5, fontFamily: FontFamily.extraBold, letterSpacing: 0.4, color: C.onAccent },
    rowVal: { flexShrink: 0, minWidth: 44, textAlign: 'right', fontSize: 16, fontFamily: FontFamily.extraBold, letterSpacing: -0.6, color: C.ink2 },
    rowValMe: { color: C.inkDark },

    zeroCard: { marginHorizontal: Spacing.lg, borderRadius: Radii.xl, backgroundColor: C.primarySoft, borderWidth: 1.5, borderColor: C.primaryPress, padding: 22 },
    zeroEyebrow: { fontSize: 10, fontFamily: FontFamily.extraBold, letterSpacing: 1.2, color: C.primaryText },
    zeroHeadline: { fontSize: 20, fontFamily: FontFamily.extraBold, letterSpacing: -0.8, color: C.inkDark, marginTop: 8 },
    zeroCta: {
      flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 7, marginTop: 16,
      paddingHorizontal: 16, paddingVertical: 11, borderRadius: Radii.pill,
      backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.primaryPress, minHeight: 44,
    },
    zeroCtaPlus: { fontSize: 14, lineHeight: 14, fontFamily: FontFamily.extraBold, color: C.primaryText },
    zeroCtaText: { fontSize: 13, fontFamily: FontFamily.extraBold, color: C.primaryText },
  });
}
