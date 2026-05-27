import { View, Pressable, Text } from 'react-native';

export interface LangToggleProps {
  value: 'vi' | 'en';
  onChange: (v: 'vi' | 'en') => void;
}

export function LangToggle({ value, onChange }: LangToggleProps) {
  return (
    <View className="flex-row border border-line-2 dark:border-line-dark-2 rounded-pill overflow-hidden bg-surface dark:bg-surface-dark">
      {(['vi', 'en'] as const).map(v => {
        const sel = v === value;
        return (
          <Pressable key={v} onPress={() => onChange(v)}
            className={`px-2.5 py-1.5 ${sel ? 'bg-ink dark:bg-ink-dark' : ''}`}>
            <Text className={`text-[11px] font-extrabold ${sel ? 'text-surface dark:text-surface-dark' : 'text-ink-faint dark:text-ink-dark-faint'}`}>{v.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
export default LangToggle;
