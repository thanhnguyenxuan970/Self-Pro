import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Radii, Spacing, AppColors } from '../config/theme';
import { useTheme } from '../hooks/useSettings';

export interface SubOption { key: string; label: string; }
export interface SubActivityResult { subType?: string; durationMin?: number; }

interface DurOption { label: string; minutes?: number; }
const DURATIONS: DurOption[] = [
  { label: '30 phút', minutes: 30 },
  { label: '1 giờ', minutes: 60 },
  { label: 'Không tính giờ' },
];

// Optional default sub-types per generic activity. Pass your own via `subOptions`.
export const DEFAULT_SUBTYPES: Record<string, SubOption[]> = {
  'Thể thao': [
    { key: 'run', label: '🏃 Chạy bộ' },
    { key: 'gym', label: '🏋️ Gym' },
    { key: 'football', label: '⚽ Bóng đá' },
    { key: 'yoga', label: '🧘 Yoga' },
  ],
  Sports: [
    { key: 'run', label: '🏃 Run' },
    { key: 'gym', label: '🏋️ Gym' },
    { key: 'football', label: '⚽ Football' },
    { key: 'yoga', label: '🧘 Yoga' },
  ],
};

interface Props {
  visible: boolean;
  title: string;
  subOptions?: SubOption[];
  showDuration?: boolean;
  onClose: () => void;
  onConfirm: (result: SubActivityResult) => void;
}

export function SubActivitySheet({ visible, title, subOptions, showDuration = false, onClose, onConfirm }: Props) {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const [sub, setSub] = useState<string | undefined>(undefined);
  const [durIdx, setDurIdx] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (visible) {
      setSub(undefined);
      setDurIdx(undefined);
    }
  }, [visible]);

  const confirm = () => {
    const durationMin = durIdx != null ? DURATIONS[durIdx].minutes : undefined;
    onConfirm({ subType: sub, durationMin });
  };

  const opts = subOptions ?? [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grip} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Chi tiết — tuỳ chọn, bỏ qua cũng được</Text>

          {opts.length > 0 ? (
            <View style={styles.chips}>
              {opts.map((o) => {
                const on = sub === o.key;
                return (
                  <Pressable key={o.key} onPress={() => setSub(on ? undefined : o.key)} style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {showDuration ? (
            <View>
              <Text style={styles.label}>⏱️ Thời lượng</Text>
              <View style={styles.chips}>
                {DURATIONS.map((d, i) => {
                  const on = durIdx === i;
                  return (
                    <Pressable key={d.label} onPress={() => setDurIdx(on ? undefined : i)} style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{d.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.acts}>
            <Pressable style={[styles.btn, styles.skip]} onPress={onClose}>
              <Text style={styles.skipText}>Bỏ qua</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.save]} onPress={confirm}>
              <Text style={styles.saveText}>Lưu</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8,16,11,0.45)' },
    sheet: { backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: Spacing.lg, paddingBottom: Spacing.xl },
    grip: { width: 38, height: 4, borderRadius: 2, backgroundColor: C.line2, alignSelf: 'center', marginBottom: 14 },
    title: { fontSize: 16, fontWeight: '700', color: C.inkDark },
    subtitle: { fontSize: 12, color: C.muted, marginTop: 2, marginBottom: 14 },
    label: { fontSize: 12, color: C.muted, marginBottom: 8 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.pill, backgroundColor: C.primarySoft },
    chipOn: { backgroundColor: C.primary },
    chipText: { fontSize: 13, fontWeight: '500', color: C.inkDark },
    chipTextOn: { color: C.white },
    acts: { flexDirection: 'row', gap: 10, marginTop: 2 },
    btn: { flex: 1, paddingVertical: 13, borderRadius: Radii.md, alignItems: 'center' },
    skip: { backgroundColor: C.surface2 },
    skipText: { fontSize: 14, fontWeight: '600', color: C.muted },
    save: { backgroundColor: C.primary },
    saveText: { fontSize: 14, fontWeight: '600', color: C.white },
  });
}
