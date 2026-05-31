import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors, Typography, Radii, Spacing, Shadows } from '../theme';
import { TEMPLATE_CATEGORIES } from '../constants';
import { useAuthUser } from '../hooks/useAuth';
import { buildTemplateTasks } from '../logic/seedTemplates';
import { useCreateTask } from '../queries/useTasks';

type Props = { onComplete: () => Promise<void> };

export function OnboardingScreen({ onComplete }: Props) {
  const userId = useAuthUser();
  const [selected, setSelected] = useState<Set<string>>(new Set(['sports']));
  const [loading, setLoading] = useState(false);
  const createTask = useCreateTask(userId);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleStart = async () => {
    if (selected.size === 0) {
      Alert.alert('Chọn ít nhất 1 danh mục', 'Bạn có thể thêm thêm sau.');
      return;
    }
    setLoading(true);
    try {
      const tasks = buildTemplateTasks(Array.from(selected));
      for (const task of tasks) {
        await createTask.mutateAsync({
          name: task.name,
          kind: task.kind,
          isTimeBased: task.isTimeBased,
          basePoints: task.basePoints,
          starPenalty: task.starPenalty,
          icon: task.icon,
        });
      }
      await onComplete();
    } catch {
      Alert.alert('Lỗi', 'Không thể khởi tạo. Thử lại.');
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chào mừng! 🌿</Text>
      <Text style={styles.subtitle}>
        Chọn danh mục để bắt đầu. Bạn có thể thêm hoạt động tuỳ chỉnh sau.
      </Text>

      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {TEMPLATE_CATEGORIES.map((cat) => {
          const active = selected.has(cat.key);
          return (
            <TouchableOpacity
              key={cat.key}
              style={[styles.card, active && styles.cardActive]}
              onPress={() => toggle(cat.key)}
              activeOpacity={0.7}
            >
              <Text style={styles.cardIcon}>{cat.icon}</Text>
              <Text style={[styles.cardName, active && styles.cardNameActive]}>
                {cat.name}
              </Text>
              <Text style={[styles.cardCount, active && styles.cardCountActive]}>
                {cat.tasks.length} hoạt động
              </Text>
              {active && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleStart}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.buttonText}>Bắt đầu →</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgBase,
    paddingHorizontal: Spacing.lg,
    paddingTop: 60,
  },
  title: { ...Typography.title, color: Colors.inkDark, marginBottom: 8 },
  subtitle: { ...Typography.body, color: Colors.muted, marginBottom: Spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingBottom: 100 },
  card: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.line,
    alignItems: 'center',
    ...Shadows.light,
  },
  cardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  cardIcon: { fontSize: 36, marginBottom: 8 },
  cardName: { ...Typography.bodyStrong, color: Colors.inkDark },
  cardNameActive: { color: Colors.primaryPress },
  cardCount: { ...Typography.caption, color: Colors.muted, marginTop: 2 },
  cardCountActive: { color: Colors.primaryHover },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 10,
    color: Colors.primary,
    fontWeight: '800',
    fontSize: 16,
  },
  button: {
    position: 'absolute',
    bottom: 32,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: Radii.md,
    paddingVertical: 16,
    alignItems: 'center',
    ...Shadows.hero,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
});
