import { APP_STACK_PRESENTATION } from '../src/navigation/stackOptions';
import { handleAppHardwareBack } from '../src/navigation/backHandler';

test('uses a card stack presentation so Android back pops app screens', () => {
  expect(APP_STACK_PRESENTATION).toBe('card');
});

test('consumes hardware back when the app stack can pop', () => {
  const navigation = { canGoBack: jest.fn(() => true), goBack: jest.fn() };

  expect(handleAppHardwareBack(navigation)).toBe(true);
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

test('leaves hardware back to Android at the app root', () => {
  const navigation = { canGoBack: jest.fn(() => false), goBack: jest.fn() };

  expect(handleAppHardwareBack(navigation)).toBe(false);
  expect(navigation.goBack).not.toHaveBeenCalled();
});
