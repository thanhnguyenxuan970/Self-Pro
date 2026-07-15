import { parseDurationMinutes } from '../src/utils/duration';

test('converts decimal hours without truncating them', () => {
  expect(parseDurationMinutes('1.5', 'hr')).toBe(90);
  expect(parseDurationMinutes('0.5', 'hr')).toBe(30);
});

test('rejects partial or non-minute durations', () => {
  expect(parseDurationMinutes('1abc', 'hr')).toBeNull();
  expect(parseDurationMinutes('1.333', 'hr')).toBeNull();
});
