import { Pressable, Text, ActivityIndicator, View } from 'react-native';

export type ButtonVariant = 'primary' | 'danger' | 'ghost';
export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

const base = 'flex-row items-center justify-center rounded-md px-5 py-3.5 active:opacity-90';
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary dark:bg-primary-dark active:bg-primary-press dark:active:bg-primary-dark-press',
  danger:  'bg-danger dark:bg-danger-dark',
  ghost:   'bg-transparent border border-line-2 dark:border-line-dark-2',
};
const labelCls: Record<ButtonVariant, string> = {
  primary: 'text-white font-bold text-[15px]',
  danger:  'text-white font-bold text-[15px]',
  ghost:   'text-ink dark:text-ink-dark font-bold text-[15px]',
};

export function Button({ label, onPress, variant = 'primary',
                        disabled, loading, fullWidth }: ButtonProps) {
  const cls = [
    base, variants[variant],
    fullWidth ? 'w-full' : '',
    disabled ? 'opacity-40' : '',
  ].join(' ');
  return (
    <Pressable className={cls} onPress={disabled || loading ? undefined : onPress}
               accessibilityRole="button" accessibilityState={{ disabled }}>
      {loading
        ? <ActivityIndicator color={variant === 'ghost' ? '#1B1F1D' : '#fff'} />
        : <Text className={labelCls[variant]}>{label}</Text>}
    </Pressable>
  );
}
export default Button;
