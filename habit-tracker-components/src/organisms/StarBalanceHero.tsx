import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../atoms/Icon';

export interface StarBalanceHeroProps {
  balance: number;
  deltaToday: number;        // signed
  rankEmoji: string;
  rankName: string;
  debt?: boolean;
  onDemoPress?: () => void;  // demo state toggle
  demoLabel?: string;
}

export function StarBalanceHero({ balance, deltaToday, rankEmoji, rankName,
                                  debt, onDemoPress, demoLabel }: StarBalanceHeroProps) {
  const colors = debt ? ['#5C1D1E', '#B0383C'] : ['#1A5039', '#2E9C6A'];
  const up = deltaToday >= 0;
  return (
    <LinearGradient colors={colors as any} start={{x:0,y:0}} end={{x:1,y:1}}
      style={{ borderRadius: 22, padding: 20, marginTop: 14,
               shadowColor:'#1E6646', shadowOffset:{width:0,height:12},
               shadowOpacity:0.18, shadowRadius:32, elevation:6 }}>
      <Text className="text-white/80 text-[12px] font-bold tracking-wider">SỐ DƯ SAO</Text>
      <View className="flex-row items-center gap-2.5 mt-1.5">
        <Icon name="star" size={32} color="#D9952B"/>
        <Text className="text-white text-[40px] font-extrabold tracking-tighter">{balance}</Text>
      </View>
      <View className="flex-row items-center justify-between mt-3.5">
        <View className="bg-white/15 px-2.5 py-1 rounded-pill">
          <Text className={`text-[12px] font-bold ${up ? 'text-emerald-200' : 'text-red-200'}`}>
            {up ? '▲' : '▼'} {up ? '+' : ''}{deltaToday} hôm nay
          </Text>
        </View>
        <View className="bg-white/18 px-3 py-1.5 rounded-pill flex-row items-center gap-1.5">
          <Text className="text-white text-[12px]">{rankEmoji}</Text>
          <Text className="text-white text-[12.5px] font-extrabold">{rankName}</Text>
        </View>
      </View>
      {onDemoPress && demoLabel ? (
        <Pressable onPress={onDemoPress} className="mt-3">
          <Text className="text-white/70 text-[11px] font-semibold underline">{demoLabel}</Text>
        </Pressable>
      ) : null}
    </LinearGradient>
  );
}
export default StarBalanceHero;
