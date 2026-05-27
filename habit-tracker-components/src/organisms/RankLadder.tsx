import { View } from 'react-native';
import { RankRow } from '../molecules/RankRow';
import type { RankInfo } from '../types';

export const RANK_TIERS: RankInfo[] = [
  { tier:'main',   vi:'U Là Trời',        en:'Main Character',   emoji:'👑', min: 160 },
  { tier:'goated', vi:'Đỉnh Chóp',        en:'Goated',           emoji:'🔥', min: 80  },
  { tier:'fresh',  vi:'Xịn Sò',           en:'Certified Fresh',  emoji:'✨', min: 40  },
  { tier:'roll',   vi:'Cuốn Phết',        en:'On a Roll',        emoji:'🌀', min: 20  },
  { tier:'clown',  vi:'Tấu Hài',          en:'Clown Arc',        emoji:'🤡', min: 10  },
  { tier:'rookie', vi:'Non Tơ',           en:'Rookie',           emoji:'🐣', min: 5   },
  { tier:'npc',    vi:'NPC',              en:'NPC',              emoji:'🎮', min: 0   },
  { tier:'debt',   vi:'Toang Rồi Ông Giáo', en:'Game Over',      emoji:'💀', min: -1  },
];

const THR = ['160+ ★','80–159 ★','40–79 ★','20–39 ★','10–19 ★','5–9 ★','0–4 ★','< 0 ★'];

export interface RankLadderProps {
  currentTier: RankInfo['tier'];
  lang?: 'vi' | 'en';
}

export function RankLadder({ currentTier, lang = 'vi' }: RankLadderProps) {
  return (
    <View className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg px-3.5">
      {RANK_TIERS.map((r, i) => (
        <RankRow key={r.tier} emoji={r.emoji} vi={r.vi} en={r.en}
          threshold={THR[i]} current={r.tier === currentTier}
          debt={r.tier === 'debt'} lang={lang}/>
      ))}
    </View>
  );
}
export default RankLadder;
