jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import {
  FIRST_USE_AT_KEY,
  REVIEW_REQUESTED_KEY,
  REVIEW_ELIGIBILITY_DELAY_MS,
  maybeRequestStoreReview,
  requestStoreReview,
} from '../src/lib/storeReview';

jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(),
  requestReview: jest.fn(),
}));

const isAvailableAsync = StoreReview.isAvailableAsync as jest.MockedFunction<typeof StoreReview.isAvailableAsync>;
const requestReview = StoreReview.requestReview as jest.MockedFunction<typeof StoreReview.requestReview>;

describe('store review trigger', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    isAvailableAsync.mockResolvedValue(true);
    requestReview.mockResolvedValue(undefined);
  });

  test('starts the 24-hour window on the first eligible activity', async () => {
    const firstUseAt = 1_700_000_000_000;

    await maybeRequestStoreReview(firstUseAt);

    expect(await AsyncStorage.getItem(FIRST_USE_AT_KEY)).toBe(String(firstUseAt));
    expect(requestReview).not.toHaveBeenCalled();
  });

  test('waits until the full 24 hours have elapsed', async () => {
    const firstUseAt = 1_700_000_000_000;

    await maybeRequestStoreReview(firstUseAt);
    await maybeRequestStoreReview(firstUseAt + REVIEW_ELIGIBILITY_DELAY_MS - 1);

    expect(requestReview).not.toHaveBeenCalled();
  });

  test('requests review when the app is used at the 24-hour boundary', async () => {
    const firstUseAt = 1_700_000_000_000;

    await maybeRequestStoreReview(firstUseAt);
    await maybeRequestStoreReview(firstUseAt + REVIEW_ELIGIBILITY_DELAY_MS);

    expect(requestReview).toHaveBeenCalledTimes(1);
  });

  test('requests the native review and latches after the first successful request', async () => {
    await requestStoreReview();
    await requestStoreReview();

    expect(isAvailableAsync).toHaveBeenCalledTimes(1);
    expect(requestReview).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(REVIEW_REQUESTED_KEY)).toBe('requested');
  });

  test('does nothing when native review is unavailable', async () => {
    isAvailableAsync.mockResolvedValue(false);

    await requestStoreReview();

    expect(requestReview).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(REVIEW_REQUESTED_KEY)).toBeNull();
  });

  test('does not latch a failed native request so a later trigger can retry', async () => {
    requestReview.mockRejectedValueOnce(new Error('review unavailable'));

    await requestStoreReview();
    await requestStoreReview();

    expect(requestReview).toHaveBeenCalledTimes(2);
    expect(await AsyncStorage.getItem(REVIEW_REQUESTED_KEY)).toBe('requested');
  });

  test('coalesces concurrent review requests', async () => {
    let resolveRequest!: () => void;
    requestReview.mockReturnValueOnce(new Promise<void>(resolve => { resolveRequest = resolve; }));

    const first = requestStoreReview();
    const second = requestStoreReview();
    resolveRequest();
    await Promise.all([first, second]);

    expect(requestReview).toHaveBeenCalledTimes(1);
  });
});
