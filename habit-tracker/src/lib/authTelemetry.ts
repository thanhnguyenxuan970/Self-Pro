import * as Sentry from '@sentry/react-native';
import { NO_SAVED_GOOGLE_CREDENTIAL_CODE } from '../api/syncErrors';

// Keep these values tied to android/app/build.gradle's versionName/versionCode
// and the Expo manifest's display version.
export const APP_VERSION_NAME = '2.0.4';
export const APP_VERSION_CODE = 85;
const APP_VERSION = `${APP_VERSION_NAME}+${APP_VERSION_CODE}`;
const isDevBuild = () => (globalThis as typeof globalThis & { __DEV__?: unknown }).__DEV__ === true;
// Verified against package.json, package-lock.json, and the installed package
// type definitions. Keep this explicit so the response-shape diagnostic cannot
// depend on importing a native-adjacent package at module load time.
export const GOOGLE_SIGN_IN_LIBRARY_VERSION = '16.1.2';

export type AuthStage =
  | 'google_native'
  | 'supabase_exchange'
  | 'identity_validation'
  | 'reset_delete_marker'
  | 'local_bootstrap'
  | 'cloud_restore'
  | 'credential_storage'
  | 'ui_publish'
  | 'startup_recovery';

export type AuthStageOutcome = 'started' | 'success' | 'failure' | 'cancelled';

export type AuthStageEvent = {
  attemptId: string;
  stage: AuthStage;
  outcome: AuthStageOutcome;
  durationMs?: number;
  errorCode?: string;
  status?: number;
};

export type GoogleSignInFailureStep = 'native_sign_in' | 'extractGoogleUser';

export type RestorePhase = 'rpc_load' | 'parse_envelope' | 'validate_payload' | 'sqlite_transaction';
export type RestoreRpcOperation = 'activity_schema_probe' | 'restore_my_data_backup_v2';
export type RestorePhaseOutcome = 'started' | 'success' | 'failure';

export type GoogleSignInResponseTelemetry = {
  google_signin_library_version: string;
  response_type?: string;
  has_data: boolean;
  has_data_user: boolean;
  has_outer_user: boolean;
  id_type: string;
  id_present: boolean;
  email_type: string;
  email_present: boolean;
  name_type: string;
  name_present: boolean;
  id_token_type: string;
  id_token_present: boolean;
  id_token_length: number | null;
  failure_step?: GoogleSignInFailureStep;
};

const SAFE_ERROR_CODES = new Set([
  NO_SAVED_GOOGLE_CREDENTIAL_CODE,
  'AUTH_TIMEOUT',
  'NETWORK_ERROR',
  'HTTP_401',
  'HTTP_5XX',
  'GOOGLE_IDENTITY_MISMATCH',
  'GOOGLE_EMAIL_MISMATCH',
  'RESTORE_NO_CLIENT',
  'RESTORE_BLOCKED',
  'RESTORE_TRANSIENT',
  'RESTORE_ERROR',
  'RESTORE_DIVERGED',
  'RESTORE_TIMEOUT',
  'BOOTSTRAP_ERROR',
  'SESSION_UNAVAILABLE',
  'CANCELLED',
  'SIGN_IN_CANCELLED',
  'PLAY_SERVICES_NOT_AVAILABLE',
  'DEVELOPER_ERROR',
  '10',
  'GOOGLE_NATIVE_INVALID_RESPONSE',
]);

let attemptSequence = 0;

/** Generate an opaque, per-process attempt id; never includes an account value or token. */
export function createAuthAttemptId(now = Date.now()): string {
  attemptSequence += 1;
  return `auth-${now.toString(36)}-${attemptSequence.toString(36)}`;
}

function errorRecord(error: unknown): {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  details?: unknown;
  source?: unknown;
  stage?: unknown;
  authStage?: unknown;
} {
  return error && typeof error === 'object'
    ? error as {
      code?: unknown;
      message?: unknown;
      status?: unknown;
      details?: unknown;
      source?: unknown;
      stage?: unknown;
      authStage?: unknown;
    }
    : {};
}

