import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert, ScrollView, Animated, Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useTreatPool, useTreats, useAddTreat, useEnjoyTreat,
  useTreatHistory, useAvgDailyTreatStars, DecoratedTreat, TreatHistoryRow,
} from '../queries/useTreats';
import { useStreakFreezeEligibility, usePurchaseStreakFreeze } from '../queries/useFund';
import { STREAK_FREEZE_COST } from '../config/constants';
import Toast from 'react-native-toast-message';
import { formatVND } from '../utils/formatters';
import { Typography, Radii, Spacing, Shadows, AppColors } from '../config/theme';
import { useAuthUser } from '../hooks/useAuth';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { cueTreatClaim } from '../audio/uiSounds';
import { Strings } from '../config/i18n';

const FUND_IN_DEV = true;

const CONFETTI_COLORS = ['#FFD700', '#FF6B6B', '#4CAF50', '#2196F3', '#FF9800', '#E91E63'];
const CONFETTI_DIRS: [number, number][] = [[-30, -40], [30, -40], [-50, -20], [50, -20], [-18, -60], [18, -60]];

function TreatCard({
  treat, onEnjoy, colors, styles, t, avgDaily,
}: {
  treat: DecoratedTreat;
  onEnjoy: () => void;
  colors: AppColors;
  styles: ReturnType<typeof makeStyles>;
  t: Strings;
  avgDaily: number;
}) {
  const isEnjoyed = treat.status === 'ENJOYED';

  const progressAnim = useRef(new Animated.Value(treat.progressPct)).current;
  const confetti = useRef(
    Array.from({ length: 6 }, () => ({
      opacity: new Animated.Value(0),
      x: new Animated.Value(0),
      y: new Animated.Value(0),
    }))
  ).current;
  const cardOpacity = useRef(new Animated.Value(isEnjoyed ? 0.45 : 1)).current;
  const cardScale = useRef(new Animated.Value(isEnjoyed ? 0.97 : 1)).current;
  const btnScale = useRef(new Animated.Value(1)).current;
  const burstOpacity = useRef(new Animated.Value(0)).current;
  const burstScale = useRef(new Animated.Value(0.3)).current;

  const prevUnlockable = useRef(treat.unlockable);
  const prevEnjoyed = useRef(isEnjoyed);

  useEffect(() => {
    Animated.spring(progressAnim, { toValue: treat.progressPct, tension: 100, friction: 8, useNativeDriver: false }).start();
  }, [treat.progressPct]);

  useEffect(() => {
    if (treat.unlockable && !prevUnlockable.current) {
      confetti.forEach((p, i) => {
        p.opacity.setValue(1);
        p.x.setValue(0);
        p.y.setValue(0);
        Animated.parallel([
          Animated.timing(p.opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
          Animated.timing(p.x, { toValue: CONFETTI_DIRS[i][0], duration: 700, useNativeDriver: true }),
          Animated.timing(p.y, { toValue: CONFETTI_DIRS[i][1], duration: 700, useNativeDriver: true }),
        ]).start();
      });
    }
    prevUnlockable.current = treat.unlockable;
  }, [treat.unlockable]);

  useEffect(() => {
    if (isEnjoyed && !prevEnjoyed.current) {
      Animated.parallel([
        Animated.spring(cardOpacity, { toValue: 0.45, tension: 100, friction: 8, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 0.97, tension: 100, friction: 8, useNativeDriver: true }),
      ]).start();
    }
    prevEnjoyed.current = isEnjoyed;
  }, [isEnjoyed]);

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  const btnPressIn = () => Animated.spring(btnScale, { toValue: 0.92, tension: 140, friction: 7, useNativeDriver: true }).start();
  const btnPressOut = () => Animated.sequence([
    Animated.spring(btnScale, { toValue: 1.12, tension: 140, friction: 7, useNativeDriver: true }),
    Animated.spring(btnScale, { toValue: 1, tension: 140, friction: 7, useNativeDriver: true }),
  ]).start();

  const handleEnjoyPress = () => {
    burstOpacity.setValue(0.6);
    burstScale.setValue(0.3);
    Animated.parallel([
      Animated.timing(burstOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.spring(burstScale, { toValue: 2.5, tension: 60, friction: 8, useNativeDriver: true }),
    ]).start();
    onEnjoy();
  };

  return (
    <Animated.View style={[styles.treatCard, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
      {/* Confetti burst on unlock */}
      <View style={styles.confettiWrap} pointerEvents="none">
        {confetti.map((p, i) => (
          <Animated.View
            key={i}
            style={[styles.confettiDot, { backgroundColor: CONFETTI_COLORS[i], opacity: p.opacity, transform: [{ translateX: p.x }, { translateY: p.y }] }]}
          />
        ))}
      </View>

      <View style={styles.treatIcon}>
        <Text style={{ fontSize: 22 }}>{treat.icon === 'gift' ? '🎁' : treat.icon}</Text>
      </View>
      <View style={styles.treatBody}>
        <View style={styles.treatRow}>
          <Text style={styles.treatName} numberOfLines={1}>{treat.name}</Text>
          {isEnjoyed && <Text style={styles.enjoyedBadge}>{t.enjoyedBadge}</Text>}
        </View>
        <Text style={styles.treatSub}>≈ {formatVND(treat.approx_amount)} · {treat.target_stars}★</Text>
        {!isEnjoyed && (
          <View style={styles.progressWrap}>
            <View style={styles.progressBg}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
            <Text style={styles.progressLabel}>
              {treat.unlockable ? t.readyToEnjoy : t.starsMore(treat.starsToUnlock)}
            </Text>
            {!treat.unlockable && avgDaily > 0 && (
              <Text style={styles.etaText}>
                {treat.starsToUnlock <= avgDaily ? t.etaToday : t.etaDays(Math.ceil(treat.starsToUnlock / avgDaily))}
              </Text>
            )}
          </View>
        )}
      </View>
      {treat.unlockable && (
        <Animated.View style={{ transform: [{ scale: btnScale }] }}>
          <Pressable style={styles.enjoyBtn} onPress={handleEnjoyPress} onPressIn={btnPressIn} onPressOut={btnPressOut}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: burstOpacity, transform: [{ scale: burstScale }], borderRadius: Radii.sm }]} />
            <Text style={styles.enjoyBtnText}>{t.claimBtn}</Text>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

function HistoryItem({
  item, styles,
}: {
  item: TreatHistoryRow;
  styles: ReturnType<typeof makeStyles>;
}) {
  const date = new Date(item.enjoyed_at);
  const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
  return (
    <View style={styles.histRow}>
      <Text style={styles.histIcon}>🎁</Text>
      <View style={styles.histBody}>
        <Text style={styles.histName}>{item.name}</Text>
        <Text style={styles.histDate}>{dateStr}</Text>
      </View>
      <Text style={styles.histStars}>−{item.stars_spent}★</Text>
    </View>
  );
}

export function FundScreen() {
  const userId = useAuthUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data: pool, isLoading: poolLoading } = useTreatPool(userId);
  const { data: treats, isLoading: treatsLoading } = useTreats(userId);
  const { data: history } = useTreatHistory(userId);
  const { data: avgDaily = 0 } = useAvgDailyTreatStars(userId);
  const addTreat = useAddTreat(userId);
  const enjoyTreat = useEnjoyTreat(userId);
  const freezeEligibility = useStreakFreezeEligibility(userId);
  const purchaseFreeze = usePurchaseStreakFreeze(userId);

  const [addModal, setAddModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const enjoyingRef = useRef(false);

  const treatStars = pool?.treat_stars ?? 0;
  const valuePerStar = pool?.value_per_star ?? 1000;

  function handleEnjoy(treat: DecoratedTreat) {
    if (enjoyingRef.current) {
      Toast.show({ type: 'info', text1: t.processing, visibilityTime: 1200 });
      return;
    }
    Alert.alert(
      t.enjoyTitle,
      t.enjoyMsg(treat.name, treat.target_stars),
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.confirm,
          onPress: async () => {
            enjoyingRef.current = true;
            try {
              await enjoyTreat.mutateAsync(treat.id);
              cueTreatClaim();
              Toast.show({ type: 'success', text1: t.celebration(treat.name), visibilityTime: 2500 });
            } catch (e: any) {
              Alert.alert(t.error, e?.message === 'NOT_ENOUGH_STARS' ? t.notEnoughStars : t.cantConfirm);
            } finally {
              enjoyingRef.current = false;
            }
          },
        },
      ]
    );
  }

  async function handleAddTreat() {
    const name = addName.trim();
    const amount = parseInt(addAmount.replace(/\D/g, ''), 10);
    if (!name) { Alert.alert(t.enterName); return; }
    if (isNaN(amount) || amount <= 0) { Alert.alert(t.enterAmount); return; }
    try {
      await addTreat.mutateAsync({ name, approxAmount: amount, valuePerStar });
      setAddModal(false);
      setAddName('');
      setAddAmount('');
    } catch {
      Alert.alert(t.error, t.addError);
    }
  }

  async function handleFreeze() {
    const d = freezeEligibility.data;
    if (!d?.eligible) return;
    try {
      await purchaseFreeze.mutateAsync({ localDate: d.yesterday, currentStreak: d.currentStreak });
      Toast.show({ type: 'success', text1: t.freezeSuccess, visibilityTime: 2500 });
    } catch (e: any) {
      Alert.alert(t.error, e?.message === 'INSUFFICIENT_FUNDS' ? t.notEnoughStarsFreeze : t.freezeError);
    }
  }

  if (poolLoading || treatsLoading) {
    return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;
  }

  if (FUND_IN_DEV) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.screenTitle}>{t.fundTitle}</Text>
        <View style={styles.devLock}>
          <Text style={styles.devLockIcon}>🚧</Text>
          <Text style={styles.devLockTitle}>{t.inDevelopmentTitle}</Text>
          <Text style={styles.devLockDesc}>{t.inDevelopmentDesc}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const activeTreats = treats?.filter(t => t.status === 'ACTIVE') ?? [];
  const enjoyedTreats = treats?.filter(t => t.status === 'ENJOYED') ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.screenTitle}>{t.fundTitle}</Text>

        {/* Pool header */}
        <LinearGradient
          colors={['#15402E', '#1E6646']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.poolCard}
        >
          <Text style={styles.poolLabel}>{t.poolLabel}</Text>
          <Text style={styles.poolStars}>★ {treatStars}</Text>
          <Text style={styles.poolSub}>≈ {formatVND(treatStars * valuePerStar)} · {t.neverExpires}</Text>
        </LinearGradient>

        {/* Add treat button */}
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddModal(true)}>
          <Text style={styles.addBtnText}>{t.addRewardBtn}</Text>
        </TouchableOpacity>

        {/* Streak freeze card */}
        {freezeEligibility.data?.eligible && (
          <View style={styles.freezeCard}>
            <Text style={styles.freezeTitle}>{t.freezeTitle}</Text>
            <Text style={styles.freezeDesc}>
              {t.freezeDesc(freezeEligibility.data.currentStreak, STREAK_FREEZE_COST)}
            </Text>
            <TouchableOpacity
              style={[styles.freezeBtn, purchaseFreeze.isPending && { opacity: 0.5 }]}
              onPress={handleFreeze}
              disabled={purchaseFreeze.isPending}
            >
              <Text style={styles.freezeBtnText}>{t.freezeBtn(STREAK_FREEZE_COST)}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Active treats */}
        {activeTreats.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t.goalsSection}</Text>
            {activeTreats.map(treat => (
              <TreatCard key={treat.id} treat={treat} onEnjoy={() => handleEnjoy(treat)} colors={colors} styles={styles} t={t} avgDaily={avgDaily} />
            ))}
          </>
        )}

        {activeTreats.length === 0 && (
          <Text style={styles.empty}>{t.emptyRewards}</Text>
        )}

        {/* Enjoyed treats */}
        {enjoyedTreats.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t.enjoyedSection}</Text>
            {enjoyedTreats.map(treat => (
              <TreatCard key={treat.id} treat={treat} onEnjoy={() => {}} colors={colors} styles={styles} t={t} avgDaily={avgDaily} />
            ))}
          </>
        )}

        {/* History */}
        {(history?.length ?? 0) > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t.fundHistorySection}</Text>
            {history!.map(h => <HistoryItem key={h.id} item={h} styles={styles} />)}
          </>
        )}
      </ScrollView>

      {/* Add treat modal */}
      <Modal visible={addModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t.addModalTitle}</Text>
            <Text style={styles.sheetSub}>{t.addModalSub}</Text>
            <TextInput
              style={styles.input}
              placeholder={t.namePlaceholder}
              placeholderTextColor={colors.faint}
              value={addName}
              onChangeText={setAddName}
            />
            <TextInput
              style={styles.input}
              placeholder={t.amountPlaceholder}
              placeholderTextColor={colors.faint}
              keyboardType="numeric"
              value={addAmount}
              onChangeText={setAddAmount}
            />
            {addAmount.length > 0 && !isNaN(parseInt(addAmount.replace(/\D/g, ''), 10)) && (
              <Text style={styles.starsPreview}>
                {t.starsPreview(Math.max(1, Math.round(parseInt(addAmount.replace(/\D/g, ''), 10) / valuePerStar)))}
              </Text>
            )}
            <View style={styles.sheetButtons}>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.cancelBtn]}
                onPress={() => { setAddModal(false); setAddName(''); setAddAmount(''); }}
              >
                <Text style={styles.cancelTxt}>{t.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.confirmBtn, addTreat.isPending && { opacity: 0.5 }]}
                onPress={handleAddTreat}
                disabled={addTreat.isPending}
              >
                <Text style={styles.confirmTxt}>{t.addBtn}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bgBase },
    screenTitle: {
      fontSize: 24, fontWeight: '800', letterSpacing: -0.5,
      color: C.inkDark, marginHorizontal: Spacing.lg, marginTop: 10, marginBottom: 14,
    },
    poolCard: {
      marginHorizontal: Spacing.lg, borderRadius: Radii.xl,
      padding: 20, overflow: 'hidden', ...Shadows.hero,
    },
    poolLabel: { fontSize: 12, opacity: 0.85, fontWeight: '700', letterSpacing: 0.3, color: '#fff' },
    poolStars: { fontSize: 38, fontWeight: '800', letterSpacing: -1, marginTop: 6, lineHeight: 44, color: '#fff' },
    poolSub: { fontSize: 11.5, opacity: 0.75, marginTop: 6, color: '#fff' },
    addBtn: {
      marginHorizontal: Spacing.lg, marginTop: Spacing.sm, paddingVertical: 12,
      borderRadius: Radii.md, alignItems: 'center',
      backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primary,
    },
    addBtnText: { color: C.primary, fontWeight: '700', fontSize: 15 },
    sectionLabel: {
      fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase',
      letterSpacing: 0.7, marginHorizontal: Spacing.lg, marginTop: Spacing.lg, marginBottom: 6,
    },
    treatCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      marginHorizontal: Spacing.lg, marginBottom: 10, padding: 14,
      backgroundColor: C.surface, borderRadius: Radii.lg,
      borderWidth: 1, borderColor: C.line, ...Shadows.medium,
      overflow: 'visible',
    },
    confettiWrap: { position: 'absolute', top: '50%' as any, left: '40%' as any, justifyContent: 'center', alignItems: 'center' },
    confettiDot: { position: 'absolute', width: 7, height: 7, borderRadius: 4 },
    treatIcon: {
      width: 40, height: 40, borderRadius: Radii.sm,
      backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center', flexShrink: 0,
    },
    treatBody: { flex: 1, minWidth: 0 },
    treatRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    treatName: { fontSize: 15, fontWeight: '700', color: C.inkDark, flex: 1 },
    enjoyedBadge: {
      fontSize: 11, fontWeight: '700', color: C.primary,
      backgroundColor: C.primarySoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    },
    treatSub: { fontSize: 11.5, color: C.muted, marginTop: 2 },
    progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    progressBg: { flex: 1, height: 5, backgroundColor: C.line, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: C.primary, borderRadius: 3 },
    progressLabel: { fontSize: 11.5, fontWeight: '600', color: C.ink2, flexShrink: 0 },
    etaText: { fontSize: 11, color: C.ink2, marginTop: 2, fontStyle: 'italic' },
    enjoyBtn: {
      backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radii.sm,
      overflow: 'hidden',
    },
    enjoyBtnText: { color: C.white, fontWeight: '800', fontSize: 13 },
    histRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 13, paddingHorizontal: Spacing.lg,
      borderBottomWidth: 1, borderColor: C.line,
    },
    histIcon: { fontSize: 20 },
    histBody: { flex: 1 },
    histName: { fontSize: 14, fontWeight: '600', color: C.inkDark },
    histDate: { fontSize: 11.5, color: C.muted, marginTop: 2 },
    histStars: { fontSize: 13.5, fontWeight: '700', color: C.inkDark },
    freezeCard: {
      marginHorizontal: Spacing.lg, marginTop: Spacing.sm, marginBottom: 4,
      backgroundColor: C.surface, borderRadius: Radii.lg,
      padding: Spacing.md, borderWidth: 1.5, borderColor: C.primary,
    },
    freezeTitle: { ...Typography.bodyStrong, color: C.inkDark, marginBottom: 4 },
    freezeDesc: { ...Typography.body, color: C.muted, marginBottom: Spacing.sm },
    freezeBtn: {
      backgroundColor: C.primary, padding: 12, borderRadius: Radii.sm, alignItems: 'center',
    },
    freezeBtnText: { color: C.white, fontWeight: '700', fontSize: 14 },
    empty: {
      textAlign: 'center', color: C.muted, marginTop: 32,
      fontSize: 15, paddingHorizontal: 32, lineHeight: 24,
    },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: C.surface, borderTopLeftRadius: Radii.xxl,
      borderTopRightRadius: Radii.xxl, padding: Spacing.xl, paddingBottom: 40,
    },
    sheetTitle: { ...Typography.title, color: C.inkDark, marginBottom: 4, textAlign: 'center' },
    sheetSub: { ...Typography.caption, color: C.muted, marginBottom: Spacing.md, textAlign: 'center' },
    starsPreview: { fontSize: 13, fontWeight: '700', color: C.primary, textAlign: 'center', marginBottom: Spacing.sm },
    input: {
      backgroundColor: C.surface2, borderRadius: Radii.sm, padding: 14,
      fontSize: 15, color: C.inkDark, marginBottom: 12,
      borderWidth: 1, borderColor: C.line,
    },
    sheetButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
    sheetBtn: { flex: 1, padding: 14, borderRadius: Radii.sm, alignItems: 'center' },
    cancelBtn: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line2 },
    cancelTxt: { color: C.muted, fontSize: 15, fontWeight: '600' },
    confirmBtn: { backgroundColor: C.primary },
    confirmTxt: { color: C.white, fontSize: 15, fontWeight: '700' },
  });
}
