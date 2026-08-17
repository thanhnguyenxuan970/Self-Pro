jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SURVEY_D0_SHOWN_KEY, markSurveyD0Pending, readSurveyD0Pending, markSurveyD0Shown,
} from '../src/game/pendingSurveyD0';

afterEach(async () => {
  await AsyncStorage.clear();
});

test('pending is false before anything happens', async () => {
  expect(await readSurveyD0Pending()).toBe(false);
});

test('marking pending makes it readable as due', async () => {
  await markSurveyD0Pending();
  expect(await readSurveyD0Pending()).toBe(true);
});

test('marking shown latches the shown flag and clears pending', async () => {
  await markSurveyD0Pending();
  await markSurveyD0Shown();
  expect(await readSurveyD0Pending()).toBe(false);
  expect(await AsyncStorage.getItem(SURVEY_D0_SHOWN_KEY)).not.toBeNull();
});

test('marking pending again after already-shown is a no-op (never re-queues)', async () => {
  await markSurveyD0Shown();
  await markSurveyD0Pending();
  expect(await readSurveyD0Pending()).toBe(false);
});

test('a second first-ever-log signal after shown does not resurrect pending', async () => {
  await markSurveyD0Pending();
  await markSurveyD0Shown();
  await markSurveyD0Pending(); // e.g. a stray duplicate trigger
  expect(await readSurveyD0Pending()).toBe(false);
});
