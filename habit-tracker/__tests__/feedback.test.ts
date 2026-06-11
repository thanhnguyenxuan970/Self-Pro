import {
  validateFeedbackMessage,
  canSubmitFeedback,
  FEEDBACK_MIN_LENGTH,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_COOLDOWN_MS,
} from '../src/utils/feedbackLogic';

describe('validateFeedbackMessage', () => {
  it('rejects empty and whitespace-only messages', () => {
    expect(validateFeedbackMessage('')).toBe(false);
    expect(validateFeedbackMessage('   ')).toBe(false);
    expect(validateFeedbackMessage('\n\t')).toBe(false);
  });

  it('rejects messages shorter than min after trim', () => {
    expect(validateFeedbackMessage('ab')).toBe(false);
    expect(validateFeedbackMessage('  ab  ')).toBe(false);
  });

  it('accepts messages at exactly min length', () => {
    expect(validateFeedbackMessage('a'.repeat(FEEDBACK_MIN_LENGTH))).toBe(true);
  });

  it('accepts messages at exactly max length', () => {
    expect(validateFeedbackMessage('a'.repeat(FEEDBACK_MAX_LENGTH))).toBe(true);
  });

  it('rejects messages over max length', () => {
    expect(validateFeedbackMessage('a'.repeat(FEEDBACK_MAX_LENGTH + 1))).toBe(false);
  });

  it('trims before measuring (padded long message still valid)', () => {
    expect(validateFeedbackMessage(`  ${'a'.repeat(FEEDBACK_MAX_LENGTH)}  `)).toBe(true);
  });
});

describe('canSubmitFeedback', () => {
  const NOW = 1_750_000_000_000;

  it('allows when no previous submission', () => {
    expect(canSubmitFeedback(null, NOW)).toBe(true);
  });

  it('blocks within cooldown window', () => {
    expect(canSubmitFeedback(NOW - 1, NOW)).toBe(false);
    expect(canSubmitFeedback(NOW - FEEDBACK_COOLDOWN_MS + 1, NOW)).toBe(false);
  });

  it('allows at exactly the cooldown boundary', () => {
    expect(canSubmitFeedback(NOW - FEEDBACK_COOLDOWN_MS, NOW)).toBe(true);
  });

  it('allows after cooldown elapsed', () => {
    expect(canSubmitFeedback(NOW - FEEDBACK_COOLDOWN_MS - 1, NOW)).toBe(true);
  });

  it('fails open when stored timestamp is in the future (clock change)', () => {
    expect(canSubmitFeedback(NOW + 5_000, NOW)).toBe(true);
  });
});