function numericStatus(error: unknown): number | undefined {
  const record = errorRecord(error);
  const candidates = [record.status, errorRecord(record.details).status];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return typeof value === 'string' ? value.trim().length > 0 : true;
}

function safeResponseType(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 64) return undefined;
  return value;
}

const SAFE_RESTORE_ERROR_CODES = new Set([
  'INVALID_CLOUD_BACKUP_ENVELOPE',
  'UNSUPPORTED_CLOUD_BACKUP_PAYLOAD',
  'CLOUD_BACKUP_PARTIAL',
  'CLOUD_BACKUP_EMPTY_WITH_REMOTE_PROGRESS',
  'HTTP_401',
  'HTTP_4XX',
  'HTTP_5XX',
  'NETWORK_ERROR',
  'UNKNOWN',
]);

function safeRestoreErrorCode(error: unknown): string {
  const record = errorRecord(error);
  const status = numericStatus(error);
  if (status === 401) return 'HTTP_401';
  if (status !== undefined && status >= 400 && status <= 499) return 'HTTP_4XX';
  if (status !== undefined && status >= 500 && status <= 599) return 'HTTP_5XX';
  if (status === 0 || status === 408 || status === 425 || status === 429) return 'NETWORK_ERROR';
  if (typeof record.code === 'string') {
    if (SAFE_RESTORE_ERROR_CODES.has(record.code)) return record.code;
    if (/^PGRST\d{3}$/.test(record.code) || /^\d{5}$/.test(record.code)) return record.code;
  }
  return 'UNKNOWN';
}

function redactRestoreErrorMessage(value: string): string {
  if (/[{}\[\]"']/.test(value)) return '<redacted-structured-error>';
  return value
    .replace(/https?:\/\/\S+/gi, '<redacted-url>')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '<redacted-email>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '<redacted-id>')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<redacted-token>')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 160);
}

function safeRestoreErrorMessage(error: unknown): string | undefined {
  const message = errorRecord(error).message;
  if (typeof message !== 'string' || !message.trim()) return undefined;
  return redactRestoreErrorMessage(message.trim());
}

export function logRestorePhase({
  attemptId,
  phase,
  operation,
  outcome,
  durationMs,
  error,
}: {
  attemptId?: string;
  phase: RestorePhase;
  operation?: RestoreRpcOperation;
  outcome: RestorePhaseOutcome;
  durationMs?: number;
  error?: unknown;
}): void {
  const duration = durationMs === undefined ? undefined : Math.max(0, Math.round(durationMs));
  const safeMessage = error === undefined ? undefined : safeRestoreErrorMessage(error);
  const data = {
    ...(typeof attemptId === 'string' && attemptId ? { attempt_id: attemptId } : {}),
    app_version: APP_VERSION,
    phase,
    ...(operation ? { operation } : {}),
    outcome,
    ...(duration === undefined ? {} : { duration_ms: duration }),
    ...(error === undefined ? {} : { error_code: safeRestoreErrorCode(error) }),
    ...(typeof numericStatus(error) === 'number' ? { http_status: numericStatus(error) } : {}),
    ...(safeMessage ? { error_message: safeMessage } : {}),
  };
  const addBreadcrumb = (Sentry as typeof Sentry & {
    addBreadcrumb?: (breadcrumb: { category: string; message: string; level: 'info' | 'warning'; data: typeof data }) => void;
  }).addBreadcrumb;
  try {
    addBreadcrumb?.({
      category: 'auth.restore',
      message: `${phase}:${outcome}`,
      level: outcome === 'failure' ? 'warning' : 'info',
      data,
    });
  } catch {
    // Diagnostics must never change restore behavior.
  }
  const serialized = JSON.stringify(data);
  const runtimeConsole = (globalThis as typeof globalThis & {
    console?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void };
  }).console;
  const write = isDevBuild() ? runtimeConsole?.info : runtimeConsole?.warn;
  write?.call(runtimeConsole, '[auth-restore]', serialized);
}

