import { Pressable, Text } from 'react-native';

export interface ChipProps {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  emoji?: string;
}

export function Chip({ label, selected, disabled, onPress, emoji }: ChipProps) {
  const cls = [
    'flex-row items-center gap-1.5 px-3 py-2 rounded-pill border',
    selected
      ? 'bg-primary-soft dark:bg-primary-dark-soft border-primary-soft dark:border-primary-dark-soft'
      : 'bg-surface dark:bg-surface-dark border-line-2 dark:border-line-dark-2 active:bg-surface-alt dark:active:bg-surface-dark-alt',
    disabled ? 'opacity-40' : '',
  ].join(' ');
  const txt = selected
    ? 'text-primary-ink dark:text-primary-dark-ink font-bold text-[12.5px]'
    : 'text-ink-muted dark:text-ink-dark-muted font-semibold text-[12.5px]';
  return (
    <Pressable className={cls} onPress={disabled ? undefined : onPress}>
      {emoji ? <Text className="text-[12px]">{emoji}</Text> : null}
      <Text className={txt}>{label}</Text>
    </Pressable>
  );
}
export default Chip;
