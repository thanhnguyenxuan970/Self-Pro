import { View, Text } from 'react-native';
import { SegmentedControl } from '../molecules/SegmentedControl';

export type Period = 'day' | 'week' | 'month' | 'year';
export interface AnalyticsChartProps {
  period: Period;
  onPeriodChange: (p: Period) => void;
  data: { labels: string[]; values: number[]; sum: number };
  loading?: boolean;
  lang?: 'vi' | 'en';
}

export function AnalyticsChart({ period, onPeriodChange, data, loading, lang = 'vi' }: AnalyticsChartProps) {
  const max = Math.max(1, ...data.values);
  const opts = [
    { id:'day',   label: lang === 'vi' ? 'Ngày'  : 'Day' },
    { id:'week',  label: lang === 'vi' ? 'Tuần'  : 'Week' },
    { id:'month', label: lang === 'vi' ? 'Tháng' : 'Month' },
    { id:'year',  label: lang === 'vi' ? 'Năm'   : 'Year' },
  ];
  return (
    <View>
      <SegmentedControl options={opts} value={period} onChange={(v) => onPeriodChange(v as Period)}/>
      <View className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg p-3.5 mt-3">
        <View className="flex-row justify-between">
          <Text className="text-[13px] font-extrabold text-ink dark:text-ink-dark">
            {lang === 'vi' ? 'Điểm theo thời gian' : 'Points over time'}
          </Text>
          <Text className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted">Σ {data.sum}</Text>
        </View>
        <View className="flex-row items-end gap-1.5 h-[148px] mt-2">
          {data.values.map((v, i) => {
            const h = v === 0 ? 2 : Math.round(v / max * 100);
            return (
              <View key={i} className="flex-1 items-center gap-1.5 h-full">
                <View className="w-full flex-1 bg-primary-soft dark:bg-primary-dark-soft rounded-t-sm justify-end overflow-hidden">
                  <View className={`w-full rounded-t-sm ${loading ? 'bg-surface-alt dark:bg-surface-dark-alt' : 'bg-primary dark:bg-primary-dark'}`}
                    style={{ height: `${h}%` }}/>
                </View>
                <Text className="text-[9.5px] font-semibold text-ink-muted dark:text-ink-dark-muted">{data.labels[i]}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
export default AnalyticsChart;
