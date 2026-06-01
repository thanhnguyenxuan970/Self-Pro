import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useTreatPool, useTreats, useAddTreat, useEnjoyTreat,
  useTreatHistory, DecoratedTreat, TreatHistoryRow,
} from '../queries/useTreats';
import { useStreakFreezeEligibility, usePurchaseStreakFreeze } from '../queries/useFund';
import { STREAK_FREEZE_COST } from '../constants';
import Toast from 'react-native-toast-message';
import { formatVND } from '../logic/formatters';
import { Colors, Typography, Radii, Spacing, Shadows } from '../theme';
import { useAuthUser } from '../hooks/useAuth';

function TreatCard({ treat, onEnjoy }: { treat: DecoratedTreat; onEnjoy: () => void }) {
  const isEnjoyed = treat.status === 'ENJOYED';
  return (
    <View style={[styles.treatCard, isEnjoyed && styles.treatCardDim]}>
      <View style={styles.treatIcon}>
        <Text style={{ fontSize: 22 }}>{treat.icon === 'gift' ? '🎁' : treat.icon}</Text>
      </View>
      <View style={styles.treatBody}>
        <View style={styles.treatRow}>
          <Text style={styles.treatName} numberOfLines={1}>{treat.name}</Text>
          {isEnjoyed && <Text style={styles.enjoyedBadge}>✓ Đã hưởng</Text>}
        </View>
        <Text style={styles.treatSub}>≈ {formatVND(treat.approx_amount)} · {treat.target_stars}★</Text>
        {!isEnjoyed && (
          <View style={styles.progressWrap}>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${treat.progressPct}%` as any }]} />
            </View>
            <Text style={styles.progressLabel}>
              {treat.unlockable ? '🎉 Có thể hưởng thụ!' : `${treat.starsToUnlock}★ nữa`}
            </Text>
          </View>
        )}
      </View>
      {treat.unlockable && (
        <TouchableOpacity style={styles.enjoyBtn} onPress={onEnjoy}>
          <Text style={styles.enjoyBtnText}>Nhận</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function HistoryItem({ item }: { item: TreatHistoryRow }) {
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
  const { data: pool, isLoading: poolLoading } = useTreatPool(userId);
  const { data: treats, isLoading: treatsLoading } = useTreats(userId);
  const { data: history } = useTreatHistory(userId);
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
      Toast.show({ type: 'info', text1: 'Đang xử lý…', visibilityTime: 1200 });
      return;
    }
    Alert.alert(
      'Hưởng thụ phần thưởng?',
      `"${treat.name}" sẽ tốn ${treat.target_stars}★ từ kho của bạn.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xác nhận',
          onPress: async () => {
            enjoyingRef.current = true;
            try {
              await enjoyTreat.mutateAsync(treat.id);
              Toast.show({ type: 'success', text1: `🎉 Chúc mừng! ${treat.name}`, visibilityTime: 2500 });
            } catch (e: any) {
              Alert.alert('Lỗi', e?.message === 'NOT_ENOUGH_STARS' ? 'Chưa đủ sao' : 'Không thể xác nhận');
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
    if (!name) { Alert.alert('Nhập tên phần thưởng'); return; }
    if (isNaN(amount) || amount <= 0) { Alert.alert('Nhập giá tiền hợp lệ'); return; }
    try {
      await addTreat.mutateAsync({ name, approxAmount: amount, valuePerStar });
      setAddModal(false);
      setAddName('');
      setAddAmount('');
    } catch {
      Alert.alert('Lỗi', 'Không thể thêm phần thưởng');
    }
  }

  async function handleFreeze() {
    const d = freezeEligibility.data;
    if (!d?.eligible) return;
    try {
      await purchaseFreeze.mutateAsync({ localDate: d.yesterday, currentStreak: d.currentStreak });
      Toast.show({ type: 'success', text1: '🧊 Streak được bảo vệ!', text2: `Tốn ${STREAK_FREEZE_COST}★`, visibilityTime: 2500 });
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message === 'INSUFFICIENT_FUNDS' ? 'Không đủ sao' : 'Không thể mua streak freeze');
    }
  }

  if (poolLoading || treatsLoading) {
    return <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />;
  }

  const activeTreats = treats?.filter(t => t.status === 'ACTIVE') ?? [];
  const enjoyedTreats = treats?.filter(t => t.status === 'ENJOYED') ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.screenTitle}>Kho Quà Thưởng</Text>

        {/* Pool header */}
        <LinearGradient
          colors={['#15402E', '#1E6646']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.poolCard}
        >
          <Text style={styles.poolLabel}>KHO SAO TÍCH LUỸ</Text>
          <Text style={styles.poolStars}>★ {treatStars}</Text>
          <Text style={styles.poolSub}>≈ {formatVND(treatStars * valuePerStar)} · Không bao giờ hết hạn</Text>
        </LinearGradient>

        {/* Add treat button */}
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddModal(true)}>
          <Text style={styles.addBtnText}>+ Thêm phần thưởng</Text>
        </TouchableOpacity>

        {/* Streak freeze card */}
        {freezeEligibility.data?.eligible && (
          <View style={styles.freezeCard}>
            <Text style={styles.freezeTitle}>🧊 Streak bị gián đoạn!</Text>
            <Text style={styles.freezeDesc}>
              Bảo vệ streak {freezeEligibility.data.currentStreak} ngày? Tốn {STREAK_FREEZE_COST}★
            </Text>
            <TouchableOpacity
              style={[styles.freezeBtn, purchaseFreeze.isPending && { opacity: 0.5 }]}
              onPress={handleFreeze}
              disabled={purchaseFreeze.isPending}
            >
              <Text style={styles.freezeBtnText}>Bảo vệ ({STREAK_FREEZE_COST}★)</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Active treats */}
        {activeTreats.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>MỤC TIÊU</Text>
            {activeTreats.map(t => (
              <TreatCard key={t.id} treat={t} onEnjoy={() => handleEnjoy(t)} />
            ))}
          </>
        )}

        {activeTreats.length === 0 && (
          <Text style={styles.empty}>
            Chưa có phần thưởng.{'\n'}Thêm mục tiêu để bắt đầu tích sao!
          </Text>
        )}

        {/* Enjoyed treats */}
        {enjoyedTreats.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>ĐÃ HƯỞNG THỤ</Text>
            {enjoyedTreats.map(t => (
              <TreatCard key={t.id} treat={t} onEnjoy={() => {}} />
            ))}
          </>
        )}

        {/* History */}
        {(history?.length ?? 0) > 0 && (
          <>
            <Text style={styles.sectionLabel}>LỊCH SỬ</Text>
            {history!.map(h => <HistoryItem key={h.id} item={h} />)}
          </>
        )}
      </ScrollView>

      {/* Add treat modal */}
      <Modal visible={addModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Thêm phần thưởng</Text>
            <Text style={styles.sheetSub}>Nhập giá → tự động tính số sao cần tích</Text>
            <TextInput
              style={styles.input}
              placeholder="Tên phần thưởng (vd: Trà sữa, Tai nghe)"
              placeholderTextColor={Colors.faint}
              value={addName}
              onChangeText={setAddName}
            />
            <TextInput
              style={styles.input}
              placeholder="Giá tiền (VND)"
              placeholderTextColor={Colors.faint}
              keyboardType="numeric"
              value={addAmount}
              onChangeText={setAddAmount}
            />
            {addAmount.length > 0 && !isNaN(parseInt(addAmount.replace(/\D/g, ''), 10)) && (
              <Text style={styles.starsPreview}>
                = {Math.max(1, Math.round(parseInt(addAmount.replace(/\D/g, ''), 10) / valuePerStar))}★ cần tích
              </Text>
            )}
            <View style={styles.sheetButtons}>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.cancelBtn]}
                onPress={() => { setAddModal(false); setAddName(''); setAddAmount(''); }}
              >
                <Text style={styles.cancelTxt}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.confirmBtn, addTreat.isPending && { opacity: 0.5 }]}
                onPress={handleAddTreat}
                disabled={addTreat.isPending}
              >
                <Text style={styles.confirmTxt}>Thêm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgBase },
  screenTitle: {
    fontSize: 24, fontWeight: '800', letterSpacing: -0.5,
    color: Colors.inkDark, marginHorizontal: Spacing.lg, marginTop: 10, marginBottom: 14,
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
    backgroundColor: Colors.primarySoft, borderWidth: 1, borderColor: Colors.primary,
  },
  addBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 15 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase',
    letterSpacing: 0.7, marginHorizontal: Spacing.lg, marginTop: Spacing.lg, marginBottom: 6,
  },
  treatCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: Spacing.lg, marginBottom: 10, padding: 14,
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    borderWidth: 1, borderColor: Colors.line, ...Shadows.medium,
  },
  treatCardDim: { opacity: 0.6 },
  treatIcon: {
    width: 40, height: 40, borderRadius: Radii.sm,
    backgroundColor: Colors.primarySoft, justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  treatBody: { flex: 1, minWidth: 0 },
  treatRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  treatName: { fontSize: 15, fontWeight: '700', color: Colors.inkDark, flex: 1 },
  enjoyedBadge: {
    fontSize: 11, fontWeight: '700', color: Colors.primary,
    backgroundColor: Colors.primarySoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  treatSub: { fontSize: 11.5, color: Colors.muted, marginTop: 2 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  progressBg: { flex: 1, height: 5, backgroundColor: Colors.line, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  progressLabel: { fontSize: 11.5, fontWeight: '600', color: Colors.ink2, flexShrink: 0 },
  enjoyBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radii.sm,
  },
  enjoyBtnText: { color: Colors.white, fontWeight: '800', fontSize: 13 },
  histRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1, borderColor: Colors.line,
  },
  histIcon: { fontSize: 20 },
  histBody: { flex: 1 },
  histName: { fontSize: 14, fontWeight: '600', color: Colors.inkDark },
  histDate: { fontSize: 11.5, color: Colors.muted, marginTop: 2 },
  histStars: { fontSize: 13.5, fontWeight: '700', color: Colors.inkDark },
  freezeCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.sm, marginBottom: 4,
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary,
  },
  freezeTitle: { ...Typography.bodyStrong, color: Colors.inkDark, marginBottom: 4 },
  freezeDesc: { ...Typography.body, color: Colors.muted, marginBottom: Spacing.sm },
  freezeBtn: {
    backgroundColor: Colors.primary, padding: 12, borderRadius: Radii.sm, alignItems: 'center',
  },
  freezeBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  empty: {
    textAlign: 'center', color: Colors.muted, marginTop: 32,
    fontSize: 15, paddingHorizontal: 32, lineHeight: 24,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radii.xxl,
    borderTopRightRadius: Radii.xxl, padding: Spacing.xl, paddingBottom: 40,
  },
  sheetTitle: { ...Typography.title, color: Colors.inkDark, marginBottom: 4, textAlign: 'center' },
  sheetSub: { ...Typography.caption, color: Colors.muted, marginBottom: Spacing.md, textAlign: 'center' },
  starsPreview: { fontSize: 13, fontWeight: '700', color: Colors.primary, textAlign: 'center', marginBottom: Spacing.sm },
  input: {
    backgroundColor: Colors.surface2, borderRadius: Radii.sm, padding: 14,
    fontSize: 15, color: Colors.inkDark, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.line,
  },
  sheetButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  sheetBtn: { flex: 1, padding: 14, borderRadius: Radii.sm, alignItems: 'center' },
  cancelBtn: { backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.line2 },
  cancelTxt: { color: Colors.muted, fontSize: 15, fontWeight: '600' },
  confirmBtn: { backgroundColor: Colors.primary },
  confirmTxt: { color: Colors.white, fontSize: 15, fontWeight: '700' },
});
