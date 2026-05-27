import { View, Pressable, Text } from 'react-native';
import { Icon, IconName } from '../atoms/Icon';

export type TabId = 'home' | 'stats' | 'rewards' | 'rank';
export interface BottomTabBarProps {
  active: TabId;
  onChange: (id: TabId) => void;
  onAddPress: () => void;
  lang?: 'vi' | 'en';
}

const TABS: Array<{ id: TabId; icon: IconName; vi: string; en: string }> = [
  { id: 'home',    icon: 'home',   vi: 'Trang chủ', en: 'Home' },
  { id: 'stats',   icon: 'chart',  vi: 'Phân tích', en: 'Stats' },
  { id: 'rewards', icon: 'gift',   vi: 'Quỹ thưởng',en: 'Rewards' },
  { id: 'rank',    icon: 'trophy', vi: 'Rank',      en: 'Rank' },
];

export function BottomTabBar({ active, onChange, onAddPress, lang = 'vi' }: BottomTabBarProps) {
  return (
    <View className="flex-row items-start bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark px-1.5 pt-2 pb-safe-bottom h-[86px]">
      {TABS.slice(0, 2).map(t => <TabBtn key={t.id} active={active === t.id} {...t} lang={lang} onPress={() => onChange(t.id)}/>)}
      <Pressable onPress={onAddPress}
        className="w-[58px] h-[58px] -mt-4 rounded-full bg-primary dark:bg-primary-dark items-center justify-center shadow-lg active:scale-95"
        style={{ shadowColor:'#2E9C6A', shadowOpacity:0.36, shadowRadius:24, shadowOffset:{width:0,height:10}, elevation:10 }}>
        <Icon name="plus" size={28} color="#fff"/>
      </Pressable>
      {TABS.slice(2).map(t => <TabBtn key={t.id} active={active === t.id} {...t} lang={lang} onPress={() => onChange(t.id)}/>)}
    </View>
  );
}

function TabBtn({ id, icon, vi, en, active, lang, onPress }: any) {
  const color = active ? '#2E9C6A' : '#A5ABA7';
  return (
    <Pressable onPress={onPress} className="flex-1 items-center gap-1 py-1">
      <Icon name={icon} size={24} color={color}/>
      <Text className={`text-[10px] font-bold ${active ? 'text-primary dark:text-primary-dark' : 'text-ink-faint dark:text-ink-dark-faint'}`}>{lang === 'vi' ? vi : en}</Text>
    </Pressable>
  );
}
export default BottomTabBar;
