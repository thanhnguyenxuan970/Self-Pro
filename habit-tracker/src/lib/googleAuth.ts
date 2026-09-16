import { GOOGLE_PICTURE_PLACEHOLDER, type GoogleUser } from './googleUserStorage';

export type GoogleSignInResponse = {
  type?: string;
  data?: {
    user?: {
      email?: string;
      name?: string | null;
      id?: string;
      photo?: string | null;
    };
    idToken?: string | null;
  } | null;
};

export function isGoogleSignInCancelledResponse(response: GoogleSignInResponse | null | undefined): boolean {
  return response?.type === 'cancelled';
}

/** Return only a short, non-sensitive native error code for opt-in diagnostics. */
export function getGoogleSignInErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(code) ? code : null;
}

export type GoogleSignInFailureKind = 'account_recovery' | 'provider_configuration' | 'unknown';

const ACCOUNT_RECOVERY_ERROR_CODES = new Set([
  'RESTORE_NO_CLIENT',
  'RESTORE_BLOCKED',
  'RESTORE_TRANSIENT',
  'RESTORE_ERROR',
  'RESTORE_DIVERGED',
  'RESTORE_TIMEOUT',
]);

/**
 * Map only the app's short, validated error codes to safe user-facing states.
 * Restore failures are deliberately kept fail-closed; this classification only
 * prevents them from being presented as a misleading generic OAuth failure.
 */
export function getGoogleSignInFailureKind(code: string | null): GoogleSignInFailureKind {
  if (code && ACCOUNT_RECOVERY_ERROR_CODES.has(code)) return 'account_recovery';
  if (code === 'DEVELOPER_ERROR' || code === '10') return 'provider_configuration';
  return 'unknown';
}

export type GoogleSignInAlertMessages = {
  signInNoPlayServices: string;
  signInRecoveryFailed: string;
  signInConfigError: string;
  signInFailed: string;
};

export function getGoogleSignInFailureMessage({
  code,
  cancelledCode,
  playServicesUnavailableCode,
  diagnosticsEnabled,
  messages,
}: {
  code: string | null;
  cancelledCode?: string;
  playServicesUnavailableCode?: string;
  diagnosticsEnabled: boolean;
  messages: GoogleSignInAlertMessages;
}): string | null {
  if (code === cancelledCode) return null;
  if (code === playServicesUnavailableCode) return messages.signInNoPlayServices;

  const failureKind = getGoogleSignInFailureKind(code);
  if (failureKind === 'account_recovery') return messages.signInRecoveryFailed;
  if (failureKind === 'provider_configuration') return messages.signInConfigError;
  return diagnosticsEnabled && code ? `${messages.signInFailed} (${code})` : messages.signInFailed;
}

/** Convert the native Google response only when the remote-auth credential is present. */
export function extractGoogleUser(response: GoogleSignInResponse): { googleUser: GoogleUser; idToken: string } | null {
  const user = response.data?.user;
  const idToken = response.data?.idToken;
  if (
    typeof user?.id !== 'string' || !user.id.trim()
    || typeof user.email !== 'string' || !user.email.trim()
    || typeof user.name !== 'string' || !user.name.trim()
    || typeof idToken !== 'string' || !idToken.trim()
  ) return null;

  return {
    googleUser: {
      sub: user.id.trim(),
      email: user.email.trim(),
      name: user.name.trim(),
      picture: typeof user.photo === 'string' && user.photo.trim()
        ? user.photo.trim()
        : GOOGLE_PICTURE_PLACEHOLDER,
    },
    idToken: idToken.trim(),
  };
}
