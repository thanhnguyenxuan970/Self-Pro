import { View, Text } from 'react-native';

export interface TierRowProps {
  stars: number;
  vnd: number;
  tierLabel: string;
  status: 'crossed' | 'locked';
  hint?: string;     // e.g. "còn 68 ★"
  statusVi?: string;
  statusEn?: string;
  lang?: 'vi' | 'en';
}

export function TierRow({ stars, vnd, tierLabel, status, hint, statusVi, statusEn, lang = 'vi' }: TierRowProps) {
  const crossed = status === 'crossed';
  const badgeCls = crossed
    ? 'bg-star-soft dark:bg-star-dark-soft'
    : 'bg-surface-alt dark:bg-surface-dark-alt';
  const badgeTxt = crossed
    ? 'text-star dark:text-star-dark'
    : 'text-ink-faint dark:text-ink-dark-faint';
  const stCls = crossed
    ? 'bg-primary-soft dark:bg-primary-dark-soft'
    : 'bg-surface-alt dark:bg-surface-dark-alt';
  const stTxt = crossed
    ? 'text-primary-ink dark:text-primary-dark-ink'
    : 'text-ink-faint dark:text-ink-dark-faint';
  const statusLabel = lang === 'vi' ? (statusVi ?? (crossed ? 'Đã vượt' : 'Khoá')) : (statusEn ?? (crossed ? 'Crossed' : 'Locked'));
  return (
    <View className="flex-row items-center gap-3 py-3 border-b border-line dark:border-line-dark">
      <View className={`w-9 h-9 rounded-sm items-center justify-center ${badgeCls}`}>
        <Text className={`text-[12.5px] font-extrabold ${badgeTxt}`}>{stars}★</Text>
      </View>
      <View className="flex-1">
        <Text className="text-[14px] font-bold text-ink dark:text-ink-dark">₫{vnd.toLocaleString('vi-VN')}</Text>
        <Text className="text-[11.5px] text-ink-muted dark:text-ink-dark-muted mt-0.5">
          {tierLabel}{hint ? ` · ${hint}` : ''}
        </Text>
      </View>
      <View className={`px-2.5 py-1 rounded-pill ${stCls}`}>
        <Text className={`text-[11px] font-extrabold uppercase tracking-wider ${stTxt}`}>{statusLabel}</Text>
      </View>
    </View>
  );
}
export default TierRow;
