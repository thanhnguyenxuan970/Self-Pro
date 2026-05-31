import React, { useState, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert,
} from 'react-native';
import { useFundBalance, useFundLedger, useSpendFund, useDepositFund, LedgerRow, useStreakFreezeEligibility, usePurchaseStreakFreeze } from '../queries/useFund';
import { STREAK_FREEZE_COST } from '../constants';
import Toast from 'react-native-toast-message';
import { validateDeposit } from '../logic/fundDeposit';
import { formatVND } from '../logic/formatters';
import { Colors, Typography, Radii, Spacing, Shadows } from '../theme';
import { useAuthUser } from '../hooks/useAuth';

function renderRow({ item }: { item: LedgerRow }) {
  const isDeposit = item.type === 'DEPOSIT';
  const sign = isDeposit ? '+' : '−';
  const color = isDeposit ? Colors.primary : Colors.danger;
  const date = new Date(item.occurred_at);
  const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  return (
    <View style={styles.row}>
      <Text style={styles.rowIcon}>{isDeposit ? '💰' : '🛍️'}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowType}>{isDeposit ? (item.note ?? 'Nạp tiền') : (item.note ?? 'Chi tiêu')}</Text>
        <Text style={styles.rowDate}>{dateStr}</Text>
      </View>
      <Text style={[styles.rowAmount, { color }]}>
        {sign}{formatVND(item.amount)}
      </Text>
    </View>
  );
}

