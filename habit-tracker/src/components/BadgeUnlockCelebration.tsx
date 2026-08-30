import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge } from './Badge';
import { ACHIEVEMENTS, type Achievement } from '../config/achievements';
import { TIER_COINS } from '../config/badgeTiers';
import { achievementUnlockKey, computeAchievementStatus, type AchievementStats } from '../lib/achievements';
import { useAllTimeStats } from '../queries/useProgress';
import { useRankData } from '../queries/useRank';
import { useAchievementActivityMetrics, useAchievementUnlocks, useChallengeDaysTotal, useWeeklyOverachieverCount } from '../queries/useAchievements';
import { getDb } from '../db/client';
import { useAuthUser } from '../hooks/useAuth';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { cueBadgeUnlock } from '../audio/uiSounds';
import { FontFamily, Radii } from '../config/theme';
import { badgeCelebrationFormat, getBadgeConfettiCount, getBadgeRarity, type BadgeRarity } from '../lib/badgeCelebration';
import type { Strings } from '../config/i18n';

type Unlock = Achievement & { label: string; description: string };
type QueueState = { items: Unlock[]; index: number };

const EMPTY_QUEUE: QueueState = { items: [], index: 0 };
const RARITY_LABEL_KEY: Record<BadgeRarity, keyof Strings> = {
  common: 'badgeUnlockRarityCommon',
  rare: 'badgeUnlockRarityRare',
  veryRare: 'badgeUnlockRarityVeryRare',
  legendary: 'badgeUnlockRarityLegendary',
};

export function BadgeUnlockCelebrationHost() {
  const userId = useAuthUser();
  const t = useTranslations();
  const { data: allTime, isLoading: allTimeLoading } = useAllTimeStats(userId);
  const { data: rank, isLoading: rankLoading } = useRankData(userId);
  const { data: challengeDays, isLoading: challengeLoading } = useChallengeDaysTotal(userId);
  const { data: overachieveWeeks, isLoading: overachieveLoading } = useWeeklyOverachieverCount(userId);
  const { data: activityMetrics, isLoading: metricsLoading } = useAchievementActivityMetrics(userId);
  const { data: unlocks = {}, isLoading: unlocksLoading } = useAchievementUnlocks(userId);
  const [queue, setQueue] = useState<QueueState>(EMPTY_QUEUE);
  const ready = useRef(false);
  const loading = allTimeLoading || rankLoading || challengeLoading || overachieveLoading || metricsLoading || unlocksLoading;
  const stats: AchievementStats = useMemo(() => {
    const currentTier = rank?.tiers.find(tier => tier.id === rank.currentTierId)?.tier_order ?? 0;
    return {
      totalActivities: allTime?.totalActivities ?? 0,
      totalStars: allTime?.totalStars ?? 0,
      bestStreak: allTime?.bestStreak ?? 0,
      activeDays: allTime?.activeDays ?? 0,
      challengeDaysDone: challengeDays ?? 0,
      rankTierOrder: currentTier,
      weeklyOverachieveWeeks: overachieveWeeks ?? 0,
      morningLogs: activityMetrics?.morningLogs ?? 0,
      nightLogs: activityMetrics?.nightLogs ?? 0,
      activityTypes: activityMetrics?.activityTypes ?? 0,
    };
  }, [activityMetrics, allTime, challengeDays, overachieveWeeks, rank]);

  useEffect(() => {
    if (loading) return;
    const earned = ACHIEVEMENTS.filter(item => computeAchievementStatus(item, stats).earned && !unlocks[achievementUnlockKey(item.id)]);
    const announce = ready.current;
    ready.current = true;
    if (!earned.length) return;
    Promise.all(earned.map(async item => {
      const db = await getDb();
      const result = await db.runAsync(
        `INSERT OR IGNORE INTO achievements (user_id, key, rarity, earned_at, source_type, source_id)
         VALUES (?, ?, 'common', date('now'), 'record', NULL)`,
        [userId, achievementUnlockKey(item.id)],
      );
      return result.changes > 0 ? item : null;
    })).then(created => {
      if (!announce) return;
      const next = created
        .filter((item): item is Achievement => item !== null)
        .map(item => ({
          ...item,
          label: t[item.labelKey as keyof typeof t] as string,
          description: t[`${item.labelKey}Desc` as keyof typeof t] as string,
        }));
      if (!next.length) return;
      setQueue(current => current.items.length > 0
        ? { ...current, items: [...current.items, ...next] }
        : { items: next, index: 0 });
    }).catch(() => {});
  }, [loading, stats, unlocks, t, userId]);

  const current = queue.items[queue.index] ?? null;
  const dismiss = useCallback(() => {
    setQueue(state => state.index + 1 < state.items.length
      ? { ...state, index: state.index + 1 }
      : EMPTY_QUEUE);
  }, []);

  return (
    <BadgeUnlockCelebration
      unlock={current}
      position={current ? queue.index + 1 : 0}
      total={current ? queue.items.length : 0}
      onDismiss={dismiss}
    />
  );
}

