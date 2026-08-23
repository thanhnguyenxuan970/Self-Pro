import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import {
  FeedbackType,
  SurveyD0Answers,
  canSubmitFeedback,
  validateFeedbackMessage,
} from '../utils/feedbackLogic';
import { isQaSandboxActive } from '../qa/qaSandbox';

const LAST_SUBMIT_KEY = 'habit_feedback_last_submit';
const SUBMIT_TIMEOUT_MS = 15_000;

// Keep in sync with app.json "version" (no expo-application dep needed).
const APP_VERSION = '1.1.0.0';

export type FeedbackResult = 'OK' | 'INVALID' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'FAILED';

/** Device info from RN core Platform — no extra native deps. */
function getDeviceInfo(): { device: string; osVersion: string } {
  const pc = (Platform.constants ?? {}) as Record<string, unknown>;
  const brand = typeof pc.Brand === 'string' ? pc.Brand : '';
  const model = typeof pc.Model === 'string' ? pc.Model : '';
  const release = typeof pc.Release === 'string' ? pc.Release : String(Platform.Version);
  const device = `${brand} ${model}`.trim() || Platform.OS;
  return { device: device.slice(0, 128), osVersion: release.slice(0, 64) };
}

/**
 * Submit feedback via the feedback-submit Edge Function (see
 * 034_feedback_server_rate_limit.sql) rather than inserting into the
 * write-only `feedback` table directly — the table revokes client INSERT
 * entirely so the function's server-side per-IP rate limit can't be
 * bypassed by calling PostgREST directly with the public anon key.
 * Works with or without an active Supabase Auth session.
 *
 * The AsyncStorage cooldown check below is a fast local pre-check for snappy
 * UX (skips a network round trip for an obviously-too-soon resubmit); the
 * Edge Function's server-side check is the actual rate-limit boundary.
 */
export async function submitFeedback(params: {
  type: FeedbackType;
  message: string;
  userEmail: string | null;
  /** D0 survey MCQ answers — only meaningful (and only sent) for type SURVEY_D0. */
  answers?: SurveyD0Answers;
}): Promise<FeedbackResult> {
  if (!validateFeedbackMessage(params.message, params.type)) return 'INVALID';
  if (isQaSandboxActive() || !supabase) return 'UNAVAILABLE';

  // SURVEY_D0 is exempt from the cooldown outright (canSubmitFeedback
  // returns true unconditionally for it) — skip both the read here and the
  // write below, so filling the survey never blocks, and never itself
  // blocks, a real feedback submission sent moments apart.
  if (params.type !== 'SURVEY_D0') {
    // A read failure here (or a "0"/corrupt stored value) is treated as "no
    // record" and falls through to the network call -- safe to fail open
    // because the Edge Function's server-side cooldown is the actual
    // rate-limit boundary; this check only saves a round trip.
    let last: number | null = null;
    try {
      const raw = await AsyncStorage.getItem(LAST_SUBMIT_KEY);
      const parsed = raw === null ? NaN : parseInt(raw, 10);
      last = Number.isFinite(parsed) ? parsed : null;
    } catch { /* fail open — see comment above */ }
    if (!canSubmitFeedback(last, Date.now(), params.type)) return 'RATE_LIMITED';
  }

  const { device, osVersion } = getDeviceInfo();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
  let data: unknown, error: unknown;
  try {
    ({ data, error } = await supabase.functions.invoke('feedback-submit', {
      body: {
        userEmail: params.userEmail,
        type: params.type,
        message: params.message.trim(),
        appVersion: APP_VERSION,
        device,
        osVersion,
        answers: params.answers ?? null,
      },
      signal: controller.signal,
    }));
  } finally {
    clearTimeout(timeout);
  }
  if (error) return 'FAILED';
  const result = (data as { result?: FeedbackResult } | null)?.result;
  if (result !== 'OK') return result ?? 'FAILED';

  // A write failure here just means the next submit re-checks the (now
  // stale) local cooldown -- harmless, since the server enforces the real
  // limit regardless of what this local timestamp says.
  if (params.type !== 'SURVEY_D0') {
    await AsyncStorage.setItem(LAST_SUBMIT_KEY, String(Date.now())).catch(() => {});
  }
  return 'OK';
}