export function FundScreen() {
  const userId = useAuthUser();
  const { data: balance, isLoading: balanceLoading } = useFundBalance(userId);
  const { data: ledger, isLoading: ledgerLoading } = useFundLedger(userId);
  const spendFund = useSpendFund(userId);
  const depositFund = useDepositFund(userId);
  const freezeEligibility = useStreakFreezeEligibility(userId);
  const purchaseFreeze = usePurchaseStreakFreeze(userId);

  const [spendModal, setSpendModal] = useState(false);
  const [spendAmount, setSpendAmount] = useState('');
  const [spendNote, setSpendNote] = useState('');
  const spendingRef = useRef(false);

  const [depositVisible, setDepositVisible] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNote, setDepositNote] = useState('');

  async function handleFreeze() {
    const d = freezeEligibility.data;
    if (!d?.eligible) return;
    try {
      await purchaseFreeze.mutateAsync({ localDate: d.yesterday, currentStreak: d.currentStreak });
      Toast.show({ type: 'success', text1: '🧊 Streak được bảo vệ!', text2: `Streak ${d.currentStreak} ngày tiếp tục`, visibilityTime: 2500 });
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message === 'INSUFFICIENT_FUNDS' ? 'Số dư không đủ' : 'Không thể mua streak freeze');
    }
  }

  const handleSpend = async () => {
    if (spendingRef.current) return;
    const amt = parseInt(spendAmount, 10);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Số tiền không hợp lệ');
      return;
    }
    spendingRef.current = true;
    try {
      await spendFund.mutateAsync({ amount: amt, note: spendNote.trim() || undefined });
      setSpendModal(false);
      setSpendAmount('');
      setSpendNote('');
    } catch (e: any) {
      if (e?.message === 'INSUFFICIENT_FUNDS') {
        Alert.alert('Lỗi', 'Số dư không đủ');
      } else {
        Alert.alert('Lỗi', 'Không thể lưu chi tiêu. Thử lại.');
      }
    } finally {
      spendingRef.current = false;
    }
  };

  const handleDeposit = async () => {
    const amount = parseInt(depositAmount.replace(/\D/g, ''), 10);
    const result = validateDeposit(amount);
    if (!result.valid) {
      Alert.alert('Số tiền không hợp lệ', result.error);
      return;
    }
    try {
      await depositFund.mutateAsync({ amount, note: depositNote.trim() || undefined });
      setDepositVisible(false);
      setDepositAmount('');
      setDepositNote('');
    } catch {
      Alert.alert('Lỗi', 'Không thể nạp tiền. Thử lại.');
    }
  };

  if (balanceLoading || ledgerLoading) {
    return <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />;
  }

  return (
    <View style={styles.container}>
      {/* Balance header */}
      <View style={styles.header}>
        <Text style={styles.balanceLabel}>SỐ DƯ KHẢ DỤNG</Text>
        <Text style={styles.balanceAmount}>{formatVND(balance ?? 0)}</Text>
        <Text style={styles.balanceSub}>Cam kết của bạn · Tự thưởng khi đạt mục tiêu</Text>
      </View>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.actionBtn, styles.depositBtn]} onPress={() => setDepositVisible(true)}>
          <Text style={styles.depositBtnText}>+ Nạp tiền</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.spendBtn]} onPress={() => setSpendModal(true)}>
          <Text style={styles.spendBtnText}>💸 Chi tiêu</Text>
        </TouchableOpacity>
      </View>

      {/* Streak freeze card */}
      {freezeEligibility.data?.eligible && (
        <View style={styles.freezeCard}>
          <Text style={styles.freezeTitle}>🧊 Streak bị gián đoạn!</Text>
          <Text style={styles.freezeDesc}>
            Hôm qua không có hoạt động. Bảo vệ streak {freezeEligibility.data.currentStreak} ngày?
          </Text>
          <TouchableOpacity
            style={[styles.freezeBtn, purchaseFreeze.isPending && { opacity: 0.5 }]}
            onPress={handleFreeze}
            disabled={purchaseFreeze.isPending}
          >
            <Text style={styles.freezeBtnText}>
              Bảo vệ ({formatVND(STREAK_FREEZE_COST)})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Ledger */}
      <FlatList
        data={ledger ?? []}
        keyExtractor={item => String(item.id)}
        renderItem={renderRow}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Chưa có giao dịch.{'\n'}Nạp tiền để cam kết với mục tiêu của bạn!
          </Text>
        }
      />

      {/* Withdrawal modal */}
      <Modal visible={spendModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Ghi nhận chi tiêu</Text>
            <TextInput
              style={styles.input}
              placeholder="Số tiền (VND)"
              placeholderTextColor={Colors.faint}
              keyboardType="numeric"
              value={spendAmount}
              onChangeText={setSpendAmount}
            />
            <TextInput
              style={styles.input}
              placeholder="Bạn đã tự thưởng gì? (tuỳ chọn)"
              placeholderTextColor={Colors.faint}
              value={spendNote}
              onChangeText={setSpendNote}
            />
            <View style={styles.sheetButtons}>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.cancelBtn]}
                onPress={() => { setSpendModal(false); setSpendAmount(''); setSpendNote(''); }}
              >
                <Text style={styles.cancelTxt}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.confirmBtn]}
                onPress={handleSpend}
                disabled={spendFund.isPending}
              >
                <Text style={styles.confirmTxt}>
                  {spendFund.isPending ? 'Đang lưu…' : 'Xác nhận'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Deposit modal */}
      <Modal visible={depositVisible} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Nạp tiền vào quỹ</Text>
            <Text style={styles.sheetSubtitle}>Cam kết trước, tự thưởng khi đạt mốc Sao.</Text>
            <TextInput
              style={styles.input}
              placeholder="Số tiền (VND)"
              placeholderTextColor={Colors.faint}
              keyboardType="numeric"
              value={depositAmount}
              onChangeText={setDepositAmount}
            />
            <TextInput
              style={styles.input}
              placeholder="Ghi chú (tuỳ chọn)"
              placeholderTextColor={Colors.faint}
              value={depositNote}
              onChangeText={setDepositNote}
            />
            <View style={styles.sheetButtons}>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.cancelBtn]}
                onPress={() => { setDepositVisible(false); setDepositAmount(''); setDepositNote(''); }}
              >
                <Text style={styles.cancelTxt}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.confirmBtn, depositFund.isPending && { opacity: 0.5 }]}
                onPress={handleDeposit}
                disabled={depositFund.isPending}
              >
                <Text style={styles.confirmTxt}>Nạp</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgBase },
  header: { padding: Spacing.xl, backgroundColor: Colors.surface, alignItems: 'center', ...Shadows.light },
  balanceLabel: { ...Typography.sectionLabel, color: Colors.muted, marginBottom: 8 },
  balanceAmount: { fontSize: 38, color: Colors.starGold, fontWeight: '800' },
  balanceSub: { ...Typography.caption, color: Colors.muted, marginTop: 6, textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: Radii.md, alignItems: 'center' },
  depositBtn: { backgroundColor: Colors.primarySoft, borderWidth: 1, borderColor: Colors.primary },
  depositBtnText: { color: Colors.primary, fontWeight: '700' },
  spendBtn: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line2 },
  spendBtnText: { color: Colors.ink2, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderColor: Colors.line },
  rowIcon: { fontSize: 24, marginRight: 12 },
  rowBody: { flex: 1 },
  rowType: { ...Typography.body, color: Colors.inkDark },
  rowDate: { ...Typography.caption, color: Colors.muted, marginTop: 2 },
  rowAmount: { fontSize: 16, fontWeight: '700' },
  empty: { textAlign: 'center', color: Colors.muted, marginTop: 48, fontSize: 15, paddingHorizontal: 32, lineHeight: 24 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, padding: Spacing.xl, paddingBottom: 40 },
  sheetTitle: { ...Typography.title, color: Colors.inkDark, marginBottom: 4, textAlign: 'center' },
  sheetSubtitle: { ...Typography.caption, color: Colors.muted, marginBottom: Spacing.md, textAlign: 'center' },
  input: { backgroundColor: Colors.surface2, borderRadius: Radii.sm, padding: 14, fontSize: 15, color: Colors.inkDark, marginBottom: 12, borderWidth: 1, borderColor: Colors.line },
  sheetButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  sheetBtn: { flex: 1, padding: 14, borderRadius: Radii.sm, alignItems: 'center' },
  cancelBtn: { backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.line2 },
  cancelTxt: { color: Colors.muted, fontSize: 15, fontWeight: '600' },
  confirmBtn: { backgroundColor: Colors.primary },
  confirmTxt: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  freezeCard: {
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary,
  },
  freezeTitle: { ...Typography.bodyStrong, color: Colors.inkDark, marginBottom: 4 },
  freezeDesc: { ...Typography.body, color: Colors.muted, marginBottom: Spacing.sm },
  freezeBtn: {
    backgroundColor: Colors.primary, padding: 12, borderRadius: Radii.sm, alignItems: 'center',
  },
  freezeBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});
