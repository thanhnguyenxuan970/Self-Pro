jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    Version: 30,
    constants: { Brand: 'Google', Model: 'Pixel 7', Release: '14' },
  },
  NativeModules: {},
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../src/api/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

jest.mock('../src/qa/qaSandbox', () => ({ isQaSandboxActive: jest.fn(() => false) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { submitFeedback } from '../src/api/feedbackService';

const mockSupabase = jest.requireMock('../src/api/supabase') as {
  supabase: { functions: { invoke: jest.Mock } };
};
const mockQaSandbox = jest.requireMock('../src/qa/qaSandbox') as { isQaSandboxActive: jest.Mock };
const mockReactNative = jest.requireMock('react-native') as { Platform: { constants: Record<string, unknown>; Version: unknown }; NativeModules: Record<string, unknown> };

beforeEach(async () => {
  mockSupabase.supabase.functions.invoke.mockReset();
  await AsyncStorage.clear();
  mockQaSandbox.isQaSandboxActive.mockReturnValue(false);
  mockReactNative.Platform.constants = { Brand: 'Google', Model: 'Pixel 7', Release: '14' };
  mockReactNative.Platform.Version = 30;
  mockReactNative.NativeModules = {};
});

test('a message that fails local validation never reaches the network', async () => {
  const result = await submitFeedback({ type: 'BUG', message: 'ab', userEmail: 'a@b.com' });
  expect(result).toBe('INVALID');
  expect(mockSupabase.supabase.functions.invoke).not.toHaveBeenCalled();
});

test('invokes the feedback-submit Edge Function with the expected payload and returns OK', async () => {
  mockSupabase.supabase.functions.invoke.mockResolvedValue({ data: { result: 'OK' }, error: null });

  const result = await submitFeedback({ type: 'BUG', message: 'The button is broken', userEmail: 'a@b.com' });

  expect(result).toBe('OK');
  expect(mockSupabase.supabase.functions.invoke).toHaveBeenCalledWith(
    'feedback-submit',
    expect.objectContaining({
      body: expect.objectContaining({
        userEmail: 'a@b.com',
        type: 'BUG',
        message: 'The button is broken',
        appVersion: '2.0.3',
        platform: 'android',
      }),
    }),
  );
});

test('includes screen, error context, and local diagnostics in a bug report', async () => {
  mockSupabase.supabase.functions.invoke.mockResolvedValue({ data: { result: 'OK' }, error: null });

  const result = await submitFeedback({
    type: 'BUG',
    message: 'The updates screen is empty',
    userEmail: 'a@b.com',
    context: {
      appLanguage: 'vi',
      screen: 'News',
      route: 'News',
      errorCode: 'NEWS_LOAD_FAILED',
      errorNotice: 'Không tải được bản tin.',
    },
  });

  expect(result).toBe('OK');
  expect(mockSupabase.supabase.functions.invoke).toHaveBeenCalledWith(
    'feedback-submit',
    expect.objectContaining({
      body: expect.objectContaining({
        appVersion: '2.0.3',
        platform: 'android',
        appLanguage: 'vi',
        localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        screen: 'News',
        route: 'News',
        errorCode: 'NEWS_LOAD_FAILED',
        errorNotice: 'Không tải được bản tin.',
      }),
    }),
  );
});

test('records the local cooldown only after a confirmed OK, then blocks an immediate resubmit without a second network call', async () => {
  mockSupabase.supabase.functions.invoke.mockResolvedValue({ data: { result: 'OK' }, error: null });

  const first = await submitFeedback({ type: 'BUG', message: 'first submission text', userEmail: 'a@b.com' });
  const second = await submitFeedback({ type: 'BUG', message: 'second submission text', userEmail: 'a@b.com' });

  expect(first).toBe('OK');
  expect(second).toBe('RATE_LIMITED');
  expect(mockSupabase.supabase.functions.invoke).toHaveBeenCalledTimes(1);
});

test('a transport-level error from the Edge Function maps to FAILED rather than throwing', async () => {
  mockSupabase.supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'network blip' } });

  const result = await submitFeedback({ type: 'SUGGESTION', message: 'a helpful idea here', userEmail: null });

  expect(result).toBe('FAILED');
});

test('a server-reported non-OK result (its own rate limit) passes through instead of being swallowed into FAILED', async () => {
  mockSupabase.supabase.functions.invoke.mockResolvedValue({ data: { result: 'RATE_LIMITED' }, error: null });

  const result = await submitFeedback({ type: 'OTHER', message: 'another message here', userEmail: 'a@b.com' });

  expect(result).toBe('RATE_LIMITED');
});

test('a response body with no result field maps to FAILED, never crashes on the undefined access', async () => {
  mockSupabase.supabase.functions.invoke.mockResolvedValue({ data: {}, error: null });

  const result = await submitFeedback({ type: 'BUG', message: 'yet another message', userEmail: 'a@b.com' });

  expect(result).toBe('FAILED');
});

const surveyAnswers = {
  survey: 'd0_v1' as const,
  q1_motivation: 'C' as const,
  q2_impression: 'B' as const,
  q3_friction: ['A' as const],
  q4_feature: 'F' as const,
  q5_return_intent: 'B' as const,
  locale: 'en-PK',
  device_lang: 'en',
  app_lang: 'vi',
};

