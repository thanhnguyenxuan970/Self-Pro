import { View } from 'react-native';
import { TierRow } from '../molecules/TierRow';

export interface RewardLadderProps {
  weeklyStars: number;
  lang?: 'vi' | 'en';
}

const MILESTONES = [5, 10, 20, 40, 80, 160];

export function RewardLadder({ weeklyStars, lang = 'vi' }: RewardLadderProps) {
  return (
    <View className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg px-3.5">
      {MILESTONES.map((s, i) => {
        const crossed = weeklyStars >= s;
        const remaining = !crossed ? s - weeklyStars : 0;
        const hint = !crossed
          ? (lang === 'vi' ? `còn ${remaining} ★` : `${remaining} ★ to go`)
          : undefined;
        return (
          <TierRow key={s} stars={s} vnd={s * 1000}
            tierLabel={lang === 'vi' ? `Mốc ${i + 1}` : `Tier ${i + 1}`}
            status={crossed ? 'crossed' : 'locked'}
            hint={hint}
            lang={lang}/>
        );
      })}
    </View>
  );
}
export default RewardLadder;