/**
 * Inspect only the response shape needed to distinguish native and parser
 * failures. Never return IDs, email addresses, names, or token contents.
 */
export function getGoogleSignInResponseTelemetry(
  response: unknown,
  failureStep?: GoogleSignInFailureStep,
): GoogleSignInResponseTelemetry {
  const root = isRecord(response) ? response : {};
  const data = root.data;
  const dataRecord = isRecord(data) ? data : null;
  const dataUser = dataRecord?.user;
  const user = isRecord(dataUser) ? dataUser : null;
  const id = user?.id;
  const email = user?.email;
  const name = user?.name;
  const idToken = dataRecord?.idToken;
  const telemetry: GoogleSignInResponseTelemetry = {
    google_signin_library_version: GOOGLE_SIGN_IN_LIBRARY_VERSION,
    ...(safeResponseType(root.type) === undefined ? {} : { response_type: safeResponseType(root.type) }),
    has_data: data !== null && data !== undefined,
    has_data_user: dataUser !== null && dataUser !== undefined,
    has_outer_user: root.user !== null && root.user !== undefined,
    id_type: typeof id,
    id_present: hasValue(id),
    email_type: typeof email,
    email_present: hasValue(email),
    name_type: typeof name,
    name_present: hasValue(name),
    id_token_type: typeof idToken,
    id_token_present: hasValue(idToken),
    id_token_length: typeof idToken === 'string' ? idToken.length : null,
    ...(failureStep ? { failure_step: failureStep } : {}),
  };
  return telemetry;
}

export function logGoogleSignInResponseTelemetry({
  attemptId,
  response,
  failureStep,
}: {
  attemptId: string;
  response: unknown;
  failureStep?: GoogleSignInFailureStep;
}): void {
  const data = {
    attempt_id: attemptId,
    ...getGoogleSignInResponseTelemetry(response, failureStep),
  };
  const addBreadcrumb = (Sentry as typeof Sentry & {
    addBreadcrumb?: (breadcrumb: { category: string; message: string; level: 'info' | 'warning'; data: typeof data }) => void;
  }).addBreadcrumb;
  try {
    addBreadcrumb?.({
      category: 'auth.google_response',
      message: failureStep ?? 'response',
      level: failureStep ? 'warning' : 'info',
      data,
    });
  } catch {
    // Diagnostics must never change auth behavior.
  }
  const serialized = JSON.stringify(data);
  const runtimeConsole = (globalThis as typeof globalThis & {
    console?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void };
  }).console;
  const write = isDevBuild() ? runtimeConsole?.info : runtimeConsole?.warn;
  write?.call(runtimeConsole, '[auth-google]', serialized);
}

/** Map an error to a small allowlisted code. Raw error objects/messages are never logged. */
export function safeAuthErrorCode(error: unknown): string {
  const record = errorRecord(error);
  const status = numericStatus(error);
  if (status === 401) return 'HTTP_401';
  if (status !== undefined && status >= 500 && status <= 599) return 'HTTP_5XX';
  if (status === 0 || status === 408 || status === 425 || status === 429) return 'NETWORK_ERROR';

  if (typeof record.code === 'string' && SAFE_ERROR_CODES.has(record.code)) return record.code;
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';
  if (message.includes('timed out') || message.includes('timeout')) return 'AUTH_TIMEOUT';
  if (message.includes('does not match the signed-in google account')) return 'GOOGLE_IDENTITY_MISMATCH';
  if (message.includes('does not match the signed-in user')) return 'GOOGLE_EMAIL_MISMATCH';
  if (message.includes('cancelled') || message.includes('canceled')) return 'CANCELLED';
  if (message.includes('network') || message.includes('offline') || message.includes('fetch failed')) return 'NETWORK_ERROR';
  if (message.includes('session unavailable')) return 'SESSION_UNAVAILABLE';
  return 'UNKNOWN';
}

