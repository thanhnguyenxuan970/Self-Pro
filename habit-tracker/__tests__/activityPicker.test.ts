import { activityGroup, activityMatches, activityPinAccessibilityLabel, normalizeActivityName } from '../src/utils/activityPicker';

describe('activity picker matching', () => {
  test('matches Vietnamese names without accents or casing', () => {
    expect(normalizeActivityName('Đá bóng')).toBe('da bong');
    expect(activityMatches({ name: 'Chạy bộ' }, 'CHAY BO')).toBe(true);
  });

  test('infers a useful group for a custom activity', () => {
    expect(activityGroup('Chạy bộ buổi sáng')).toBe('Vận động');
  });

  test('names the task when announcing the pin action', () => {
    expect(activityPinAccessibilityLabel('Pin', 'Read')).toBe('Pin: Read');
  });
});
