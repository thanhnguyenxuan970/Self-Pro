import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import appConfig from '../../app.json';
import { supabase } from './supabase';
import {
  FeedbackType,
  SurveyD0Answers,
  canSubmitFeedback,
  validateFeedbackMessage,
} from '../utils/feedbackLogic';
import { isQaSandboxActive } from '../qa/qaSandbox';
import { getLocalDate } from '../utils/formatters';

const LAST_SUBMIT_KEY = 'habit_feedback_last_submit';
const SUBMIT_TIMEOUT_MS = 15_000;

const APP_VERSION = typeof appConfig.expo?.version === 'string' ? appConfig.expo.version : null;

export type FeedbackContext = {
  appLanguage?: string | null;
  screen?: string | null;
  route?: string | null;
  errorCode?: string | null;
  errorNotice?: string | null;
};

function getDeviceLocale(): string | null {
  try {
    // Keep this runtime-only and guard the native registry: an OTA update can
    // reach a binary that predates expo-localization, and requireNativeModule
    // would otherwise turn a diagnostic field into a startup crash.
    const { NativeModules } = require('react-native') as { NativeModules?: Record<string, unknown> };
    if (!NativeModules?.ExpoLocalization) return null;
    const Localization = require('expo-localization') as {
      getLocales?: () => Array<{ languageTag?: unknown }>;
    };
    const languageTag = Localization.getLocales?.()[0]?.languageTag;
    return typeof languageTag === 'string' && languageTag.trim() ? languageTag.trim().slice(0, 64) : null;
  } catch {
    return null;
  }
}

function getDeviceTimezone(): string | null {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timezone === 'string' && timezone.trim() ? timezone.trim().slice(0, 64) : null;
  } catch {
    return null;
  }
}

export type FeedbackResult = 'OK' | 'INVALID' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'FAILED';

/** Device info from RN core Platform — no extra native deps. */
function getDeviceInfo(): { platform: string; device: string; osVersion: string } {
  const pc = (Platform.constants ?? {}) as Record<string, unknown>;
  const brand = typeof pc.Brand === 'string' ? pc.Brand : '';
  const model = typeof pc.Model === 'string' ? pc.Model : '';
  const release = typeof pc.Release === 'string' ? pc.Release : String(Platform.Version);
  const device = `${brand} ${model}`.trim() || Platform.OS;
  return { platform: String(Platform.OS).slice(0, 32), device: device.slice(0, 128), osVersion: release.slice(0, 64) };
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
  context?: FeedbackContext;
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

  const { platform, device, osVersion } = getDeviceInfo();
  const context = params.context ?? {};

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
        platform,
        device,
        osVersion,
        deviceTimezone: getDeviceTimezone(),
        deviceLocale: getDeviceLocale(),
        appLanguage: context.appLanguage ?? null,
        localDate: getLocalDate(),
        screen: context.screen ?? null,
        route: context.route ?? null,
        errorCode: context.errorCode ?? null,
        errorNotice: context.errorNotice ?? null,
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
