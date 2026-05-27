import { Pressable, Text, View } from 'react-native';
import { Icon } from '../atoms/Icon';

export interface SettingRowProps {
  icon: string;          // emoji
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
}

export function SettingRow({ icon, label, value, danger, onPress }: SettingRowProps) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 py-3.5 border-b border-line dark:border-line-dark active:bg-surface-alt dark:active:bg-surface-dark-alt">
      <Text className="text-[18px] w-6 text-center">{icon}</Text>
      <Text className={`flex-1 text-[14px] font-semibold ${danger ? 'text-danger dark:text-danger-dark' : 'text-ink dark:text-ink-dark'}`}>{label}</Text>
      {value ? <Text className="text-[12.5px] font-bold text-ink-muted dark:text-ink-dark-muted">{value}</Text> : null}
      <Icon name="chevron-right" size={18} color="#A5ABA7"/>
    </Pressable>
  );
}
export default SettingRow;
