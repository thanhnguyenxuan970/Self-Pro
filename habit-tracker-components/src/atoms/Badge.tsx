import { View, Text } from 'react-native';

export type BadgeTone = 'neutral' | 'primary' | 'star' | 'danger';
export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

const tones: Record<BadgeTone, { wrap: string; text: string }> = {
  neutral: { wrap: 'bg-surface-alt dark:bg-surface-dark-alt', text: 'text-ink-muted dark:text-ink-dark-muted' },
  primary: { wrap: 'bg-primary-soft dark:bg-primary-dark-soft', text: 'text-primary-ink dark:text-primary-dark-ink' },
  star:    { wrap: 'bg-star-soft dark:bg-star-dark-soft', text: 'text-star dark:text-star-dark' },
  danger:  { wrap: 'bg-danger-soft dark:bg-danger-dark-soft', text: 'text-danger dark:text-danger-dark' },
};

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const t = tones[tone];
  return (
    <View className={`px-2.5 py-1 rounded-pill self-start ${t.wrap}`}>
      <Text className={`text-[11px] font-extrabold tracking-wider ${t.text}`}>{label}</Text>
    </View>
  );
}
export default Badge;
