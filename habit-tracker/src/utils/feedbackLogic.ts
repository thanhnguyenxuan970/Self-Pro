// Pure feedback validation + rate-limit logic (unit-testable, no RN imports).

// 'SURVEY_D0' is the D0 growth survey (see Docs/survey_d0_analysis_queries.sql
// and the implementation notes in the survey question doc) — an extension of
// the existing feedback pipeline rather than a new one, per its own "Kiểu dữ
// liệu — mở rộng, không tạo mới" guidance.
export type FeedbackType = 'BUG' | 'SUGGESTION' | 'OTHER' | 'SURVEY_D0';

export const FEEDBACK_MIN_LENGTH = 3;
export const FEEDBACK_MAX_LENGTH = 2000;
export const FEEDBACK_COOLDOWN_MS = 60_000; // 1 submission per minute

/**
 * True when trimmed message length is within server-enforced bounds.
 *
 * The D0 survey's Q6 (free text) is optional — an empty message is valid
 * only for type SURVEY_D0. Without this bypass, every survey submitted with
 * Q6 left blank would come back 'INVALID' and silently vanish (the survey's
 * own single most-missable implementation detail, per its spec).
 * A *non-empty* Q6 still has to clear the normal 3–2000 bound.
 */
export function validateFeedbackMessage(message: string, type: FeedbackType = 'BUG'): boolean {
  const len = message.trim().length;
  if (type === 'SURVEY_D0' && len === 0) return true;
  return len >= FEEDBACK_MIN_LENGTH && len <= FEEDBACK_MAX_LENGTH;
}

/**
 * Client-side rate limit: allowed when no previous submit recorded,
 * cooldown elapsed, or stored timestamp is in the future (clock change → fail open).
 *
 * SURVEY_D0 is exempt outright — a survey shown right after someone's first
 * log shouldn't itself be blocked by an unrelated recent feedback submit, and
 * shouldn't consume the cooldown window either (see submitFeedback, which
 * skips writing the local timestamp for this type — a user who fills the
 * survey and then wants to report a real bug 10 seconds later must be able to).
 */
export function canSubmitFeedback(lastSubmitMs: number | null, nowMs: number, type: FeedbackType = 'BUG'): boolean {
  if (type === 'SURVEY_D0') return true;
  if (lastSubmitMs === null) return true;
  if (lastSubmitMs > nowMs) return true;
  return nowMs - lastSubmitMs >= FEEDBACK_COOLDOWN_MS;
}

// ---------------------------------------------------------------------
// D0 growth survey — see the survey question doc for full Q1–Q6 copy and
// the "why" behind each field. Answer keys below are option letters, not
// translated text, so the shape is language-independent and stable to
// analyze in SQL regardless of which language the respondent saw.
// ---------------------------------------------------------------------

export const SURVEY_D0_VERSION = 'd0_v1';

export type SurveyD0Q1 = 'A' | 'B' | 'C' | 'D' | 'E';
export type SurveyD0Q2 = 'A' | 'B' | 'C' | 'D' | 'E';
export type SurveyD0Q3 = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type SurveyD0Q4 = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type SurveyD0Q5 = 'A' | 'B' | 'C' | 'D';

export interface SurveyD0Answers {
  survey: typeof SURVEY_D0_VERSION;
  q1_motivation: SurveyD0Q1;
  q2_impression: SurveyD0Q2;
  /** Multi-select; 'F' ("nothing — smooth") is exclusive with every other option. */
  q3_friction: SurveyD0Q3[];
  q4_feature: SurveyD0Q4;
  q5_return_intent: SurveyD0Q5;
  // Self-recorded by the client, never asked — see the survey doc's point 3.
  // This trio alone can confirm or refute the hardcoded-'vi' hypothesis even
  // if nobody ever answers Q3's language option.
  locale: string;
  device_lang: string;
  app_lang: string;
}

const Q3_VALUES: SurveyD0Q3[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Validates the 5 required MCQ answers (Q1–Q5) plus the self-recorded locale
 * trio. Q6 (the free-text message) is validated separately via
 * validateFeedbackMessage — it isn't part of this shape's contract since it's
 * optional and travels as the feedback row's own `message` field, not inside
 * `answers`.
 */
export function validateSurveyD0Answers(a: Partial<SurveyD0Answers> | null | undefined): a is SurveyD0Answers {
  if (!a) return false;
  if (a.survey !== SURVEY_D0_VERSION) return false;
  if (!['A', 'B', 'C', 'D', 'E'].includes(a.q1_motivation as string)) return false;
  if (!['A', 'B', 'C', 'D', 'E'].includes(a.q2_impression as string)) return false;
  if (!Array.isArray(a.q3_friction) || a.q3_friction.length === 0) return false;
  if (!a.q3_friction.every(v => Q3_VALUES.includes(v))) return false;
  // 'F' ("nothing got in the way") is exclusive with every other option.
  if (a.q3_friction.includes('F') && a.q3_friction.length > 1) return false;
  if (!['A', 'B', 'C', 'D', 'E', 'F'].includes(a.q4_feature as string)) return false;
  if (!['A', 'B', 'C', 'D'].includes(a.q5_return_intent as string)) return false;
  if (typeof a.locale !== 'string' || a.locale.length === 0) return false;
  if (typeof a.device_lang !== 'string' || a.device_lang.length === 0) return false;
  if (typeof a.app_lang !== 'string' || a.app_lang.length === 0) return false;
  return true;
}
