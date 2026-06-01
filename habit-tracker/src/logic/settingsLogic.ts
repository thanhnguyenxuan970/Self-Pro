import type { AppLanguage } from '../contexts/SettingsContext';

export function parseSettingsBool(raw: string | null): boolean {
  return raw === 'true';
}

export function parseSettingsLang(raw: string | null): AppLanguage {
  if (raw === 'en' || raw === 'vi') return raw;
  return 'vi';
}

/** Validates HH:MM 24-hour format. Returns false for out-of-range values. */
export function validateNotificationTime(time: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [h, m] = time.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}
