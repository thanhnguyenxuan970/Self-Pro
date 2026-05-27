import { View, Pressable, Text } from 'react-native';

export interface StepperProps {
  value: number;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}

export function Stepper({ value, step = 30, min = 30, max = 720, unit = '′', onChange, disabled }: StepperProps) {
  const dec = () => !disabled && onChange(Math.max(min, value - step));
  const inc = () => !disabled && onChange(Math.min(max, value + step));
  const btnCls = 'w-9 h-9 rounded-sm bg-surface-alt dark:bg-surface-dark-alt items-center justify-center active:scale-95';
  return (
    <View className={`flex-row items-center justify-between border-2 border-line-2 dark:border-line-dark-2 bg-surface dark:bg-surface-dark rounded-md px-2.5 py-1.5 ${disabled?'opacity-40':''}`}>
      <Pressable className={btnCls} onPress={dec}>
        <Text className="text-ink dark:text-ink-dark text-[20px] font-bold">−</Text>
      </Pressable>
      <Text className="text-[15px] font-extrabold text-ink dark:text-ink-dark">{value}{unit}</Text>
      <Pressable className={btnCls} onPress={inc}>
        <Text className="text-ink dark:text-ink-dark text-[20px] font-bold">+</Text>
      </Pressable>
    </View>
  );
}
export default Stepper;
