import { View, Text } from 'react-native';
import { TaskRow } from '../molecules/TaskRow';
import type { Task } from '../types';

export interface TaskListProps {
  tasks: Task[];
  onToggle: (id: string) => void;
  emptyLabelVi?: string;
  emptyLabelEn?: string;
  emptyHintVi?: string;
  emptyHintEn?: string;
  lang?: 'vi' | 'en';
}

const EMOJI: Record<string, string> = { study:'📚', sports:'🏃', family:'👨‍👩‍👧', work:'💼', other:'⭐' };

export function TaskList({ tasks, onToggle,
  emptyLabelVi = 'Hôm nay vẫn chưa có gì', emptyLabelEn = 'Nothing logged today',
  emptyHintVi = 'Chạm + để ghi hoạt động đầu tiên', emptyHintEn = 'Tap + to log your first activity',
  lang = 'vi' }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <View className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg p-9 items-center">
        <Text className="text-[42px] opacity-60">🌱</Text>
        <Text className="text-[14px] font-bold text-ink-2 dark:text-ink-dark-2 mt-2">
          {lang === 'vi' ? emptyLabelVi : emptyLabelEn}
        </Text>
        <Text className="text-[12px] text-ink-muted dark:text-ink-dark-muted mt-1">
          {lang === 'vi' ? emptyHintVi : emptyHintEn}
        </Text>
      </View>
    );
  }
  return (
    <View className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg px-3.5">
      {tasks.map(t => (
        <TaskRow key={t.id} name={t.name} emoji={EMOJI[t.category] ?? '⭐'}
          durationMin={t.durationMin} kind={t.kind} done={t.done}
          onToggle={() => onToggle(t.id)}/>
      ))}
    </View>
  );
}
export default TaskList;
