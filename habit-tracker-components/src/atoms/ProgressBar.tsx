import { View } from 'react-native';

export interface ProgressBarProps {
  value: number;        // 0..1
  height?: number;
  tone?: 'primary' | 'star' | 'danger';
}

export function ProgressBar({ value, height = 10, tone = 'primary' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill =
    tone === 'star' ? 'bg-star dark:bg-star-dark'
    : tone === 'danger' ? 'bg-danger dark:bg-danger-dark'
    : 'bg-primary dark:bg-primary-dark';
  return (
    <View className="bg-surface-alt dark:bg-surface-dark-alt rounded-pill overflow-hidden" style={{ height }}>
      <View className={`h-full rounded-pill ${fill}`} style={{ width: `${pct}%` }} />
    </View>
  );
}
export default ProgressBar;
