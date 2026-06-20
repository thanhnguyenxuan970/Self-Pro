import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Radii, Spacing, AppColors, FontFamily } from '../config/theme';
import { useTheme } from '../hooks/useSettings';

export interface RankTier {
  id: number;
  tier_order: number;     // 1..7
  rank_name: string;
  stars_required: number;
}

interface Props {
  visible: boolean;
  tiers: RankTier[];
  currentTierId: number | null;
  onClose: () => void;
}

const POINTS: { e: string; t: string; s: string }[] = [
  { e: '⭐', t: 'Làm việc → nhận sao', s: 'Hoàn thành hoạt động là có sao.' },
  { e: '📈', t: 'Đủ sao → lên hạng', s: 'Có 7 hạng, càng nhiều sao càng cao.' },
  { e: '♻️', t: 'Reset mỗi thứ 2', s: 'Sao về mức sàn — giữ hạng phải duy trì.' },
];

export function RankInfoSheet({ visible, tiers, currentTierId, onClose }: Props) {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const sorted = [...tiers].sort((a, b) => a.tier_order - b.tier_order);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grip} />
          <View style={styles.head}>
            <Text style={styles.title}>Rank là gì?</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Đóng">
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {POINTS.map((p) => (
              <View key={p.t} style={styles.pt}>
                <Text style={styles.ptEmoji}>{p.e}</Text>
                <View style={styles.flex1}>
                  <Text style={styles.ptTitle}>{p.t}</Text>
                  <Text style={styles.ptSub}>{p.s}</Text>
                </View>
              </View>
            ))}

            <Text style={styles.sec}>Thang bậc · {sorted.length} hạng</Text>
            {sorted.map((tier) => {
              const cur = tier.id === currentTierId;
              return (
                <View key={tier.id} style={[styles.lrow, cur && styles.lrowCur]}>
                  <View style={[styles.lnum, cur && styles.lnumCur]}>
                    <Text style={[styles.lnumText, cur && styles.lnumTextCur]}>{tier.tier_order}</Text>
                  </View>
                  <Text style={styles.lname}>{tier.rank_name}</Text>
                  {cur ? (
                    <View style={styles.youtag}>
                      <Text style={styles.youtagText}>BẠN</Text>
                    </View>
                  ) : null}
                  <Text style={styles.lstar}>{tier.stars_required} ⭐</Text>
                </View>
              );
            })}
            <View style={{ height: Spacing.sm }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: { backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: Spacing.lg, paddingBottom: Spacing.md, maxHeight: '86%' },
    grip: { width: 38, height: 4, borderRadius: 2, backgroundColor: C.line2, alignSelf: 'center', marginBottom: 12 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    title: { fontSize: 18, fontFamily: FontFamily.bold, color: C.inkDark },
    close: { fontSize: 17, color: C.faint, fontFamily: FontFamily.bold },
    flex1: { flex: 1 },
    pt: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: C.surface2, borderRadius: Radii.md, padding: 12, marginBottom: 8 },
    ptEmoji: { fontSize: 18 },
    ptTitle: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.inkDark },
    ptSub: { fontSize: 11.5, color: C.ink2, marginTop: 1 },
    sec: { fontSize: 12, fontFamily: FontFamily.semiBold, color: C.ink2, marginTop: 10, marginBottom: 8 },
    lrow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 7 },
    lrowCur: { borderWidth: 2, borderColor: C.primary, backgroundColor: C.primarySoft },
    lnum: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.surface3, alignItems: 'center', justifyContent: 'center' },
    lnumCur: { backgroundColor: C.primary },
    lnumText: { fontSize: 11, fontFamily: FontFamily.bold, color: C.muted },
    lnumTextCur: { color: C.white },
    lname: { flex: 1, fontSize: 13, fontFamily: FontFamily.semiBold, color: C.inkDark },
    lstar: { fontSize: 12.5, fontFamily: FontFamily.semiBold, color: C.muted },
    youtag: { backgroundColor: C.primary, borderRadius: Radii.pill, paddingHorizontal: 6, paddingVertical: 1, marginRight: 6 },
    youtagText: { fontSize: 11, fontFamily: FontFamily.bold, color: C.white },
  });
}
