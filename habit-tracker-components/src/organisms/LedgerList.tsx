import { View } from 'react-native';
import { LedgerRow } from '../molecules/LedgerRow';
import type { LedgerEntry } from '../types';

export interface LedgerListProps {
  entries: LedgerEntry[];
}

const ICON: Record<string, string> = { milestone_in: '★', spend_out: '☕' };

export function LedgerList({ entries }: LedgerListProps) {
  return (
    <View className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg px-3.5">
      {entries.map(e => (
        <LedgerRow key={e.id}
          icon={ICON[e.type]}
          label={e.label}
          date={e.date}
          amount={e.amount}
          balanceAfter={e.balanceAfter}
          type={e.amount >= 0 ? 'in' : 'out'}/>
      ))}
    </View>
  );
}
export default LedgerList;
