import { View, Text } from 'react-native';
import { ProgressBar } from '../atoms/ProgressBar';

export interface DailyProgressCardProps {
  points: number;
  threshold?: number;     // default 50
  lang?: 'vi' | 'en';
}

export function DailyProgressCard({ points, threshold = 50, lang = 'vi' }: DailyProgressCardProps) {
  const pct = points / threshold;
  return (
    <View className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg p-3.5 mt-3">
      <View className="flex-row justify-between">
        <Text className="text-[13px] font-bold text-ink dark:text-ink-dark">
          {lang === 'vi' ? 'Điểm hôm nay' : "Today's points"}
        </Text>
        <Text className="text-[14px] text-ink dark:text-ink-dark">
          <Text className="text-[16px] font-extrabold text-primary dark:text-primary-dark">{points}</Text>
          {' / '}{threshold}
        </Text>
      </View>
      <View className="mt-2.5"><ProgressBar value={pct}/></View>
      <Text className="text-[11.5px] text-ink-muted dark:text-ink-dark-muted mt-2">
        {lang === 'vi'
          ? `Đạt ${threshold} điểm/ngày → +1 ★ Streak bonus`
          : `Hit ${threshold} points/day → +1 ★ Streak bonus`}
      </Text>
    </View>
  );
}
export default DailyProgressCard;
