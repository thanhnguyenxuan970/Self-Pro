export const MAX_PINNED_ACTIVITIES = 8;

export type PickerTask = {
  id: number;
  name: string;
  kind: string;
  icon: string | null;
  is_time_based: number;
  base_points: number;
  star_penalty: number;
  archived: number;
  is_pinned: number;
  last_used_date: string | null;
};

export function normalizeActivityName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim();
}

export function activityMatches(task: Pick<PickerTask, 'name'>, query: string): boolean {
  return normalizeActivityName(task.name).includes(normalizeActivityName(query));
}

export function activityGroup(name: string): string {
  const normalized = normalizeActivityName(name);
  if (/(chay|gym|boi|yoga|the thao|dance|nhay|walk)/.test(normalized)) return 'Vận động';
  if (/(doc|hoc|study|viet|language|ngoai ngu)/.test(normalized)) return 'Học tập';
  if (/(nau|don dep|rua|home|nha)/.test(normalized)) return 'Nhà cửa';
  return 'Khác';
}
