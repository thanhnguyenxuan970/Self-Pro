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
  is_template: number;
  last_used_date: string | null;
};

/** Build the log payload used when a screen presets an existing task (for
 * example, the linked habit from a Challenge). The preset flow logs the
 * existing row instead of upserting its configuration first. */
export function buildPresetTaskLogParams(
  task: Pick<PickerTask, 'id' | 'kind' | 'base_points' | 'star_penalty'>,
) {
  return {
    taskTypeId: task.id,
    kind: task.kind as 'GOOD' | 'BAD',
    isTimeBased: false,
    basePoints: task.base_points,
    starPenalty: task.star_penalty,
  };
}

export function normalizeActivityName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim();
}

export function activityMatches(task: Pick<PickerTask, 'name'>, query: string): boolean {
  return normalizeActivityName(task.name).includes(normalizeActivityName(query));
}

/** Keep the picker result list authoritative when a template also matches the query. */
export function filterDuplicateActivitySuggestions<T extends Pick<PickerTask, 'name'>>(
  suggestions: T[],
  searchResults: Array<Pick<PickerTask, 'name'>>,
): T[] {
  const searchNames = new Set(searchResults.map(task => normalizeActivityName(task.name)));
  return suggestions.filter(suggestion => !searchNames.has(normalizeActivityName(suggestion.name)));
}

/** Resolve a preset activity name (e.g. a challenge's linked habit) to its
 *  existing task record, so callers can wire it up as the selected task
 *  instead of treating it as a brand-new name. Name matching is ambiguous
 *  when two tasks' names collide after normalization (e.g. "Đọc sách" vs.
 *  "doc sach" typed separately) -- prefer resolvePresetTask below when the
 *  caller already knows the exact task id. */
export function findPresetTask<T extends Pick<PickerTask, 'name'>>(tasks: T[], presetName: string): T | null {
  return tasks.find(task => normalizeActivityName(task.name) === normalizeActivityName(presetName)) ?? null;
}

/** Same as findPresetTask, but resolves by exact id first when the caller
 *  already knows it -- avoiding a wrong-task match when another task's name
 *  collides with the preset name after normalization. */
export function resolvePresetTask<T extends Pick<PickerTask, 'id' | 'name'>>(
  tasks: T[],
  presetName: string,
  presetTaskId?: number | null,
): T | null {
  if (presetTaskId != null) return tasks.find(task => task.id === presetTaskId) ?? null;
  return findPresetTask(tasks, presetName);
}

export function activityPinAccessibilityLabel(actionLabel: string, taskLabel: string): string {
  return `${actionLabel}: ${taskLabel}`;
}

export function activityGroup(name: string): string {
  const normalized = normalizeActivityName(name);
  if (/(chay|gym|boi|yoga|the thao|dance|nhay|walk)/.test(normalized)) return 'Vận động';
  if (/(doc|hoc|study|viet|language|ngoai ngu)/.test(normalized)) return 'Học tập';
  if (/(nau|don dep|rua|home|nha)/.test(normalized)) return 'Nhà cửa';
  return 'Khác';
}
