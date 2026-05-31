import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, TextInput, Alert, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTodayTasks, useDailySummary, useWeeklySummary, useLogTask, useCategories } from '../queries/useToday';
import { getLocalDate } from '../logic/formatters';
import { Colors, Typography, Radii, Spacing, Shadows } from '../theme';
import { USER_ID } from '../constants';

type Task = {
  id: number;
  name: string;
  kind: string;
  is_time_based: number;
  base_points: number;
  star_penalty: number;
  icon: string | null;
};

export function TodayScreen() {
  const navigation = useNavigation();
  const { data: tasks, isLoading, isError } = useTodayTasks(USER_ID);
  const { data: daily } = useDailySummary(USER_ID);
  const { data: weekly } = useWeeklySummary(USER_ID);
  const { data: categories } = useCategories(USER_ID);
  const logTask = useLogTask(USER_ID);

  const [modalTask, setModalTask] = useState<Task | null>(null);
  const [duration, setDuration] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  const filteredTasks = selectedCategoryId === null
    ? tasks ?? []
    : (tasks ?? []).filter(t => (t as any).category_id === selectedCategoryId);

  async function handleLog(task: Task) {
    if (task.is_time_based) {
      setModalTask(task);
      return;
    }
    try {
      await logTask.mutateAsync({
        taskTypeId: task.id,
        kind: task.kind as 'GOOD' | 'BAD',
        isTimeBased: false,
        basePoints: task.base_points,
        starPenalty: task.star_penalty,
      });
    } catch (err) {
      Alert.alert('Lỗi', 'Không thể ghi nhận. Thử lại.');
    }
  }

  async function handleLogTime() {
    if (!modalTask) return;
    const mins = parseInt(duration, 10);
    if (isNaN(mins) || mins <= 0) {
      Alert.alert('Nhập số phút hợp lệ');
      return;
    }
    try {
      await logTask.mutateAsync({
        taskTypeId: modalTask.id,
        kind: modalTask.kind as 'GOOD' | 'BAD',
        isTimeBased: true,
        basePoints: modalTask.base_points,
        starPenalty: modalTask.star_penalty,
        durationMin: mins,
      });
      setModalTask(null);
      setDuration('');
    } catch (err) {
      Alert.alert('Lỗi', 'Không thể ghi nhận. Thử lại.');
    }
  }

  if (isLoading) return <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />;
  if (isError) return (
    <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ color: Colors.danger, fontSize: 16 }}>Lỗi tải dữ liệu. Khởi động lại ứng dụng.</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Chào, bạn 👋</Text>
          <Text style={styles.date}>{getLocalDate()}</Text>
        </View>
        <TouchableOpacity style={styles.avatar} onPress={() => navigation.navigate('Profile' as never)}>
          <Text style={styles.avatarText}>B</Text>
        </TouchableOpacity>
      </View>

      {/* Stats strip */}
      <View style={styles.statsStrip}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{(weekly?.weekly_stars ?? 0).toFixed(0)}</Text>
          <Text style={styles.statLabel}>★ tuần</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{daily?.total_points ?? 0}</Text>
          <Text style={styles.statLabel}>pts hôm nay</Text>
        </View>
        {daily?.bonus_star_awarded ? (
          <>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>🎯</Text>
              <Text style={styles.statLabel}>Bonus!</Text>
            </View>
          </>
        ) : null}
      </View>

      {/* Category chips */}
      {categories && categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          <TouchableOpacity
            style={[styles.chip, selectedCategoryId === null && styles.chipActive]}
            onPress={() => setSelectedCategoryId(null)}
          >
            <Text style={[styles.chipText, selectedCategoryId === null && styles.chipTextActive]}>
              Tất cả
            </Text>
          </TouchableOpacity>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.chip, selectedCategoryId === cat.id && styles.chipActive]}
              onPress={() => setSelectedCategoryId(cat.id)}
            >
              <Text style={[styles.chipText, selectedCategoryId === cat.id && styles.chipTextActive]}>
                {cat.icon ? `${cat.icon} ` : ''}{cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Task list */}
      <FlatList
        data={filteredTasks}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, item.kind === 'BAD' && styles.badRow]}
            onPress={() => handleLog(item)}
            disabled={logTask.isPending}
          >
            <Text style={styles.icon}>{item.icon ?? (item.kind === 'GOOD' ? '✅' : '❌')}</Text>
            <Text style={styles.taskName}>{item.name}</Text>
            <Text style={styles.pts}>
              {item.kind === 'GOOD'
                ? `+${item.is_time_based ? '1pt/30m' : item.base_points + 'pt'}`
                : `-${item.star_penalty}⭐`}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {selectedCategoryId ? 'Không có hoạt động trong danh mục này.' : 'Chưa có hoạt động. Vào Hồ sơ để thêm.'}
          </Text>
        }
      />

      {/* Duration modal */}
      <Modal visible={!!modalTask} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Bao nhiêu phút?</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={duration}
              onChangeText={setDuration}
              placeholder="Ví dụ: 45"
              placeholderTextColor={Colors.faint}
              autoFocus
            />
            <TouchableOpacity style={styles.btn} onPress={handleLogTime}>
              <Text style={styles.btnText}>Ghi nhận</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setModalTask(null); setDuration(''); }}>
              <Text style={styles.cancel}>Huỷ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgBase },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: 52, paddingBottom: Spacing.md,
    backgroundColor: Colors.surface, ...Shadows.light,
  },
  greeting: { ...Typography.bodyStrong, color: Colors.inkDark },
  date: { ...Typography.caption, color: Colors.muted },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primarySoft, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontWeight: '800', color: Colors.primary },
  statsStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderColor: Colors.line,
  },
  statItem: { alignItems: 'center', paddingHorizontal: Spacing.lg },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.starGold },
  statLabel: { ...Typography.caption, color: Colors.muted, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: Colors.line },
  chipScroll: { maxHeight: 52, backgroundColor: Colors.surface2 },
  chipRow: { paddingHorizontal: Spacing.sm, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radii.pill,
    borderWidth: 1, borderColor: Colors.line2, backgroundColor: Colors.surface,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  chipText: { color: Colors.muted, fontSize: 13 },
  chipTextActive: { color: Colors.primaryPress, fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: 16,
    borderBottomWidth: 1, borderColor: Colors.line,
  },
  badRow: { backgroundColor: Colors.dangerSoft },
  icon: { fontSize: 24, marginRight: 12 },
  taskName: { flex: 1, ...Typography.body, color: Colors.inkDark },
  pts: { ...Typography.caption, color: Colors.muted },
  empty: { textAlign: 'center', color: Colors.muted, marginTop: 40, fontSize: 16, paddingHorizontal: Spacing.xl },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: Colors.surface, padding: Spacing.xl,
    borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl,
  },
  modalTitle: { ...Typography.title, color: Colors.inkDark, marginBottom: Spacing.md },
  input: {
    backgroundColor: Colors.surface2, color: Colors.inkDark, padding: 12,
    borderRadius: Radii.sm, fontSize: 18, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.line,
  },
  btn: { backgroundColor: Colors.primary, padding: 14, borderRadius: Radii.sm, alignItems: 'center', marginBottom: 8 },
  btnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  cancel: { textAlign: 'center', color: Colors.muted, padding: 8 },
});
