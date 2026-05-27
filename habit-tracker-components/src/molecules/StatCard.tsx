import { View, Text } from 'react-native';

export interface StatCardProps {
  value: string;
  label: string;
  loading?: boolean;
}

export function StatCard({ value, label, loading }: StatCardProps) {
  if (loading) {
    return (
      <View className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-md p-3.5">
        <View className="h-5 w-3/5 rounded bg-surface-alt dark:bg-surface-dark-alt"/>
        <View className="h-2.5 w-4/5 rounded bg-surface-alt dark:bg-surface-dark-alt mt-2"/>
      </View>
    );
  }
  return (
    <View className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-md p-3.5">
      <Text className="text-[22px] font-extrabold tracking-tight text-ink dark:text-ink-dark">{value}</Text>
      <Text className="text-[11px] font-bold uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted mt-0.5">{label}</Text>
    </View>
  );
}
export default StatCard;
