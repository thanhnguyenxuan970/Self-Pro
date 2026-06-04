import { parseNotificationTime } from '../src/utils/notifications';

test('valid time returns hours and minutes', () => {
  expect(parseNotificationTime('08:30')).toEqual({ hours: 8, minutes: 30 });
});

test('single-digit hour is valid', () => {
  expect(parseNotificationTime('9:05')).toEqual({ hours: 9, minutes: 5 });
});

test('invalid format returns null', () => {
  expect(parseNotificationTime('8am')).toBeNull();
});

test('out-of-range hours returns null', () => {
  expect(parseNotificationTime('25:00')).toBeNull();
});

test('out-of-range minutes returns null', () => {
  expect(parseNotificationTime('08:61')).toBeNull();
});
