import { View, Text, Pressable } from 'react-native';
import { Icon } from '../atoms/Icon';
import { LangToggle } from '../molecules/LangToggle';
import { useColorScheme } from 'nativewind';

export interface HomeHeaderProps {
  initial: string;
  greetingVi: string;
  greetingEn: string;
  dateVi: string;
  dateEn: string;
  lang: 'vi' | 'en';
  onAvatarPress?: () => void;
  onLangChange: (l: 'vi' | 'en') => void;
}

export function HomeHeader({ initial, greetingVi, greetingEn, dateVi, dateEn,
                             lang, onAvatarPress, onLangChange }: HomeHeaderProps) {
  const { colorScheme, toggleColorScheme } = useColorScheme();
  return (
    <View className="flex-row items-center gap-2.5 px-0.5 py-1.5">
      <Pressable onPress={onAvatarPress}
        className="w-10 h-10 rounded-full bg-primary-soft dark:bg-primary-dark-soft border border-line dark:border-line-dark items-center justify-center active:scale-95">
        <Text className="text-[16px] font-extrabold text-primary-ink dark:text-primary-dark-ink">{initial}</Text>
      </Pressable>
      <View className="flex-1 min-w-0">
        <Text className="text-[15px] font-extrabold text-ink dark:text-ink-dark">{lang === 'vi' ? greetingVi : greetingEn}</Text>
        <Text className="text-[12px] text-ink-muted dark:text-ink-dark-muted">{lang === 'vi' ? dateVi : dateEn}</Text>
      </View>
      <Pressable onPress={toggleColorScheme}
        className="w-8 h-8 rounded-full bg-surface dark:bg-surface-dark border border-line-2 dark:border-line-dark-2 items-center justify-center active:scale-90">
        <Icon name={colorScheme === 'dark' ? 'moon' : 'sun'} size={18}
          color={colorScheme === 'dark' ? '#C7CCC9' : '#3F4642'}/>
      </Pressable>
      <LangToggle value={lang} onChange={onLangChange}/>
    </View>
  );
}
export default HomeHeader;
