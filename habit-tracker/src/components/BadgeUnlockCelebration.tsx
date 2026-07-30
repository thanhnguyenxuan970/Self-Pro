import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge } from './Badge';
import { ACHIEVEMENTS, type Achievement } from '../config/achievements';
import { computeAchievementStatus, type AchievementStats } from '../lib/achievements';
import { useAllTimeStats } from '../queries/useProgress';
import { useRankData } from '../queries/useRank';
import { useAchievementActivityMetrics, useAchievementUnlocks, useChallengeDaysTotal, useWeeklyOverachieverCount } from '../queries/useAchievements';
import { getDb } from '../db/client';
import { useAuthUser } from '../hooks/useAuth';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { cueBadgeUnlock } from '../audio/uiSounds';
import { FontFamily, Radii } from '../config/theme';
import { badgeCelebrationFormat } from '../lib/badgeCelebration';

type Unlock = Achievement & { label: string; description: string };

export function BadgeUnlockCelebrationHost() {
  const userId = useAuthUser();
  const t = useTranslations();
  const { data: allTime, isLoading: allTimeLoading } = useAllTimeStats(userId);
  const { data: rank, isLoading: rankLoading } = useRankData(userId);
  const { data: challengeDays, isLoading: challengeLoading } = useChallengeDaysTotal(userId);
  const { data: overachieveWeeks, isLoading: overachieveLoading } = useWeeklyOverachieverCount(userId);
  const { data: activityMetrics, isLoading: metricsLoading } = useAchievementActivityMetrics(userId);
  const { data: unlocks = {}, isLoading: unlocksLoading } = useAchievementUnlocks(userId);
  const [queue, setQueue] = useState<Unlock[]>([]);
  const ready = useRef(false);
  const loading = allTimeLoading || rankLoading || challengeLoading || overachieveLoading || metricsLoading || unlocksLoading;
  const stats: AchievementStats = useMemo(() => {
    const currentTier = rank?.tiers.find(tier => tier.id === rank.currentTierId)?.tier_order ?? 0;
    return { totalActivities: allTime?.totalActivities ?? 0, totalStars: allTime?.totalStars ?? 0, bestStreak: allTime?.bestStreak ?? 0, activeDays: allTime?.activeDays ?? 0, challengeDaysDone: challengeDays ?? 0, rankTierOrder: currentTier, weeklyOverachieveWeeks: overachieveWeeks ?? 0, morningLogs: activityMetrics?.morningLogs ?? 0, nightLogs: activityMetrics?.nightLogs ?? 0, activityTypes: activityMetrics?.activityTypes ?? 0 };
  }, [activityMetrics, allTime, challengeDays, overachieveWeeks, rank]);

  useEffect(() => {
    if (loading) return;
    const earned = ACHIEVEMENTS.filter(item => computeAchievementStatus(item, stats).earned && !unlocks[item.id]);
    const announce = ready.current;
    ready.current = true;
    if (!earned.length) return;
    Promise.all(earned.map(async item => {
      const db = await getDb();
      const result = await db.runAsync(
        `INSERT OR IGNORE INTO achievements (user_id, key, rarity, earned_at, source_type, source_id)
         VALUES (?, ?, 'common', date('now'), 'record', NULL)`,
        [userId, item.id],
      );
      return result.changes > 0 ? item : null;
    })).then(created => {
      if (!announce) return;
      const next = created.filter((item): item is Achievement => item !== null).map(item => ({ ...item, label: t[item.labelKey as keyof typeof t] as string, description: t[`${item.labelKey}Desc` as keyof typeof t] as string }));
      if (next.length) setQueue(current => [...current, ...next]);
    }).catch(() => {});
  }, [loading, stats, unlocks, t, userId]);

  const current = queue[0] ?? null;
  return <BadgeUnlockCelebration unlock={current} position={queue.length} onDismiss={() => setQueue(current => current.slice(1))} />;
}

