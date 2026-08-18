// Pure device-locale resolution logic (unit-testable, no RN/Expo imports).
//
// Historically SettingsContext.tsx hardcoded the language default to 'vi'
// regardless of device locale (expo-localization wasn't even a dependency),
// so every new install showed Vietnamese to every user until they manually
// changed it in Settings. This resolves the *first-launch* default from the
// device's actual locale instead — once a user has an explicit stored
// preference (habit_language in AsyncStorage), that stored value always wins
// and this module is never consulted again.
import type { AppLanguage } from '../config/i18n';

/** Minimal shape of one entry from expo-localization's Localization.getLocales(). */
export type DeviceLocale = {
  languageTag?: string | null;
  languageCode?: string | null;
};

/** Full BCP-47-ish tag of the device's most-preferred locale, e.g. "en-PK".
 *  Falls back to 'unknown' when the platform reports nothing usable. */
export function resolveDeviceLocaleTag(locales: DeviceLocale[] | null | undefined): string {
  const tag = locales?.[0]?.languageTag;
  return tag && tag.trim().length > 0 ? tag : 'unknown';
}

/** Bare language subtag of the device's most-preferred locale, e.g. "en".
 *  Falls back to 'unknown' when the platform reports nothing usable. */
export function resolveDeviceLanguageCode(locales: DeviceLocale[] | null | undefined): string {
  const code = locales?.[0]?.languageCode;
  if (code && code.trim().length > 0) return code.toLowerCase();
  // Some platforms only populate languageTag ("en-PK"), not languageCode.
  const tag = locales?.[0]?.languageTag;
  if (tag && tag.trim().length > 0) return tag.split(/[-_]/)[0].toLowerCase();
  return 'unknown';
}

/** Maps a device language code to one of the app's supported languages.
 *  Only 'vi' and 'en' are supported today, so anything that isn't
 *  Vietnamese defaults to English rather than assuming Vietnamese. */
export function resolveDefaultAppLanguage(deviceLanguageCode: string): AppLanguage {
  return deviceLanguageCode === 'vi' ? 'vi' : 'en';
}
