import {
  validateFeedbackMessage,
  canSubmitFeedback,
  validateSurveyD0Answers,
  FEEDBACK_MIN_LENGTH,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_COOLDOWN_MS,
  SURVEY_D0_VERSION,
  SurveyD0Answers,
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

  it('SURVEY_D0 is exempt from cooldown even seconds after a prior submission', () => {
    expect(canSubmitFeedback(NOW - 1, NOW, 'SURVEY_D0')).toBe(true);
  });
});

describe('validateFeedbackMessage — SURVEY_D0 bypass', () => {
  it('accepts an empty message for SURVEY_D0 (Q6 is optional)', () => {
    expect(validateFeedbackMessage('', 'SURVEY_D0')).toBe(true);
    expect(validateFeedbackMessage('   ', 'SURVEY_D0')).toBe(true);
  });

  it('still enforces the normal 3–2000 bound for SURVEY_D0 once Q6 is non-empty', () => {
    expect(validateFeedbackMessage('ab', 'SURVEY_D0')).toBe(false);
    expect(validateFeedbackMessage('abc', 'SURVEY_D0')).toBe(true);
    expect(validateFeedbackMessage('a'.repeat(FEEDBACK_MAX_LENGTH + 1), 'SURVEY_D0')).toBe(false);
  });

  it('non-SURVEY_D0 types are unaffected by the bypass (default type is BUG)', () => {
    expect(validateFeedbackMessage('')).toBe(false);
  });
});

const validAnswers: SurveyD0Answers = {
  survey: SURVEY_D0_VERSION,
  q1_motivation: 'C',
  q2_impression: 'B',
  q3_friction: ['A', 'C'],
  q4_feature: 'F',
  q5_return_intent: 'B',
  locale: 'en-PK',
  device_lang: 'en',
  app_lang: 'vi',
};

describe('validateSurveyD0Answers', () => {
  it('accepts a fully valid answer set', () => {
    expect(validateSurveyD0Answers(validAnswers)).toBe(true);
  });

  it('accepts the exclusive F-only friction answer', () => {
    expect(validateSurveyD0Answers({ ...validAnswers, q3_friction: ['F'] })).toBe(true);
  });

  it('rejects F combined with any other friction option', () => {
    expect(validateSurveyD0Answers({ ...validAnswers, q3_friction: ['F', 'A'] })).toBe(false);
  });

  it('rejects an empty q3_friction array', () => {
    expect(validateSurveyD0Answers({ ...validAnswers, q3_friction: [] })).toBe(false);
  });

  it('rejects a wrong survey version tag', () => {
    expect(validateSurveyD0Answers({ ...validAnswers, survey: 'd0_v2' as typeof SURVEY_D0_VERSION })).toBe(false);
  });

  it('rejects an invalid MCQ option letter', () => {
    expect(validateSurveyD0Answers({ ...validAnswers, q1_motivation: 'Z' as SurveyD0Answers['q1_motivation'] })).toBe(false);
  });

  it('rejects invalid options and incomplete locale metadata at every survey field boundary', () => {
    expect(validateSurveyD0Answers({ ...validAnswers, q2_impression: 'Z' as SurveyD0Answers['q2_impression'] })).toBe(false);
    expect(validateSurveyD0Answers({ ...validAnswers, q3_friction: ['Z' as SurveyD0Answers['q3_friction'][number]] })).toBe(false);
    expect(validateSurveyD0Answers({ ...validAnswers, q4_feature: 'Z' as SurveyD0Answers['q4_feature'] })).toBe(false);
    expect(validateSurveyD0Answers({ ...validAnswers, q5_return_intent: 'Z' as SurveyD0Answers['q5_return_intent'] })).toBe(false);
    expect(validateSurveyD0Answers({ ...validAnswers, device_lang: '' })).toBe(false);
    expect(validateSurveyD0Answers({ ...validAnswers, app_lang: '' })).toBe(false);
  });

  it('rejects a missing locale field', () => {
    const { locale, ...rest } = validAnswers;
    expect(validateSurveyD0Answers(rest as SurveyD0Answers)).toBe(false);
  });

  it('rejects null/undefined', () => {
    expect(validateSurveyD0Answers(null)).toBe(false);
    expect(validateSurveyD0Answers(undefined)).toBe(false);
  });
});
