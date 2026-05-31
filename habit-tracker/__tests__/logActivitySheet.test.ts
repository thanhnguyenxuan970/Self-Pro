type Task = {
  id: number; name: string; kind: 'GOOD' | 'BAD';
  is_time_based: number; base_points: number;
  star_penalty: number; icon: string | null; category_id: number | null;
};

function needsDurationPrompt(task: Task): boolean {
  return task.is_time_based === 1;
}

const goodInstant: Task = {
  id: 1, name: 'Push-ups', kind: 'GOOD', is_time_based: 0,
  base_points: 10, star_penalty: 0, icon: '💪', category_id: null,
};
const goodTimeBased: Task = {
  id: 2, name: 'Read', kind: 'GOOD', is_time_based: 1,
  base_points: 1, star_penalty: 0, icon: '📖', category_id: null,
};
const badInstant: Task = {
  id: 3, name: 'Doomscroll', kind: 'BAD', is_time_based: 0,
  base_points: 0, star_penalty: 50, icon: '📱', category_id: null,
};

describe('needsDurationPrompt', () => {
  test('non-time-based GOOD -> false', () => expect(needsDurationPrompt(goodInstant)).toBe(false));
  test('time-based GOOD -> true', () => expect(needsDurationPrompt(goodTimeBased)).toBe(true));
  test('non-time-based BAD -> false', () => expect(needsDurationPrompt(badInstant)).toBe(false));
});