function BadgeUnlockCelebration({ unlock, position, total, onDismiss }: { unlock: Unlock | null; position: number; total: number; onDismiss: () => void }) {
  const { colors } = useTheme();
  const t = useTranslations();
  const reduceMotion = useReduceMotion();
  const { top, bottom } = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const rare = !!unlock && badgeCelebrationFormat(unlock.tier) === 'takeover';
  const glowSize = Math.min(520, Math.max(320, windowWidth + 80));
  const backdrop = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;
  const coin = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const sheen = useRef(new Animated.Value(0)).current;
  const confetti = useRef(new Animated.Value(0)).current;
  const eyebrow = useRef(new Animated.Value(0)).current;
  const title = useRef(new Animated.Value(0)).current;
  const chip = useRef(new Animated.Value(0)).current;
  const cta = useRef(new Animated.Value(0)).current;
  const sheetEntrance = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const rarity = unlock ? getBadgeRarity(unlock.tier) : null;
  const rarityLabel = rarity ? t[RARITY_LABEL_KEY[rarity.kind]] as string : '';
  const rarityTextColor = rare ? colors.white : colors.inkDark;
  const glowColor = unlock ? TIER_COINS[unlock.tier][2] : colors.primary;
  const styles = useMemo(() => makeStyles(colors, top, bottom, rare, glowSize), [colors, top, bottom, rare, glowSize]);

  useEffect(() => {
    if (!unlock) return;
    closing.current = false;
    [backdrop, glow, coin, float, sheen, confetti, eyebrow, title, chip, cta, sheetEntrance].forEach(value => value.setValue(0));
    glowPulse.setValue(0);
    cueBadgeUnlock(unlock.tier);

    if (reduceMotion) {
      [backdrop, glow, coin, confetti, eyebrow, title, chip, cta, sheetEntrance].forEach(value => value.setValue(1));
      return;
    }

    const enter = Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 180, easing: Easing.ease, useNativeDriver: true }),
      Animated.sequence([Animated.delay(50), Animated.timing(glow, { toValue: 1, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true })]),
      Animated.sequence([Animated.delay(50), Animated.timing(coin, { toValue: 1, duration: 550, easing: Easing.bezier(0.34, 1.56, 0.64, 1), useNativeDriver: true })]),
      Animated.sequence([Animated.delay(50), Animated.timing(eyebrow, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true })]),
      Animated.sequence([Animated.delay(140), Animated.timing(title, { toValue: 1, duration: 500, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true })]),
      Animated.sequence([Animated.delay(300), Animated.timing(chip, { toValue: 1, duration: 400, easing: Easing.bezier(0.34, 1.56, 0.64, 1), useNativeDriver: true })]),
      Animated.sequence([Animated.delay(500), Animated.timing(cta, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true })]),
      Animated.timing(confetti, { toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(sheetEntrance, { toValue: 1, duration: 500, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }),
    ]);
    const floatLoop = Animated.loop(Animated.sequence([
      Animated.delay(650),
      Animated.timing(float, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const sheenLoop = Animated.loop(Animated.sequence([
      Animated.delay(1000),
      Animated.timing(sheen, { toValue: 1, duration: 3600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(sheen, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    const glowLoop = Animated.loop(Animated.sequence([
      Animated.delay(650),
      Animated.timing(glowPulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(glowPulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    enter.start();
    floatLoop.start();
    sheenLoop.start();
    glowLoop.start();
    return () => {
      enter.stop();
      floatLoop.stop();
      sheenLoop.stop();
      glowLoop.stop();
    };
  }, [backdrop, chip, coin, confetti, cta, eyebrow, float, glow, glowPulse, reduceMotion, sheen, sheetEntrance, title, unlock, rare]);

  const handleDismiss = useCallback(() => {
    if (!unlock || closing.current) return;
    closing.current = true;
    if (!rare || reduceMotion) {
      onDismiss();
      return;
    }
    Animated.timing(backdrop, { toValue: 0, duration: 180, easing: Easing.ease, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onDismiss();
    });
  }, [backdrop, onDismiss, rare, reduceMotion, unlock]);

  useEffect(() => {
    if (!unlock || rare) return;
    const timer = setTimeout(handleDismiss, 4200);
    return () => clearTimeout(timer);
  }, [handleDismiss, rare, unlock]);

  if (!unlock || !rarity) return null;

  if (!rare) {
    return (
      <Modal visible transparent animationType="none" onRequestClose={handleDismiss} statusBarTranslucent navigationBarTranslucent>
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleDismiss} accessibilityRole="button" accessibilityLabel={t.close} />
          <Animated.View style={[styles.sheet, { opacity: sheetEntrance, transform: [{ translateY: sheetEntrance.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] }) }] }]} accessibilityViewIsModal>
            <TouchableOpacity style={styles.sheetTouch} onPress={handleDismiss} activeOpacity={0.95} accessibilityRole="button" accessibilityLabel={t.close}>
              <Badge tier={unlock.tier} emblem={unlock.emblem} size={56} colors={colors} />
              <View style={styles.sheetCopy}>
                <Text style={styles.eyebrow}>{t.badgeUnlockEyebrow}</Text>
                <Text style={styles.sheetTitle} numberOfLines={1}>{unlock.label}</Text>
                <Text style={styles.description} numberOfLines={2}>{unlock.description}</Text>
                <View style={styles.sheetRarityRow}>
                  <Text style={[styles.tierName, { color: rarityTextColor }]}>{unlock.tier.toUpperCase()}</Text>
                  <View style={[styles.rarityChip, { borderColor: `${rarity.color}66`, backgroundColor: `${rarity.color}1F` }]}>
                    <Text style={[styles.rarityChipText, { color: rarityTextColor }]}>{`◇ ${rarityLabel} · ${rarity.percent}%`}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  const confettiCount = getBadgeConfettiCount(unlock.tier);
  return (
    <Modal visible transparent animationType="none" onRequestClose={handleDismiss} statusBarTranslucent navigationBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]} accessibilityViewIsModal>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleDismiss} accessibilityRole="button" accessibilityLabel={t.close} />
        {!reduceMotion && Array.from({ length: confettiCount }, (_, index) => {
          const angle = (index / confettiCount) * Math.PI * 2;
          const distance = 90 + (index % 7) * 24;
          const start = ((index % 7) + 1) * 0.04;
          return (
            <Animated.View
              key={index}
              pointerEvents="none"
              style={[styles.confetti, {
                backgroundColor: ['#A78BFA', '#60A5FA', '#FB923C', '#E0A93B', '#25B36E'][index % 5],
                opacity: confetti.interpolate({ inputRange: [0, start, start + 0.12, 1], outputRange: [0, 0, 1, 0] }),
                transform: [
                  { translateX: confetti.interpolate({ inputRange: [0, start, 1], outputRange: [0, 0, Math.cos(angle) * distance] }) },
                  { translateY: confetti.interpolate({ inputRange: [0, start, 1], outputRange: [0, 0, Math.sin(angle) * distance] }) },
                  { rotate: confetti.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${index % 2 ? 540 : -540}deg`] }) },
                ],
              }]}
            />
          );
        })}

        {total > 1 && <View pointerEvents="none" style={styles.queuePill}><Text style={styles.queuePillText}>{position}/{total}</Text></View>}

        <View style={styles.hero}>
          <Animated.Text style={[styles.eyebrow, { opacity: eyebrow }]}>{t.badgeUnlockEyebrow}</Animated.Text>
          <View style={styles.coinStage}>
            <Animated.View pointerEvents="none" style={[styles.glow, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.7] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }] }]}>
              <Animated.View style={[styles.glowInner, { opacity: glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0.95] }) }]}>
                <Svg width={glowSize} height={glowSize} viewBox="0 0 100 100">
                  <Defs>
                    <RadialGradient id={`badge-glow-${unlock.id}`} cx="50%" cy="50%" r="50%">
                      <Stop offset="0" stopColor={glowColor} stopOpacity="0.75" />
                      <Stop offset="0.48" stopColor={glowColor} stopOpacity="0.28" />
                      <Stop offset="1" stopColor={glowColor} stopOpacity="0" />
                    </RadialGradient>
                  </Defs>
                  <Circle cx="50" cy="50" r="50" fill={`url(#badge-glow-${unlock.id})`} />
                </Svg>
              </Animated.View>
            </Animated.View>
            <Animated.View style={[styles.coin, {
              opacity: coin,
              transform: [
                { scale: coin.interpolate({ inputRange: [0, 0.72, 1], outputRange: [0.6, 1.12, 1] }) },
                { rotate: coin.interpolate({ inputRange: [0, 0.55, 1], outputRange: ['-14deg', '5deg', '0deg'] }) },
                { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }) },
              ],
            }]}>
              <Badge tier={unlock.tier} emblem={unlock.emblem} size={150} colors={colors} sheenProgress={reduceMotion ? undefined : sheen} />
            </Animated.View>
          </View>
          <Animated.Text style={[styles.title, { opacity: title, transform: [{ translateY: title.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }] }]}>{unlock.label}</Animated.Text>
          <Animated.View style={[styles.tierRow, { opacity: chip, transform: [{ scale: chip.interpolate({ inputRange: [0, 0.72, 1], outputRange: [0.6, 1.16, 1] }) }] }]}>
            <Text style={[styles.tierName, { color: rarityTextColor }]}>{unlock.tier.toUpperCase()}</Text>
            <View style={[styles.rarityChip, { borderColor: `${rarity.color}66`, backgroundColor: `${rarity.color}1F` }]}>
              <Text style={[styles.rarityChipText, { color: rarityTextColor }]}>{`◇ ${rarityLabel} · ${rarity.percent}%`}</Text>
            </View>
          </Animated.View>
          <Animated.Text style={[styles.description, { opacity: title }]}>{unlock.description}</Animated.Text>
        </View>

        <Animated.View style={[styles.ctaWrap, { opacity: cta }]}>
          <TouchableOpacity style={[styles.cta, { backgroundColor: colors.primary }]} onPress={handleDismiss} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={position < total ? t.badgeUnlockNextCta : t.badgeUnlockDismissCta}>
            <Text style={[styles.ctaText, { color: colors.onAccent }]}>{position < total ? t.badgeUnlockNextCta : t.badgeUnlockDismissCta}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>['colors'], top: number, bottom: number, rare: boolean, glowSize: number) {
  return StyleSheet.create({
    sheetBackdrop: { flex: 1, paddingTop: top + 10, paddingHorizontal: 14 },
    sheet: { alignSelf: 'center', width: '100%', maxWidth: 480, minHeight: 92, borderRadius: Radii.xl, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
    sheetTouch: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    sheetCopy: { flex: 1, minWidth: 0 },
    backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(8,10,9,.9)', paddingHorizontal: 28, paddingTop: top + 16, paddingBottom: Math.max(88, bottom + 78), overflow: 'hidden' },
    glow: { position: 'absolute', width: glowSize, height: glowSize, borderRadius: glowSize / 2, left: '50%', top: '50%', marginLeft: -glowSize / 2, marginTop: -glowSize / 2 },
    glowInner: { width: '100%', height: '100%' },
    hero: { alignItems: 'center', width: '100%', maxWidth: 360, flexShrink: 1 },
    coinStage: { position: 'relative', width: 170, height: 170, alignItems: 'center', justifyContent: 'center' },
    coin: { alignItems: 'center', justifyContent: 'center', height: 170, width: 170 },
    eyebrow: { color: C.primaryText, fontFamily: FontFamily.extraBold, fontSize: 12, letterSpacing: 1.4, marginBottom: 12, textAlign: 'center' },
    title: { color: '#FFF', fontFamily: FontFamily.extraBold, fontSize: 28, lineHeight: 35, textAlign: 'center', marginTop: 22, maxWidth: 360 },
    description: { color: rare ? 'rgba(255,255,255,.72)' : C.muted, fontFamily: FontFamily.semiBold, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 7, maxWidth: 360 },
    sheetTitle: { color: C.inkDark, fontFamily: FontFamily.extraBold, fontSize: 16 },
    tierRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, maxWidth: '100%' },
    sheetRarityRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5, maxWidth: '100%' },
    tierName: { fontFamily: FontFamily.extraBold, fontSize: 12, letterSpacing: 0.8 },
    rarityChip: { borderWidth: 1, borderRadius: Radii.pill, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '100%' },
    rarityChipText: { fontFamily: FontFamily.extraBold, fontSize: 11, letterSpacing: 0.35 },
    confetti: { position: 'absolute', top: '50%', left: '50%', width: 8, height: 12, borderRadius: 2 },
    queuePill: { position: 'absolute', top: top + 18, right: 28, minWidth: 44, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.pill, backgroundColor: 'rgba(255,255,255,.12)', alignItems: 'center' },
    queuePillText: { color: 'rgba(255,255,255,.82)', fontFamily: FontFamily.extraBold, fontSize: 12 },
    ctaWrap: { position: 'absolute', bottom: Math.max(24, bottom + 12), left: 26, right: 26 },
    cta: { minHeight: 54, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center' },
    ctaText: { fontFamily: FontFamily.extraBold, fontSize: 16 },
  });
}
