import { buildTemplateTasks } from '../src/game/seedTemplates';

describe('buildTemplateTasks', () => {
  test('empty selection → 0 tasks', () => {
    expect(buildTemplateTasks([])).toHaveLength(0);
  });
  test('sports → 2 tasks', () => {
    expect(buildTemplateTasks(['sports'])).toHaveLength(2);
  });
  test('reading → 1 task', () => {
    expect(buildTemplateTasks(['reading'])).toHaveLength(1);
  });
  test('sports + reading → 3 tasks', () => {
    expect(buildTemplateTasks(['sports', 'reading'])).toHaveLength(3);
  });
  test('all 4 categories → 8 tasks', () => {
    expect(buildTemplateTasks(['sports', 'reading', 'studying', 'housework'])).toHaveLength(8);
  });
  test('task has required fields', () => {
    const tasks = buildTemplateTasks(['sports']);
    expect(tasks[0]).toMatchObject({
      name: expect.any(String),
      icon: expect.any(String),
      isTimeBased: expect.any(Boolean),
      basePoints: expect.any(Number),
    });
  });
});
