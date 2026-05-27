import { useState } from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import { SegmentedControl } from '../molecules/SegmentedControl';
import { CategoryFilter } from '../molecules/CategoryFilter';
import { TextField } from '../atoms/TextField';
import { Stepper } from '../atoms/Stepper';
import { Button } from '../atoms/Button';
import type { Category, TaskKind } from '../types';

export interface AddTaskSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (t: { kind: TaskKind; name: string; category: Category; durationMin?: number }) => void;
  lang?: 'vi' | 'en';
}

/** Scoring (rule 7.2.1): 1 task = 1 point; if duration > 30min, points = floor(min/30). */
export const computePoints = (durMin: number) => durMin <= 30 ? 1 : Math.floor(durMin / 30);

export function AddTaskSheet({ visible, onClose, onSubmit, lang = 'vi' }: AddTaskSheetProps) {
  const [kind, setKind] = useState<TaskKind>('good');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('study');
  const [dur, setDur] = useState(60);
  const [err, setErr] = useState<string | undefined>();

  const submit = () => {
    if (!name.trim()) {
      setErr(lang === 'vi' ? 'Tên hoạt động không được để trống' : 'Activity name is required');
      return;
    }
    onSubmit({ kind, name: name.trim(),
      category: category === 'all' ? 'other' : category,
      durationMin: kind === 'good' ? dur : undefined });
    reset(); onClose();
  };
  const reset = () => { setKind('good'); setName(''); setCategory('study'); setDur(60); setErr(undefined); };

  const pts = computePoints(dur);
  const preview = kind === 'bad'
    ? (lang === 'vi' ? 'Trừ 50 ★ khỏi số dư (có thể âm)' : '−50 ★ from balance (can go negative)')
    : (lang === 'vi' ? `= ${pts} điểm · +1 ★ (1 việc = 1 Sao)` : `= ${pts} points · +1 ★ (1 task = 1 Star)`);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50" onPress={onClose}>
        <View className="flex-1"/>
        <Pressable onPress={() => {}} className="bg-surface dark:bg-surface-dark rounded-t-2xl px-5 pt-3 pb-7">
          <View className="w-10 h-1 bg-line-2 dark:bg-line-dark-2 rounded-full self-center mb-4"/>
          <Text className="text-[19px] font-extrabold text-ink dark:text-ink-dark mb-3.5">
            {lang === 'vi' ? 'Ghi nhận hoạt động' : 'Log activity'}
          </Text>
          <SegmentedControl
            options={[
              { id:'good', label: lang === 'vi' ? 'Việc tốt +' : 'Good +' },
              { id:'bad',  label: lang === 'vi' ? 'Thói xấu −' : 'Bad −' },
            ]}
            value={kind}
            onChange={(v) => setKind(v as TaskKind)}
            tone={kind === 'bad' ? 'danger' : 'neutral'}/>
          <Text className="text-[11.5px] font-bold text-ink-muted dark:text-ink-dark-muted mt-3.5 mb-1.5 uppercase tracking-wider">
            {lang === 'vi' ? 'Tên hoạt động' : 'Activity name'}
          </Text>
          <TextField value={name} onChangeText={(t) => { setName(t); setErr(undefined); }}
            placeholder={lang === 'vi' ? 'VD: Đọc sách, học, thể thao…' : 'e.g. Reading, study, sports…'}
            error={err}/>
          <Text className="text-[11.5px] font-bold text-ink-muted dark:text-ink-dark-muted mt-3.5 mb-1.5 uppercase tracking-wider">
            {lang === 'vi' ? 'Danh mục' : 'Category'}
          </Text>
          <CategoryFilter selected={category} onSelect={setCategory} lang={lang}/>
          {kind === 'good' ? (
            <>
              <Text className="text-[11.5px] font-bold text-ink-muted dark:text-ink-dark-muted mt-3.5 mb-1.5 uppercase tracking-wider">
                {lang === 'vi' ? 'Thời lượng (bước 30 phút)' : 'Duration (30-min steps)'}
              </Text>
              <Stepper value={dur} onChange={setDur} step={30} min={30} max={720} unit="′"/>
            </>
          ) : null}
          <View className={`mt-3.5 rounded-md p-3 items-center ${kind === 'bad' ? 'bg-danger-soft dark:bg-danger-dark-soft' : 'bg-primary-soft dark:bg-primary-dark-soft'}`}>
            <Text className={`text-[14px] font-bold ${kind === 'bad' ? 'text-danger dark:text-danger-dark' : 'text-primary-ink dark:text-primary-dark-ink'}`}>{preview}</Text>
          </View>
          <View className="mt-4">
            <Button label={lang === 'vi' ? 'Lưu hoạt động' : 'Save activity'}
              variant={kind === 'bad' ? 'danger' : 'primary'}
              fullWidth onPress={submit}/>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
export default AddTaskSheet;
