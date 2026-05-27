import { Pressable, Text } from 'react-native';

export type CheckboxVariant = 'default' | 'done' | 'bad';
export interface CheckboxProps {
  variant?: CheckboxVariant;
  onPress?: () => void;
  disabled?: boolean;
}

const variants: Record<CheckboxVariant, string> = {
  default: 'bg-surface dark:bg-surface-dark border-line-2 dark:border-line-dark-2',
  done:    'bg-primary dark:bg-primary-dark border-primary dark:border-primary-dark',
  bad:     'bg-danger dark:bg-danger-dark border-danger dark:border-danger-dark',
};

export function Checkbox({ variant = 'default', onPress, disabled }: CheckboxProps) {
  const cls = `w-7 h-7 rounded-full border-2 items-center justify-center active:scale-90 ${variants[variant]} ${disabled?'opacity-40':''}`;
  const icon = variant === 'done' ? '✓' : variant === 'bad' ? '✕' : '';
  return (
    <Pressable className={cls} onPress={disabled ? undefined : onPress}
               accessibilityRole="checkbox" accessibilityState={{ checked: variant !== 'default' }}>
      <Text className="text-white font-bold text-[13px]">{icon}</Text>
    </Pressable>
  );
}
export default Checkbox;
