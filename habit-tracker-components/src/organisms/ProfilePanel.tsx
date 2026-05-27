import { View, Text } from 'react-native';
import { SettingRow } from '../molecules/SettingRow';

export interface ProfilePanelProps {
  initial: string;
  name: string;
  joinedLabel: string;        // "Tham gia 18/03/2026 · 🔥 Đỉnh Chóp"
  totalStars: number;
  bestStreak: number;
  fundVnd: number;
  lang?: 'vi' | 'en';
  theme?: 'light' | 'dark';
  onLangPress?: () => void;
  onThemePress?: () => void;
}

export function ProfilePanel({ initial, name, joinedLabel, totalStars, bestStreak, fundVnd,
                               lang = 'vi', theme = 'light', onLangPress, onThemePress }: ProfilePanelProps) {
  return (
    <View>
      <View className="items-center pt-3 pb-1.5">
        <View className="w-20 h-20 rounded-full bg-primary-soft dark:bg-primary-dark-soft border border-line dark:border-line-dark items-center justify-center"
          style={{ shadowColor:'#2E9C6A', shadowOpacity:0.18, shadowRadius:20, shadowOffset:{width:0,height:8}, elevation:4 }}>
          <Text className="text-[32px] font-extrabold text-primary-ink dark:text-primary-dark-ink">{initial}</Text>
        </View>
        <Text className="text-[20px] font-extrabold mt-2.5 text-ink dark:text-ink-dark">{name}</Text>
        <Text className="text-[12.5px] text-ink-muted dark:text-ink-dark-muted mt-0.5">{joinedLabel}</Text>
      </View>
      <View className="flex-row bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-md mt-3.5 overflow-hidden">
        <Stat v={`${totalStars} ★`} l={lang === 'vi' ? 'Tổng Sao' : 'Total stars'}/>
        <Stat v={`${bestStreak} 🔥`} l={'Streak'}/>
        <Stat v={`₫${Math.round(fundVnd / 1000)}k`} l={lang === 'vi' ? 'Quỹ thưởng' : 'Fund'} last/>
      </View>
      <Text className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted uppercase tracking-wider mt-5 mb-2">
        {lang === 'vi' ? 'Cài đặt' : 'Settings'}
      </Text>
      <View className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg px-3.5">
        <SettingRow icon="🌐" label={lang === 'vi' ? 'Ngôn ngữ' : 'Language'}
          value={lang === 'vi' ? 'Tiếng Việt' : 'English'} onPress={onLangPress}/>
        <SettingRow icon="🌓" label={lang === 'vi' ? 'Giao diện' : 'Theme'}
          value={theme === 'light' ? (lang === 'vi' ? 'Sáng' : 'Light') : (lang === 'vi' ? 'Tối' : 'Dark')}
          onPress={onThemePress}/>
        <SettingRow icon="🏷️" label={lang === 'vi' ? 'Quản lý danh mục' : 'Manage categories'}/>
        <SettingRow icon="🔔" label={lang === 'vi' ? 'Nhắc nhở' : 'Reminders'} value="08:00"/>
        <SettingRow icon="🧮" label={lang === 'vi' ? 'Quy tắc tính điểm' : 'Scoring rules'}/>
        <SettingRow icon="🎯" label={lang === 'vi' ? 'Mục tiêu cá nhân' : 'Personal goals'}/>
        <SettingRow icon="ℹ️" label={lang === 'vi' ? 'Giới thiệu ứng dụng' : 'About'}/>
        <SettingRow icon="↺" label={lang === 'vi' ? 'Đặt lại dữ liệu' : 'Reset data'} danger/>
      </View>
    </View>
  );
}

function Stat({ v, l, last }: { v: string; l: string; last?: boolean }) {
  return (
    <View className={`flex-1 items-center py-3.5 ${last ? '' : 'border-r border-line dark:border-line-dark'}`}>
      <Text className="text-[17px] font-extrabold text-ink dark:text-ink-dark">{v}</Text>
      <Text className="text-[10px] font-bold uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted mt-0.5">{l}</Text>
    </View>
  );
}
export default ProfilePanel;
