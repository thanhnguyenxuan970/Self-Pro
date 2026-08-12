jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    Version: 30,
    constants: { Brand: 'Google', Model: 'Pixel 7', Release: '14' },
  },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../src/api/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { submitFeedback } from '../src/api/feedbackService';

const mockSupabase = jest.requireMock('../src/api/supabase') as {
  supabase: { functions: { invoke: jest.Mock } };
};

beforeEach(async () => {
  mockSupabase.supabase.functions.invoke.mockReset();
  await AsyncStorage.clear();
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
