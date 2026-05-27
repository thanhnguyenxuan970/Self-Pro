import { View, Text } from 'react-native';

export interface RankRowProps {
  emoji: string;
  vi: string;
  en: string;
  threshold: string;   // e.g. "80–159 ★"
  current?: boolean;
  debt?: boolean;
  lang?: 'vi' | 'en';
}

export function RankRow({ emoji, vi, en, threshold, current, debt, lang = 'vi' }: RankRowProps) {
  const wrap = current
    ? 'bg-primary-soft dark:bg-primary-dark-soft rounded-md px-3 py-3 -mx-2'
    : 'py-3 border-b border-line dark:border-line-dark';
  const nameCls = current
    ? 'text-primary-ink dark:text-primary-dark-ink'
    : debt
    ? 'text-danger dark:text-danger-dark'
    : 'text-ink dark:text-ink-dark';
  const thrCls = current
    ? 'text-primary-ink dark:text-primary-dark-ink'
    : 'text-ink-muted dark:text-ink-dark-muted';
  return (
    <View className={`flex-row items-center gap-3 ${wrap}`}>
      <Text className="text-[24px] w-8 text-center">{emoji}</Text>
      <View className="flex-1">
        <Text className={`text-[14px] font-extrabold ${nameCls}`}>{lang === 'vi' ? vi : en}</Text>
        <Text className="text-[11.5px] text-ink-muted dark:text-ink-dark-muted mt-0.5">{lang === 'vi' ? en : vi}</Text>
      </View>
      <Text className={`text-[11.5px] font-extrabold ${thrCls}`}>{threshold}</Text>
    </View>
  );
}
export default RankRow;
