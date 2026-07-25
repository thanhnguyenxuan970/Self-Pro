import { TEMPLATE_NAME_TO_KEY, getTranslations, Strings } from '../src/config/i18n';
import { TEMPLATE_CATEGORIES } from '../src/config/constants';

// Simulates resolveTaskDisplayName used in TaskRow and TodayScreen
function resolveTaskDisplayName(name: string, t: Strings): string {
  const key = TEMPLATE_NAME_TO_KEY.get(name);
  return key ? ((t as unknown as Record<string, string>)[key] ?? name) : name;
}

const vi = getTranslations('vi');
const en = getTranslations('en');

describe('Rank localization', () => {
  test('translates the rank roadmap heading', () => {
    expect(vi.rankRoadmap).toBe('LỘ TRÌNH RANK');
    expect(en.rankRoadmap).toBe('RANK ROADMAP');
  });
});

describe('TEMPLATE_NAME_TO_KEY reverse-lookup', () => {
  test('covers all template tasks in both languages', () => {
    const allTasks = TEMPLATE_CATEGORIES.flatMap(c => c.tasks);
    for (const task of allTasks) {
      const viName = (vi as unknown as Record<string, string>)[task.nameKey];
      const enName = (en as unknown as Record<string, string>)[task.nameKey];
      expect(TEMPLATE_NAME_TO_KEY.get(viName)).toBe(task.nameKey);
      expect(TEMPLATE_NAME_TO_KEY.get(enName)).toBe(task.nameKey);
    }
  });

  test('Gym maps to tmplGym in both languages (non-translatable loanword)', () => {
    expect(TEMPLATE_NAME_TO_KEY.get('Gym')).toBe('tmplGym');
    expect(vi.tmplGym).toBe('Gym');
    expect(en.tmplGym).toBe('Gym');
  });
});

describe('Bug 2 — language switch translates existing activity names', () => {
  test('English-stored "Running" resolves to "Chạy bộ" in Vietnamese UI', () => {
    const storedInDB = 'Running'; // added while app was in English
    expect(resolveTaskDisplayName(storedInDB, vi)).toBe('Chạy bộ');
  });

  test('Vietnamese-stored "Chạy bộ" resolves to "Running" in English UI', () => {
    const storedInDB = 'Chạy bộ'; // added while app was in Vietnamese
    expect(resolveTaskDisplayName(storedInDB, en)).toBe('Running');
  });

  test('canonical name stored by AddActivitySheet resolves to "Running" in English', () => {
    // AddActivitySheet now stores selectedSuggestion.name (Vietnamese canonical: "Chạy bộ")
    const canonicalStoreName = 'Chạy bộ';
    expect(resolveTaskDisplayName(canonicalStoreName, en)).toBe('Running');
  });

  test('non-translatable loanword "Gym" stays "Gym" in both languages', () => {
    expect(resolveTaskDisplayName('Gym', vi)).toBe('Gym');
    expect(resolveTaskDisplayName('Gym', en)).toBe('Gym');
  });

  test('custom user activity (not a template) returns unchanged', () => {
    expect(resolveTaskDisplayName('My custom activity', vi)).toBe('My custom activity');
    expect(resolveTaskDisplayName('My custom activity', en)).toBe('My custom activity');
  });

  test('all template tasks translate correctly vi→en', () => {
    const allTasks = TEMPLATE_CATEGORIES.flatMap(c => c.tasks);
    for (const task of allTasks) {
      const viName = (vi as unknown as Record<string, string>)[task.nameKey];
      const enName = (en as unknown as Record<string, string>)[task.nameKey];
      expect(resolveTaskDisplayName(viName, en)).toBe(enName);
    }
  });

  test('all template tasks translate correctly en→vi', () => {
    const allTasks = TEMPLATE_CATEGORIES.flatMap(c => c.tasks);
    for (const task of allTasks) {
      const viName = (vi as unknown as Record<string, string>)[task.nameKey];
      const enName = (en as unknown as Record<string, string>)[task.nameKey];
      expect(resolveTaskDisplayName(enName, vi)).toBe(viName);
    }
  });
});
