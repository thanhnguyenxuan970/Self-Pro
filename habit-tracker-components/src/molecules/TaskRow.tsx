import { View, Text } from 'react-native';
import { Checkbox } from '../atoms/Checkbox';

export interface TaskRowProps {
  name: string;
  emoji: string;
  durationMin?: number;
  points?: number;
  kind?: 'good' | 'bad';
  done?: boolean;
  onToggle?: () => void;
}

export function TaskRow({ name, emoji, durationMin, points, kind = 'good', done, onToggle }: TaskRowProps) {
  const isBad = kind === 'bad';
  return (
    <View className="flex-row items-center gap-3 py-3.5 border-b border-line dark:border-line-dark">
      <Checkbox variant={isBad ? 'bad' : done ? 'done' : 'default'} onPress={isBad ? undefined : onToggle}/>
      <View className="flex-1">
        <Text className={`text-[14.5px] font-semibold ${done ? 'text-ink-muted dark:text-ink-dark-muted line-through' : 'text-ink dark:text-ink-dark'}`}>{name}</Text>
        <View className="flex-row items-center gap-2 mt-0.5">
          <Text className="text-[11.5px] text-ink-muted dark:text-ink-dark-muted">{emoji}</Text>
          {durationMin ? <>
            <View className="w-0.5 h-0.5 rounded-full bg-ink-faint dark:bg-ink-dark-faint"/>
            <Text className="text-[11.5px] text-ink-muted dark:text-ink-dark-muted">{durationMin}′</Text>
            {typeof points === 'number' && <>
              <View className="w-0.5 h-0.5 rounded-full bg-ink-faint dark:bg-ink-dark-faint"/>
              <Text className="text-[11.5px] text-ink-muted dark:text-ink-dark-muted">= {points} pts</Text>
            </>}
          </> : <>
            <View className="w-0.5 h-0.5 rounded-full bg-ink-faint dark:bg-ink-dark-faint"/>
            <Text className="text-[11.5px] text-ink-muted dark:text-ink-dark-muted">Bad habit</Text>
          </>}
        </View>
      </View>
      <Text className={`text-[13px] font-extrabold ${isBad ? 'text-danger dark:text-danger-dark' : done ? 'text-primary dark:text-primary-dark' : 'text-ink-faint dark:text-ink-dark-faint'}`}>
        {isBad ? '−50 ★' : '+1 ★'}
      </Text>
    </View>
  );
}
export default TaskRow;
