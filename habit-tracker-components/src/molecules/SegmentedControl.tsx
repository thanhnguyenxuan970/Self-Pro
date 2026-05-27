import { View, Pressable, Text } from 'react-native';

export interface SegmentedOption { id: string; label: string; }
export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (id: string) => void;
  tone?: 'neutral' | 'danger';
}

export function SegmentedControl({ options, value, onChange, tone = 'neutral' }: SegmentedControlProps) {
  return (
    <View className="flex-row bg-surface-alt dark:bg-surface-dark-alt rounded-md p-0.5">
      {options.map(o => {
        const sel = o.id === value;
        const activeCls = sel
          ? 'bg-surface dark:bg-surface-dark shadow-sm'
          : '';
        const txtCls = sel
          ? tone === 'danger' ? 'text-danger dark:text-danger-dark' : 'text-ink dark:text-ink-dark'
          : 'text-ink-muted dark:text-ink-dark-muted';
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)}
            className={`flex-1 rounded-sm py-2.5 items-center ${activeCls}`}>
            <Text className={`text-[13px] font-bold ${txtCls}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
export default SegmentedControl;
