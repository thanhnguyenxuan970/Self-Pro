import { TextInput, View, Text } from 'react-native';
import { useState } from 'react';

export interface TextFieldProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function TextField({ value, onChangeText, placeholder, error, disabled, autoFocus }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const borderCls = error
    ? 'border-danger dark:border-danger-dark'
    : focused
    ? 'border-primary dark:border-primary-dark'
    : 'border-line-2 dark:border-line-dark-2';
  const bgCls = focused
    ? 'bg-surface dark:bg-surface-dark'
    : 'bg-surface-alt dark:bg-surface-dark-alt';
  return (
    <View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        editable={!disabled}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`w-full px-3.5 py-3 rounded-md border-2 text-[14px] text-ink dark:text-ink-dark ${borderCls} ${bgCls} ${disabled?'opacity-40':''}`}
        placeholderTextColor="#A5ABA7"
      />
      {error ? <Text className="text-danger dark:text-danger-dark text-[11.5px] font-semibold mt-1.5">{error}</Text> : null}
    </View>
  );
}
export default TextField;