function BadgeUnlockCelebration({ unlock, position, onDismiss }: { unlock: Unlock | null; position: number; onDismiss: () => void }) {
  const { colors, isDark } = useTheme();
  const t = useTranslations();
  const reduceMotion = useReduceMotion();
  const { top, bottom } = useSafeAreaInsets();
  const rare = !!unlock && badgeCelebrationFormat(unlock.tier) === 'takeover';
  const entrance = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const confetti = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!unlock) return;
    entrance.setValue(0); float.setValue(0); confetti.setValue(0);
    cueBadgeUnlock(rare);
    const enter = Animated.timing(entrance, { toValue: 1, duration: reduceMotion ? 150 : rare ? 550 : 420, easing: reduceMotion ? Easing.ease : Easing.out(Easing.cubic), useNativeDriver: true });
    enter.start();
    if (reduceMotion) return () => enter.stop();
    const idle = Animated.loop(Animated.sequence([Animated.timing(float, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }), Animated.timing(float, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true })]));
    const burst = Animated.timing(confetti, { toValue: 1, duration: 1250, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    idle.start(); burst.start();
    return () => { enter.stop(); idle.stop(); burst.stop(); };
  }, [confetti, entrance, float, rare, reduceMotion, unlock]);
  useEffect(() => {
    if (!unlock || rare) return;
    const timer = setTimeout(onDismiss, 4200);
    return () => clearTimeout(timer);
  }, [onDismiss, rare, unlock]);
  if (!unlock) return null;
  const styles = makeStyles(colors, top, bottom, rare);
  if (!rare) return <Modal visible transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent navigationBarTranslucent><TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onDismiss} accessibilityRole="button" accessibilityLabel={t.close}><Animated.View style={[styles.sheet, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] }) }] }]}><Badge tier={unlock.tier} emblem={unlock.emblem} size={56} colors={colors} /><View style={styles.sheetCopy}><Text style={styles.eyebrow}>{t.badgeUnlockEyebrow}</Text><Text style={styles.sheetTitle} numberOfLines={1}>{unlock.label}</Text><Text style={styles.description} numberOfLines={2}>{unlock.description}</Text></View><Text style={styles.tierChip}>{unlock.tier.toUpperCase()}</Text></Animated.View></TouchableOpacity></Modal>;
  return <Modal visible transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent navigationBarTranslucent><TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss} accessibilityRole="button" accessibilityLabel={t.close}><Animated.View style={[styles.glow, { opacity: entrance.interpolate({ inputRange: [0, 1], outputRange: [0, .72] }), transform: [{ scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [.55, 1] }) }] }]} />{!reduceMotion && Array.from({ length: unlock.tier === 'diamond' ? 46 : unlock.tier === 'platinum' ? 40 : unlock.tier === 'gold' ? 34 : 24 }, (_, index) => { const angle = index * 2.4; const distance = 90 + index % 7 * 24; return <Animated.View key={index} style={[styles.confetti, { backgroundColor: ['#A78BFA', '#60A5FA', '#FB923C', '#E0A93B', '#25B36E'][index % 5], opacity: confetti.interpolate({ inputRange: [0, .7, 1], outputRange: [1, 1, 0] }), transform: [{ translateX: confetti.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * distance] }) }, { translateY: confetti.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * distance] }) }, { rotate: confetti.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${index % 2 ? 540 : -540}deg`] }) }] }]} />; })}<Animated.View style={[styles.hero, { opacity: entrance, transform: [{ scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [.6, 1] }) }, { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }) }] }]}><Text style={styles.eyebrow}>{t.badgeUnlockEyebrow}</Text><Badge tier={unlock.tier} emblem={unlock.emblem} size={150} colors={colors} /><Text style={styles.title}>{unlock.label}</Text><Text style={styles.tierChip}>{unlock.tier.toUpperCase()}{position > 1 ? ` · 1/${position}` : ''}</Text><Text style={styles.description}>{unlock.description}</Text></Animated.View><View style={[styles.cta, { backgroundColor: colors.primary }]}><Text style={[styles.ctaText, { color: isDark ? '#141816' : '#FFF' }]}>{position > 1 ? t.badgeUnlockNextCta : t.badgeUnlockDismissCta}</Text></View></TouchableOpacity></Modal>;
}

// The rare-tier takeover `backdrop` is deliberately a fixed near-black
// (not C.scrim / theme-aware) so the confetti and glow colors stay legible
// regardless of the user's light/dark setting -- unlike a plain modal
// backdrop, this one is a full-bleed celebration effect, not app chrome.
// The CTA text's `isDark ? '#141816' : '#FFF'` (not C.onAccent) is the same
// stopgap as StreakMilestoneCelebrationModal: C.onAccent is flat white and
// fails AA against dark-mode's lighter accent primaries (~1.4-3:1 for 5/6
// accents) -- see TODOS.md's "Per-theme onAccent ink color" item.
function makeStyles(C: ReturnType<typeof useTheme>['colors'], top: number, bottom: number, rare: boolean) { return StyleSheet.create({ sheetBackdrop: { flex: 1, paddingTop: top + 10, paddingHorizontal: 14 }, sheet: { minHeight: 92, borderRadius: Radii.xl, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, sheetCopy: { flex: 1 }, backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(8,10,9,.9)', paddingHorizontal: 28 }, glow: { position: 'absolute', width: 390, height: 390, borderRadius: 195, backgroundColor: rare ? C.primary : 'transparent' }, hero: { alignItems: 'center', width: '100%' }, eyebrow: { color: C.primary, fontFamily: FontFamily.extraBold, fontSize: 12, letterSpacing: 1.4, marginBottom: 12 }, title: { color: '#FFF', fontFamily: FontFamily.extraBold, fontSize: 28, lineHeight: 35, textAlign: 'center', marginTop: 22 }, sheetTitle: { color: C.inkDark, fontFamily: FontFamily.extraBold, fontSize: 16 }, description: { color: rare ? 'rgba(255,255,255,.72)' : C.muted, fontFamily: FontFamily.semiBold, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 7 }, tierChip: { color: C.primary, fontFamily: FontFamily.extraBold, fontSize: 12, letterSpacing: .8, marginTop: 12 }, confetti: { position: 'absolute', width: 8, height: 12, borderRadius: 2 }, cta: { position: 'absolute', bottom: Math.max(24, bottom + 12), left: 26, right: 26, minHeight: 54, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center' }, ctaText: { fontFamily: FontFamily.extraBold, fontSize: 16 } }); }
