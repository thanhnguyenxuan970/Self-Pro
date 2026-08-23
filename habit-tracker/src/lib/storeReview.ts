import AsyncStorage from '@react-native-async-storage/async-storage';

type StoreReviewModule = typeof import('expo-store-review');

/** Device-wide latch: the native review quota is app-wide, not account-specific. */
export const REVIEW_REQUESTED_KEY = 'habi_store_review_requested_v1';
export const FIRST_USE_AT_KEY = 'habi_store_first_use_at_v1';
export const REVIEW_ELIGIBILITY_DELAY_MS = 24 * 60 * 60 * 1000;

let inFlight: Promise<void> | null = null;
let firstUseWriteInFlight: Promise<void> | null = null;
let promptTimer: ReturnType<typeof setTimeout> | null = null;

function getStoreReviewModule(): StoreReviewModule | null {
  try {
    return require('expo-store-review') as StoreReviewModule;
  } catch {
    // OTA/JS reloads can run against an older binary without this native module.
    return null;
  }
}

async function rememberFirstUse(firstUseAtMs: number): Promise<void> {
  if (firstUseWriteInFlight) return firstUseWriteInFlight;
  firstUseWriteInFlight = (async () => {
    if (await AsyncStorage.getItem(FIRST_USE_AT_KEY)) return;
    await AsyncStorage.setItem(FIRST_USE_AT_KEY, String(firstUseAtMs));
  })().finally(() => { firstUseWriteInFlight = null; });
  return firstUseWriteInFlight;
}

async function requestStoreReviewOnce(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(REVIEW_REQUESTED_KEY)) return;
    const storeReview = getStoreReviewModule();
    if (!storeReview || !(await storeReview.isAvailableAsync())) return;

    await storeReview.requestReview();
    await AsyncStorage.setItem(REVIEW_REQUESTED_KEY, 'requested');
  } catch {
    // Review prompting is best-effort and must never affect activity logging.
  }
}

/** Request the native review flow at most once per device installation. */
export function requestStoreReview(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = requestStoreReviewOnce().finally(() => { inFlight = null; });
  return inFlight;
}

/** Persist first use immediately; the visible review prompt may be delayed. */
export function recordFirstUse(firstUseAtMs = Date.now()): Promise<void> {
  return rememberFirstUse(firstUseAtMs);
}

/** Coalesce delayed prompts from rapid logs into one lifecycle-safe callback. */
export function scheduleStoreReviewPrompt(delayMs = 4_000): void {
  if (promptTimer !== null) return;
  promptTimer = setTimeout(() => {
    promptTimer = null;
    maybeRequestStoreReview().catch(() => {});
  }, delayMs);
}

/** Prompt only when the app is used again at least 24 hours after first use. */
export async function maybeRequestStoreReview(
  nowMs = Date.now(),
): Promise<void> {
  try {
    await recordFirstUse(nowMs);

    const firstUseAt = await AsyncStorage.getItem(FIRST_USE_AT_KEY);
    if (!firstUseAt) return;

    const firstUseAtMs = Number(firstUseAt);
    if (!Number.isFinite(firstUseAtMs) || nowMs - firstUseAtMs < REVIEW_ELIGIBILITY_DELAY_MS) return;

    await requestStoreReview();
  } catch {
    // Review eligibility is best-effort and must never affect activity logging.
  }
}