/** Only classify credential loss when the provider/session layer explicitly proves it. */
export function isConfirmedInvalidCredential(error: unknown): boolean {
  const code = safeAuthErrorCode(error);
  if (code === NO_SAVED_GOOGLE_CREDENTIAL_CODE) return true;

  // HTTP 401 is ambiguous outside the provider/session layer: bootstrap RPCs,
  // profile reads, and other protected calls can all return it. Reauthentication
  // is therefore allowed only when the producer explicitly marks the failure as
  // a Supabase auth/credential operation. This keeps an account's saved Google
  // identity and local data intact for retryable downstream failures.
  if (code !== 'HTTP_401') return false;
  const record = errorRecord(error);
  const source = [record.source, record.stage, record.authStage]
    .find(value => typeof value === 'string') as string | undefined;
  return source === 'supabase_auth' || source === 'google_credential';
}

export function logAuthStage(event: AuthStageEvent): void {
  const durationMs = event.durationMs === undefined
    ? undefined
    : Math.max(0, Math.round(event.durationMs));
  const data = {
    attempt_id: event.attemptId,
    app_version: APP_VERSION,
    version_name: APP_VERSION_NAME,
    version_code: APP_VERSION_CODE,
    stage: event.stage,
    outcome: event.outcome,
    ...(durationMs === undefined ? {} : { duration_ms: durationMs }),
    ...(event.errorCode ? { error_code: SAFE_ERROR_CODES.has(event.errorCode) ? event.errorCode : 'UNKNOWN' } : {}),
    ...(typeof event.status === 'number' && Number.isFinite(event.status) ? { status: Math.trunc(event.status) } : {}),
  };

  const addBreadcrumb = (Sentry as typeof Sentry & {
    addBreadcrumb?: (breadcrumb: { category: string; message: string; level: 'info' | 'warning'; data: typeof data }) => void;
  }).addBreadcrumb;
  try {
    addBreadcrumb?.({
      category: 'auth',
      message: `${event.stage}:${event.outcome}`,
      level: event.outcome === 'failure' ? 'warning' : 'info',
      data,
    });
  } catch {
    // Diagnostics must never change auth behavior.
  }
  // Keep this allowlisted line available in release logcat even when Sentry is
  // intentionally disabled; React Native release builds may suppress
  // console.info, while console.warn is forwarded by the native logger. This
  // is the only runtime path to correlate a Play attempt without exposing
  // credentials or account payloads.
  const serialized = JSON.stringify(data);
  // Resolve the console object indirectly: the release Babel preset removes
  // direct `console.*` expressions, which made the first release-runtime
  // verification silently lose these otherwise-safe events.
  const runtimeConsole = (globalThis as typeof globalThis & {
    console?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void };
  }).console;
  const write = isDevBuild() ? runtimeConsole?.info : runtimeConsole?.warn;
  write?.call(runtimeConsole, '[auth]', serialized);
}

export function createAuthStageReporter(attemptId: string) {
  const starts = new Map<AuthStage, number>();
  const start = (stage: AuthStage): void => {
    starts.set(stage, Date.now());
    logAuthStage({ attemptId, stage, outcome: 'started' });
  };
  const end = (stage: AuthStage, outcome: Exclude<AuthStageOutcome, 'started'>, error?: unknown): void => {
    const startedAt = starts.get(stage);
    starts.delete(stage);
    logAuthStage({
      attemptId,
      stage,
      outcome,
      durationMs: startedAt === undefined ? undefined : Date.now() - startedAt,
      ...(error ? { errorCode: safeAuthErrorCode(error), status: numericStatus(error) } : {}),
    });
  };
  return { start, end };
}
