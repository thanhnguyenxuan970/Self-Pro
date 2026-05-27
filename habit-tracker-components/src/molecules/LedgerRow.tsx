import { View, Text } from 'react-native';

export interface LedgerRowProps {
  icon: string;             // emoji or single char
  label: string;
  date: string;             // formatted
  amount: number;           // signed
  balanceAfter: number;
  type: 'in' | 'out';
}

export function LedgerRow({ icon, label, date, amount, balanceAfter, type }: LedgerRowProps) {
  const dotCls = type === 'in'
    ? 'bg-primary-soft dark:bg-primary-dark-soft'
    : 'bg-surface-alt dark:bg-surface-dark-alt';
  const amtCls = type === 'in'
    ? 'text-primary dark:text-primary-dark'
    : 'text-ink dark:text-ink-dark';
  const sign = amount >= 0 ? '+' : '−';
  return (
    <View className="flex-row items-center gap-3 py-3 border-b border-line dark:border-line-dark">
      <View className={`w-8 h-8 rounded-sm items-center justify-center ${dotCls}`}>
        <Text className="text-[15px]">{icon}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-[14px] font-semibold text-ink dark:text-ink-dark">{label}</Text>
        <Text className="text-[11.5px] text-ink-muted dark:text-ink-dark-muted mt-0.5">{date}</Text>
      </View>
      <View className="items-end">
        <Text className={`text-[13.5px] font-extrabold ${amtCls}`}>
          {sign}₫{Math.abs(amount).toLocaleString('vi-VN')}
        </Text>
        <Text className="text-[10px] font-semibold text-ink-faint dark:text-ink-dark-faint mt-0.5">
          ₫{balanceAfter.toLocaleString('vi-VN')}
        </Text>
      </View>
    </View>
  );
}
export default LedgerRow;
