import { ScrollView } from 'react-native';
import { Chip } from '../atoms/Chip';
import type { Category } from '../types';

export interface CategoryFilterProps {
  selected: Category | 'all';
  onSelect: (c: Category | 'all') => void;
  lang?: 'vi' | 'en';
}

const ITEMS: Array<{ id: Category | 'all'; vi: string; en: string; emoji?: string }> = [
  { id: 'all',    vi: 'Tất cả',   en: 'All' },
  { id: 'study',  vi: 'Học',      en: 'Study',  emoji: '📚' },
  { id: 'sports', vi: 'Thể thao', en: 'Sports', emoji: '🏃' },
  { id: 'family', vi: 'Gia đình', en: 'Family', emoji: '👨‍👩‍👧' },
  { id: 'work',   vi: 'Công việc',en: 'Work',   emoji: '💼' },
];

export function CategoryFilter({ selected, onSelect, lang = 'vi' }: CategoryFilterProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 2 }}>
      {ITEMS.map(it => (
        <Chip key={it.id}
          label={lang === 'vi' ? it.vi : it.en}
          emoji={it.emoji}
          selected={selected === it.id}
          onPress={() => onSelect(it.id)}/>
      ))}
    </ScrollView>
  );
}
export default CategoryFilter;
