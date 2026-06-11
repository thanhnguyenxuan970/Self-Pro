// Pure feedback validation + rate-limit logic (unit-testable, no RN imports).

export type FeedbackType = 'BUG' | 'SUGGESTION' | 'OTHER';

export const FEEDBACK_MIN_LENGTH = 3;
export const FEEDBACK_MAX_LENGTH = 2000;
export const FEEDBACK_COOLDOWN_MS = 60_000; // 1 submission per minute

/** True when trimmed message length is within server-enforced bounds. */
export function validateFeedbackMessage(message: string): boolean {
  const len = message.trim().length;
  return len >= FEEDBACK_MIN_LENGTH && len <= FEEDBACK_MAX_LENGTH;
}

/**
 * Client-side rate limit: allowed when no previous submit recorded,
 * cooldown elapsed, or stored timestamp is in the future (clock change → fail open).
 */
export function canSubmitFeedback(lastSubmitMs: number | null, nowMs: number): boolean {
  if (lastSubmitMs === null) return true;
  if (lastSubmitMs > nowMs) return true;
  return nowMs - lastSubmitMs >= FEEDBACK_COOLDOWN_MS;
}