test('SURVEY_D0 submits with an empty message and the answers payload', async () => {
  mockSupabase.supabase.functions.invoke.mockResolvedValue({ data: { result: 'OK' }, error: null });

  const result = await submitFeedback({ type: 'SURVEY_D0', message: '', userEmail: 'a@b.com', answers: surveyAnswers });

  expect(result).toBe('OK');
  expect(mockSupabase.supabase.functions.invoke).toHaveBeenCalledWith(
    'feedback-submit',
    expect.objectContaining({
      body: expect.objectContaining({ type: 'SURVEY_D0', message: '', answers: surveyAnswers }),
    }),
  );
});

test('SURVEY_D0 is exempt from the local cooldown — a BUG submitted right after it still goes through', async () => {
  mockSupabase.supabase.functions.invoke.mockResolvedValue({ data: { result: 'OK' }, error: null });

  const survey = await submitFeedback({ type: 'SURVEY_D0', message: '', userEmail: 'a@b.com', answers: surveyAnswers });
  const bug = await submitFeedback({ type: 'BUG', message: 'found a real bug here', userEmail: 'a@b.com' });

  expect(survey).toBe('OK');
  expect(bug).toBe('OK');
  expect(mockSupabase.supabase.functions.invoke).toHaveBeenCalledTimes(2);
});

test('handles QA mode, storage read failures, native locale fallback, and sparse device metadata', async () => {
  mockQaSandbox.isQaSandboxActive.mockReturnValue(true);
  await expect(submitFeedback({ type: 'BUG', message: 'a valid bug message', userEmail: null })).resolves.toBe('UNAVAILABLE');
  mockQaSandbox.isQaSandboxActive.mockReturnValue(false);
  (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));
  mockSupabase.supabase.functions.invoke.mockResolvedValueOnce({ data: { result: 'OK' }, error: null });
  mockReactNative.Platform.constants = {};
  mockReactNative.Platform.Version = undefined;
  mockReactNative.NativeModules.ExpoLocalization = {};
  await expect(submitFeedback({ type: 'OTHER', message: 'sparse device metadata', userEmail: null, context: {} })).resolves.toBe('OK');
  expect(mockSupabase.supabase.functions.invoke).toHaveBeenCalledWith('feedback-submit', expect.objectContaining({ body: expect.objectContaining({ device: 'android', osVersion: 'undefined', answers: null }) }));
});

test('SURVEY_D0 without answers keeps the nullable payload explicit', async () => {
  mockSupabase.supabase.functions.invoke.mockResolvedValueOnce({ data: { result: 'OK' }, error: null });
  await expect(submitFeedback({ type: 'SURVEY_D0', message: '', userEmail: null })).resolves.toBe('OK');
  expect(mockSupabase.supabase.functions.invoke).toHaveBeenCalledWith('feedback-submit', expect.objectContaining({ body: expect.objectContaining({ answers: null }) }));
});

test('a BUG submitted right before SURVEY_D0 does not block the survey', async () => {
  mockSupabase.supabase.functions.invoke.mockResolvedValue({ data: { result: 'OK' }, error: null });

  const bug = await submitFeedback({ type: 'BUG', message: 'found a real bug here', userEmail: 'a@b.com' });
  const survey = await submitFeedback({ type: 'SURVEY_D0', message: '', userEmail: 'a@b.com', answers: surveyAnswers });

  expect(bug).toBe('OK');
  expect(survey).toBe('OK');
  expect(mockSupabase.supabase.functions.invoke).toHaveBeenCalledTimes(2);
});

test('keeps diagnostics safe when timezone detection throws', async () => {
  mockSupabase.supabase.functions.invoke.mockResolvedValueOnce({ data: { result: 'OK' }, error: null });
  const timezone = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
    throw new Error('timezone unavailable');
  });
  try {
    await expect(submitFeedback({ type: 'BUG', message: 'timezone fallback message', userEmail: null }))
      .resolves.toBe('OK');
  } finally {
    timezone.mockRestore();
  }
});

test('handles native locale variants and null platform constants defensively', async () => {
  mockSupabase.supabase.functions.invoke.mockResolvedValue({ data: { result: 'OK' }, error: null });
  mockReactNative.NativeModules.ExpoLocalization = {};
  await expect(submitFeedback({ type: 'BUG', message: 'locale missing branch', userEmail: null })).resolves.toBe('OK');

  jest.resetModules();
  jest.doMock('react-native', () => ({
    Platform: { OS: 'android', Version: 33, constants: null },
    NativeModules: { ExpoLocalization: {} },
  }));
  jest.doMock('../src/api/supabase', () => ({ supabase: { functions: { invoke: jest.fn().mockResolvedValue({ data: { result: 'OK' }, error: null }) } } }));
  jest.doMock('../src/qa/qaSandbox', () => ({ isQaSandboxActive: jest.fn(() => false) }));
  try {
    const isolated = await import('../src/api/feedbackService');
    await expect(isolated.submitFeedback({ type: 'BUG', message: 'null constants branch', userEmail: null })).resolves.toBe('OK');
  } finally {
    jest.dontMock('react-native');
    jest.dontMock('../src/api/supabase');
    jest.dontMock('../src/qa/qaSandbox');
    jest.resetModules();
  }
});
