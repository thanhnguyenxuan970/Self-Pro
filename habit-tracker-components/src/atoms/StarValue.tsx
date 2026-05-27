import { Text, View } from 'react-native';

export interface StarValueProps {
  value: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'auto' | 'positive' | 'negative' | 'muted';
}

const sizeMap = { sm: 'text-[12px]', md: 'text-[14px]', lg: 'text-[18px]', xl: 'text-[40px]' };
const starSize = { sm: 'text-[10px]', md: 'text-[12px]', lg: 'text-[16px]', xl: 'text-[28px]' };

export function StarValue({ value, size = 'md', tone = 'auto' }: StarValueProps) {
  const tn = tone === 'auto' ? (value < 0 ? 'negative' : 'positive') : tone;
  const color =
    tn === 'positive' ? 'text-primary dark:text-primary-dark'
    : tn === 'negative' ? 'text-danger dark:text-danger-dark'
    : 'text-ink-faint dark:text-ink-dark-faint';
  return (
    <View className="flex-row items-center gap-1">
      <Text className={`${starSize[size]} text-star dark:text-star-dark`}>★</Text>
      <Text className={`${sizeMap[size]} font-bold ${color}`}>{value}</Text>
    </View>
  );
}
export default StarValue;
