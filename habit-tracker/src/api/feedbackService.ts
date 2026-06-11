import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import {
  FeedbackType,
  canSubmitFeedback,
  validateFeedbackMessage,
} from '../utils/feedbackLogic';

const LAST_SUBMIT_KEY = 'habit_feedback_last_submit';

// Keep in sync with app.json "version" (no expo-application dep needed).
const APP_VERSION = '1.0.0';

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
 * Insert feedback into Supabase (write-only table — see 003_create_feedback_table.sql).
 * Works with or without an active Supabase Auth session (anon INSERT allowed).
 */
export async function submitFeedback(params: {
  type: FeedbackType;
  message: string;
  userEmail: string | null;
}): Promise<FeedbackResult> {
  if (!validateFeedbackMessage(params.message)) return 'INVALID';
  if (!supabase) return 'UNAVAILABLE';

  const raw = await AsyncStorage.getItem(LAST_SUBMIT_KEY).catch(() => null);
  const last = raw ? parseInt(raw, 10) || null : null;
  if (!canSubmitFeedback(last, Date.now())) return 'RATE_LIMITED';

  const { device, osVersion } = getDeviceInfo();
  const { error } = await supabase.from('feedback').insert({
    user_email: params.userEmail,
    type: params.type,
    message: params.message.trim(),
    app_version: APP_VERSION,
    device,
    os_version: osVersion,
  });
  if (error) return 'FAILED';

  await AsyncStorage.setItem(LAST_SUBMIT_KEY, String(Date.now())).catch(() => {});
  return 'OK';
}
